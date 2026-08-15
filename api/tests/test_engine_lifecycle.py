import pytest
from httpx import ASGITransport, AsyncClient
from api.services import ssh as ssh_mod


class FakeResult:
    def __init__(self, stdout="", exit_status=0, stderr=""):
        self.stdout = stdout
        self.stderr = stderr
        self.exit_status = exit_status


async def _seed(client):
    cluster = (await client.post("/clusters", json={"name": "desk-macs"})).json()
    node = (await client.post(
        f"/clusters/{cluster['id']}/nodes",
        json={
            "name": "mac-1",
            "host": "192.168.1.10",
            "sshUser": "fernando",
            "sshAuthType": "password",
            "sshPassword": "secret",
            "openaiBaseUrl": "http://192.168.1.10:8080/v1",
            "serverParams": {"ctxSize": 8192, "gpuLayers": "all"},
        },
    )).json()
    return node


@pytest.mark.asyncio
async def test_start_stop_restart(app, monkeypatch):
    state = {"running": False, "pid": ""}

    async def fake_run(node, command, timeout=30.0):
        if (
            "echo ~" in command
            or ("mkdir -p" in command and "echo" in command and "nohup" not in command)
            or ("printf" in command and "MODEL_DIR" in command)
        ):
            return FakeResult("/Users/x/models\n")
        if "command -v llama-server" in command or "brew --prefix" in command:
            return FakeResult("/opt/homebrew/bin/llama-server\n")
        if "llama-server.pid" in command and "cat" in command and "kill" not in command and "nohup" not in command:
            return FakeResult("12345\n" if state["running"] else "")
        if "echo alive" in command:
            return FakeResult("alive\n" if state["running"] else "")
        if "nohup" in command:
            if state["running"]:
                return FakeResult("ALREADY\n", exit_status=1)
            state["running"] = True
            state["pid"] = "12345"
            return FakeResult("12345\n")
        if "kill" in command:
            state["running"] = False
            return FakeResult("STOPPED\n")
        if "-f" in command and ".gguf" in command:
            return FakeResult("OK\n")
        return FakeResult("")

    monkeypatch.setattr(ssh_mod, "run_command", fake_run)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        node = await _seed(client)
        started = await client.post(f"/nodes/{node['id']}/engine/start", json={"modelFilename": "phi.gguf"})
        assert started.status_code == 200
        body = started.json()
        assert body["running"] is True
        assert "--ctx-size" in " ".join(body["lastStart"]["argv"])
        engine = await client.get(f"/nodes/{node['id']}/engine")
        assert engine.json()["running"] is True
        stopped = await client.post(f"/nodes/{node['id']}/engine/stop")
        assert stopped.status_code == 200
        assert stopped.json()["running"] is False
        restarted = await client.post(f"/nodes/{node['id']}/engine/restart")
        assert restarted.status_code == 200
        assert restarted.json()["running"] is True


@pytest.mark.asyncio
async def test_restart_without_last_start(app, monkeypatch):
    async def fake_run(node, command, timeout=30.0):
        return FakeResult("")

    monkeypatch.setattr(ssh_mod, "run_command", fake_run)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        node = await _seed(client)
        response = await client.post(f"/nodes/{node['id']}/engine/restart")
        assert response.status_code == 400
        assert response.json()["detail"] == "No previous start"


@pytest.mark.asyncio
async def test_start_already_running(app, monkeypatch):
    async def fake_run(node, command, timeout=30.0):
        if "nohup" in command or "already" in command.lower():
            return FakeResult("ALREADY\n", exit_status=9)
        if "PID_FILE" in command or "llama-server.pid" in command:
            return FakeResult("111\n")
        if "ps -p" in command or "kill -0" in command:
            return FakeResult("alive\n")
        return FakeResult("/opt/homebrew/bin/llama-server\n")

    monkeypatch.setattr(ssh_mod, "run_command", fake_run)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        node = await _seed(client)
        response = await client.post(f"/nodes/{node['id']}/engine/start", json={"modelFilename": "phi.gguf"})
        assert response.status_code == 409
        assert response.json()["detail"] == "Engine already running"


