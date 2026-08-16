from dataclasses import dataclass
import asyncio
import asyncssh
from api.helpers import is_local_node
from api.logger import get_logger

logger = get_logger(__name__)


class SshError(Exception):
    pass


def _exc_text(exc: Exception) -> str:
    text = str(exc).strip()
    if text:
        return text
    name = type(exc).__name__
    if name == "TimeoutError":
        return "connection timed out"
    return name


@dataclass
class SshResult:
    stdout: str
    stderr: str
    exit_status: int


async def _run_local(command: str, timeout: float) -> SshResult:
    try:
        proc = await asyncio.create_subprocess_exec(
            "/bin/bash",
            "-lc",
            command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
    except Exception as exc:
        raise SshError(_exc_text(exc)) from exc
    return SshResult(
        stdout=(stdout or b"").decode(errors="replace"),
        stderr=(stderr or b"").decode(errors="replace"),
        exit_status=int(proc.returncode or 0),
    )


async def run_command(node: dict, command: str, timeout: float = 30.0) -> SshResult:
    if is_local_node(node):
        return await _run_local(command, timeout)

    connect_kwargs = {
        "host": node["host"],
        "port": int(node.get("sshPort") or 22),
        "username": node["sshUser"],
        "known_hosts": None,
        "connect_timeout": 10,
    }
    try:
        if node.get("sshAuthType") == "private_key":
            connect_kwargs["client_keys"] = [asyncssh.import_private_key(
                node.get("sshPrivateKey") or "",
                passphrase=node.get("sshPassphrase") or None,
            )]
        else:
            connect_kwargs["password"] = node.get("sshPassword") or ""
        async with asyncssh.connect(**connect_kwargs) as conn:
            # Non-interactive ssh has no Homebrew PATH. Login zsh does.
            remote = (
                'export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH"; '
                + command
            )
            result = await conn.run(remote, check=False, timeout=timeout)
    except Exception as exc:
        raise SshError(_exc_text(exc)) from exc
    return SshResult(
        stdout=str(result.stdout or ""),
        stderr=str(result.stderr or ""),
        exit_status=int(result.exit_status or 0),
    )
