from datetime import datetime
from fastapi import APIRouter, HTTPException, Query, status
from api.database import get_database
from api.helpers import cluster_helper, parse_object_id
from api.logger import get_logger
from api.models.models import ClusterIn, ClusterUpdate

router = APIRouter(tags=["clusters"], prefix="/clusters")
logger = get_logger(__name__)


async def _node_count(db, cluster_id) -> int:
    return await db.nodes.count_documents({"clusterId": cluster_id})


async def _node_stats(db, cluster_id) -> tuple[int, int]:
    nodes = [doc async for doc in db.nodes.find({"clusterId": cluster_id})]
    if not nodes:
        return 0, 0
    running = sum(1 for node in nodes if (node.get("statusCache") or {}).get("running"))
    return len(nodes), running


@router.get("")
async def list_clusters():
    db = get_database()
    items = []
    async for doc in db.clusters.find().sort("createdAt", -1):
        items.append(cluster_helper(doc, *await _node_stats(db, doc["_id"])))
    return items


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_cluster(payload: ClusterIn):
    db = get_database()
    now = datetime.utcnow()
    doc = payload.model_dump()
    doc["engine"] = payload.engine.value
    doc["createdAt"] = now
    doc["updatedAt"] = now
    result = await db.clusters.insert_one(doc)
    created = await db.clusters.find_one({"_id": result.inserted_id})
    logger.info("Cluster created: %s", str(result.inserted_id))
    return cluster_helper(created, 0)


@router.get("/{cluster_id}")
async def get_cluster(cluster_id: str):
    db = get_database()
    oid = parse_object_id(cluster_id)
    doc = await db.clusters.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    return cluster_helper(doc, *await _node_stats(db, oid))


@router.put("/{cluster_id}")
async def update_cluster(cluster_id: str, update: ClusterUpdate):
    db = get_database()
    oid = parse_object_id(cluster_id)
    doc = await db.clusters.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    data = {k: v for k, v in update.model_dump().items() if v is not None}
    if "engine" in data and hasattr(data["engine"], "value"):
        data["engine"] = data["engine"].value
    data["updatedAt"] = datetime.utcnow()
    await db.clusters.update_one({"_id": oid}, {"$set": data})
    if "engine" in data:
        await db.nodes.update_many({"clusterId": oid}, {"$set": {"engine": data["engine"]}})
    updated = await db.clusters.find_one({"_id": oid})
    return cluster_helper(updated, *await _node_stats(db, oid))


@router.delete("/{cluster_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_cluster(cluster_id: str, cascade: bool = Query(False)):
    db = get_database()
    oid = parse_object_id(cluster_id)
    doc = await db.clusters.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    if await _node_count(db, oid) > 0:
        if not cascade:
            raise HTTPException(status_code=409, detail="Cluster has nodes")
        await db.nodes.delete_many({"clusterId": oid})
    result = await db.clusters.delete_one({"_id": oid})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return None
