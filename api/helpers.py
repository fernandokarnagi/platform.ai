from datetime import datetime
from bson import ObjectId
from fastapi import HTTPException, status
from api.models.models import ServerParams

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


def cluster_helper(doc: dict, node_count: int = 0, running_count: int = 0) -> dict:
    stopped = max(int(node_count) - int(running_count), 0)
    return {
        "id": str(doc["_id"]),
        "name": doc.get("name", ""),
        "engine": doc.get("engine", "llama.cpp"),
        "description": doc.get("description", ""),
        "nodeCount": node_count,
        "runningCount": running_count,
        "stoppedCount": stopped,
        "createdAt": _iso(doc.get("createdAt")),
        "updatedAt": _iso(doc.get("updatedAt")),
    }


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
        "listenPort": doc.get("listenPort", 8080),
        "modelDir": doc.get("modelDir", "~/models"),
        "serverParams": doc.get("serverParams") or default_server_params(),
        "lastStart": doc.get("lastStart"),
        "lastOpenAICheck": _last_openai_check(doc.get("lastOpenAICheck")),
        "createdAt": _iso(doc.get("createdAt")),
        "updatedAt": _iso(doc.get("updatedAt")),
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


def safe_model_filename(filename: str) -> str:
    name = (filename or "").strip()
    if not name or name.startswith("/") or ".." in name or "/" in name or "\\" in name:
        raise ValueError("Invalid filename")
    return name
