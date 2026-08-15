import pytest
from httpx import ASGITransport, AsyncClient
from api.engines.llama_cpp import LlamaCppEngine
from api.services import ssh as ssh_mod


def test_hf_url():
    assert LlamaCppEngine.hf_url("org/model", "q.gguf") == "https://huggingface.co/org/model/resolve/main/q.gguf"


class FakeResult:
    def __init__(self, stdout="", exit_status=0, stderr=""):
        self.stdout = stdout
        self.stderr = stderr
        self.exit_status = exit_status


async def _seed(client):
    cluster = (await client.post("/clusters", json={"name": "desk-macs"})).json()
    return (await client.post(
        f"/clusters/{cluster['id']}/nodes",
        json={
            "name": "mac-1",
            "host": "192.168.1.10",
            "sshUser": "fernando",
            "sshAuthType": "password",
            "sshPassword": "secret",
            "openaiBaseUrl": "http://192.168.1.10:8080/v1",
            "hfToken": "hf_node",
        },
    )).json()


@pytest.mark.asyncio
async def test_list_and_delete_models(app, monkeypatch):
    async def fake_run(node, command, timeout=30.0):
        if "stat" in command or "gguf" in command:
            return FakeResult("phi.gguf\t1234\t2026-08-15T00:00:00\n")
        return FakeResult("OK\n")

    monkeypatch.setattr(ssh_mod, "run_command", fake_run)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        node = await _seed(client)
        listed = await client.get(f"/nodes/{node['id']}/models")
        assert listed.status_code == 200
        assert listed.json()[0]["name"] == "phi.gguf"
        deleted = await client.request("DELETE", f"/nodes/{node['id']}/models", json={"filename": "phi.gguf"})
        assert deleted.status_code == 204
        bad = await client.request("DELETE", f"/nodes/{node['id']}/models", json={"filename": "../x"})
        assert bad.status_code == 400
        assert bad.json()["detail"] == "Invalid filename"


@pytest.mark.asyncio
async def test_download_url_and_hf(app, monkeypatch):
    seen = {}

    async def fake_run(node, command, timeout=30.0):
        seen["cmd"] = command
        if "curl" in command and "fail" in command and "missing.gguf" in command:
            return FakeResult("", exit_status=22, stderr="404")
        return FakeResult("OK\n")

    monkeypatch.setattr(ssh_mod, "run_command", fake_run)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        node = await _seed(client)
        ok = await client.post(
            f"/nodes/{node['id']}/models/download",
            json={"source": "url", "url": "https://example.com/a.gguf", "filename": "a.gguf"},
        )
        assert ok.status_code == 200
        fail = await client.post(
            f"/nodes/{node['id']}/models/download",
            json={"source": "huggingface", "repo": "org/model", "filename": "missing.gguf"},
        )
        assert fail.status_code == 502
        assert fail.json()["detail"].startswith("Download failed:")
