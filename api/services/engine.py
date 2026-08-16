from api.engines.llama_cpp import LlamaCppEngine
from api.services import ssh as ssh_mod


async def engine_status(node: dict) -> dict:
    pid_res = await ssh_mod.run_command(node, LlamaCppEngine.read_pid_command())
    pid = pid_res.stdout.strip()
    running = False
    if pid:
        alive = await ssh_mod.run_command(node, LlamaCppEngine.pid_alive_command(pid))
        running = "alive" in alive.stdout
    return {"running": running, "pid": pid if running else None, "lastStart": node.get("lastStart")}


async def is_running(node: dict) -> bool:
    try:
        return bool((await engine_status(node))["running"])
    except ssh_mod.SshError:
        return False
