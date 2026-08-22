from datetime import datetime
from fastapi import APIRouter, HTTPException, status
from api.database import get_database
from api.engines import get_engine, is_vllm_engine
from api.helpers import SETTINGS_DOC_ID, download_helper, parse_object_id, resolve_hf_token
from api.services import library as library_mod
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
    node = await library_mod.runner_for_job(db, doc)
    if node and doc.get("jobType") != "copy":
        try:
            engine = get_engine(node.get("engine") or doc.get("engine") or doc.get("kind"))
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
    node = await library_mod.runner_for_job(db, doc)
    now = datetime.utcnow()
    if not node:
        await db.downloads.update_one(
            {"_id": doc["_id"]},
            {"$set": {"status": "failed", "detail": "Node is gone", "updatedAt": now, "finishedAt": now}},
        )
        raise HTTPException(status_code=502, detail="Node is gone")
    if doc.get("jobType") == "copy":
        raise HTTPException(status_code=409, detail="Copy jobs cannot be retried — copy again from the node")
    cluster = await db.clusters.find_one({"_id": node.get("clusterId")}) if node.get("clusterId") is not None else None
    settings = await db.settings.find_one({"_id": SETTINGS_DOC_ID})
    token = resolve_hf_token(node, cluster, settings=settings) if doc.get("source") == "huggingface" else ""
    engine = get_engine(node.get("engine") or doc.get("engine") or doc.get("kind"))
    if is_vllm_engine(engine):
        try:
            await ssh_mod.run_command(
                node,
                engine.cancel_download_command(
                    doc["modelDir"], doc["filename"], str(doc["_id"]), wipe=False
                ),
            )
        except ssh_mod.SshError:
            pass
    await db.downloads.update_one(
        {"_id": doc["_id"]},
        {"$set": {"status": "queued", "detail": "", "bytes": 0, "updatedAt": now, "finishedAt": None}},
    )
    try:
        started = await ssh_mod.run_command(
            node,
            engine.start_download_command(
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
    if node.get("_id"):
        await db.nodes.update_one({"_id": node["_id"]}, {"$unset": {"modelsCache": ""}})
    updated = await db.downloads.find_one({"_id": doc["_id"]})
    return download_helper(updated)


@router.delete("/downloads/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_download(job_id: str):
    db = get_database()
    doc = await db.downloads.find_one({"_id": parse_object_id(job_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    node = await library_mod.runner_for_job(db, doc)
    engine = get_engine((node or {}).get("engine") or doc.get("engine") or doc.get("kind") or "llama.cpp")
    if node and doc.get("jobType") != "copy" and doc.get("status") in ("queued", "running"):
        try:
            await ssh_mod.run_command(
                node,
                engine.cancel_download_command(doc["modelDir"], doc["filename"], str(doc["_id"])),
            )
        except ssh_mod.SshError:
            pass
    if node and doc.get("jobType") != "copy":
        try:
            await ssh_mod.run_command(node, engine.delete_job_command(str(doc["_id"])))
        except ssh_mod.SshError:
            pass
    await db.downloads.delete_one({"_id": doc["_id"]})
    return None
