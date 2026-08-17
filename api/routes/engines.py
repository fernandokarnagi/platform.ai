from fastapi import APIRouter, HTTPException
from api.engines import ForbiddenExtraFlagsError, get_engine
from api.models.models import PreviewIn

router = APIRouter(tags=["engines"], prefix="/engines")


@router.post("/{engine_name}/preview")
async def preview_engine(engine_name: str, payload: PreviewIn):
    try:
        engine = get_engine(engine_name)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    node = {
        "listenHost": payload.listenHost,
        "listenPort": payload.listenPort,
        "modelDir": payload.modelDir,
        "serverParams": payload.serverParams.model_dump(),
        "selectedModel": payload.modelFilename,
        "modelFilename": payload.modelFilename,
        "vllmImage": payload.vllmImage,
    }
    try:
        argv = engine.build_argv(node, payload.modelDir)
        command = engine.preview_command(node)
    except ForbiddenExtraFlagsError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"argv": argv, "command": command}
