from dataclasses import dataclass
import asyncssh
from api.logger import get_logger

logger = get_logger(__name__)


class SshError(Exception):
    pass


@dataclass
class SshResult:
    stdout: str
    stderr: str
    exit_status: int


async def run_command(node: dict, command: str, timeout: float = 30.0) -> SshResult:
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
            result = await conn.run(command, check=False, timeout=timeout)
    except Exception as exc:
        raise SshError(str(exc)) from exc
    return SshResult(
        stdout=str(result.stdout or ""),
        stderr=str(result.stderr or ""),
        exit_status=int(result.exit_status or 0),
    )
