import pytest
from httpx import ASGITransport, AsyncClient


async def _client(app):
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.mark.asyncio
async def test_create_and_list_cluster(app):
    async with await _client(app) as client:
        created = await client.post("/clusters", json={"name": "desk-macs", "description": "two macs"})
        assert created.status_code == 201
        body = created.json()
        assert body["name"] == "desk-macs"
        assert body["engine"] == "llama.cpp"
        assert body["nodeCount"] == 0
        assert body["runningCount"] == 0
        assert body["stoppedCount"] == 0
        listed = await client.get("/clusters")
        assert listed.status_code == 200
        assert len(listed.json()) == 1


@pytest.mark.asyncio
async def test_create_vllm_cluster(app):
    async with await _client(app) as client:
        created = await client.post("/clusters", json={"name": "gpu-box", "engine": "vllm"})
        assert created.status_code == 201
        assert created.json()["engine"] == "vllm"


@pytest.mark.asyncio
async def test_create_vllm_metal_cluster(app):
    async with await _client(app) as client:
        created = await client.post("/clusters", json={"name": "mac-metal", "engine": "vllm-metal"})
        assert created.status_code == 201
        assert created.json()["engine"] == "vllm-metal"


@pytest.mark.asyncio
async def test_list_cluster_reports_stopped_nodes(app):
    async with await _client(app) as client:
        created = await client.post("/clusters", json={"name": "desk-macs"})
        cluster_id = created.json()["id"]
        registered = await client.post(
            f"/clusters/{cluster_id}/nodes",
            json={
                "name": "this-mac",
                "nodeType": "local",
                "openaiBaseUrl": "http://127.0.0.1:8080/v1",
            },
        )
        assert registered.status_code == 201
        listed = await client.get("/clusters")
        assert listed.status_code == 200
        row = listed.json()[0]
        assert row["nodeCount"] == 1
        assert row["runningCount"] == 0
        assert row["stoppedCount"] == 1


@pytest.mark.asyncio
async def test_delete_cluster_without_nodes(app):
    async with await _client(app) as client:
        created = await client.post("/clusters", json={"name": "tmp"})
        cluster_id = created.json()["id"]
        deleted = await client.delete(f"/clusters/{cluster_id}")
        assert deleted.status_code == 204


@pytest.mark.asyncio
async def test_get_missing_cluster(app):
    async with await _client(app) as client:
        response = await client.get("/clusters/64b64b64b64b64b64b64b64b")
        assert response.status_code == 404
        assert response.json()["detail"] == "Not found"


@pytest.mark.asyncio
async def test_invalid_cluster_id(app):
    async with await _client(app) as client:
        response = await client.get("/clusters/nope")
        assert response.status_code == 400
        assert response.json()["detail"] == "Invalid id"


@pytest.mark.asyncio
async def test_delete_cluster_with_nodes_conflict(app):
    async with await _client(app) as client:
        created = await client.post("/clusters", json={"name": "desk-macs"})
        cluster_id = created.json()["id"]
        registered = await client.post(
            f"/clusters/{cluster_id}/nodes",
            json={
                "name": "mac-1",
                "host": "192.168.1.10",
                "sshUser": "fernando",
                "sshAuthType": "password",
                "sshPassword": "secret",
                "openaiBaseUrl": "http://192.168.1.10:8080/v1",
            },
        )
        assert registered.status_code == 201
        deleted = await client.delete(f"/clusters/{cluster_id}")
        assert deleted.status_code == 409
        assert deleted.json()["detail"] == "Cluster has nodes"


@pytest.mark.asyncio
async def test_delete_cluster_cascade_removes_nodes(app):
    async with await _client(app) as client:
        created = await client.post("/clusters", json={"name": "desk-macs"})
        cluster_id = created.json()["id"]
        registered = await client.post(
            f"/clusters/{cluster_id}/nodes",
            json={
                "name": "mac-1",
                "host": "192.168.1.10",
                "sshUser": "fernando",
                "sshAuthType": "password",
                "sshPassword": "secret",
                "openaiBaseUrl": "http://192.168.1.10:8080/v1",
            },
        )
        assert registered.status_code == 201
        node_id = registered.json()["id"]
        deleted = await client.delete(f"/clusters/{cluster_id}?cascade=true")
        assert deleted.status_code == 204
        assert (await client.get(f"/clusters/{cluster_id}")).status_code == 404
        assert (await client.get(f"/nodes/{node_id}")).status_code == 404
