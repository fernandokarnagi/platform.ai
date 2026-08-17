import shlex

from api.engines.llama_cpp import ForbiddenExtraFlagsError, LlamaCppEngine

FORBIDDEN_EXTRA = {"--host", "--port", "--model", "-m"}


def _flag_value(value) -> str:
    return str(getattr(value, "value", value))


def _is_hub_model(model: str) -> bool:
    name = (model or "").strip()
    return "/" in name and not name.startswith("/") and ".." not in name and "\\" not in name


def _model_arg(node: dict, model_dir_expanded: str) -> str:
    model = (node.get("selectedModel") or node.get("modelFilename") or "").strip()
    if not model:
        return "$MODEL"
    if _is_hub_model(model) or model.startswith("/") or model == "$MODEL":
        return model
    root = (model_dir_expanded or node.get("modelDir") or "~/models").rstrip("/")
    return f"{root}/{model}"


DEFAULT_VLLM_IMAGE = "rocm/vllm:rocm7.14.0_cdna_ubuntu24.04_py3.14_pytorch_2.11.0_vllm_0.23.0"
CONTAINER_NAME = "platformai-vllm"


def _image(node: dict | None) -> str:
    raw = ((node or {}).get("vllmImage") or "").strip()
    return raw or DEFAULT_VLLM_IMAGE


def _quote_parts(parts: list[str]) -> str:
    return " ".join(
        shlex.quote(part) if any(ch.isspace() or ch in "'\"\\" for ch in part) else part
        for part in parts
    )


