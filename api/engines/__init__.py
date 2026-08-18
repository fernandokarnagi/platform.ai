from api.engines.llama_cpp import ForbiddenExtraFlagsError, LlamaCppEngine
from api.engines.vllm import VllmEngine
from api.engines.vllm_metal import VllmMetalEngine

ENGINES = {
    "llama.cpp": LlamaCppEngine,
    "vllm": VllmEngine,
    "vllm-metal": VllmMetalEngine,
}


def get_engine(name: str | None):
    key = (name or "llama.cpp").strip()
    if key not in ENGINES:
        raise ValueError(f"Unknown engine: {key}")
    return ENGINES[key]


def is_vllm_engine(engine) -> bool:
    if engine is None:
        return False
    if isinstance(engine, str):
        return engine.strip() in {"vllm", "vllm-metal"}
    return getattr(engine, "FAMILY", "") == "vllm"


def is_docker_vllm(engine) -> bool:
    if engine is None:
        return False
    if isinstance(engine, str):
        return engine.strip() == "vllm"
    return getattr(engine, "NAME", "") == "vllm" and getattr(engine, "PROCESS", "") == "docker"


__all__ = [
    "ENGINES",
    "ForbiddenExtraFlagsError",
    "LlamaCppEngine",
    "VllmEngine",
    "VllmMetalEngine",
    "get_engine",
    "is_vllm_engine",
    "is_docker_vllm",
]
