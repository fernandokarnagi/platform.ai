import shlex
from api.helpers import safe_model_filename

FORBIDDEN_EXTRA = {"-m", "--model", "--host", "--port"}


def _flag_value(value) -> str:
    return str(getattr(value, "value", value))


class ForbiddenExtraFlagsError(ValueError):
    pass


class LlamaCppEngine:
    PID_FILE = "~/.platformai/llama-server.pid"
    LOG_FILE = "~/.platformai/llama-server.log"

    @staticmethod
    def _extra_tokens(extra: str) -> list[str]:
        tokens = shlex.split(extra or "")
        if any(tok in FORBIDDEN_EXTRA for tok in tokens):
            raise ForbiddenExtraFlagsError(
                "extraFlags cannot include -m, --model, --host, or --port"
            )
        return tokens

    @staticmethod
    def build_argv(node: dict, model_filename: str, model_dir_expanded: str) -> list[str]:
        filename = model_filename if model_filename == "$MODEL" else safe_model_filename(model_filename)
        model_path = f"{model_dir_expanded.rstrip('/')}/{filename}"
        params = node.get("serverParams") or {}
        argv = [
            "-m", model_path,
            "--host", str(node.get("listenHost") or "0.0.0.0"),
            "--port", str(node.get("listenPort") or 8080),
            "--ctx-size", _flag_value(params.get("ctxSize", 0)),
            "--n-gpu-layers", _flag_value(params.get("gpuLayers", "auto")),
            "--flash-attn", _flag_value(params.get("flashAttn", "auto")),
            "--parallel", _flag_value(params.get("parallel", 1)),
        ]
        if params.get("kvOffload", True):
            argv.append("--kv-offload")
        else:
            argv.append("--no-kv-offload")
        argv.extend(["--fit", _flag_value(params.get("fit", "on"))])

        optional_int = [
            ("threads", "--threads"),
            ("batchSize", "--batch-size"),
            ("ubatchSize", "--ubatch-size"),
            ("nPredict", "--n-predict"),
            ("keep", "--keep"),
            ("threadsBatch", "--threads-batch"),
            ("mainGpu", "--main-gpu"),
            ("nCpuMoe", "--n-cpu-moe"),
        ]
        for key, flag in optional_int:
            if params.get(key) is not None:
                argv.extend([flag, _flag_value(params[key])])

        optional_str = [
            ("cacheTypeK", "--cache-type-k"),
            ("cacheTypeV", "--cache-type-v"),
            ("splitMode", "--split-mode"),
            ("tensorSplit", "--tensor-split"),
            ("device", "--device"),
            ("loadMode", "--load-mode"),
            ("chatTemplate", "--chat-template"),
        ]
        for key, flag in optional_str:
            value = params.get(key)
            if value:
                argv.extend([flag, _flag_value(value)])

        if params.get("cpuMoe"):
            argv.append("--cpu-moe")
        if params.get("jinja"):
            argv.append("--jinja")
        if params.get("metrics"):
            argv.append("--metrics")
        if params.get("alias"):
            argv.extend(["-a", str(params["alias"])])

        argv.extend(LlamaCppEngine._extra_tokens(params.get("extraFlags") or ""))
        return argv

    @staticmethod
    def probe_command() -> str:
        return (
            "uname -s; "
            "if command -v llama-server >/dev/null 2>&1; then command -v llama-server; "
            "elif [ -x \"$(brew --prefix 2>/dev/null)/bin/llama-server\" ]; then echo \"$(brew --prefix)/bin/llama-server\"; "
            "elif [ -x /usr/local/bin/llama-server ]; then echo /usr/local/bin/llama-server; "
            "else echo MISSING; fi"
        )

    @staticmethod
    def preview_command(node: dict, model_filename: str = "$MODEL") -> str:
        model_dir = node.get("modelDir") or "~/models"
        argv = LlamaCppEngine.build_argv(node, model_filename, model_dir)
        return "llama-server " + " ".join(argv)
