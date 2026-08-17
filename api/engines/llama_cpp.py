import re
import shlex

FORBIDDEN_EXTRA = {"-m", "--model", "--models-dir", "--host", "--port"}
_HF_HOST = re.compile(r"^https?://(huggingface\.co|hf\.co)/", re.I)


def _flag_value(value) -> str:
    return str(getattr(value, "value", value))


class ForbiddenExtraFlagsError(ValueError):
    pass


class LlamaCppEngine:
    NAME = "llama.cpp"
    BINARY_LABEL = "llama-server"
    PID_FILE = "~/.platformai/llama-server.pid"
    LOG_FILE = "~/.platformai/llama-server.log"

    @staticmethod
    def _extra_tokens(extra: str) -> list[str]:
        tokens = shlex.split(extra or "")
        if any(tok in FORBIDDEN_EXTRA for tok in tokens):
            raise ForbiddenExtraFlagsError(
                "extraFlags cannot include -m, --model, --models-dir, --host, or --port"
            )
        return tokens

    @staticmethod
    def build_argv(node: dict, model_dir_expanded: str) -> list[str]:
        params = node.get("serverParams") or {}
        argv = [
            "--models-dir", model_dir_expanded.rstrip("/") or (node.get("modelDir") or "~/models"),
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
        ]
        for key, flag in optional_str:
            value = params.get(key)
            if value:
                argv.extend([flag, _flag_value(value)])

        if params.get("cpuMoe"):
            argv.append("--cpu-moe")
        # --jinja must precede --chat-template or llama-server rejects custom templates.
        if params.get("jinja"):
            argv.append("--jinja")
        chat_template = params.get("chatTemplate")
        if chat_template:
            argv.extend(["--chat-template", _flag_value(chat_template)])
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
            "elif command -v brew >/dev/null 2>&1 && [ -x \"$(brew --prefix)/bin/llama-server\" ]; "
            "then echo \"$(brew --prefix)/bin/llama-server\"; "
            "elif [ -x /opt/homebrew/bin/llama-server ]; then echo /opt/homebrew/bin/llama-server; "
            "elif [ -x /usr/local/bin/llama-server ]; then echo /usr/local/bin/llama-server; "
            "else echo MISSING; fi"
        )

    @staticmethod
    def preview_command(node: dict) -> str:
        model_dir = node.get("modelDir") or "~/models"
        argv = LlamaCppEngine.build_argv(node, model_dir)
        return "llama-server " + " ".join(
            shlex.quote(part) if any(ch.isspace() or ch in "'\"\\" for ch in part) else part
            for part in argv
        )

    @staticmethod
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
            "if command -v llama-server >/dev/null 2>&1; then command -v llama-server; "
            "elif command -v brew >/dev/null 2>&1 && [ -x \"$(brew --prefix)/bin/llama-server\" ]; "
            "then echo \"$(brew --prefix)/bin/llama-server\"; "
            "elif [ -x /opt/homebrew/bin/llama-server ]; then echo /opt/homebrew/bin/llama-server; "
            "elif [ -x /usr/local/bin/llama-server ]; then echo /usr/local/bin/llama-server; "
            "else echo MISSING; fi"
        )

    @staticmethod
    def expand_model_dir_command(model_dir: str) -> str:
        return f"mkdir -p {shlex.quote(model_dir)} ~/.platformai && echo {model_dir}"

    @staticmethod
    def read_pid_command() -> str:
        return "if [ -f ~/.platformai/llama-server.pid ]; then cat ~/.platformai/llama-server.pid; fi"

    @staticmethod
    def tail_log_command(lines: int = 200) -> str:
        n = max(20, min(int(lines), 1000))
        return (
            f"if [ -f {LlamaCppEngine.LOG_FILE} ]; then tail -n {n} {LlamaCppEngine.LOG_FILE}; "
            "else echo __PLATFORMAI_LOG_MISSING__; fi"
        )

    @staticmethod
    def pid_alive_command(pid: str) -> str:
        return f"if kill -0 {shlex.quote(pid)} 2>/dev/null; then echo alive; fi"

    @staticmethod
    def start_command(binary: str, argv: list[str]) -> str:
        quoted = " ".join(shlex.quote(part) for part in argv)
        return (
            f"mkdir -p ~/.platformai; "
            f"nohup {shlex.quote(binary)} {quoted} > ~/.platformai/llama-server.log 2>&1 & echo $! "
            f"| tee ~/.platformai/llama-server.pid"
        )

    @staticmethod
    def stop_command() -> str:
        return (
            "if [ -f ~/.platformai/llama-server.pid ]; then "
            "PID=$(cat ~/.platformai/llama-server.pid); "
            "if kill -0 $PID 2>/dev/null; then kill $PID; "
            "for i in 1 2 3 4 5 6 7 8; do kill -0 $PID 2>/dev/null || break; sleep 1; done; "
            "kill -0 $PID 2>/dev/null && kill -9 $PID; fi; "
            "rm -f ~/.platformai/llama-server.pid; echo STOPPED; "
            "else echo STOPPED; fi"
        )

    @staticmethod
    def model_exists_command(model_dir: str, filename: str) -> str:
        path = f"{model_dir.rstrip('/')}/{filename}"
        return f"if [ -f {shlex.quote(path)} ]; then echo OK; else echo MISSING; fi"

    @staticmethod
    @staticmethod
    def parse_hf_ref(repo: str, filename: str = "") -> dict:
        raw = (repo or "").strip()
        name = (filename or "").strip()
        revision = "main"
        quant = ""
        if _HF_HOST.match(raw):
            path = _HF_HOST.sub("", raw).strip("/")
            parts = path.split("/")
            if len(parts) >= 2:
                raw = f"{parts[0]}/{parts[1]}"
            for key in ("resolve", "blob", "tree"):
                if key in parts:
                    idx = parts.index(key)
                    if idx + 1 < len(parts):
                        revision = parts[idx + 1] or "main"
                    if key != "tree" and idx + 2 < len(parts) and not name:
                        name = "/".join(parts[idx + 2:]).split("?")[0]
                    break
        else:
            raw = raw.strip("/")
            if "@" in raw:
                raw, revision = raw.rsplit("@", 1)
            elif ":" in raw:
                raw, quant = raw.rsplit(":", 1)
        raw = raw.split("?")[0].strip("/")
        return {
            "repo": raw,
            "revision": revision or "main",
            "filename": name,
            "quant": (quant or "").strip(),
        }

    @staticmethod
    def pick_hf_filename(files: list[str], requested: str = "", quant: str = "") -> str | None:
        names = [item for item in files if item.lower().endswith(".gguf")]
        if requested:
            if requested in names:
                return requested
            lower = requested.lower()
            hits = [item for item in names if item.lower() == lower or item.lower().endswith("/" + lower)]
            if len(hits) == 1:
                return hits[0]
        tag = (quant or "").strip().upper()
        if tag:
            suffix = f"-{tag}.GGUF"
            hits = [item for item in names if item.upper().endswith(suffix)]
            if len(hits) == 1:
                return hits[0]
            if requested:
                stripped = requested
                for extra in ("-GGUF-", "_GGUF_"):
                    stripped = stripped.replace(f"{extra}{tag}.gguf", f"-{tag}.gguf").replace(
                        f"{extra}{tag}.GGUF", f"-{tag}.gguf"
                    )
                if stripped in names:
                    return stripped
                fuzzy = [item for item in names if item.lower().endswith(f"-{tag.lower()}.gguf") and item.split("/")[-1] in requested]
                if len(fuzzy) == 1:
                    return fuzzy[0]
        return None

    @staticmethod
    def hf_url(repo: str, filename: str, revision: str = "main") -> str:
        return f"https://huggingface.co/{repo}/resolve/{revision or 'main'}/{filename}"

    @staticmethod
    def list_models_command(model_dir: str) -> str:
        return (
            f"mkdir -p {shlex.quote(model_dir)} && "
            f"find {shlex.quote(model_dir)} -maxdepth 1 -name '*.gguf' -type f -print0 | "
            "while IFS= read -r -d '' f; do "
            "stat -f '%N\t%z\t%Sm' -t '%Y-%m-%dT%H:%M:%S' \"$f\" 2>/dev/null || "
            "stat -c '%n\t%s\t%y' \"$f\"; "
            "done"
        )

    @staticmethod
    def download_command(model_dir: str, filename: str, url: str, token: str = "") -> str:
        dest = f"{model_dir.rstrip('/')}/{filename}"
        header = f"-H {shlex.quote('Authorization: Bearer ' + token)} " if token else ""
        return (
            f"mkdir -p {shlex.quote(model_dir)} && "
            f"curl -fsSL {header}-o {shlex.quote(dest)} {shlex.quote(url)}"
        )

    @staticmethod
    def start_download_command(model_dir: str, filename: str, url: str, job_id: str, token: str = "") -> str:
        dest = f"{model_dir.rstrip('/')}/{filename}"
        part = f"{dest}.part"
        job_dir = f"~/.platformai/downloads/{job_id}"
        header = f"-H {shlex.quote('Authorization: Bearer ' + token)} " if token else ""
        inner = (
            f"curl -L --fail -sS {header}-o {shlex.quote(part)} {shlex.quote(url)}; "
            f"ec=$?; echo $ec > {shlex.quote(job_dir)}/exit; "
            f"if [ \"$ec\" -eq 0 ]; then mv {shlex.quote(part)} {shlex.quote(dest)}; fi"
        )
        return (
            f"mkdir -p {shlex.quote(model_dir)} {shlex.quote(job_dir)}; "
            f"rm -f {shlex.quote(job_dir + '/exit')} {shlex.quote(job_dir + '/pid')} "
            f"{shlex.quote(job_dir + '/curl.log')} {shlex.quote(part)}; "
            f"nohup /bin/bash -lc {shlex.quote(inner)} "
            f"> {shlex.quote(job_dir)}/curl.log 2>&1 & "
            f"echo $! | tee {shlex.quote(job_dir)}/pid"
        )

    @staticmethod
    def download_progress_command(model_dir: str, filename: str, job_id: str) -> str:
        dest = f"{model_dir.rstrip('/')}/{filename}"
        part = f"{dest}.part"
        job_dir = f"~/.platformai/downloads/{job_id}"
        return (
            f"pid=''; [ -f {shlex.quote(job_dir)}/pid ] && pid=$(cat {shlex.quote(job_dir)}/pid); "
            "alive=0; if [ -n \"$pid\" ] && kill -0 \"$pid\" 2>/dev/null; then alive=1; fi; "
            f"ex=''; [ -f {shlex.quote(job_dir)}/exit ] && ex=$(cat {shlex.quote(job_dir)}/exit); "
            "size=0; done=0; "
            f"if [ -f {shlex.quote(dest)} ]; then "
            f"size=$(stat -f%z {shlex.quote(dest)} 2>/dev/null || stat -c%s {shlex.quote(dest)}); done=1; "
            f"elif [ -f {shlex.quote(part)} ]; then "
            f"size=$(stat -f%z {shlex.quote(part)} 2>/dev/null || stat -c%s {shlex.quote(part)}); fi; "
            f"err=''; [ -f {shlex.quote(job_dir)}/curl.log ] && err=$(tail -n 1 {shlex.quote(job_dir)}/curl.log); "
            "printf '%s\\t%s\\t%s\\t%s\\t%s\\n' \"$alive\" \"$ex\" \"$size\" \"$done\" \"$err\""
        )

    @staticmethod
    def cancel_download_command(model_dir: str, filename: str, job_id: str) -> str:
        dest = f"{model_dir.rstrip('/')}/{filename}"
        part = f"{dest}.part"
        job_dir = f"~/.platformai/downloads/{job_id}"
        return (
            f"if [ -f {shlex.quote(job_dir)}/pid ]; then "
            f"pid=$(cat {shlex.quote(job_dir)}/pid); "
            "kill \"$pid\" 2>/dev/null; sleep 0.2; kill -9 \"$pid\" 2>/dev/null; fi; "
            f"rm -f {shlex.quote(part)}; echo CANCELLED"
        )

    @staticmethod
    def delete_model_command(model_dir: str, filename: str) -> str:
        dest = f"{model_dir.rstrip('/')}/{filename}"
        return f"rm -f {shlex.quote(dest)}"

    @staticmethod
    def delete_job_command(job_id: str) -> str:
        job_dir = f"$HOME/.platformai/downloads/{job_id}"
        legacy = f"$HOME/~/.platformai/downloads/{job_id}"
        return f"rm -rf {job_dir} {legacy}; echo DELETED"
