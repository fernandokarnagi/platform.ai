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
        listed = await client.get("/clusters")
        assert listed.status_code == 200
        assert len(listed.json()) == 1


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
