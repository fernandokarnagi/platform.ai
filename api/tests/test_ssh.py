import pytest
from httpx import ASGITransport, AsyncClient
from api.services import ssh as ssh_mod


class FakeResult:
    def __init__(self, stdout, exit_status=0, stderr=""):
        self.stdout = stdout
        self.stderr = stderr
        self.exit_status = exit_status


@pytest.mark.asyncio
async def test_test_ssh_success(app, monkeypatch):
    async def fake_run(node, command, timeout=30.0):
        if "uname" in command:
            return FakeResult("Darwin\n/opt/homebrew/bin/llama-server\n")
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
            },
        )).json()
        response = await client.post(f"/nodes/{node['id']}/test-ssh")
        assert response.status_code == 200
        assert response.json()["uname"] == "Darwin"
        assert "llama-server" in response.json()["llamaServer"]


@pytest.mark.asyncio
async def test_test_ssh_failure(app, monkeypatch):
    async def fake_run(node, command, timeout=30.0):
        raise ssh_mod.SshError("Authentication failed")

    monkeypatch.setattr(ssh_mod, "run_command", fake_run)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        cluster = (await client.post("/clusters", json={"name": "desk-macs"})).json()
        node = (await client.post(
            f"/clusters/{cluster['id']}/nodes",
            json={
                "name": "mac-1",
                "host": "192.168.1.10",
                "sshUser": "x",
                "sshAuthType": "password",
                "sshPassword": "bad",
                "openaiBaseUrl": "http://192.168.1.10:8080/v1",
            },
        )).json()
        response = await client.post(f"/nodes/{node['id']}/test-ssh")
        assert response.status_code == 502
        assert response.json()["detail"].startswith("SSH failed:")


@pytest.mark.asyncio
async def test_run_command_bad_private_key_is_ssh_error():
    node = {
        "host": "192.168.1.10",
        "sshUser": "x",
        "sshAuthType": "private_key",
        "sshPrivateKey": "not-a-pem",
        "sshPassphrase": None,
    }
    with pytest.raises(ssh_mod.SshError):
        await ssh_mod.run_command(node, "uname -s")


@pytest.mark.asyncio
async def test_run_command_localhost_skips_ssh():
    result = await ssh_mod.run_command({"nodeType": "local"}, "echo platformai-local")
    assert result.exit_status == 0
    assert "platformai-local" in result.stdout


@pytest.mark.asyncio
async def test_create_localhost_node_without_ssh(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        cluster = (await client.post("/clusters", json={"name": "local"})).json()
        created = await client.post(
            f"/clusters/{cluster['id']}/nodes",
            json={
                "name": "this-mac",
                "nodeType": "local",
                "openaiBaseUrl": "http://127.0.0.1:8080/v1",
            },
        )
        assert created.status_code == 201
        body = created.json()
        assert body["nodeType"] == "local"
        assert body["host"] == "localhost"
        assert body["sshAuthType"] == "none"
        assert body["sshUser"] == ""


@pytest.mark.asyncio
async def test_remote_node_requires_host(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        cluster = (await client.post("/clusters", json={"name": "needs-host"})).json()
        created = await client.post(
            f"/clusters/{cluster['id']}/nodes",
            json={
                "name": "box",
                "nodeType": "remote",
                "sshUser": "fernando",
                "sshAuthType": "password",
                "sshPassword": "secret",
                "openaiBaseUrl": "http://192.168.1.10:8080/v1",
            },
        )
        assert created.status_code == 400
        assert "Host" in created.json()["detail"]


@pytest.mark.asyncio
async def test_remote_node_requires_ssh_user(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        cluster = (await client.post("/clusters", json={"name": "remote"})).json()
        created = await client.post(
            f"/clusters/{cluster['id']}/nodes",
            json={
                "name": "box",
                "host": "192.168.1.10",
                "openaiBaseUrl": "http://192.168.1.10:8080/v1",
            },
        )
        assert created.status_code == 400
        assert "SSH" in created.json()["detail"]
