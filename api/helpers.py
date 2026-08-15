from datetime import datetime
from bson import ObjectId
from fastapi import HTTPException, status
from api.models.models import ServerParams


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


def cluster_helper(doc: dict, node_count: int = 0) -> dict:
    return {
        "id": str(doc["_id"]),
        "name": doc.get("name", ""),
        "engine": doc.get("engine", "llama.cpp"),
        "description": doc.get("description", ""),
        "nodeCount": node_count,
        "createdAt": _iso(doc.get("createdAt")),
        "updatedAt": _iso(doc.get("updatedAt")),
    }


def node_helper(doc: dict) -> dict:
    cluster_id = doc.get("clusterId")
    return {
        "id": str(doc["_id"]),
        "clusterId": str(cluster_id) if cluster_id is not None else "",
        "name": doc.get("name", ""),
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
        "createdAt": _iso(doc.get("createdAt")),
        "updatedAt": _iso(doc.get("updatedAt")),
    }


def safe_model_filename(filename: str) -> str:
    name = (filename or "").strip()
    if not name or name.startswith("/") or ".." in name or "/" in name or "\\" in name:
        raise ValueError("Invalid filename")
    return name
