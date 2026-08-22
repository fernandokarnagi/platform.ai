import os
from datetime import datetime, timedelta
from bson import ObjectId
from fastapi import HTTPException, status
from api.models.models import ServerParams

STATUS_CACHE_TTL = timedelta(minutes=30)

LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1", "0.0.0.0"}


def is_local_host(host: str) -> bool:
    return (host or "").strip().lower().split("%", 1)[0] in LOCAL_HOSTS


def is_local_node(node: dict) -> bool:
    kind = str(node.get("nodeType") or "").strip().lower()
    if kind == "local":
        return True
    if kind == "remote":
        return False
    return is_local_host(str(node.get("host") or ""))


def apply_node_location(doc: dict, node_type: str | None, host: str | None) -> None:
    """Force local vs remote fields on a node document in place."""
    kind = (node_type or "").strip().lower()
    if kind == "local" or (not kind and is_local_host(host or "")):
        doc["nodeType"] = "local"
        doc["host"] = "localhost"
        doc["sshPort"] = 22
        doc["sshAuthType"] = "none"
        doc["sshUser"] = ""
        doc["sshPassword"] = ""
        doc["sshPrivateKey"] = ""
        doc["sshPassphrase"] = ""
        return
    doc["nodeType"] = "remote"
    if not (host or "").strip() or is_local_host(host or ""):
        raise HTTPException(status_code=400, detail="Host is required for remote nodes")
    if not str(doc.get("sshUser") or "").strip() or str(doc.get("sshAuthType") or "") in ("", "none"):
        raise HTTPException(status_code=400, detail="SSH user and auth are required for remote hosts")


def parse_object_id(value: str) -> ObjectId:
    if not ObjectId.is_valid(value):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid id")
    return ObjectId(value)


def _iso(value) -> str:
    if isinstance(value, datetime):
        return value.isoformat()
    return value or ""


def default_server_params() -> dict:
    return ServerParams().model_dump()


LLAMA_CPP_PARAM_KEYS = (
    "ctxSize",
    "gpuLayers",
    "flashAttn",
    "threads",
    "parallel",
    "batchSize",
    "ubatchSize",
    "kvOffload",
    "fit",
    "cacheTypeK",
    "cacheTypeV",
    "nPredict",
    "keep",
    "threadsBatch",
    "splitMode",
    "mainGpu",
    "tensorSplit",
    "device",
    "cpuMoe",
    "nCpuMoe",
    "loadMode",
    "jinja",
    "chatTemplate",
    "metrics",
    "alias",
    "extraFlags",
)


def llama_cpp_engine_defaults() -> dict:
    return {
        "ctxSize": 0,
        "gpuLayers": "auto",
        "flashAttn": "auto",
        "threads": None,
        "parallel": 1,
        "batchSize": None,
        "ubatchSize": None,
        "kvOffload": True,
        "fit": "on",
        "cacheTypeK": None,
        "cacheTypeV": None,
        "nPredict": None,
        "keep": None,
        "threadsBatch": None,
        "splitMode": None,
        "mainGpu": None,
        "tensorSplit": None,
        "device": None,
        "cpuMoe": None,
        "nCpuMoe": None,
        "loadMode": None,
        "jinja": None,
        "chatTemplate": None,
        "metrics": None,
        "alias": None,
        "extraFlags": "",
    }


def param_is_set(value) -> bool:
    if value is None:
        return False
    if isinstance(value, str) and value.strip() == "":
        return False
    return True


def merge_llama_cpp_params(node_params: dict | None = None, settings_params: dict | None = None) -> dict:
    """Engine defaults, then Settings, then node. Empty/None node fields inherit."""
    merged = llama_cpp_engine_defaults()
    node = node_params or {}
    settings = settings_params or {}
    for key in LLAMA_CPP_PARAM_KEYS:
        if param_is_set(settings.get(key)):
            merged[key] = settings.get(key)
        if param_is_set(node.get(key)):
            merged[key] = node.get(key)
    out = dict(node)
    out.update(merged)
    return out


def apply_llama_cpp_settings(node: dict, settings: dict | None = None) -> dict:
    engine = str(node.get("engine") or "llama.cpp").strip()
    if engine in ("vllm", "vllm-metal"):
        return node
    params = merge_llama_cpp_params(node.get("serverParams"), (settings or {}).get("llamaCpp"))
    return {**node, "serverParams": params}


def llama_cpp_settings_helper(raw) -> dict:
    base = {key: None for key in LLAMA_CPP_PARAM_KEYS}
    base["extraFlags"] = ""
    if isinstance(raw, dict):
        for key in LLAMA_CPP_PARAM_KEYS:
            if key in raw:
                base[key] = raw.get(key)
    return base