def _expand_ok(command: str) -> bool:
    return (
        "echo ~" in command
        or ("mkdir -p" in command and "echo" in command and "nohup" not in command)
        or ("printf" in command and "MODEL_DIR" in command)
    )


@pytest.mark.asyncio
async def test_start_model_not_found(app, monkeypatch):
    async def fake_run(node, command, timeout=30.0):
        if _expand_ok(command):
            return FakeResult("/Users/x/models\n")
        if "-f" in command and ".gguf" in command:
            return FakeResult("MISSING\n")
        return FakeResult("")

    monkeypatch.setattr(ssh_mod, "run_command", fake_run)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        node = await _seed(client)
        response = await client.post(f"/nodes/{node['id']}/engine/start", json={"modelFilename": "phi.gguf"})
        assert response.status_code == 404
        assert response.json()["detail"] == "Model not found"


@pytest.mark.asyncio
async def test_start_llama_server_not_found(app, monkeypatch):
    async def fake_run(node, command, timeout=30.0):
        if _expand_ok(command):
            return FakeResult("/Users/x/models\n")
        if "-f" in command and ".gguf" in command:
            return FakeResult("OK\n")
        if "command -v llama-server" in command or "brew --prefix" in command:
            return FakeResult("MISSING\n")
        return FakeResult("")

    monkeypatch.setattr(ssh_mod, "run_command", fake_run)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        node = await _seed(client)
        response = await client.post(f"/nodes/{node['id']}/engine/start", json={"modelFilename": "phi.gguf"})
        assert response.status_code == 502
        assert response.json()["detail"] == "llama-server not found on node"


@pytest.mark.asyncio
async def test_start_forbidden_extra_flags(app, monkeypatch):
    async def fake_run(node, command, timeout=30.0):
        if _expand_ok(command):
            return FakeResult("/Users/x/models\n")
        if "-f" in command and ".gguf" in command:
            return FakeResult("OK\n")
        if "command -v llama-server" in command or "brew --prefix" in command:
            return FakeResult("/opt/homebrew/bin/llama-server\n")
        return FakeResult("")

    monkeypatch.setattr(ssh_mod, "run_command", fake_run)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        cluster = (await client.post("/clusters", json={"name": "desk-macs"})).json()
        node = (await client.post(
            f"/clusters/{cluster['id']}/nodes",
            json={
                "name": "mac-1",
                "host": "192.168.1.10",
                "sshUser": "fernando",
                "sshAuthType": "password",
                "sshPassword": "secret",
                "openaiBaseUrl": "http://192.168.1.10:8080/v1",
                "serverParams": {"extraFlags": "--port 9"},
            },
        )).json()
        response = await client.post(f"/nodes/{node['id']}/engine/start", json={"modelFilename": "phi.gguf"})
        assert response.status_code == 400
        assert "extraFlags" in response.json()["detail"]


@pytest.mark.asyncio
async def test_start_dead_pid_does_not_persist_last_start(app, monkeypatch):
    async def fake_run(node, command, timeout=30.0):
        if _expand_ok(command):
            return FakeResult("/Users/x/models\n")
        if "-f" in command and ".gguf" in command:
            return FakeResult("OK\n")
        if "command -v llama-server" in command or "brew --prefix" in command:
            return FakeResult("/opt/homebrew/bin/llama-server\n")
        if "nohup" in command:
            return FakeResult("99999\n")
        if "echo alive" in command:
            return FakeResult("")
        return FakeResult("")

    monkeypatch.setattr(ssh_mod, "run_command", fake_run)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        node = await _seed(client)
        response = await client.post(f"/nodes/{node['id']}/engine/start", json={"modelFilename": "phi.gguf"})
        assert response.status_code == 502
        assert response.json()["detail"].startswith("SSH failed:")
        fetched = await client.get(f"/nodes/{node['id']}")
        assert fetched.json()["lastStart"] is None
