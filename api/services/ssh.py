from dataclasses import dataclass
import asyncio
import os
import shlex
import shutil
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


def _copy_local(local_path: str, dest_path: str) -> None:
    parent = os.path.dirname(dest_path.rstrip(os.sep))
    if parent:
        os.makedirs(parent, exist_ok=True)
    if os.path.isdir(local_path):
        if os.path.exists(dest_path):
            shutil.rmtree(dest_path)
        shutil.copytree(local_path, dest_path)
        return
    shutil.copy2(local_path, dest_path)


def _connect_kwargs(node: dict) -> dict:
    kwargs = {
        "host": node["host"],
        "port": int(node.get("sshPort") or 22),
        "username": node["sshUser"],
        "known_hosts": None,
        "connect_timeout": 10,
    }
    if node.get("sshAuthType") == "private_key":
        kwargs["client_keys"] = [
            asyncssh.import_private_key(
                node.get("sshPrivateKey") or "",
                passphrase=node.get("sshPassphrase") or None,
            )
        ]
    else:
        kwargs["password"] = node.get("sshPassword") or ""
    return kwargs


async def push_path(node: dict, local_path: str, remote_path: str) -> None:
    if not os.path.exists(local_path):
        raise SshError(f"missing {local_path}")
    if is_local_node(node):
        await asyncio.to_thread(_copy_local, local_path, remote_path)
        return
    parent = os.path.dirname(remote_path.rstrip("/"))
    if parent:
        await run_command(node, f"mkdir -p {shlex.quote(parent)}")
    try:
        async with asyncssh.connect(**_connect_kwargs(node)) as conn:
            await asyncssh.scp(local_path, (conn, remote_path), recurse=True, preserve=True)
    except SshError:
        raise
    except Exception as exc:
        raise SshError(_exc_text(exc)) from exc


async def run_command(node: dict, command: str, timeout: float = 30.0) -> SshResult:
    if is_local_node(node):
        return await _run_local(command, timeout)

    try:
        async with asyncssh.connect(**_connect_kwargs(node)) as conn:
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
