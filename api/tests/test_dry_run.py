import pytest
from httpx import ASGITransport, AsyncClient
from api.services import metrics as metrics_mod
from api.services import ssh as ssh_mod


class FakeResult:
    def __init__(self, stdout="", exit_status=0, stderr=""):
        self.stdout = stdout
        self.stderr = stderr
        self.exit_status = exit_status


async def _seed(client, extra=None):
    cluster = (await client.post("/clusters", json={"name": "desk-macs"})).json()
    payload = {
        "name": "mac-1",
        "host": "192.168.1.10",
        "sshUser": "fernando",
        "sshAuthType": "password",
        "sshPassword": "secret",
        "openaiBaseUrl": "http://192.168.1.10:8080/v1",
        "serverParams": {"ctxSize": 8192, "gpuLayers": "all"},
    }
    if extra:
        payload.update(extra)
    node = (await client.post(f"/clusters/{cluster['id']}/nodes", json=payload)).json()
    return node


def _fake_run(state=None):
    state = state or {}

    async def fake_run(node, command, timeout=30.0):
        if command.strip() == "uname -s":
            return FakeResult("Darwin\n")
        if "command -v llama-server" in command or "brew --prefix" in command:
            return FakeResult("/opt/homebrew/bin/llama-server\n")
        if "DIR_OK" in command or "DIR_MISSING" in command:
            return FakeResult("/Users/x/models\nDIR_OK\n")
        if "name '*.gguf'" in command and "wc -l" in command:
            return FakeResult("2\n")
        if "connect_ex" in command:
            return FakeResult("free\n")
        if "llama-server.pid" in command and "cat" in command:
            return FakeResult("")
        if "echo alive" in command:
            return FakeResult("")
        if "MISSING" in command and ".gguf" in command:
            return FakeResult("MISSING\n")
        return FakeResult("")

    return fake_run


@pytest.mark.asyncio
async def test_dry_run_ok_does_not_start(app, monkeypatch):
    started = {"nohup": 0}

    async def fake_run(node, command, timeout=30.0):
        if "nohup" in command:
            started["nohup"] += 1
            return FakeResult("12345\n")
        return await _fake_run()(node, command, timeout)

    async def fake_metrics(node):
        return {
            "gpus": [{"name": "Apple M4", "vendor": "Apple"}],
            "diskFreeBytes": 80 * 1024 * 1024 * 1024,
        }

    monkeypatch.setattr(ssh_mod, "run_command", fake_run)
    monkeypatch.setattr(metrics_mod, "collect_node_metrics", fake_metrics)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        node = await _seed(client)
        response = await client.post(f"/nodes/{node['id']}/engine/dry-run", json={})
        assert response.status_code == 200
        body = response.json()
        assert body["ok"] is True
        assert started["nohup"] == 0
        ids = [item["id"] for item in body["checks"]]
        assert ids == ["access", "binary", "modelDir", "model", "port", "gpu", "disk", "running"]
        assert all(item["ok"] for item in body["checks"] if item["id"] != "running")
        assert "--models-dir" in " ".join(body["argv"])
        assert "llama-server" in body["command"]
        engine = await client.get(f"/nodes/{node['id']}/engine")
        assert engine.json()["running"] is False
        assert engine.json()["lastStart"] is None


@pytest.mark.asyncio
async def test_dry_run_missing_binary(app, monkeypatch):
    async def fake_run(node, command, timeout=30.0):
        if "command -v llama-server" in command or "brew --prefix" in command:
            return FakeResult("MISSING\n")
        return await _fake_run()(node, command, timeout)

    async def fake_metrics(node):
        return {"gpus": [], "diskFreeBytes": 80 * 1024 * 1024 * 1024}

    monkeypatch.setattr(ssh_mod, "run_command", fake_run)
    monkeypatch.setattr(metrics_mod, "collect_node_metrics", fake_metrics)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        node = await _seed(client)
        response = await client.post(f"/nodes/{node['id']}/engine/dry-run", json={})
        assert response.status_code == 200
        body = response.json()
        assert body["ok"] is False
        binary = next(item for item in body["checks"] if item["id"] == "binary")
        assert binary["ok"] is False


@pytest.mark.asyncio
async def test_dry_run_vllm_requires_model(app, monkeypatch):
    async def fake_run(node, command, timeout=30.0):
        if command.strip() == "uname -s":
            return FakeResult("Linux\n")
        if "command -v docker" in command:
            return FakeResult("/usr/bin/docker\n")
        if "DIR_OK" in command:
            return FakeResult("/models\nDIR_OK\n")
        if "connect_ex" in command:
            return FakeResult("free\n")
        return FakeResult("")

    async def fake_metrics(node):
        return {"gpus": [{"name": "Radeon"}], "diskFreeBytes": 80 * 1024 * 1024 * 1024}

    monkeypatch.setattr(ssh_mod, "run_command", fake_run)
    monkeypatch.setattr(metrics_mod, "collect_node_metrics", fake_metrics)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        cluster = (await client.post("/clusters", json={"name": "gpu-box", "engine": "vllm"})).json()
        node = (await client.post(
            f"/clusters/{cluster['id']}/nodes",
            json={
                "name": "box",
                "host": "192.168.1.20",
                "sshUser": "fernando",
                "sshAuthType": "password",
                "sshPassword": "secret",
                "openaiBaseUrl": "http://192.168.1.20:8000/v1",
            },
        )).json()
        response = await client.post(f"/nodes/{node['id']}/engine/dry-run", json={})
        assert response.status_code == 200
        body = response.json()
        assert body["ok"] is False
        model = next(item for item in body["checks"] if item["id"] == "model")
        assert model["ok"] is False
