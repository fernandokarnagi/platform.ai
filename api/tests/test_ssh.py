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
                "host": "127.0.0.1",
                "sshUser": "x",
                "sshAuthType": "password",
                "sshPassword": "bad",
                "openaiBaseUrl": "http://127.0.0.1:8080/v1",
            },
        )).json()
        response = await client.post(f"/nodes/{node['id']}/test-ssh")
        assert response.status_code == 502
        assert response.json()["detail"].startswith("SSH failed:")


@pytest.mark.asyncio
async def test_run_command_bad_private_key_is_ssh_error():
    node = {
        "host": "127.0.0.1",
        "sshUser": "x",
        "sshAuthType": "private_key",
        "sshPrivateKey": "not-a-pem",
        "sshPassphrase": None,
    }
    with pytest.raises(ssh_mod.SshError):
        await ssh_mod.run_command(node, "uname -s")
