import pytest
from httpx import ASGITransport, AsyncClient
from api.services import openai_proxy as proxy
from api.services import ssh as ssh_mod
from api.services.request_log import LIMIT, estimate_prompt_tokens


class FakeResult:
    def __init__(self, stdout="", exit_status=0, stderr=""):
        self.stdout = stdout
        self.stderr = stderr
        self.exit_status = exit_status


def test_estimate_prompt_tokens():
    assert estimate_prompt_tokens([]) == 0
    assert estimate_prompt_tokens([{"content": "abcd"}]) == 1
    assert estimate_prompt_tokens([{"content": "abcdefgh"}]) == 2


@pytest.mark.asyncio
async def test_chat_records_request_log(app, monkeypatch):
    async def fake_ssh(node, command, timeout=30.0):
        return FakeResult("Darwin\n")

    async def fake_chat(base_url, api_key, payload):
        return {
            "choices": [{"message": {"role": "assistant", "content": "hi"}}],
            "usage": {"prompt_tokens": 12, "completion_tokens": 3},
        }

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
        empty = await client.get(f"/nodes/{node['id']}/requests")
        assert empty.status_code == 200
        assert empty.json() == []
        chat = await client.post(
            f"/nodes/{node['id']}/chat",
            json={"model": "phi", "messages": [{"role": "user", "content": "hi"}]},
        )
        assert chat.status_code == 200
        logged = await client.get(f"/nodes/{node['id']}/requests")
        assert logged.status_code == 200
        rows = logged.json()
        assert len(rows) == 1
        assert rows[0]["model"] == "phi"
        assert rows[0]["ok"] is True
        assert rows[0]["promptTokens"] == 12
        assert rows[0]["completionTokens"] == 3
        assert rows[0]["error"] == ""
        assert rows[0]["latencyMs"] >= 0


@pytest.mark.asyncio
async def test_chat_failure_records_error_body(app, monkeypatch):
    async def fake_ssh(node, command, timeout=30.0):
        return FakeResult("Darwin\n")

    async def fake_chat(base_url, api_key, payload):
        raise proxy.OpenAIProxyError('{"error":{"message":"context overflow"}}')

    monkeypatch.setattr(ssh_mod, "run_command", fake_ssh)
    monkeypatch.setattr(proxy, "chat_completions", fake_chat)

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
        chat = await client.post(
            f"/nodes/{node['id']}/chat",
            json={"model": "phi", "messages": [{"role": "user", "content": "hi there"}]},
        )
        assert chat.status_code == 502
        rows = (await client.get(f"/nodes/{node['id']}/requests")).json()
        assert len(rows) == 1
        assert rows[0]["ok"] is False
        assert "context overflow" in rows[0]["error"]
        assert rows[0]["model"] == "phi"


@pytest.mark.asyncio
async def test_request_log_caps_at_limit(app, monkeypatch):
    async def fake_ssh(node, command, timeout=30.0):
        return FakeResult("Darwin\n")

    n = {"i": 0}

    async def fake_chat(base_url, api_key, payload):
        n["i"] += 1
        return {"choices": [{"message": {"role": "assistant", "content": str(n["i"])}}]}

    monkeypatch.setattr(ssh_mod, "run_command", fake_ssh)
    monkeypatch.setattr(proxy, "chat_completions", fake_chat)

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
        for i in range(LIMIT + 3):
            await client.post(
                f"/nodes/{node['id']}/chat",
                json={"model": f"m{i}", "messages": [{"role": "user", "content": "x"}]},
            )
        rows = (await client.get(f"/nodes/{node['id']}/requests")).json()
        assert len(rows) == LIMIT
        assert rows[0]["model"] == f"m{LIMIT + 2}"
        assert rows[-1]["model"] == "m3"
