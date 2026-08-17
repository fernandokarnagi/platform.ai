from datetime import datetime
from fastapi import APIRouter, HTTPException, status
from api.database import get_database
from api.engines import get_engine
from api.helpers import download_helper, parse_object_id
from api.services import ssh as ssh_mod

router = APIRouter(tags=["downloads"])


@router.get("/downloads")
async def list_downloads():
    db = get_database()
    items = []
    async for doc in db.downloads.find().sort("createdAt", -1):
        items.append(download_helper(doc))
    return items


@router.get("/downloads/{job_id}")
async def get_download(job_id: str):
    db = get_database()
    doc = await db.downloads.find_one({"_id": parse_object_id(job_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    return download_helper(doc)


@router.post("/downloads/{job_id}/cancel")
async def cancel_download(job_id: str):
    db = get_database()
    doc = await db.downloads.find_one({"_id": parse_object_id(job_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    if doc.get("status") not in ("queued", "running"):
        raise HTTPException(status_code=409, detail="Download is not running")
    node = await db.nodes.find_one({"_id": doc["nodeId"]}) if doc.get("nodeId") else None
    if node:
        try:
            engine = get_engine(node.get("engine") or doc.get("engine"))
            await ssh_mod.run_command(
                node,
                engine.cancel_download_command(doc["modelDir"], doc["filename"], str(doc["_id"])),
            )
        except ssh_mod.SshError:
            pass
    now = datetime.utcnow()
    await db.downloads.update_one(
        {"_id": doc["_id"]},
        {"$set": {"status": "cancelled", "detail": "Cancelled", "updatedAt": now, "finishedAt": now}},
    )
    updated = await db.downloads.find_one({"_id": doc["_id"]})
    return download_helper(updated)


@router.post("/downloads/{job_id}/retry")
async def retry_download(job_id: str):
    db = get_database()
    doc = await db.downloads.find_one({"_id": parse_object_id(job_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    if doc.get("status") not in ("failed", "cancelled"):
        raise HTTPException(status_code=409, detail="Download cannot be retried")
    node = await db.nodes.find_one({"_id": doc["nodeId"]}) if doc.get("nodeId") else None
    now = datetime.utcnow()
    if not node:
        await db.downloads.update_one(
            {"_id": doc["_id"]},
            {"$set": {"status": "failed", "detail": "Node is gone", "updatedAt": now, "finishedAt": now}},
        )
        raise HTTPException(status_code=502, detail="Node is gone")
    token = (node.get("hfToken") or "") if doc.get("source") == "huggingface" else ""
    await db.downloads.update_one(
        {"_id": doc["_id"]},
        {"$set": {"status": "queued", "detail": "", "bytes": 0, "updatedAt": now, "finishedAt": None}},
    )
    try:
        started = await ssh_mod.run_command(
            node,
            get_engine(node.get("engine") or doc.get("engine")).start_download_command(
                doc["modelDir"], doc["filename"], doc["url"], str(doc["_id"]), token
            ),
        )
    except ssh_mod.SshError as exc:
        await db.downloads.update_one(
            {"_id": doc["_id"]},
            {
                "$set": {
                    "status": "failed",
                    "detail": str(exc),
                    "updatedAt": datetime.utcnow(),
                    "finishedAt": datetime.utcnow(),
                }
            },
        )
        raise HTTPException(status_code=502, detail=f"Download failed: {exc}") from exc
    pid = (started.stdout or "").strip().splitlines()
    pid = pid[-1] if pid else ""
    if started.exit_status != 0 or not pid:
        err = (started.stderr or started.stdout or "failed to start download").strip()
        await db.downloads.update_one(
            {"_id": doc["_id"]},
            {"$set": {"status": "failed", "detail": err, "updatedAt": datetime.utcnow(), "finishedAt": datetime.utcnow()}},
        )
        raise HTTPException(status_code=502, detail=f"Download failed: {err}")
    await db.downloads.update_one(
        {"_id": doc["_id"]},
        {"$set": {"status": "running", "detail": "", "updatedAt": datetime.utcnow(), "finishedAt": None}},
    )
    await db.nodes.update_one({"_id": node["_id"]}, {"$unset": {"modelsCache": ""}})
    updated = await db.downloads.find_one({"_id": doc["_id"]})
    return download_helper(updated)


@router.delete("/downloads/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_download(job_id: str):
    db = get_database()
    doc = await db.downloads.find_one({"_id": parse_object_id(job_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    node = await db.nodes.find_one({"_id": doc["nodeId"]}) if doc.get("nodeId") else None
    engine = get_engine((node or {}).get("engine") or doc.get("engine"))
    if node and doc.get("status") in ("queued", "running"):
        try:
            await ssh_mod.run_command(
                node,
                engine.cancel_download_command(doc["modelDir"], doc["filename"], str(doc["_id"])),
            )
        except ssh_mod.SshError:
            pass
    if node:
        try:
            await ssh_mod.run_command(node, engine.delete_job_command(str(doc["_id"])))
        except ssh_mod.SshError:
            pass
    await db.downloads.delete_one({"_id": doc["_id"]})
    return None
