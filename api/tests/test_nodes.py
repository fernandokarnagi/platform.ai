import pytest
from httpx import ASGITransport, AsyncClient


def _node_payload():
    return {
        "name": "mac-1",
        "host": "192.168.1.10",
        "sshUser": "fernando",
        "sshAuthType": "password",
        "sshPassword": "secret",
        "openaiBaseUrl": "http://192.168.1.10:8080/v1",
    }


@pytest.mark.asyncio
async def test_register_list_get_node(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        cluster = (await client.post("/clusters", json={"name": "desk-macs"})).json()
        created = await client.post(f"/clusters/{cluster['id']}/nodes", json=_node_payload())
        assert created.status_code == 201
        node = created.json()
        assert node["sshPassword"] == "secret"
        assert node["listenPort"] == 8080
        assert node["llamaServerPath"] == ""
        assert node["serverParams"]["ctxSize"] is None
        assert node["serverParams"]["gpuLayers"] is None
        listed = await client.get(f"/clusters/{cluster['id']}/nodes")
        assert len(listed.json()) == 1
        fetched = await client.get(f"/nodes/{node['id']}")
        assert fetched.json()["name"] == "mac-1"


@pytest.mark.asyncio
async def test_delete_node(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        cluster = (await client.post("/clusters", json={"name": "desk-macs"})).json()
        created = await client.post(f"/clusters/{cluster['id']}/nodes", json=_node_payload())
        node_id = created.json()["id"]
        deleted = await client.delete(f"/nodes/{node_id}")
        assert deleted.status_code == 204
        assert (await client.get(f"/nodes/{node_id}")).status_code == 404
        listed = await client.get(f"/clusters/{cluster['id']}/nodes")
        assert listed.json() == []


@pytest.mark.asyncio
async def test_delete_cluster_blocked_when_nodes_exist(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        cluster = (await client.post("/clusters", json={"name": "desk-macs"})).json()
        await client.post(f"/clusters/{cluster['id']}/nodes", json=_node_payload())
        deleted = await client.delete(f"/clusters/{cluster['id']}")
        assert deleted.status_code == 409
        assert deleted.json()["detail"] == "Cluster has nodes"


@pytest.mark.asyncio
async def test_register_node_on_missing_cluster(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/clusters/64b64b64b64b64b64b64b64b/nodes",
            json=_node_payload(),
        )
        assert response.status_code == 404