VLLM_PARAM_KEYS = (
    "tensorParallelSize",
    "gpuMemoryUtilization",
    "maxModelLen",
    "dtype",
    "quantization",
    "maxNumSeqs",
    "swapSpace",
    "kvCacheDtype",
    "servedModelName",
    "trustRemoteCode",
    "enforceEager",
    "enablePrefixCaching",
    "extraFlags",
)


def vllm_engine_defaults() -> dict:
    return {
        "tensorParallelSize": 1,
        "gpuMemoryUtilization": 0.9,
        "maxModelLen": None,
        "dtype": None,
        "quantization": None,
        "maxNumSeqs": None,
        "swapSpace": None,
        "kvCacheDtype": None,
        "servedModelName": None,
        "trustRemoteCode": None,
        "enforceEager": None,
        "enablePrefixCaching": None,
        "extraFlags": "",
    }


def merge_vllm_params(node_params: dict | None = None, settings_params: dict | None = None) -> dict:
    """Engine defaults, then Settings, then node. Empty/None node fields inherit."""
    merged = vllm_engine_defaults()
    node = node_params or {}
    settings = settings_params or {}
    for key in VLLM_PARAM_KEYS:
        if param_is_set(settings.get(key)):
            merged[key] = settings.get(key)
        if param_is_set(node.get(key)):
            merged[key] = node.get(key)
    out = dict(node)
    out.update(merged)
    return out


def apply_vllm_settings(node: dict, settings: dict | None = None) -> dict:
    engine = str(node.get("engine") or "").strip()
    if engine not in ("vllm", "vllm-metal"):
        return node
    params = merge_vllm_params(node.get("serverParams"), (settings or {}).get("vllm"))
    return {**node, "serverParams": params}


def apply_engine_settings(node: dict, settings: dict | None = None) -> dict:
    engine = str(node.get("engine") or "llama.cpp").strip()
    if engine in ("vllm", "vllm-metal"):
        return apply_vllm_settings(node, settings)
    return apply_llama_cpp_settings(node, settings)


def vllm_settings_helper(raw) -> dict:
    base = {key: None for key in VLLM_PARAM_KEYS}
    base["extraFlags"] = ""
    if isinstance(raw, dict):
        for key in VLLM_PARAM_KEYS:
            if key in raw:
                base[key] = raw.get(key)
    return base


def cluster_helper(doc: dict, node_count: int = 0, running_count: int = 0) -> dict:
    stopped = max(int(node_count) - int(running_count), 0)
    return {
        "id": str(doc["_id"]),
        "name": doc.get("name", ""),
        "engine": doc.get("engine", "llama.cpp"),
        "description": doc.get("description", ""),
        "hfToken": doc.get("hfToken") or "",
        "nodeCount": node_count,
        "runningCount": running_count,
        "stoppedCount": stopped,
        "createdAt": _iso(doc.get("createdAt")),
        "updatedAt": _iso(doc.get("updatedAt")),
    }


SETTINGS_DOC_ID = "app"
DEFAULT_LIBRARY_DIR = "/Users/fernando.karnagi/App/globalmodel"


def resolve_library_dir(settings: dict | None = None) -> str:
    raw = str((settings or {}).get("libraryDir") or "").strip() or DEFAULT_LIBRARY_DIR
    return os.path.abspath(os.path.expanduser(raw))


def settings_helper(doc: dict | None = None) -> dict:
    data = doc or {}
    return {
        "hfToken": data.get("hfToken") or "",
        "libraryDir": resolve_library_dir(data),
        "llamaCpp": llama_cpp_settings_helper(data.get("llamaCpp")),
        "vllm": vllm_settings_helper(data.get("vllm")),
        "updatedAt": _iso(data.get("updatedAt")),
    }


def resolve_hf_token(
    node: dict | None = None,
    cluster: dict | None = None,
    override: str | None = None,
    settings: dict | None = None,
) -> str:
    """Payload override, then node, then cluster, then Settings."""
    for value in (
        override,
        (node or {}).get("hfToken"),
        (cluster or {}).get("hfToken"),
        (settings or {}).get("hfToken"),
    ):
        text = str(value or "").strip()
        if text:
            return text
    return ""


