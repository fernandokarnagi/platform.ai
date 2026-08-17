from datetime import datetime
import asyncio
import httpx
from fastapi import APIRouter, HTTPException, Query, status
from api.database import get_database
from api.engines import ForbiddenExtraFlagsError, get_engine as resolve_engine
from api.helpers import (
    apply_node_location,
    download_helper,
    is_local_node,
    models_cache_is_fresh,
    node_helper,
    parse_object_id,
    safe_model_filename,
)
from api.logger import get_logger
from api.models.models import ChatIn, DeleteModelIn, DownloadModelIn, NodeIn, NodeUpdate, StartEngineIn
from api.services import engine as engine_mod
from api.services import openai_proxy as openai_proxy
from api.services import ssh as ssh_mod
from api.services import status_cache as status_cache_mod

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


async def _cluster_engine_name(db, cluster_id) -> str:
    cluster = await db.clusters.find_one({"_id": cluster_id}) if cluster_id is not None else None
    return (cluster or {}).get("engine") or "llama.cpp"


async def _engine_for(db, node: dict):
    name = node.get("engine") or await _cluster_engine_name(db, node.get("clusterId"))
    try:
        return resolve_engine(name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


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
    doc["engine"] = await _cluster_engine_name(db, oid)
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
        result = await ssh_mod.run_command(node, "uname -s")
    except ssh_mod.SshError as exc:
        raise HTTPException(status_code=502, detail=f"{label} failed: {exc}") from exc
    if result.exit_status != 0:
        raise HTTPException(status_code=502, detail=f"{label} failed: {result.stderr or result.stdout}")
    uname = (result.stdout or "").strip().splitlines()[0] if result.stdout.strip() else ""
    try:
        binary = await _resolve_binary(node, await _engine_for(db, node))
    except HTTPException as exc:
        raise HTTPException(status_code=502, detail=f"{label} failed: {exc.detail}") from exc
    return {"ok": True, "local": local, "uname": uname, "llamaServer": binary}


def _vllm_crash_detail(log: str) -> str:
    text = log or ""
    if "0 devices" in text or "out of bounds for 0 devices" in text:
        return "vLLM sees 0 GPUs (no CUDA). Install the NVIDIA driver on the node so nvidia-smi works, then restart."
    if "libcuda.so.1" in text:
        return "vLLM cannot load libcuda.so.1. The NVIDIA driver is missing on this node."
    if "CUDA out of memory" in text or "OutOfMemory" in text:
        return "vLLM ran out of GPU memory. Lower gpu memory util or use a smaller model."
    if "Engine core initialization failed" in text:
        return "vLLM engine core failed to start. Open the log for the traceback."
    return "vLLM process died after start. Open the log."


async def _confirm_vllm_stayed_up(node: dict, engine, pid: str) -> None:
    for _ in range(5):
        await asyncio.sleep(1)
        alive = await ssh_mod.run_command(node, engine.pid_alive_command(pid))
        if "alive" in alive.stdout:
            continue
        hint = "vLLM process died after start. Open the log."
        try:
            tailed = await ssh_mod.run_command(node, engine.tail_log_command(200))
            hint = _vllm_crash_detail(tailed.stdout or "")
        except ssh_mod.SshError:
            pass
        raise HTTPException(status_code=502, detail=hint)
    return None


def _last_line(stdout: str) -> str:
    lines = [line.strip() for line in (stdout or "").splitlines() if line.strip()]
    return lines[-1] if lines else ""


async def _expand_dir(node, engine):
    model_dir = node.get("modelDir") or "~/models"
    result = await ssh_mod.run_command(node, engine.expand_model_dir_command(model_dir))
    expanded = _last_line(result.stdout)
    if not expanded:
        raise HTTPException(status_code=502, detail="SSH failed: empty modelDir")
    return expanded


async def _resolve_binary(node, engine):
    label = getattr(engine, "BINARY_LABEL", "llama-server")
    if getattr(engine, "NAME", "") == "vllm":
        result = await ssh_mod.run_command(node, engine.resolve_binary_command())
        binary = result.stdout.strip().splitlines()[0] if result.stdout.strip() else "MISSING"
        if binary == "MISSING":
            raise HTTPException(status_code=502, detail="docker not found on node")
        return binary
    configured = (node.get("llamaServerPath") or "").strip()
    if configured:
        result = await ssh_mod.run_command(node, engine.verify_binary_command(configured))
        binary = _last_line(result.stdout) or "MISSING"
        if binary == "MISSING":
            raise HTTPException(status_code=502, detail=f"{label} not found at {configured}")
        return binary
    result = await ssh_mod.run_command(node, engine.resolve_binary_command())
    binary = result.stdout.strip().splitlines()[0] if result.stdout.strip() else "MISSING"
    if binary == "MISSING":
        raise HTTPException(status_code=502, detail=f"{label} not found on node")
    return binary


@router.get("/nodes/{node_id}/engine")
async def get_engine(node_id: str, refresh: bool = Query(False)):
    db = get_database()
    node = await _require_node(db, node_id)
    try:
        status_body = await status_cache_mod.get_engine(db, node, refresh=refresh)
        if refresh:
            try:
                status_body["llamaServer"] = await _resolve_binary(node, await _engine_for(db, node))
            except HTTPException:
                status_body["llamaServer"] = None
        return status_body
    except ssh_mod.SshError as exc:
        raise HTTPException(status_code=502, detail=f"SSH failed: {exc}") from exc


@router.post("/nodes/{node_id}/engine/start")
async def start_engine(node_id: str, payload: StartEngineIn):
    db = get_database()
    node = await _require_node(db, node_id)
    engine = await _engine_for(db, node)
    try:
        current = await engine_mod.engine_status(node)
        if current["running"]:
            raise HTTPException(status_code=409, detail="Engine already running")
        model_dir = await _expand_dir(node, engine)
        binary = await _resolve_binary(node, engine)
        selected = (payload.modelFilename or node.get("selectedModel") or "").strip()
        if getattr(engine, "NAME", "") == "vllm" and not selected:
            raise HTTPException(status_code=400, detail="Select a model before starting vLLM")
        start_node = {**node, "selectedModel": selected, "modelFilename": selected}
        argv = engine.build_argv(start_node, model_dir)
        if getattr(engine, "NAME", "") == "vllm":
            started = await ssh_mod.run_command(
                node, engine.start_command(binary, argv, start_node), timeout=180
            )
        else:
            started = await ssh_mod.run_command(node, engine.start_command(binary, argv), timeout=20)
        pid = _last_line(started.stdout)
        if not pid:
            raise HTTPException(status_code=502, detail="SSH failed: engine did not start")
        alive = await ssh_mod.run_command(node, engine.pid_alive_command(pid))
        if "alive" not in alive.stdout:
            raise HTTPException(status_code=502, detail="SSH failed: engine did not start")
        if getattr(engine, "NAME", "") == "vllm":
            await _confirm_vllm_stayed_up(node, engine, pid)
        last_start = {"modelFilename": selected, "argv": argv, "startedAt": datetime.utcnow().isoformat()}
        started_fields = {"lastStart": last_start, "updatedAt": datetime.utcnow()}
        if selected:
            started_fields["selectedModel"] = selected
        await db.nodes.update_one({"_id": node["_id"]}, {"$set": started_fields})
        await status_cache_mod.touch_engine(db, node, True, pid)
        return {"running": True, "pid": pid, "lastStart": last_start}
    except ForbiddenExtraFlagsError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except HTTPException:
        raise
    except ssh_mod.SshError as exc:
        raise HTTPException(status_code=502, detail=f"SSH failed: {exc}") from exc


@router.get("/nodes/{node_id}/engine/logs")
async def engine_logs(node_id: str, lines: int = Query(200, ge=20, le=1000)):
    db = get_database()
    node = await _require_node(db, node_id)
    try:
        engine = await _engine_for(db, node)
        result = await ssh_mod.run_command(node, engine.tail_log_command(lines))
    except ssh_mod.SshError as exc:
        raise HTTPException(status_code=502, detail=f"SSH failed: {exc}") from exc
    if result.exit_status != 0:
        raise HTTPException(status_code=502, detail=result.stderr or result.stdout or "log read failed")
    text = result.stdout or ""
    missing = text.strip() == "__PLATFORMAI_LOG_MISSING__"
    return {"text": "" if missing else text, "missing": missing, "lines": lines}


@router.post("/nodes/{node_id}/engine/stop")
async def stop_engine(node_id: str):
    db = get_database()
    node = await _require_node(db, node_id)
    try:
        engine = await _engine_for(db, node)
        await ssh_mod.run_command(node, engine.stop_command(), timeout=20)
        await status_cache_mod.touch_engine(db, node, False, None)
        return {"running": False, "pid": None, "lastStart": node.get("lastStart")}
    except ssh_mod.SshError as exc:
        raise HTTPException(status_code=502, detail=f"SSH failed: {exc}") from exc


@router.post("/nodes/{node_id}/engine/restart")
async def restart_engine(node_id: str):
    db = get_database()
    node = await _require_node(db, node_id)
    await stop_engine(node_id)
    return await start_engine(node_id, StartEngineIn())


def _parse_model_list(stdout: str) -> list[dict]:
    items = []
    for line in stdout.splitlines():
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


@router.get("/nodes/{node_id}/models")
async def list_models(node_id: str, refresh: bool = Query(False)):
    db = get_database()
    node = await _require_node(db, node_id)
    if not refresh and models_cache_is_fresh(node):
        cache = node.get("modelsCache") or {}
        return list(cache.get("items") or [])
    try:
        engine = await _engine_for(db, node)
        model_dir = await _expand_dir(node, engine)
        result = await ssh_mod.run_command(node, engine.list_models_command(model_dir))
    except ssh_mod.SshError as exc:
        raise HTTPException(status_code=502, detail=f"SSH failed: {exc}") from exc
    if result.exit_status != 0:
        raise HTTPException(
            status_code=502,
            detail=f"SSH failed: {result.stderr or result.stdout or 'list failed'}",
        )
    items = _parse_model_list(result.stdout)
    now = datetime.utcnow()
    await db.nodes.update_one(
        {"_id": node["_id"]},
        {"$set": {"modelsCache": {"items": items, "checkedAt": now}, "updatedAt": now}},
    )
    return items


async def _list_hf_files(repo: str, revision: str, token: str, suffixes: tuple[str, ...] | None = (".gguf",)) -> list[str]:
    return [item["name"] for item in await _list_hf_file_details(repo, revision, token, suffixes)]


async def _list_hf_file_details(
    repo: str,
    revision: str,
    token: str,
    suffixes: tuple[str, ...] | None = (".gguf",),
) -> list[dict]:
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.get(
                f"https://huggingface.co/api/models/{repo}/tree/{revision}",
                headers=headers,
            )
            if response.status_code != 200:
                return []
            data = response.json()
    except Exception:
        return []
    if not isinstance(data, list):
        return []
    files = []
    for item in data:
        path = str((item or {}).get("path") or "")
        if (item or {}).get("type") != "file" or not path:
            continue
        if suffixes and not any(path.lower().endswith(suffix) for suffix in suffixes):
            continue
        try:
            size = int((item or {}).get("size") or 0)
        except (TypeError, ValueError):
            size = 0
        files.append({"name": path, "sizeBytes": size})
    return files


@router.get("/nodes/{node_id}/models/huggingface")
async def list_hf_repo_files(node_id: str, repo: str = Query(...)):
    db = get_database()
    node = await _require_node(db, node_id)
    engine = await _engine_for(db, node)
    parsed = engine.parse_hf_ref(repo, "")
    if not parsed["repo"] or "/" not in parsed["repo"]:
        raise HTTPException(status_code=400, detail="repo must look like org/model")
    token = node.get("hfToken") or ""
    suffixes = None if getattr(engine, "NAME", "") == "vllm" else (".gguf",)
    files = await _list_hf_file_details(parsed["repo"], parsed["revision"], token, suffixes)
    if not files:
        detail = "No files found in that repo" if suffixes is None else "No GGUF files found in that repo"
        raise HTTPException(status_code=404, detail=detail)
    return {
        "repo": parsed["repo"],
        "revision": parsed["revision"],
        "quant": parsed["quant"],
        "files": files,
    }


@router.post("/nodes/{node_id}/models/download", status_code=status.HTTP_202_ACCEPTED)
async def download_model(node_id: str, payload: DownloadModelIn):
    db = get_database()
    node = await _require_node(db, node_id)
    engine = await _engine_for(db, node)
    try:
        parsed = {"repo": "", "revision": "main", "filename": "", "quant": ""}
        picked = ""
        if payload.source == "huggingface":
            if not payload.repo:
                raise HTTPException(status_code=400, detail="repo required")
            token = payload.hfToken or node.get("hfToken") or ""
            parsed = engine.parse_hf_ref(payload.repo, payload.filename or "")
            if not parsed["repo"] or "/" not in parsed["repo"]:
                raise HTTPException(status_code=400, detail="repo must look like org/model")
            if getattr(engine, "NAME", "") == "vllm":
                filename = safe_model_filename(engine.snapshot_dirname(parsed["repo"]))
                url = parsed["repo"]
                files = await _list_hf_file_details(parsed["repo"], parsed["revision"], token, None)
            else:
                files = await _list_hf_files(parsed["repo"], parsed["revision"], token)
                picked = engine.pick_hf_filename(files, parsed["filename"], parsed["quant"])
                if not picked:
                    if parsed["filename"]:
                        picked = parsed["filename"]
                    elif files:
                        raise HTTPException(
                            status_code=400,
                            detail="File not found. Available: " + ", ".join(path.split("/")[-1] for path in files),
                        )
                    else:
                        raise HTTPException(status_code=400, detail="repo and filename required")
                filename = safe_model_filename(picked.split("/")[-1])
                url = engine.hf_url(parsed["repo"], picked, parsed["revision"])
        elif payload.source == "url":
            if not payload.url:
                raise HTTPException(status_code=400, detail="url required")
            filename = payload.filename or payload.url.rstrip("/").split("?")[0].split("/")[-1]
            filename = safe_model_filename(filename)
            url = payload.url
            token = ""
        else:
            raise HTTPException(status_code=400, detail="source must be huggingface or url")
        model_dir = await _expand_dir(node, engine)
        total = 0
        if payload.source == "huggingface":
            listed = await _list_hf_file_details(
                parsed["repo"],
                parsed["revision"],
                token,
                None if getattr(engine, "NAME", "") == "vllm" else (".gguf",),
            )
            if getattr(engine, "NAME", "") == "vllm":
                total = sum(int(item.get("sizeBytes") or 0) for item in listed)
            else:
                for item in listed:
                    if item["name"] == picked or item["name"].endswith("/" + filename):
                        total = int(item.get("sizeBytes") or 0)
                        break
        now = datetime.utcnow()
        job = {
            "nodeId": node["_id"],
            "clusterId": node.get("clusterId"),
            "nodeName": node.get("name") or "",
            "engine": getattr(engine, "NAME", node.get("engine") or "llama.cpp"),
            "source": payload.source,
            "repo": parsed["repo"] if payload.source == "huggingface" else "",
            "filename": filename,
            "url": url,
            "modelDir": model_dir,
            "status": "queued",
            "bytes": 0,
            "totalBytes": total,
            "detail": "",
            "createdAt": now,
            "updatedAt": now,
            "finishedAt": None,
        }
        inserted = await db.downloads.insert_one(job)
        job["_id"] = inserted.inserted_id
        try:
            started = await ssh_mod.run_command(
                node,
                engine.start_download_command(model_dir, filename, url, str(job["_id"]), token),
            )
        except ssh_mod.SshError as exc:
            await db.downloads.update_one(
                {"_id": job["_id"]},
                {"$set": {"status": "failed", "detail": str(exc), "updatedAt": datetime.utcnow(), "finishedAt": datetime.utcnow()}},
            )
            raise HTTPException(status_code=502, detail=f"Download failed: {exc}") from exc
        pid = (started.stdout or "").strip().splitlines()
        pid = pid[-1] if pid else ""
        if started.exit_status != 0 or not pid:
            err = (started.stderr or started.stdout or "failed to start download").strip()
            await db.downloads.update_one(
                {"_id": job["_id"]},
                {"$set": {"status": "failed", "detail": err, "updatedAt": datetime.utcnow(), "finishedAt": datetime.utcnow()}},
            )
            raise HTTPException(status_code=502, detail=f"Download failed: {err}")
        await db.downloads.update_one(
            {"_id": job["_id"]},
            {"$set": {"status": "running", "detail": "", "updatedAt": datetime.utcnow()}},
        )
        await db.nodes.update_one({"_id": node["_id"]}, {"$unset": {"modelsCache": ""}})
        created = await db.downloads.find_one({"_id": job["_id"]})
        return download_helper(created)
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
        engine = await _engine_for(db, node)
        model_dir = await _expand_dir(node, engine)
        await ssh_mod.run_command(node, engine.delete_model_command(model_dir, filename))
    except ssh_mod.SshError as exc:
        raise HTTPException(status_code=502, detail=f"SSH failed: {exc}") from exc
    await db.nodes.update_one({"_id": node["_id"]}, {"$unset": {"modelsCache": ""}})
    return None


@router.get("/nodes/{node_id}/status")
async def node_status(
    node_id: str,
    refresh: bool = Query(False),
    check: str | None = Query(None),
):
    db = get_database()
    node = await _require_node(db, node_id)
    try:
        body = await status_cache_mod.get_status(db, node, refresh=refresh, check=check)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return status_cache_mod.status_payload(body)


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
    if payload.minP is not None:
        body["min_p"] = payload.minP
    if payload.presencePenalty is not None:
        body["presence_penalty"] = payload.presencePenalty
    if payload.repetitionPenalty is not None:
        body["repetition_penalty"] = payload.repetitionPenalty
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

