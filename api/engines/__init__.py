from api.engines.llama_cpp import ForbiddenExtraFlagsError, LlamaCppEngine
from api.engines.vllm import VllmEngine

ENGINES = {
    "llama.cpp": LlamaCppEngine,
    "vllm": VllmEngine,
}


def get_engine(name: str | None):
    key = (name or "llama.cpp").strip()
    if key not in ENGINES:
        raise ValueError(f"Unknown engine: {key}")
    return ENGINES[key]


__all__ = ["ENGINES", "ForbiddenExtraFlagsError", "LlamaCppEngine", "VllmEngine", "get_engine"]
