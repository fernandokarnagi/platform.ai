import os
from datetime import datetime, timezone

from api.engines import is_vllm_engine
from api.helpers import resolve_library_dir, safe_model_filename
from api.services import ssh as ssh_mod

LIBRARY_KINDS = ("llama.cpp", "vllm")


def control_plane_node() -> dict:
    return {"host": "localhost", "nodeType": "local", "sshAuthType": "none"}


def normalize_kind(kind: str | None) -> str:
    raw = (kind or "").strip()
    if raw in ("vllm", "vllm-metal"):
        return "vllm"
    if raw == "llama.cpp":
        return "llama.cpp"
    raise ValueError("kind must be llama.cpp or vllm")


def kind_dir(root: str, kind: str) -> str:
    return os.path.join(root, normalize_kind(kind))


def ensure_library_dirs(root: str) -> str:
    os.makedirs(kind_dir(root, "llama.cpp"), exist_ok=True)
    os.makedirs(kind_dir(root, "vllm"), exist_ok=True)
    return root


def library_item_path(root: str, kind: str, filename: str) -> str:
    name = safe_model_filename(filename)
    return os.path.join(kind_dir(root, kind), name)


def _mtime(path: str) -> str:
    stamp = datetime.fromtimestamp(os.path.getmtime(path), tz=timezone.utc)
    return stamp.replace(tzinfo=None).isoformat()


def _dir_size(path: str) -> int:
    total = 0
    for dirpath, _dirs, files in os.walk(path):
        for name in files:
            try:
                total += os.path.getsize(os.path.join(dirpath, name))
            except OSError:
                continue
    return total


def list_library(settings: dict | None = None, kind: str | None = None) -> list[dict]:
    root = ensure_library_dirs(resolve_library_dir(settings))
    wanted = None if not kind else normalize_kind(kind)
    items: list[dict] = []
    if wanted in (None, "llama.cpp"):
        folder = kind_dir(root, "llama.cpp")
        for name in sorted(os.listdir(folder)):
            path = os.path.join(folder, name)
            if not name.lower().endswith(".gguf") or not os.path.isfile(path):
                continue
            items.append(
                {
                    "kind": "llama.cpp",
                    "name": name,
                    "sizeBytes": os.path.getsize(path),
                    "mtime": _mtime(path),
                }
            )
    if wanted in (None, "vllm"):
        folder = kind_dir(root, "vllm")
        for name in sorted(os.listdir(folder)):
            path = os.path.join(folder, name)
            if not os.path.isdir(path) or not os.path.isfile(os.path.join(path, "config.json")):
                continue
            items.append(
                {
                    "kind": "vllm",
                    "name": name,
                    "sizeBytes": _dir_size(path),
                    "mtime": _mtime(path),
                }
            )
    return items


def require_library_item(settings: dict | None, kind: str, filename: str) -> str:
    path = library_item_path(resolve_library_dir(settings), kind, filename)
    if not os.path.exists(path):
        raise FileNotFoundError(filename)
    return path


async def copy_to_node(node: dict, local_path: str, dest_path: str) -> None:
    await ssh_mod.push_path(node, local_path, dest_path)


async def runner_for_job(db, doc: dict) -> dict | None:
    if doc.get("nodeId"):
        return await db.nodes.find_one({"_id": doc["nodeId"]})
    if doc.get("target") == "library":
        return control_plane_node()
    return None


def node_kind(node: dict | None, engine=None) -> str:
    if is_vllm_engine(engine) or is_vllm_engine((node or {}).get("engine")):
        return "vllm"
    return "llama.cpp"
