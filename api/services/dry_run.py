import shlex

from api.engines import is_vllm_engine
from api.services import engine as engine_mod
from api.services import metrics as metrics_mod
from api.services import ssh as ssh_mod

DISK_MIN_FREE = 1 * 1024 * 1024 * 1024


def _is_hub_model(model: str) -> bool:
    name = (model or "").strip()
    return "/" in name and not name.startswith("/") and ".." not in name and "\\" not in name


def _check(check_id: str, ok: bool, detail: str) -> dict:
    return {"id": check_id, "ok": bool(ok), "detail": detail}


def _last_line(stdout: str) -> str:
    lines = [line.strip() for line in (stdout or "").splitlines() if line.strip()]
    return lines[-1] if lines else ""


def _expand_dir_command(model_dir: str) -> str:
    return (
        f"DIR={shlex.quote(model_dir or '~/models')}; "
        'DIR="${DIR/#\\~/$HOME}"; '
        'printf "%s\\n" "$DIR"; '
        'if [ -d "$DIR" ]; then echo DIR_OK; else echo DIR_MISSING; fi'
    )


def _gguf_count_command(model_dir: str) -> str:
    return (
        f"find {shlex.quote(model_dir)} -maxdepth 1 -name '*.gguf' -type f 2>/dev/null | wc -l"
    )


def _llama_file_command(model_dir: str, name: str) -> str:
    base = f"{model_dir.rstrip('/')}/{name}"
    alt = base if name.lower().endswith(".gguf") else f"{base}.gguf"
    return (
        f"if [ -f {shlex.quote(base)} ]; then echo {shlex.quote(base)}; "
        f"elif [ -f {shlex.quote(alt)} ]; then echo {shlex.quote(alt)}; "
        "else echo MISSING; fi"
    )


def _port_command(port: int) -> str:
    n = int(port)
    script = (
        "import socket; s=socket.socket(); s.settimeout(0.5); "
        f"print('busy' if s.connect_ex(('127.0.0.1', {n}))==0 else 'free')"
    )
    return f"python3 -c {shlex.quote(script)}"


def format_bytes(n: int | None) -> str:
    if n is None:
        return "unknown"
    value = float(n)
    for unit, size in (("GB", 1024 ** 3), ("MB", 1024 ** 2), ("KB", 1024)):
        if value >= size or unit == "KB":
            return f"{value / size:.1f} {unit}"
    return f"{n} B"


async def _resolve_binary(node: dict, engine) -> tuple[str | None, str]:
    label = getattr(engine, "BINARY_LABEL", "llama-server")
    configured = (node.get("llamaServerPath") or "").strip()
    try:
        if configured and not str(getattr(engine, "PROCESS", "")).startswith("docker"):
            result = await ssh_mod.run_command(node, engine.verify_binary_command(configured))
        else:
            result = await ssh_mod.run_command(node, engine.resolve_binary_command())
    except ssh_mod.SshError as exc:
        return None, str(exc)
    binary = _last_line(result.stdout) or "MISSING"
    if binary == "MISSING":
        return None, f"{label} not found on node"
    return binary, binary