def node_helper(doc: dict) -> dict:
    cluster_id = doc.get("clusterId")
    return {
        "id": str(doc["_id"]),
        "clusterId": str(cluster_id) if cluster_id is not None else "",
        "name": doc.get("name", ""),
        "nodeType": "local" if is_local_node(doc) else "remote",
        "host": doc.get("host", ""),
        "sshPort": doc.get("sshPort", 22),
        "sshUser": doc.get("sshUser", ""),
        "sshAuthType": doc.get("sshAuthType", "password"),
        "sshPassword": doc.get("sshPassword", ""),
        "sshPrivateKey": doc.get("sshPrivateKey", ""),
        "sshPassphrase": doc.get("sshPassphrase", ""),
        "openaiBaseUrl": doc.get("openaiBaseUrl", ""),
        "openaiApiKey": doc.get("openaiApiKey", ""),
        "hfToken": doc.get("hfToken", ""),
        "listenHost": doc.get("listenHost", "0.0.0.0"),
        "engine": doc.get("engine") or "llama.cpp",
        "listenPort": doc.get("listenPort", 8080),
        "modelDir": doc.get("modelDir", "~/models"),
        "llamaServerPath": doc.get("llamaServerPath") or "",
        "vllmImage": doc.get("vllmImage") or "",
        "selectedModel": doc.get("selectedModel") or "",
        "serverParams": doc.get("serverParams") or default_server_params(),
        "lastStart": doc.get("lastStart"),
        "lastOpenAICheck": _last_openai_check(doc.get("lastOpenAICheck")),
        "statusCache": status_cache_helper(doc),
        "modelsCache": models_cache_helper(doc),
        "createdAt": _iso(doc.get("createdAt")),
        "updatedAt": _iso(doc.get("updatedAt")),
    }


def _parse_checked_at(value) -> datetime | None:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str) and value.strip():
        try:
            return datetime.fromisoformat(value.replace("Z", ""))
        except ValueError:
            return None
    return None


def status_cache_is_fresh(doc: dict) -> bool:
    cache = doc.get("statusCache")
    if not isinstance(cache, dict):
        return False
    checked = _parse_checked_at(cache.get("checkedAt"))
    if not checked:
        return False
    return datetime.utcnow() - checked < STATUS_CACHE_TTL


def models_cache_is_fresh(doc: dict) -> bool:
    cache = doc.get("modelsCache")
    if not isinstance(cache, dict):
        return False
    checked = _parse_checked_at(cache.get("checkedAt"))
    if not checked:
        return False
    return datetime.utcnow() - checked < STATUS_CACHE_TTL


def models_cache_helper(doc: dict) -> dict | None:
    cache = doc.get("modelsCache")
    if not isinstance(cache, dict):
        return None
    checked = cache.get("checkedAt")
    return {
        "items": list(cache.get("items") or []),
        "checkedAt": _iso(checked) if checked else "",
        "fresh": models_cache_is_fresh(doc),
    }


def status_cache_helper(doc: dict) -> dict | None:
    cache = doc.get("statusCache")
    if not isinstance(cache, dict):
        return None
    checked = cache.get("checkedAt")
    return {
        "ssh": cache.get("ssh") or "down",
        "openai": cache.get("openai") or "down",
        "running": bool(cache.get("running")),
        "pid": cache.get("pid"),
        "models": list(cache.get("models") or []),
        "detail": cache.get("detail"),
        "checkedAt": _iso(checked) if checked else "",
        "fresh": status_cache_is_fresh(doc),
    }


def _last_openai_check(value) -> dict | None:
    if not isinstance(value, dict):
        return None
    checked = value.get("checkedAt")
    return {
        "openai": value.get("openai") or "down",
        "checkedAt": _iso(checked) if checked else "",
        "models": value.get("models") or [],
        "detail": value.get("detail"),
    }


def download_helper(doc: dict) -> dict:
    cluster_id = doc.get("clusterId")
    node_id = doc.get("nodeId")
    return {
        "id": str(doc["_id"]),
        "nodeId": str(node_id) if node_id is not None else "",
        "clusterId": str(cluster_id) if cluster_id is not None else "",
        "nodeName": doc.get("nodeName") or "",
        "source": doc.get("source") or "",
        "repo": doc.get("repo") or "",
        "filename": doc.get("filename") or "",
        "url": doc.get("url") or "",
        "kind": doc.get("kind") or "",
        "target": doc.get("target") or ("library" if not node_id else "node"),
        "status": doc.get("status") or "queued",
        "bytes": int(doc.get("bytes") or 0),
        "totalBytes": int(doc.get("totalBytes") or 0),
        "detail": doc.get("detail") or "",
        "createdAt": _iso(doc.get("createdAt")),
        "updatedAt": _iso(doc.get("updatedAt")),
        "finishedAt": _iso(doc.get("finishedAt")) if doc.get("finishedAt") else "",
    }


def safe_model_filename(filename: str) -> str:
    name = (filename or "").strip()
    if not name or name.startswith("/") or ".." in name or "/" in name or "\\" in name:
        raise ValueError("Invalid filename")
    return name
