import pytest
from httpx import ASGITransport, AsyncClient

from api.services import ssh as ssh_mod


class FakeResult:
    def __init__(self, stdout="", exit_status=0, stderr=""):
        self.stdout = stdout
        self.stderr = stderr
        self.exit_status = exit_status


@pytest.mark.asyncio
async def test_library_list_and_copy(app, tmp_path, monkeypatch):
    lib = tmp_path / "globalmodel"
    llama = lib / "llama.cpp"
    llama.mkdir(parents=True)
    (llama / "tiny.gguf").write_bytes(b"gguf-bytes")
    dest_dir = tmp_path / "node-models"
    dest_dir.mkdir()

    async def fake_run(node, command, timeout=30.0):
        if "mkdir -p" in command and "echo" in command:
            return FakeResult(str(dest_dir) + "\n")
        if "nohup" in command:
            return FakeResult("4242\n")
        return FakeResult("OK\n")

    monkeypatch.setattr(ssh_mod, "run_command", fake_run)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        await client.put("/settings", json={"libraryDir": str(lib)})
        listed = await client.get("/library/models")
        assert listed.status_code == 200
        body = listed.json()
        assert body["libraryDir"] == str(lib)
        assert [item["name"] for item in body["items"]] == ["tiny.gguf"]
        assert body["items"][0]["kind"] == "llama.cpp"

        cluster = (await client.post("/clusters", json={"name": "desk-macs"})).json()
        node = (
            await client.post(
                f"/clusters/{cluster['id']}/nodes",
                json={
                    "name": "mac-1",
                    "nodeType": "local",
                    "host": "localhost",
                    "openaiBaseUrl": "http://127.0.0.1:8080/v1",
                    "modelDir": str(dest_dir),
                },
            )
        ).json()
        copied = await client.post(
            f"/nodes/{node['id']}/models/copy",
            json={"kind": "llama.cpp", "filename": "tiny.gguf"},
        )
        assert copied.status_code == 202
        assert copied.json()["source"] == "library"
        assert copied.json()["target"] == "node"
        assert copied.json()["filename"] == "tiny.gguf"
        missing = await client.post(
            f"/nodes/{node['id']}/models/copy",
            json={"kind": "llama.cpp", "filename": "nope.gguf"},
        )
        assert missing.status_code == 404
        wrong = await client.post(
            f"/nodes/{node['id']}/models/copy",
            json={"kind": "vllm", "filename": "tiny.gguf"},
        )
        assert wrong.status_code == 400
