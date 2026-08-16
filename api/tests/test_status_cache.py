from datetime import datetime, timedelta
import pytest
from httpx import ASGITransport, AsyncClient
from api.services import openai_proxy as proxy
from api.services import ssh as ssh_mod


class FakeResult:
    def __init__(self, stdout="", exit_status=0, stderr=""):
        self.stdout = stdout
        self.stderr = stderr
        self.exit_status = exit_status


async def _client(app):
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def _make_node(client):
    cluster = (await client.post("/clusters", json={"name": "desk-macs"})).json()
    node = (
        await client.post(
            f"/clusters/{cluster['id']}/nodes",
            json={
                "name": "mac-1",
                "host": "192.168.1.10",
                "sshUser": "fernando",
                "sshAuthType": "password",
                "sshPassword": "secret",
                "openaiBaseUrl": "http://192.168.1.10:8080/v1",
            },
        )
    ).json()
    return cluster, node


@pytest.mark.asyncio
async def test_status_cached_for_thirty_minutes(app, monkeypatch):
    calls = {"ssh": 0, "models": 0}

    async def fake_ssh(node, command, timeout=30.0):
        calls["ssh"] += 1
        if "llama-server.pid" in command:
            return FakeResult("99\n")
        if "kill -0" in command:
            return FakeResult("alive\n")
        return FakeResult("Darwin\n")

    async def fake_models(base_url, api_key):
        calls["models"] += 1
        return [{"id": "phi"}]

    monkeypatch.setattr(ssh_mod, "run_command", fake_ssh)
    monkeypatch.setattr(proxy, "fetch_models", fake_models)

    async with await _client(app) as client:
        _cluster, node = await _make_node(client)
        first = await client.get(f"/nodes/{node['id']}/status")
        assert first.status_code == 200
        body = first.json()
        assert body["openai"] == "up"
        assert body["models"] == ["phi"]
        assert body["running"] is True
        assert body["cached"] is False
        assert calls["ssh"] > 0
        ssh_after_first = calls["ssh"]
        models_after_first = calls["models"]

        second = await client.get(f"/nodes/{node['id']}/status")
        assert second.status_code == 200
        assert second.json()["cached"] is True
        assert second.json()["models"] == ["phi"]
        assert calls["ssh"] == ssh_after_first
        assert calls["models"] == models_after_first

        forced = await client.get(f"/nodes/{node['id']}/status?refresh=true")
        assert forced.status_code == 200
        assert forced.json()["cached"] is False
        assert calls["models"] == models_after_first + 1


@pytest.mark.asyncio
async def test_stale_status_cache_is_refreshed(app, monkeypatch):
    calls = {"models": 0}

    async def fake_ssh(node, command, timeout=30.0):
        if "llama-server.pid" in command:
            return FakeResult("")
        return FakeResult("Darwin\n")

    async def fake_models(base_url, api_key):
        calls["models"] += 1
        return [{"id": "phi"}]

    monkeypatch.setattr(ssh_mod, "run_command", fake_ssh)
    monkeypatch.setattr(proxy, "fetch_models", fake_models)

    async with await _client(app) as client:
        _cluster, node = await _make_node(client)
        await client.get(f"/nodes/{node['id']}/status")
        assert calls["models"] == 1

        from api.database import get_database

        db = get_database()
        from bson import ObjectId

        await db.nodes.update_one(
            {"_id": ObjectId(node["id"])},
            {"$set": {"statusCache.checkedAt": datetime.utcnow() - timedelta(minutes=31)}},
        )
        again = await client.get(f"/nodes/{node['id']}/status")
        assert again.status_code == 200
        assert again.json()["cached"] is False
        assert calls["models"] == 2


@pytest.mark.asyncio
async def test_cluster_list_uses_status_cache_not_live_probe(app, monkeypatch):
    async def fail_if_called(*args, **kwargs):
        raise AssertionError("cluster list must not live-probe nodes")

    monkeypatch.setattr("api.services.engine.is_running", fail_if_called)
    monkeypatch.setattr("api.services.engine.engine_status", fail_if_called)

    async with await _client(app) as client:
        cluster, node = await _make_node(client)
        from api.database import get_database
        from bson import ObjectId

        db = get_database()
        await db.nodes.update_one(
            {"_id": ObjectId(node["id"])},
            {
                "$set": {
                    "statusCache": {
                        "ssh": "up",
                        "openai": "up",
                        "running": True,
                        "pid": "12",
                        "models": ["phi"],
                        "detail": None,
                        "checkedAt": datetime.utcnow(),
                    }
                }
            },
        )
        listed = await client.get("/clusters")
        assert listed.status_code == 200
        row = listed.json()[0]
        assert row["nodeCount"] == 1
        assert row["runningCount"] == 1
        assert row["stoppedCount"] == 0

        fetched = await client.get(f"/clusters/{cluster['id']}/nodes")
        assert fetched.json()[0]["statusCache"]["running"] is True
        assert fetched.json()[0]["statusCache"]["fresh"] is True


@pytest.mark.asyncio
async def test_status_check_probes_one_part(app, monkeypatch):
    calls = {"uname": 0, "pid": 0, "models": 0}

    async def fake_ssh(node, command, timeout=30.0):
        if "uname" in command:
            calls["uname"] += 1
            return FakeResult("Darwin\n")
        if "llama-server.pid" in command:
            calls["pid"] += 1
            return FakeResult("99\n")
        if "kill -0" in command:
            return FakeResult("alive\n")
        return FakeResult("")

    async def fake_models(base_url, api_key):
        calls["models"] += 1
        return [{"id": "phi"}]

    monkeypatch.setattr(ssh_mod, "run_command", fake_ssh)
    monkeypatch.setattr(proxy, "fetch_models", fake_models)

    async with await _client(app) as client:
        _cluster, node = await _make_node(client)
        await client.get(f"/nodes/{node['id']}/status")
        calls["uname"] = 0
        calls["pid"] = 0
        calls["models"] = 0

        ssh = await client.get(f"/nodes/{node['id']}/status?check=ssh")
        assert ssh.status_code == 200
        assert ssh.json()["ssh"] == "up"
        assert ssh.json()["cached"] is False
        assert calls["uname"] == 1
        assert calls["pid"] == 0
        assert calls["models"] == 0

        engine = await client.get(f"/nodes/{node['id']}/status?check=engine")
        assert engine.status_code == 200
        assert engine.json()["running"] is True
        assert calls["pid"] >= 1
        assert calls["models"] == 0

        openai = await client.get(f"/nodes/{node['id']}/status?check=openai")
        assert openai.status_code == 200
        assert openai.json()["openai"] == "up"
        assert openai.json()["models"] == ["phi"]
        assert calls["models"] == 1

        bad = await client.get(f"/nodes/{node['id']}/status?check=disk")
        assert bad.status_code == 400
