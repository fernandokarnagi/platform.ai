import shlex

from api.engines.vllm import VllmEngine

DEFAULT_VLLM_BIN = "$HOME/.venv-vllm-metal/bin/vllm"


class VllmMetalEngine(VllmEngine):
    """Native vLLM on Apple Silicon (vllm-metal / MLX). Same serve argv as ROCm, no Docker."""

    NAME = "vllm-metal"
    FAMILY = "vllm"
    PROCESS = "native"
    BINARY_LABEL = "vllm"
    DEFAULT_BIN = "~/.venv-vllm-metal/bin/vllm"

    @staticmethod
    def preview_command(node: dict) -> str:
        model_dir = node.get("modelDir") or "~/models"
        argv = VllmMetalEngine.build_argv(node, model_dir)
        binary = (node.get("llamaServerPath") or "").strip() or "vllm"
        quoted = " ".join(
            shlex.quote(part) if any(ch.isspace() or ch in "'\"\\" for ch in part) else part
            for part in argv
        )
        return f"{binary} {quoted}"

    @staticmethod
    def verify_binary_command(path: str) -> str:
        return (
            f"BIN={shlex.quote(path)}; "
            'BIN="${BIN/#\\~/$HOME}"; '
            'if [ -x "$BIN" ]; then echo "$BIN"; else echo MISSING; fi'
        )

    @staticmethod
    def resolve_binary_command() -> str:
        return (
            f"if [ -x {DEFAULT_VLLM_BIN} ]; then echo {DEFAULT_VLLM_BIN}; "
            "elif command -v vllm >/dev/null 2>&1; then command -v vllm; "
            "else echo MISSING; fi"
        )

    @staticmethod
    def read_pid_command() -> str:
        return "if [ -f ~/.platformai/vllm.pid ]; then cat ~/.platformai/vllm.pid; fi"

    @staticmethod
    def tail_log_command(lines: int = 200) -> str:
        n = max(20, min(int(lines), 1000))
        return (
            f"if [ -f {VllmMetalEngine.LOG_FILE} ]; then tail -n {n} {VllmMetalEngine.LOG_FILE}; "
            "else echo __PLATFORMAI_LOG_MISSING__; fi"
        )

    @staticmethod
    def pid_alive_command(pid: str) -> str:
        return f"if kill -0 {shlex.quote(pid)} 2>/dev/null; then echo alive; fi"

    @staticmethod
    def start_command(binary: str, argv: list[str], node: dict | None = None) -> str:
        quoted = " ".join(shlex.quote(part) for part in argv)
        return (
            f"mkdir -p ~/.platformai; "
            f"nohup {shlex.quote(binary)} {quoted} > ~/.platformai/vllm.log 2>&1 & echo $! "
            f"| tee ~/.platformai/vllm.pid"
        )

    @staticmethod
    def stop_command() -> str:
        return (
            "if [ -f ~/.platformai/vllm.pid ]; then "
            "PID=$(cat ~/.platformai/vllm.pid); "
            "if kill -0 $PID 2>/dev/null; then kill $PID; "
            "for i in 1 2 3 4 5 6 7 8; do kill -0 $PID 2>/dev/null || break; sleep 1; done; "
            "kill -0 $PID 2>/dev/null && kill -9 $PID; fi; "
            "rm -f ~/.platformai/vllm.pid; echo STOPPED; "
            "else echo STOPPED; fi"
        )
