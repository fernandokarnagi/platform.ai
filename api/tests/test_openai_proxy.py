import pytest
from httpx import ASGITransport, AsyncClient
from api.services.openai_proxy import normalize_base_url
from api.services import openai_proxy as proxy
from api.services import ssh as ssh_mod


def test_normalize_base_url():
    assert normalize_base_url("http://x:8080/v1/") == "http://x:8080/v1"
    assert normalize_base_url("http://x:8080/v1") == "http://x:8080/v1"


class FakeResult:
    def __init__(self, stdout="", exit_status=0, stderr=""):
        self.stdout = stdout
        self.stderr = stderr
        self.exit_status = exit_status


@pytest.mark.asyncio
async def test_status_up_and_chat(app, monkeypatch):
    async def fake_ssh(node, command, timeout=30.0):
        return FakeResult("Darwin\n")

    async def fake_models(base_url, api_key):
        return [{"id": "phi"}]

    async def fake_chat(base_url, api_key, payload):
        assert payload["stream"] is False
        assert payload.get("top_k") == 40
        return {"choices": [{"message": {"role": "assistant", "content": "hi"}}]}

    monkeypatch.setattr(ssh_mod, "run_command", fake_ssh)
    monkeypatch.setattr(proxy, "fetch_models", fake_models)
    monkeypatch.setattr(proxy, "chat_completions", fake_chat)

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
                "openaiBaseUrl": "http://192.168.1.10:8080/v1/",
            },
        )).json()
        status = await client.get(f"/nodes/{node['id']}/status")
        assert status.status_code == 200
        assert status.json()["openai"] == "up"
        assert status.json()["models"] == ["phi"]
        chat = await client.post(
            f"/nodes/{node['id']}/chat",
            json={"model": "phi", "messages": [{"role": "user", "content": "hi"}], "topK": 40},
        )
        assert chat.status_code == 200
        assert chat.json()["choices"][0]["message"]["content"] == "hi"


@pytest.mark.asyncio
async def test_chat_applies_sampling_defaults(app, monkeypatch):
    captured = {}

    async def fake_ssh(node, command, timeout=30.0):
        return FakeResult("Darwin\n")

    async def fake_chat(base_url, api_key, payload):
        captured.update(payload)
        return {"choices": [{"message": {"role": "assistant", "content": "hi"}}]}

    monkeypatch.setattr(ssh_mod, "run_command", fake_ssh)
    monkeypatch.setattr(proxy, "chat_completions", fake_chat)

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
                "openaiBaseUrl": "http://192.168.1.10:8080/v1/",
            },
        )).json()
        chat = await client.post(
            f"/nodes/{node['id']}/chat",
            json={"model": "phi", "messages": [{"role": "user", "content": "hi"}]},
        )
        assert chat.status_code == 200
        assert captured["temperature"] == 1.0
        assert captured["top_p"] == 0.95
        assert captured["top_k"] == 20
        assert captured["min_p"] == 0.0
        assert captured["presence_penalty"] == 0.0
        assert captured["repetition_penalty"] == 1.0


@pytest.mark.asyncio
async def test_status_openai_down_is_200(app, monkeypatch):
    async def fake_ssh(node, command, timeout=30.0):
        return FakeResult("Darwin\n")

    async def fake_models(base_url, api_key):
        raise proxy.OpenAIProxyError("connection refused")

    monkeypatch.setattr(ssh_mod, "run_command", fake_ssh)
    monkeypatch.setattr(proxy, "fetch_models", fake_models)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        cluster = (await client.post("/clusters", json={"name": "c"})).json()
        node = (await client.post(
            f"/clusters/{cluster['id']}/nodes",
            json={
                "name": "n",
                "host": "h",
                "sshUser": "u",
                "sshAuthType": "password",
                "sshPassword": "p",
                "openaiBaseUrl": "http://h:8080/v1",
            },
        )).json()
        status = await client.get(f"/nodes/{node['id']}/status")
        assert status.status_code == 200
        assert status.json()["openai"] == "down"
