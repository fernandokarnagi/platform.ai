import pytest
from httpx import ASGITransport, AsyncClient
from api.routes import nodes as nodes_mod
from api.services import ssh as ssh_mod


class FakeResult:
    def __init__(self, stdout="", exit_status=0, stderr=""):
        self.stdout = stdout
        self.stderr = stderr
        self.exit_status = exit_status


def _download_fake_run(seen):
    async def fake_run(node, command, timeout=30.0):
        if "nohup" in command:
            seen["start"] = command
            return FakeResult("4242\n")
        if "mkdir -p" in command and "echo" in command:
            return FakeResult("/Users/x/models\n")
        return FakeResult("OK\n")

    return fake_run


@pytest.mark.asyncio
async def test_download_inherits_cluster_hf_token(app, monkeypatch):
    seen = {}

    async def fake_list(repo, revision, token, suffixes=None):
        seen["list_token"] = token
        return []

    monkeypatch.setattr(ssh_mod, "run_command", _download_fake_run(seen))
    monkeypatch.setattr(nodes_mod, "_list_hf_files", fake_list)
    monkeypatch.setattr(nodes_mod, "_list_hf_file_details", fake_list)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        cluster = (await client.post("/clusters", json={"name": "desk-macs", "hfToken": "hf_cluster"})).json()
        assert cluster["hfToken"] == "hf_cluster"
        node = (await client.post(
            f"/clusters/{cluster['id']}/nodes",
            json={
                "name": "mac-1",
                "host": "192.168.1.10",
                "sshUser": "fernando",
                "sshAuthType": "password",
                "sshPassword": "secret",
                "openaiBaseUrl": "http://192.168.1.10:8080/v1",
            },
        )).json()
        assert node["hfToken"] == ""
        started = await client.post(
            f"/nodes/{node['id']}/models/download",
            json={"source": "huggingface", "repo": "org/model", "filename": "a.gguf"},
        )
        assert started.status_code == 202
        assert seen.get("list_token") == "hf_cluster"
        assert "Authorization: Bearer hf_cluster" in seen.get("start", "")


@pytest.mark.asyncio
async def test_download_node_token_overrides_cluster(app, monkeypatch):
    seen = {}

    async def fake_list(repo, revision, token, suffixes=None):
        seen["list_token"] = token
        return []

    monkeypatch.setattr(ssh_mod, "run_command", _download_fake_run(seen))
    monkeypatch.setattr(nodes_mod, "_list_hf_files", fake_list)
    monkeypatch.setattr(nodes_mod, "_list_hf_file_details", fake_list)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        cluster = (await client.post("/clusters", json={"name": "desk-macs", "hfToken": "hf_cluster"})).json()
        node = (await client.post(
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
        started = await client.post(
            f"/nodes/{node['id']}/models/download",
            json={"source": "huggingface", "repo": "org/model", "filename": "a.gguf"},
        )
        assert started.status_code == 202
        assert seen.get("list_token") == "hf_node"
        assert "Authorization: Bearer hf_node" in seen.get("start", "")


@pytest.mark.asyncio
async def test_retry_inherits_cluster_hf_token(app, monkeypatch):
    seen = {}
    monkeypatch.setattr(ssh_mod, "run_command", _download_fake_run(seen))

    async def fake_list(repo, revision, token, suffixes=None):
        return []

    monkeypatch.setattr(nodes_mod, "_list_hf_files", fake_list)
    monkeypatch.setattr(nodes_mod, "_list_hf_file_details", fake_list)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        cluster = (await client.post("/clusters", json={"name": "desk-macs", "hfToken": "hf_cluster"})).json()
        node = (await client.post(
            f"/clusters/{cluster['id']}/nodes",
            json={
                "name": "mac-1",
                "host": "192.168.1.10",
                "sshUser": "fernando",
                "sshAuthType": "password",
                "sshPassword": "secret",
                "openaiBaseUrl": "http://192.168.1.10:8080/v1",
            },
        )).json()
        started = await client.post(
            f"/nodes/{node['id']}/models/download",
            json={"source": "huggingface", "repo": "org/model", "filename": "a.gguf"},
        )
        from api.database import get_database
        from bson import ObjectId

        db = get_database()
        await db.downloads.update_one(
            {"_id": ObjectId(started.json()["id"])},
            {"$set": {"status": "failed"}},
        )
        seen.pop("start", None)
        retried = await client.post(f"/downloads/{started.json()['id']}/retry")
        assert retried.status_code == 200
        assert "Authorization: Bearer hf_cluster" in seen.get("start", "")


@pytest.mark.asyncio
async def test_update_cluster_hf_token(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        created = await client.post("/clusters", json={"name": "desk-macs"})
        cluster_id = created.json()["id"]
        updated = await client.put(f"/clusters/{cluster_id}", json={"hfToken": "hf_saved"})
        assert updated.status_code == 200
        assert updated.json()["hfToken"] == "hf_saved"
        fetched = await client.get(f"/clusters/{cluster_id}")
        assert fetched.json()["hfToken"] == "hf_saved"
