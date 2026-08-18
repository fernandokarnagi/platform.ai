from datetime import datetime

from api.engines import get_engine
from api.logger import get_logger
from api.services import ssh as ssh_mod

logger = get_logger(__name__)


def parse_progress(stdout: str) -> tuple[str, str, int, str, str]:
    """Parse engine progress stdout. Ignore tqdm \\r fragments."""
    for raw in (stdout or "").replace("\r", "\n").split("\n"):
        if "\t" not in raw:
            continue
        parts = raw.split("\t")
        while len(parts) < 5:
            parts.append("")
        alive, exit_code, size_raw, done_flag, err = parts[:5]
        try:
            size = int(size_raw or 0)
        except ValueError:
            size = 0
        return alive, exit_code, size, done_flag, err
    return "0", "", 0, "0", ""


async def sync_job(db, doc: dict) -> dict:
    """Probe a running download on the node and persist bytes/status."""
    if doc.get("status") not in ("queued", "running"):
        return doc
    node = await db.nodes.find_one({"_id": doc["nodeId"]}) if doc.get("nodeId") else None
    now = datetime.utcnow()
    if not node:
        await db.downloads.update_one(
            {"_id": doc["_id"]},
            {"$set": {"status": "failed", "detail": "Node is gone", "updatedAt": now, "finishedAt": now}},
        )
        doc.update({"status": "failed", "detail": "Node is gone", "updatedAt": now, "finishedAt": now})
        return doc
    try:
        engine = get_engine(node.get("engine") or doc.get("engine"))
        result = await ssh_mod.run_command(
            node,
            engine.download_progress_command(doc["modelDir"], doc["filename"], str(doc["_id"])),
        )
    except ssh_mod.SshError as exc:
        await db.downloads.update_one(
            {"_id": doc["_id"]},
            {"$set": {"detail": f"progress check failed: {exc}", "updatedAt": now}},
        )
        doc.update({"detail": f"progress check failed: {exc}", "updatedAt": now})
        return doc
    alive, exit_code, size, done_flag, err = parse_progress(result.stdout or "")
    update = {"bytes": size, "updatedAt": now, "detail": ""}
    if done_flag == "1" or (alive != "1" and exit_code.strip() == "0"):
        update.update({"status": "done", "finishedAt": now})
    elif alive != "1" and exit_code.strip() not in ("", "0"):
        update.update({"status": "failed", "finishedAt": now, "detail": err or f"curl exit {exit_code.strip()}"})
    elif alive != "1" and not exit_code.strip() and doc.get("status") == "running":
        update.update({"status": "failed", "finishedAt": now, "detail": err or "download stopped"})
    else:
        update["status"] = "running"
    await db.downloads.update_one({"_id": doc["_id"]}, {"$set": update})
    doc.update(update)
    return doc


async def sync_active_jobs() -> int:
    from api.database import get_database
    import asyncio

    db = get_database()
    docs = [doc async for doc in db.downloads.find({"status": {"$in": ["queued", "running"]}})]
    if not docs:
        return 0
    await asyncio.gather(*(sync_job(db, doc) for doc in docs), return_exceptions=True)
    return len(docs)
