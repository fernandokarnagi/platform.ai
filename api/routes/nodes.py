from datetime import datetime
from fastapi import APIRouter, HTTPException, status
from api.database import get_database
from api.engines.llama_cpp import LlamaCppEngine
from api.helpers import node_helper, parse_object_id
from api.logger import get_logger
from api.models.models import NodeIn, NodeUpdate
from api.services import ssh as ssh_mod

router = APIRouter(tags=["nodes"])
logger = get_logger(__name__)


async def _require_cluster(db, cluster_id: str):
    oid = parse_object_id(cluster_id)
    doc = await db.clusters.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    return oid


async def _require_node(db, node_id: str):
    oid = parse_object_id(node_id)
    doc = await db.nodes.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    return doc


@router.get("/clusters/{cluster_id}/nodes")
async def list_nodes(cluster_id: str):
    db = get_database()
    oid = await _require_cluster(db, cluster_id)
    items = []
    async for doc in db.nodes.find({"clusterId": oid}).sort("createdAt", -1):
        items.append(node_helper(doc))
    return items


@router.post("/clusters/{cluster_id}/nodes", status_code=status.HTTP_201_CREATED)
async def create_node(cluster_id: str, payload: NodeIn):
    db = get_database()
    oid = await _require_cluster(db, cluster_id)
    now = datetime.utcnow()
    doc = payload.model_dump()
    doc["sshAuthType"] = payload.sshAuthType.value
    doc["clusterId"] = oid
    doc["lastStart"] = None
    doc["createdAt"] = now
    doc["updatedAt"] = now
    result = await db.nodes.insert_one(doc)
    created = await db.nodes.find_one({"_id": result.inserted_id})
    logger.info("Node created: %s", str(result.inserted_id))
    return node_helper(created)


@router.get("/nodes/{node_id}")
async def get_node(node_id: str):
    db = get_database()
    return node_helper(await _require_node(db, node_id))


@router.put("/nodes/{node_id}")
async def update_node(node_id: str, update: NodeUpdate):
    db = get_database()
    doc = await _require_node(db, node_id)
    data = {k: v for k, v in update.model_dump().items() if v is not None}
    if "sshAuthType" in data and hasattr(data["sshAuthType"], "value"):
        data["sshAuthType"] = data["sshAuthType"].value
    if "serverParams" in data and data["serverParams"] is not None:
        data["serverParams"] = update.serverParams.model_dump()
    data["updatedAt"] = datetime.utcnow()
    await db.nodes.update_one({"_id": doc["_id"]}, {"$set": data})
    updated = await db.nodes.find_one({"_id": doc["_id"]})
    return node_helper(updated)


@router.delete("/nodes/{node_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_node(node_id: str):
    db = get_database()
    doc = await _require_node(db, node_id)
    await db.nodes.delete_one({"_id": doc["_id"]})
    return None


@router.post("/nodes/{node_id}/test-ssh")
async def test_ssh(node_id: str):
    db = get_database()
    node = await _require_node(db, node_id)
    try:
        result = await ssh_mod.run_command(node, LlamaCppEngine.probe_command())
    except ssh_mod.SshError as exc:
        raise HTTPException(status_code=502, detail=f"SSH failed: {exc}") from exc
    lines = [line.strip() for line in result.stdout.splitlines() if line.strip()]
    uname = lines[0] if lines else ""
    binary = lines[1] if len(lines) > 1 else "MISSING"
    if result.exit_status != 0:
        raise HTTPException(status_code=502, detail=f"SSH failed: {result.stderr or result.stdout}")
    return {"ok": True, "uname": uname, "llamaServer": binary}
