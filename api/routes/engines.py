from fastapi import APIRouter, HTTPException
from api.engines.llama_cpp import ForbiddenExtraFlagsError, LlamaCppEngine
from api.models.models import PreviewIn

router = APIRouter(tags=["engines"], prefix="/engines")


@router.post("/llama.cpp/preview")
async def preview_llama_cpp(payload: PreviewIn):
    node = {
        "listenHost": payload.listenHost,
        "listenPort": payload.listenPort,
        "modelDir": payload.modelDir,
        "serverParams": payload.serverParams.model_dump(),
    }
    try:
        argv = LlamaCppEngine.build_argv(node, payload.modelDir)
    except ForbiddenExtraFlagsError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"argv": argv, "command": "llama-server " + " ".join(argv)}
