from datetime import datetime
from fastapi import APIRouter, HTTPException, status
from api.database import get_database
from api.engines.llama_cpp import LlamaCppEngine
from api.helpers import download_helper, parse_object_id
from api.services import ssh as ssh_mod

router = APIRouter(tags=["downloads"])


async def _refresh_job(db, doc: dict) -> dict:
    if doc.get("status") not in ("queued", "running"):
        return doc
    node = await db.nodes.find_one({"_id": doc["nodeId"]}) if doc.get("nodeId") else None
    if not node:
        now = datetime.utcnow()
        await db.downloads.update_one(
            {"_id": doc["_id"]},
            {"$set": {"status": "failed", "detail": "Node is gone", "updatedAt": now, "finishedAt": now}},
        )
        doc.update({"status": "failed", "detail": "Node is gone", "updatedAt": now, "finishedAt": now})
        return doc
    try:
        result = await ssh_mod.run_command(
            node,
            LlamaCppEngine.download_progress_command(doc["modelDir"], doc["filename"], str(doc["_id"])),
        )
    except ssh_mod.SshError as exc:
        now = datetime.utcnow()
        await db.downloads.update_one(
            {"_id": doc["_id"]},
            {"$set": {"status": "failed", "detail": str(exc), "updatedAt": now, "finishedAt": now}},
        )
        doc.update({"status": "failed", "detail": str(exc), "updatedAt": now, "finishedAt": now})
        return doc
    line = (result.stdout or "").strip().splitlines()
    parts = (line[-1] if line else "").split("\t")
    while len(parts) < 5:
        parts.append("")
    alive, exit_code, size_raw, done_flag, err = parts[:5]
    try:
        size = int(size_raw or 0)
    except ValueError:
        size = 0
    now = datetime.utcnow()
    update = {"bytes": size, "updatedAt": now}
    if done_flag == "1" or (alive != "1" and exit_code.strip() == "0"):
        update.update({"status": "done", "finishedAt": now, "detail": ""})
    elif alive != "1" and exit_code.strip() not in ("", "0"):
        update.update({"status": "failed", "finishedAt": now, "detail": err or f"curl exit {exit_code.strip()}"})
    elif alive != "1" and not exit_code.strip() and doc.get("status") == "running":
        update.update({"status": "failed", "finishedAt": now, "detail": err or "download stopped"})
    else:
        update["status"] = "running"
    await db.downloads.update_one({"_id": doc["_id"]}, {"$set": update})
    doc.update(update)
    return doc


@router.get("/downloads")
async def list_downloads():
    db = get_database()
    items = []
    async for doc in db.downloads.find().sort("createdAt", -1):
        items.append(download_helper(await _refresh_job(db, doc)))
    return items


@router.get("/downloads/{job_id}")
async def get_download(job_id: str):
    db = get_database()
    doc = await db.downloads.find_one({"_id": parse_object_id(job_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    return download_helper(await _refresh_job(db, doc))


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
            await ssh_mod.run_command(
                node,
                LlamaCppEngine.cancel_download_command(doc["modelDir"], doc["filename"], str(doc["_id"])),
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
