from datetime import datetime
from fastapi import APIRouter, HTTPException, status
from api.database import get_database
from api.engines.llama_cpp import ForbiddenExtraFlagsError, LlamaCppEngine
from api.helpers import apply_node_location, is_local_node, node_helper, parse_object_id, safe_model_filename
from api.logger import get_logger
from api.models.models import ChatIn, DeleteModelIn, DownloadModelIn, NodeIn, NodeUpdate, StartEngineIn
from api.services import engine as engine_mod
from api.services import openai_proxy as openai_proxy
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
    if payload.sshAuthType is not None:
        doc["sshAuthType"] = payload.sshAuthType.value
    if payload.nodeType is not None:
        doc["nodeType"] = payload.nodeType.value
    apply_node_location(
        doc,
        payload.nodeType.value if payload.nodeType else None,
        payload.host,
    )
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
    if "nodeType" in data and hasattr(data["nodeType"], "value"):
        data["nodeType"] = data["nodeType"].value
    merged = {**doc, **data}
    apply_node_location(
        merged,
        merged.get("nodeType"),
        merged.get("host"),
    )
    data["nodeType"] = merged["nodeType"]
    data["host"] = merged["host"]
    data["sshPort"] = merged["sshPort"]
    data["sshAuthType"] = merged["sshAuthType"]
    data["sshUser"] = merged["sshUser"]
    data["sshPassword"] = merged["sshPassword"]
    data["sshPrivateKey"] = merged["sshPrivateKey"]
    data["sshPassphrase"] = merged["sshPassphrase"]
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
    local = is_local_node(node)
    label = "Local" if local else "SSH"
    try:
        result = await ssh_mod.run_command(node, LlamaCppEngine.probe_command())
    except ssh_mod.SshError as exc:
        raise HTTPException(status_code=502, detail=f"{label} failed: {exc}") from exc
    lines = [line.strip() for line in result.stdout.splitlines() if line.strip()]
    uname = lines[0] if lines else ""
    binary = lines[1] if len(lines) > 1 else "MISSING"
    if result.exit_status != 0:
        raise HTTPException(status_code=502, detail=f"{label} failed: {result.stderr or result.stdout}")
    return {"ok": True, "local": local, "uname": uname, "llamaServer": binary}


def _last_line(stdout: str) -> str:
    lines = [line.strip() for line in (stdout or "").splitlines() if line.strip()]
    return lines[-1] if lines else ""


async def _expand_dir(node):
    model_dir = node.get("modelDir") or "~/models"
    result = await ssh_mod.run_command(node, LlamaCppEngine.expand_model_dir_command(model_dir))
    expanded = _last_line(result.stdout)
    if not expanded:
        raise HTTPException(status_code=502, detail="SSH failed: empty modelDir")
    return expanded


async def _resolve_binary(node):
    result = await ssh_mod.run_command(node, LlamaCppEngine.resolve_binary_command())
    binary = result.stdout.strip().splitlines()[0] if result.stdout.strip() else "MISSING"
    if binary == "MISSING":
        raise HTTPException(status_code=502, detail="llama-server not found on node")
    return binary


@router.get("/nodes/{node_id}/engine")
async def get_engine(node_id: str):
    db = get_database()
    node = await _require_node(db, node_id)
    try:
        status_body = await engine_mod.engine_status(node)
        try:
            status_body["llamaServer"] = await _resolve_binary(node)
        except HTTPException:
            status_body["llamaServer"] = None
        return status_body
    except ssh_mod.SshError as exc:
        raise HTTPException(status_code=502, detail=f"SSH failed: {exc}") from exc


@router.post("/nodes/{node_id}/engine/start")
async def start_engine(node_id: str, payload: StartEngineIn):
    db = get_database()
    node = await _require_node(db, node_id)
    try:
        filename = safe_model_filename(payload.modelFilename)
        current = await engine_mod.engine_status(node)
        if current["running"]:
            raise HTTPException(status_code=409, detail="Engine already running")
        model_dir = await _expand_dir(node)
        exists = await ssh_mod.run_command(node, LlamaCppEngine.model_exists_command(model_dir, filename))
        if "OK" not in exists.stdout:
            raise HTTPException(status_code=404, detail="Model not found")
        binary = await _resolve_binary(node)
        argv = LlamaCppEngine.build_argv(node, filename, model_dir)
        started = await ssh_mod.run_command(node, LlamaCppEngine.start_command(binary, argv), timeout=20)
        pid = _last_line(started.stdout)
        if not pid:
            raise HTTPException(status_code=502, detail="SSH failed: engine did not start")
        alive = await ssh_mod.run_command(node, LlamaCppEngine.pid_alive_command(pid))
        if "alive" not in alive.stdout:
            raise HTTPException(status_code=502, detail="SSH failed: engine did not start")
        last_start = {"modelFilename": filename, "argv": argv, "startedAt": datetime.utcnow().isoformat()}
        await db.nodes.update_one({"_id": node["_id"]}, {"$set": {"lastStart": last_start, "updatedAt": datetime.utcnow()}})
        return {"running": True, "pid": pid, "lastStart": last_start}
    except ForbiddenExtraFlagsError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except HTTPException:
        raise
    except ssh_mod.SshError as exc:
        raise HTTPException(status_code=502, detail=f"SSH failed: {exc}") from exc


@router.post("/nodes/{node_id}/engine/stop")
async def stop_engine(node_id: str):
    db = get_database()
    node = await _require_node(db, node_id)
    try:
        await ssh_mod.run_command(node, LlamaCppEngine.stop_command(), timeout=20)
        return {"running": False, "pid": None, "lastStart": node.get("lastStart")}
    except ssh_mod.SshError as exc:
        raise HTTPException(status_code=502, detail=f"SSH failed: {exc}") from exc