class VllmEngine:
    NAME = "vllm"
    BINARY_LABEL = "docker"
    CONTAINER = CONTAINER_NAME
    DEFAULT_IMAGE = DEFAULT_VLLM_IMAGE
    PID_FILE = "~/.platformai/vllm.pid"
    LOG_FILE = "~/.platformai/vllm.log"

    @staticmethod
    def _extra_tokens(extra: str) -> list[str]:
        tokens = shlex.split(extra or "")
        if any(tok in FORBIDDEN_EXTRA for tok in tokens):
            raise ForbiddenExtraFlagsError(
                "extraFlags cannot include --host, --port, --model, or -m"
            )
        return tokens

    @staticmethod
    def build_argv(node: dict, model_dir_expanded: str) -> list[str]:
        params = node.get("serverParams") or {}
        argv = [
            "serve",
            _model_arg(node, model_dir_expanded),
            "--host",
            str(node.get("listenHost") or "0.0.0.0"),
            "--port",
            str(node.get("listenPort") or 8000),
            "--tensor-parallel-size",
            _flag_value(params.get("tensorParallelSize", 1)),
            "--gpu-memory-utilization",
            _flag_value(params.get("gpuMemoryUtilization", 0.9)),
        ]
        optional_int = [
            ("maxModelLen", "--max-model-len"),
            ("maxNumSeqs", "--max-num-seqs"),
            ("swapSpace", "--swap-space"),
        ]
        for key, flag in optional_int:
            if params.get(key) is not None:
                argv.extend([flag, _flag_value(params[key])])

        optional_str = [
            ("dtype", "--dtype"),
            ("quantization", "--quantization"),
            ("kvCacheDtype", "--kv-cache-dtype"),
        ]
        for key, flag in optional_str:
            value = params.get(key)
            if value:
                argv.extend([flag, _flag_value(value)])

        served = params.get("servedModelName") or params.get("alias")
        if served:
            argv.extend(["--served-model-name", str(served)])
        if params.get("trustRemoteCode"):
            argv.append("--trust-remote-code")
        if params.get("enforceEager"):
            argv.append("--enforce-eager")
        if params.get("enablePrefixCaching"):
            argv.append("--enable-prefix-caching")

        argv.extend(VllmEngine._extra_tokens(params.get("extraFlags") or ""))
        return argv

    @staticmethod
    def docker_run_command(node: dict, argv: list[str], detached: bool) -> str:
        model_dir = node.get("modelDir") or "~/models"
        flags = f"-d --name {CONTAINER_NAME}" if detached else "--rm"
        return (
            f"MODEL_DIR={shlex.quote(model_dir)}; MODEL_DIR=\"${{MODEL_DIR/#\\~/$HOME}}\"; "
            f"docker run {flags} "
            "--device /dev/kfd --device /dev/dri "
            "--network=host --ipc=host "
            "--group-add=video --cap-add=SYS_PTRACE "
            "--security-opt seccomp=unconfined "
            '-v "$MODEL_DIR:$MODEL_DIR" '
            f"{shlex.quote(_image(node))} "
            f"vllm {_quote_parts(argv)}"
        )

    @staticmethod
    def preview_command(node: dict) -> str:
        model_dir = node.get("modelDir") or "~/models"
        argv = VllmEngine.build_argv(node, model_dir)
        return VllmEngine.docker_run_command(node, argv, detached=False)

    @staticmethod
    def verify_binary_command(path: str) -> str:
        return VllmEngine.resolve_binary_command()

    @staticmethod
    def resolve_binary_command() -> str:
        return "if command -v docker >/dev/null 2>&1; then command -v docker; else echo MISSING; fi"

    @staticmethod
    def expand_model_dir_command(model_dir: str) -> str:
        return f"mkdir -p {shlex.quote(model_dir)} ~/.platformai && echo {model_dir}"

    @staticmethod
    def read_pid_command() -> str:
        return (
            f"if docker inspect -f '{{{{.State.Running}}}}' {CONTAINER_NAME} 2>/dev/null | grep -qx true; "
            f"then docker inspect -f '{{{{.Id}}}}' {CONTAINER_NAME} | cut -c1-12; fi"
        )

    @staticmethod
    def tail_log_command(lines: int = 200) -> str:
        n = max(20, min(int(lines), 1000))
        return (
            f"if docker ps -a --format '{{{{.Names}}}}' | grep -qx {shlex.quote(CONTAINER_NAME)}; "
            f"then docker logs --tail {n} {CONTAINER_NAME} 2>&1; "
            "else echo __PLATFORMAI_LOG_MISSING__; fi"
        )

    @staticmethod
    def pid_alive_command(pid: str) -> str:
        return (
            f"if docker inspect -f '{{{{.State.Running}}}}' {CONTAINER_NAME} 2>/dev/null | grep -qx true; "
            "then echo alive; fi"
        )

    @staticmethod
    def start_command(binary: str, argv: list[str], node: dict | None = None) -> str:
        run = VllmEngine.docker_run_command(node or {}, argv, detached=True)
        return f"docker rm -f {CONTAINER_NAME} >/dev/null 2>&1; {run}"

    @staticmethod
    def stop_command() -> str:
        return f"docker stop {CONTAINER_NAME} >/dev/null 2>&1; docker rm -f {CONTAINER_NAME} >/dev/null 2>&1; echo STOPPED"

    @staticmethod
    def model_exists_command(model_dir: str, filename: str) -> str:
        path = f"{model_dir.rstrip('/')}/{filename}"
        return (
            f"if [ -d {shlex.quote(path)} ] || [ -f {shlex.quote(path)} ]; "
            "then echo OK; else echo MISSING; fi"
        )

    @staticmethod
    def parse_hf_ref(repo: str, filename: str = "") -> dict:
        return LlamaCppEngine.parse_hf_ref(repo, filename)

    @staticmethod
    def hf_url(repo: str, filename: str, revision: str = "main") -> str:
        return LlamaCppEngine.hf_url(repo, filename, revision)

    @staticmethod
    def snapshot_dirname(repo: str) -> str:
        return (repo or "").strip().strip("/").replace("/", "--")

    @staticmethod
    def list_models_command(model_dir: str) -> str:
        return (
            f"mkdir -p {shlex.quote(model_dir)} && "
            f"find {shlex.quote(model_dir)} -mindepth 1 -maxdepth 1 -type d -print0 | "
            "while IFS= read -r -d '' d; do "
            'if [ -f "$d/config.json" ]; then '
            'sz=$(du -sk "$d" 2>/dev/null | awk \'{print $1 * 1024}\'); '
            "mt=$(stat -f '%Sm' -t '%Y-%m-%dT%H:%M:%S' \"$d\" 2>/dev/null || "
            "stat -c '%y' \"$d\" | cut -c1-19 | tr ' ' T); "
            'printf \'%s\\t%s\\t%s\\n\' "$(basename "$d")" "${sz:-0}" "$mt"; '
            "fi; done"
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
    def _job_dir(job_id: str) -> str:
        return f"$HOME/.platformai/downloads/{job_id}"

    @staticmethod
    def start_download_command(model_dir: str, filename: str, url: str, job_id: str, token: str = "") -> str:
        dest = f"{model_dir.rstrip('/')}/{filename}"
        part = f"{dest}.partial"
        job_dir = VllmEngine._job_dir(job_id)
        token_env = f"HF_TOKEN={shlex.quote(token)} " if token else ""
        if (url or "").startswith("http://") or (url or "").startswith("https://"):
            header = f"-H {shlex.quote('Authorization: Bearer ' + token)} " if token else ""
            inner = (
                f"curl -L --fail -sS {header}-o {shlex.quote(part)} {shlex.quote(url)}; "
                f"ec=$?; echo $ec > {job_dir}/exit; "
                f"if [ \"$ec\" -eq 0 ]; then mv {shlex.quote(part)} {shlex.quote(dest)}; fi"
            )
        else:
            py = (
                "from huggingface_hub import snapshot_download; import os; "
                "snapshot_download(repo_id=os.environ['REPO'], local_dir=os.environ['DEST'])"
            )
            inner = (
                f"export REPO={shlex.quote(url)}; export DEST={shlex.quote(part)}; "
                f"rm -rf {shlex.quote(part)}; mkdir -p {shlex.quote(part)}; "
                "if command -v hf >/dev/null 2>&1; then "
                f"{token_env}hf download {shlex.quote(url)} --local-dir {shlex.quote(part)}; "
                f"else {token_env}python3 -c {shlex.quote(py)}; fi; "
                f"ec=$?; echo $ec > {job_dir}/exit; "
                f"if [ \"$ec\" -eq 0 ]; then rm -rf {shlex.quote(dest)}; mv {shlex.quote(part)} {shlex.quote(dest)}; fi"
            )
        return (
            f"mkdir -p {shlex.quote(model_dir)} {job_dir}; "
            f"rm -f {job_dir}/exit {job_dir}/pid {job_dir}/curl.log; "
            f"setsid nohup /bin/bash -c {shlex.quote(inner)} "
            f"< /dev/null > {job_dir}/curl.log 2>&1 & echo $! | tee {job_dir}/pid"
        )

    @staticmethod
    def download_progress_command(model_dir: str, filename: str, job_id: str) -> str:
        dest = f"{model_dir.rstrip('/')}/{filename}"
        part = f"{dest}.partial"
        job_dir = VllmEngine._job_dir(job_id)
        dest_q = shlex.quote(dest)
        part_q = shlex.quote(part)
        repo_pat = shlex.quote(f"hf download {filename.replace('--', '/')}")
        return (
            f"pid=''; [ -f {job_dir}/pid ] && pid=$(cat {job_dir}/pid); "
            "alive=0; if [ -n \"$pid\" ] && kill -0 \"$pid\" 2>/dev/null; then alive=1; fi; "
            f"if [ \"$alive\" != 1 ] && pgrep -f {repo_pat} >/dev/null 2>&1; then alive=1; fi; "
            f"ex=''; [ -f {job_dir}/exit ] && ex=$(cat {job_dir}/exit); "
            "size=0; done=0; "
            f"if [ -f {dest_q}/config.json ] || [ -f {dest_q} ]; then "
            f"size=$(du -sk {dest_q} 2>/dev/null | awk '{{print $1 * 1024}}'); done=1; "
            f"elif [ -e {part_q} ]; then "
            f"size=$(du -sk {part_q} 2>/dev/null | awk '{{print $1 * 1024}}'); "
            f"if [ \"$alive\" != 1 ] && [ -z \"$ex\" ] && "
            f"find {part_q} {job_dir}/curl.log -mmin -2 2>/dev/null | grep -q .; then alive=1; fi; fi; "
            f"err=''; [ -f {job_dir}/curl.log ] && err=$(tail -n 20 {job_dir}/curl.log | "
            "sed $'s/\\x1b\\[[0-9;]*[A-Za-z]//g' | grep -v '^[[:space:]]*$' | tail -n 3 | tr '\\n' ' '); "
            "printf '%s\\t%s\\t%s\\t%s\\t%s\\n' \"$alive\" \"$ex\" \"${size:-0}\" \"$done\" \"$err\""
        )

    @staticmethod
    def cancel_download_command(model_dir: str, filename: str, job_id: str) -> str:
        dest = f"{model_dir.rstrip('/')}/{filename}"
        part = f"{dest}.partial"
        job_dir = VllmEngine._job_dir(job_id)
        return (
            f"if [ -f {job_dir}/pid ]; then "
            f"pid=$(cat {job_dir}/pid); "
            "kill \"$pid\" 2>/dev/null; sleep 0.2; kill -9 \"$pid\" 2>/dev/null; fi; "
            f"pkill -f {shlex.quote('hf download ' + filename.replace('--', '/'))} 2>/dev/null; "
            f"rm -rf {shlex.quote(part)}; echo CANCELLED"
        )

    @staticmethod
    def delete_job_command(job_id: str) -> str:
        job_dir = VllmEngine._job_dir(job_id)
        legacy = f"$HOME/~/.platformai/downloads/{job_id}"
        return f"rm -rf {job_dir} {legacy}; echo DELETED"

    @staticmethod
    def delete_model_command(model_dir: str, filename: str) -> str:
        dest = f"{model_dir.rstrip('/')}/{filename}"
        return f"rm -rf {shlex.quote(dest)}"
