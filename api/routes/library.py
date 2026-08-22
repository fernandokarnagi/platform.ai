from datetime import datetime

from fastapi import APIRouter, HTTPException, Query, status

from api.database import get_database
from api.engines import get_engine, is_vllm_engine
from api.helpers import (
    SETTINGS_DOC_ID,
    download_helper,
    resolve_hf_token,
    resolve_library_dir,
    safe_model_filename,
)
from api.models.models import LibraryDownloadIn
from api.routes import nodes as nodes_mod
from api.services import library as library_mod
from api.services import ssh as ssh_mod

router = APIRouter(tags=["library"])


def _engine_for_kind(kind: str):
    family = library_mod.normalize_kind(kind)
    return get_engine("vllm" if family == "vllm" else "llama.cpp")


@router.get("/library/models")
async def list_library_models(kind: str | None = None):
    db = get_database()
    settings = await db.settings.find_one({"_id": SETTINGS_DOC_ID})
    try:
        items = library_mod.list_library(settings, kind)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"libraryDir": resolve_library_dir(settings), "items": items}


@router.get("/library/huggingface")
async def list_library_hf(repo: str = Query(...), kind: str = "llama.cpp"):
    db = get_database()
    settings = await db.settings.find_one({"_id": SETTINGS_DOC_ID})
    try:
        family = library_mod.normalize_kind(kind)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    engine = _engine_for_kind(family)
    parsed = engine.parse_hf_ref(repo, "")
    if not parsed["repo"] or "/" not in parsed["repo"]:
        raise HTTPException(status_code=400, detail="repo must look like org/model")
    token = resolve_hf_token(settings=settings)
    suffixes = None if family == "vllm" else (".gguf",)
    files = await nodes_mod._list_hf_file_details(parsed["repo"], parsed["revision"], token, suffixes)
    if not files:
        detail = "No files found in that repo" if suffixes is None else "No GGUF files found in that repo"
        raise HTTPException(status_code=404, detail=detail)
    return {
        "repo": parsed["repo"],
        "revision": parsed["revision"],
        "quant": parsed["quant"],
        "files": files,
    }


@router.post("/library/download", status_code=status.HTTP_202_ACCEPTED)
async def download_to_library(payload: LibraryDownloadIn):
    db = get_database()
    settings = await db.settings.find_one({"_id": SETTINGS_DOC_ID})
    try:
        family = library_mod.normalize_kind(payload.kind)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    engine = _engine_for_kind(family)
    root = library_mod.ensure_library_dirs(resolve_library_dir(settings))
    model_dir = library_mod.kind_dir(root, family)
    try:
        parsed = {"repo": "", "revision": "main", "filename": "", "quant": ""}
        picked = ""
        if payload.source == "huggingface":
            if not payload.repo:
                raise HTTPException(status_code=400, detail="repo required")
            token = resolve_hf_token(override=payload.hfToken, settings=settings)
            parsed = engine.parse_hf_ref(payload.repo, payload.filename or "")
            if not parsed["repo"] or "/" not in parsed["repo"]:
                raise HTTPException(status_code=400, detail="repo must look like org/model")
            if is_vllm_engine(engine):
                filename = safe_model_filename(engine.snapshot_dirname(parsed["repo"]))
                url = parsed["repo"]
                files = await nodes_mod._list_hf_file_details(parsed["repo"], parsed["revision"], token, None)
            else:
                files = await nodes_mod._list_hf_files(parsed["repo"], parsed["revision"], token)
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
        total = 0
        if payload.source == "huggingface":
            listed = await nodes_mod._list_hf_file_details(
                parsed["repo"],
                parsed["revision"],
                token,
                None if is_vllm_engine(engine) else (".gguf",),
            )
            if is_vllm_engine(engine):
                total = sum(int(item.get("sizeBytes") or 0) for item in listed)
            else:
                for item in listed:
                    if item["name"] == picked or item["name"].endswith("/" + filename):
                        total = int(item.get("sizeBytes") or 0)
                        break
        now = datetime.utcnow()
        job = {
            "nodeId": None,
            "clusterId": None,
            "nodeName": "library",
            "engine": family,
            "kind": family,
            "target": "library",
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
        runner = library_mod.control_plane_node()
        try:
            started = await ssh_mod.run_command(
                runner,
                engine.start_download_command(model_dir, filename, url, str(job["_id"]), token),
                timeout=60.0,
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
        created = await db.downloads.find_one({"_id": job["_id"]})
        return download_helper(created)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid filename") from exc
    except HTTPException:
        raise
    except ssh_mod.SshError as exc:
        raise HTTPException(status_code=502, detail=f"Download failed: {exc}") from exc
