from datetime import datetime

from api.helpers import status_cache_is_fresh
from api.services import engine as engine_mod
from api.services import openai_proxy
from api.services import ssh as ssh_mod

STATUS_CHECKS = ("ssh", "engine", "openai")


def _iso(value) -> str | None:
    if isinstance(value, datetime):
        return value.isoformat()
    return value or None


def body_from_cache(node: dict) -> dict:
    cache = node.get("statusCache") if isinstance(node.get("statusCache"), dict) else {}
    return {
        "ssh": cache.get("ssh") or "down",
        "openai": cache.get("openai") or "down",
        "models": list(cache.get("models") or []),
        "detail": cache.get("detail"),
        "checkedAt": _iso(cache.get("checkedAt")),
        "running": bool(cache.get("running")),
        "pid": cache.get("pid"),
        "cached": True,
    }


def status_payload(body: dict) -> dict:
    running = bool(body.get("running"))
    return {
        "ssh": body.get("ssh") or "down",
        "openai": body.get("openai") or "down",
        "models": list(body.get("models") or []),
        "detail": body.get("detail"),
        "checkedAt": _iso(body.get("checkedAt")) if not isinstance(body.get("checkedAt"), str) else body.get("checkedAt"),
        "cached": bool(body.get("cached")),
        "running": running,
        "pid": body.get("pid") if running else None,
    }


async def probe_live(node: dict) -> dict:
    body = {
        "ssh": "down",
        "openai": "down",
        "models": [],
        "detail": None,
        "running": False,
        "pid": None,
        "checkedAt": datetime.utcnow(),
        "cached": False,
    }
    try:
        await ssh_mod.run_command(node, "uname -s")
        body["ssh"] = "up"
    except ssh_mod.SshError as exc:
        reason = str(exc).strip()
        body["detail"] = f"SSH failed: {reason}" if reason else "SSH failed: connection timed out"
    try:
        engine = await engine_mod.engine_status(node)
        body["running"] = bool(engine.get("running"))
        body["pid"] = engine.get("pid")
    except ssh_mod.SshError as exc:
        reason = str(exc).strip() or "connection timed out"
        extra = f"Engine failed: {reason}"
        body["detail"] = extra if not body["detail"] else f"{body['detail']}; {extra}"
    try:
        models = await openai_proxy.fetch_models(node.get("openaiBaseUrl") or "", node.get("openaiApiKey") or "")
        body["openai"] = "up"
        body["models"] = [m.get("id") for m in models if m.get("id")]
    except openai_proxy.OpenAIProxyError as exc:
        extra = str(exc)
        body["detail"] = extra if not body["detail"] else f"{body['detail']}; {extra}"
    return body


async def probe_part(node: dict, check: str) -> dict:
    now = datetime.utcnow()
    if check == "ssh":
        try:
            await ssh_mod.run_command(node, "uname -s")
            return {"ssh": "up", "detail": None, "sshCheckedAt": now}
        except ssh_mod.SshError as exc:
            reason = str(exc).strip() or "connection timed out"
            return {"ssh": "down", "detail": f"SSH failed: {reason}", "sshCheckedAt": now}
    if check == "engine":
        try:
            engine = await engine_mod.engine_status(node)
            return {
                "running": bool(engine.get("running")),
                "pid": engine.get("pid"),
                "detail": None,
                "engineCheckedAt": now,
            }
        except ssh_mod.SshError as exc:
            reason = str(exc).strip() or "connection timed out"
            return {
                "running": False,
                "pid": None,
                "detail": f"Engine failed: {reason}",
                "engineCheckedAt": now,
            }
    if check == "openai":
        try:
            models = await openai_proxy.fetch_models(
                node.get("openaiBaseUrl") or "",
                node.get("openaiApiKey") or "",
            )
            return {
                "openai": "up",
                "models": [m.get("id") for m in models if m.get("id")],
                "detail": None,
                "openaiCheckedAt": now,
            }
        except openai_proxy.OpenAIProxyError as exc:
            return {
                "openai": "down",
                "detail": str(exc).strip() or "OpenAI probe failed",
                "openaiCheckedAt": now,
            }
    raise ValueError(f"check must be one of {', '.join(STATUS_CHECKS)}")


async def persist_partial(db, node: dict, patch: dict) -> dict:
    cache = dict(node.get("statusCache") or {}) if isinstance(node.get("statusCache"), dict) else {}
    cache.update(patch)
    cache.setdefault("ssh", "down")
    cache.setdefault("openai", "down")
    cache.setdefault("running", False)
    cache.setdefault("pid", None)
    cache.setdefault("models", [])
    now = datetime.utcnow()
    last_openai = {
        "openai": cache.get("openai") or "down",
        "checkedAt": cache.get("openaiCheckedAt") or cache.get("checkedAt") or now,
        "models": list(cache.get("models") or []),
        "detail": cache.get("detail"),
    }
    await db.nodes.update_one(
        {"_id": node["_id"]},
        {"$set": {"statusCache": cache, "lastOpenAICheck": last_openai, "updatedAt": now}},
    )
    body = body_from_cache({**node, "statusCache": cache})
    body["cached"] = False
    body["detail"] = cache.get("detail")
    return body


async def persist(db, node: dict, body: dict) -> dict:
    now = body.get("checkedAt") or datetime.utcnow()
    if isinstance(now, str):
        now = datetime.utcnow()
    cache = {
        "ssh": body.get("ssh") or "down",
        "openai": body.get("openai") or "down",
        "running": bool(body.get("running")),
        "pid": body.get("pid"),
        "models": list(body.get("models") or []),
        "detail": body.get("detail"),
        "checkedAt": now,
    }
    last_openai = {
        "openai": cache["openai"],
        "checkedAt": now,
        "models": cache["models"],
        "detail": cache["detail"],
    }
    await db.nodes.update_one(
        {"_id": node["_id"]},
        {"$set": {"statusCache": cache, "lastOpenAICheck": last_openai, "updatedAt": now}},
    )
    stored = dict(body)
    stored["checkedAt"] = now
    stored["cached"] = False
    return stored


async def get_status(db, node: dict, refresh: bool = False, check: str | None = None) -> dict:
    if check:
        if check not in STATUS_CHECKS:
            raise ValueError(f"check must be one of {', '.join(STATUS_CHECKS)}")
        return await persist_partial(db, node, await probe_part(node, check))
    if not refresh and status_cache_is_fresh(node):
        return body_from_cache(node)
    body = await persist(db, node, await probe_live(node))
    return body


async def get_engine(db, node: dict, refresh: bool = False) -> dict:
    body = await get_status(db, node, refresh=refresh)
    running = bool(body.get("running"))
    return {
        "running": running,
        "pid": body.get("pid") if running else None,
        "lastStart": node.get("lastStart"),
    }


async def touch_engine(db, node: dict, running: bool, pid: str | None) -> None:
    now = datetime.utcnow()
    cache = dict(node.get("statusCache") or {}) if isinstance(node.get("statusCache"), dict) else {}
    cache["running"] = bool(running)
    cache["pid"] = pid if running else None
    if running:
        cache["ssh"] = "up"
    if not cache.get("checkedAt"):
        cache["checkedAt"] = now
        cache.setdefault("openai", "down")
        cache.setdefault("models", [])
        cache.setdefault("detail", None)
    await db.nodes.update_one(
        {"_id": node["_id"]},
        {"$set": {"statusCache": cache, "updatedAt": now}},
    )