async def run(node: dict, engine, model_filename: str = "") -> dict:
    checks: list[dict] = []
    selected = (model_filename or node.get("selectedModel") or "").strip()
    model_dir = node.get("modelDir") or "~/models"
    expanded = model_dir

    try:
        uname = await ssh_mod.run_command(node, "uname -s")
    except ssh_mod.SshError:
        raise
    host = _last_line(uname.stdout) or "ok"
    if uname.exit_status != 0:
        raise ssh_mod.SshError(uname.stderr or uname.stdout or "access failed")
    checks.append(_check("access", True, host))

    binary, binary_detail = await _resolve_binary(node, engine)
    checks.append(_check("binary", binary is not None, binary_detail))

    try:
        dir_res = await ssh_mod.run_command(node, _expand_dir_command(model_dir))
        lines = [line.strip() for line in (dir_res.stdout or "").splitlines() if line.strip()]
        expanded = lines[0] if lines else model_dir
        dir_ok = "DIR_OK" in (dir_res.stdout or "")
        checks.append(_check("modelDir", dir_ok, expanded if dir_ok else f"{expanded} is missing"))
    except ssh_mod.SshError as exc:
        checks.append(_check("modelDir", False, str(exc)))
        dir_ok = False

    if is_vllm_engine(engine):
        if not selected:
            checks.append(_check("model", False, "Select a model before starting vLLM"))
        elif _is_hub_model(selected):
            checks.append(_check("model", True, f"Hugging Face repo {selected} — pull at start if not local"))
        elif dir_ok:
            try:
                exists = await ssh_mod.run_command(node, engine.model_exists_command(expanded, selected))
                found = "OK" in (exists.stdout or "")
                checks.append(
                    _check("model", found, f"{selected} found" if found else f"{selected} not in {expanded}")
                )
            except ssh_mod.SshError as exc:
                checks.append(_check("model", False, str(exc)))
        else:
            checks.append(_check("model", False, "model dir missing"))
    elif dir_ok:
        try:
            counted = await ssh_mod.run_command(node, _gguf_count_command(expanded))
            n = int(_last_line(counted.stdout) or 0)
        except (ssh_mod.SshError, ValueError):
            n = 0
        matched = ""
        if selected:
            try:
                exists = await ssh_mod.run_command(node, _llama_file_command(expanded, selected))
                found = _last_line(exists.stdout)
                if found and found != "MISSING":
                    matched = found.split("/")[-1]
            except ssh_mod.SshError:
                matched = ""
        if matched:
            checks.append(_check("model", True, f"{matched} in {expanded}"))
        elif n > 0:
            extra = f"; selected {selected} is not a local GGUF" if selected else ""
            checks.append(_check("model", True, f"{n} GGUF file{'s' if n != 1 else ''} in {expanded}{extra}"))
        else:
            checks.append(_check("model", False, f"No GGUF files in {expanded}"))
    else:
        checks.append(_check("model", False, "model dir missing"))

    running = False
    pid = None
    status_known = False
    try:
        status = await engine_mod.engine_status(node)
        running = bool(status.get("running"))
        pid = status.get("pid")
        status_known = True
    except ssh_mod.SshError:
        running = False

    port = int(node.get("listenPort") or (8000 if is_vllm_engine(engine) else 8080))
    try:
        port_res = await ssh_mod.run_command(node, _port_command(port))
        free = _last_line(port_res.stdout) == "free"
        if free:
            checks.append(_check("port", True, f"{port} is free"))
        elif running:
            checks.append(_check("port", True, f"{port} in use (engine already running)"))
        else:
            checks.append(_check("port", False, f"{port} is in use"))
    except ssh_mod.SshError as exc:
        checks.append(_check("port", False, str(exc)))

    gpu_ok = True
    gpu_detail = "unknown"
    disk_ok = True
    disk_detail = "unknown"
    try:
        metrics = await metrics_mod.collect_node_metrics(node)
        gpus = metrics.get("gpus") or []
        if gpus:
            names = ", ".join(str(gpu.get("name") or "GPU") for gpu in gpus)
            gpu_detail = names
            gpu_ok = True
        elif is_vllm_engine(engine):
            gpu_ok = False
            gpu_detail = "No GPU visible"
        else:
            gpu_ok = True
            gpu_detail = "No GPU (CPU ok)"
        free_disk = metrics.get("diskFreeBytes")
        if free_disk is None:
            disk_ok = True
            disk_detail = "unknown"
        elif int(free_disk) < DISK_MIN_FREE:
            disk_ok = False
            disk_detail = f"{format_bytes(int(free_disk))} free — need at least 1 GB"
        else:
            disk_ok = True
            disk_detail = f"{format_bytes(int(free_disk))} free"
    except ssh_mod.SshError as exc:
        gpu_detail = str(exc)
        disk_detail = str(exc)
        gpu_ok = not is_vllm_engine(engine)
    except Exception:
        gpu_ok = not is_vllm_engine(engine)
    checks.append(_check("gpu", gpu_ok, gpu_detail))
    checks.append(_check("disk", disk_ok, disk_detail))

    if running:
        checks.append(_check("running", True, f"already running (pid {pid})"))
    elif status_known:
        checks.append(_check("running", True, "stopped"))
    else:
        checks.append(_check("running", True, "unknown"))

    start_node = {**node, "selectedModel": selected, "modelFilename": selected, "modelDir": expanded}
    argv = engine.build_argv(start_node, expanded)
    command = engine.preview_command(start_node)

    required = {"access", "binary", "modelDir", "model", "port", "disk"}
    if is_vllm_engine(engine):
        required.add("gpu")
    ok = all(item["ok"] for item in checks if item["id"] in required)
    return {
        "ok": ok,
        "checks": checks,
        "argv": argv,
        "command": command,
        "modelFilename": selected,
        "binary": binary,
    }