@router.post("/nodes/{node_id}/engine/restart")
async def restart_engine(node_id: str):
    db = get_database()
    node = await _require_node(db, node_id)
    last = node.get("lastStart") or {}
    filename = last.get("modelFilename")
    if not filename:
        raise HTTPException(status_code=400, detail="No previous start")
    await stop_engine(node_id)
    return await start_engine(node_id, StartEngineIn(modelFilename=filename))


@router.get("/nodes/{node_id}/models")
async def list_models(node_id: str):
    db = get_database()
    node = await _require_node(db, node_id)
    try:
        model_dir = await _expand_dir(node)
        result = await ssh_mod.run_command(node, LlamaCppEngine.list_models_command(model_dir))
    except ssh_mod.SshError as exc:
        raise HTTPException(status_code=502, detail=f"SSH failed: {exc}") from exc
    if result.exit_status != 0:
        raise HTTPException(
            status_code=502,
            detail=f"SSH failed: {result.stderr or result.stdout or 'list failed'}",
        )
    items = []
    for line in result.stdout.splitlines():
        parts = line.split("\t")
        if len(parts) < 3:
            continue
        try:
            size_bytes = int(parts[1])
        except ValueError:
            continue
        name = parts[0].rstrip("/").split("/")[-1]
        items.append({"name": name, "sizeBytes": size_bytes, "mtime": parts[2]})
    return items


@router.post("/nodes/{node_id}/models/download")
async def download_model(node_id: str, payload: DownloadModelIn):
    db = get_database()
    node = await _require_node(db, node_id)
    try:
        if payload.source == "huggingface":
            if not payload.repo or not payload.filename:
                raise HTTPException(status_code=400, detail="repo and filename required")
            filename = safe_model_filename(payload.filename)
            url = LlamaCppEngine.hf_url(payload.repo, filename)
            token = payload.hfToken or node.get("hfToken") or ""
        elif payload.source == "url":
            if not payload.url:
                raise HTTPException(status_code=400, detail="url required")
            filename = payload.filename or payload.url.rstrip("/").split("?")[0].split("/")[-1]
            filename = safe_model_filename(filename)
            url = payload.url
            token = ""
        else:
            raise HTTPException(status_code=400, detail="source must be huggingface or url")
        model_dir = await _expand_dir(node)
        result = await ssh_mod.run_command(
            node,
            LlamaCppEngine.download_command(model_dir, filename, url, token),
            timeout=3600,
        )
        if result.exit_status != 0:
            raise HTTPException(status_code=502, detail=f"Download failed: {result.stderr or result.stdout}")
        return {"name": filename, "url": url}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid filename") from exc
    except HTTPException:
        raise
    except ssh_mod.SshError as exc:
        raise HTTPException(status_code=502, detail=f"SSH failed: {exc}") from exc


@router.delete("/nodes/{node_id}/models", status_code=status.HTTP_204_NO_CONTENT)
async def delete_model(node_id: str, payload: DeleteModelIn):
    db = get_database()
    node = await _require_node(db, node_id)
    try:
        filename = safe_model_filename(payload.filename)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid filename") from exc
    try:
        model_dir = await _expand_dir(node)
        await ssh_mod.run_command(node, LlamaCppEngine.delete_model_command(model_dir, filename))
    except ssh_mod.SshError as exc:
        raise HTTPException(status_code=502, detail=f"SSH failed: {exc}") from exc
    return None


@router.get("/nodes/{node_id}/status")
async def node_status(node_id: str):
    db = get_database()
    node = await _require_node(db, node_id)
    body = {"ssh": "down", "openai": "down", "models": [], "detail": None, "checkedAt": None}
    try:
        await ssh_mod.run_command(node, "uname -s")
        body["ssh"] = "up"
    except ssh_mod.SshError as exc:
        body["detail"] = f"SSH failed: {exc}"
    try:
        models = await openai_proxy.fetch_models(node.get("openaiBaseUrl") or "", node.get("openaiApiKey") or "")
        body["openai"] = "up"
        body["models"] = [m.get("id") for m in models if m.get("id")]
    except openai_proxy.OpenAIProxyError as exc:
        body["detail"] = str(exc) if not body["detail"] else f"{body['detail']}; {exc}"
    now = datetime.utcnow()
    check = {
        "openai": body["openai"],
        "checkedAt": now,
        "models": body["models"],
        "detail": body["detail"],
    }
    await db.nodes.update_one(
        {"_id": node["_id"]},
        {"$set": {"lastOpenAICheck": check, "updatedAt": now}},
    )
    body["checkedAt"] = now.isoformat()
    return body


@router.get("/nodes/{node_id}/models/openai")
async def openai_models(node_id: str):
    db = get_database()
    node = await _require_node(db, node_id)
    try:
        models = await openai_proxy.fetch_models(node.get("openaiBaseUrl") or "", node.get("openaiApiKey") or "")
        return {"data": models}
    except openai_proxy.OpenAIProxyError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("/nodes/{node_id}/chat")
async def chat(node_id: str, payload: ChatIn):
    db = get_database()
    node = await _require_node(db, node_id)
    body = {
        "model": payload.model,
        "messages": [m.model_dump() for m in payload.messages],
        "stream": False,
    }
    if payload.temperature is not None:
        body["temperature"] = payload.temperature
    if payload.topP is not None:
        body["top_p"] = payload.topP
    if payload.topK is not None:
        body["top_k"] = payload.topK
    if payload.maxTokens is not None:
        body["max_tokens"] = payload.maxTokens
    try:
        return await openai_proxy.chat_completions(
            node.get("openaiBaseUrl") or "",
            node.get("openaiApiKey") or "",
            body,
        )
    except openai_proxy.OpenAIProxyError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

