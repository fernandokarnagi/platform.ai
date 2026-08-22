from datetime import datetime

LIMIT = 50
ERROR_CAP = 500


def entry(
    *,
    model: str,
    latency_ms: int,
    prompt_tokens: int | None,
    completion_tokens: int | None,
    ok: bool,
    error: str = "",
) -> dict:
    return {
        "at": datetime.utcnow(),
        "model": model or "",
        "latencyMs": max(int(latency_ms), 0),
        "promptTokens": prompt_tokens,
        "completionTokens": completion_tokens,
        "ok": bool(ok),
        "error": (error or "")[:ERROR_CAP],
    }


def estimate_prompt_tokens(messages: list[dict] | None) -> int | None:
    text = " ".join(str((item or {}).get("content") or "") for item in (messages or []))
    if not text.strip():
        return 0
    return max(1, len(text) // 4)


def from_usage(usage: dict | None, messages: list[dict] | None) -> tuple[int | None, int | None]:
    data = usage if isinstance(usage, dict) else {}
    prompt = data.get("prompt_tokens")
    completion = data.get("completion_tokens")
    try:
        prompt_n = int(prompt) if prompt is not None else None
    except (TypeError, ValueError):
        prompt_n = None
    try:
        completion_n = int(completion) if completion is not None else None
    except (TypeError, ValueError):
        completion_n = None
    if prompt_n is None:
        prompt_n = estimate_prompt_tokens(messages)
    return prompt_n, completion_n


def helper(doc: dict) -> list[dict]:
    items = []
    for item in reversed(list(doc.get("requestLog") or [])):
        if not isinstance(item, dict):
            continue
        items.append({
            "at": item["at"].isoformat() if isinstance(item.get("at"), datetime) else (item.get("at") or ""),
            "model": item.get("model") or "",
            "latencyMs": int(item.get("latencyMs") or 0),
            "promptTokens": item.get("promptTokens"),
            "completionTokens": item.get("completionTokens"),
            "ok": bool(item.get("ok")),
            "error": item.get("error") or "",
        })
    return items


async def append(db, node_id, item: dict) -> None:
    await db.nodes.update_one(
        {"_id": node_id},
        {
            "$push": {"requestLog": {"$each": [item], "$slice": -LIMIT}},
            "$set": {"updatedAt": datetime.utcnow()},
        },
    )
