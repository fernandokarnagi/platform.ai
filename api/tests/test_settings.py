import os
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
async def test_get_settings_defaults(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/settings")
        assert response.status_code == 200
        body = response.json()
        assert body["hfToken"] == ""
        assert body["libraryDir"] == "/Users/fernando.karnagi/App/globalmodel"
        assert body["llamaCpp"]["ctxSize"] is None
        assert body["llamaCpp"]["gpuLayers"] is None
        assert body["vllm"]["tensorParallelSize"] is None
        assert body["vllm"]["gpuMemoryUtilization"] is None


@pytest.mark.asyncio
async def test_put_and_get_settings(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        updated = await client.put("/settings", json={"hfToken": "hf_settings"})
        assert updated.status_code == 200
        assert updated.json()["hfToken"] == "hf_settings"
        fetched = await client.get("/settings")
        assert fetched.json()["hfToken"] == "hf_settings"
        llama = await client.put(
            "/settings",
            json={"llamaCpp": {"ctxSize": 8192, "gpuLayers": "all", "threads": 8}},
        )
        assert llama.status_code == 200
        assert llama.json()["llamaCpp"]["ctxSize"] == 8192
        assert llama.json()["llamaCpp"]["gpuLayers"] == "all"
        assert llama.json()["llamaCpp"]["threads"] == 8
        assert llama.json()["hfToken"] == "hf_settings"
        lib = await client.put("/settings", json={"libraryDir": "/tmp/global-models"})
        assert lib.json()["libraryDir"] == os.path.abspath("/tmp/global-models")
        assert lib.json()["hfToken"] == "hf_settings"
        blank = await client.put("/settings", json={"libraryDir": ""})
        assert blank.json()["libraryDir"] == "/Users/fernando.karnagi/App/globalmodel"
        cleared = await client.put("/settings", json={"hfToken": ""})
        assert cleared.json()["hfToken"] == ""
        assert cleared.json()["llamaCpp"]["ctxSize"] == 8192
        vllm = await client.put(
            "/settings",
            json={"vllm": {"tensorParallelSize": 2, "gpuMemoryUtilization": 0.75, "maxModelLen": 32768}},
        )
        assert vllm.status_code == 200
        assert vllm.json()["vllm"]["tensorParallelSize"] == 2
        assert vllm.json()["vllm"]["gpuMemoryUtilization"] == 0.75
        assert vllm.json()["llamaCpp"]["ctxSize"] == 8192


@pytest.mark.asyncio
async def test_download_inherits_settings_hf_token(app, monkeypatch):
    seen = {}

    async def fake_list(repo, revision, token, suffixes=None):
        seen["list_token"] = token
        return []

    monkeypatch.setattr(ssh_mod, "run_command", _download_fake_run(seen))
    monkeypatch.setattr(nodes_mod, "_list_hf_files", fake_list)
    monkeypatch.setattr(nodes_mod, "_list_hf_file_details", fake_list)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        await client.put("/settings", json={"hfToken": "hf_settings"})
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
        started = await client.post(
            f"/nodes/{node['id']}/models/download",
            json={"source": "huggingface", "repo": "org/model", "filename": "a.gguf"},
        )
        assert started.status_code == 202
        assert seen.get("list_token") == "hf_settings"
        assert "Authorization: Bearer hf_settings" in seen.get("start", "")


@pytest.mark.asyncio
async def test_cluster_token_overrides_settings(app, monkeypatch):
    seen = {}

    async def fake_list(repo, revision, token, suffixes=None):
        seen["list_token"] = token
        return []

    monkeypatch.setattr(ssh_mod, "run_command", _download_fake_run(seen))
    monkeypatch.setattr(nodes_mod, "_list_hf_files", fake_list)
    monkeypatch.setattr(nodes_mod, "_list_hf_file_details", fake_list)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        await client.put("/settings", json={"hfToken": "hf_settings"})
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
        assert started.status_code == 202
        assert seen.get("list_token") == "hf_cluster"
        assert "Authorization: Bearer hf_cluster" in seen.get("start", "")


@pytest.mark.asyncio
async def test_start_inherits_global_llama_cpp_params(app, monkeypatch):
    state = {"running": False}

    async def fake_run(node, command, timeout=30.0):
        if (
            "echo ~" in command
            or ("mkdir -p" in command and "echo" in command and "nohup" not in command)
            or ("printf" in command and "MODEL_DIR" in command)
        ):
            return FakeResult("/Users/x/models\n")
        if "command -v llama-server" in command or "brew --prefix" in command:
            return FakeResult("/opt/homebrew/bin/llama-server\n")
        if "llama-server.pid" in command and "cat" in command and "kill" not in command and "nohup" not in command:
            return FakeResult("12345\n" if state["running"] else "")
        if "echo alive" in command:
            return FakeResult("alive\n" if state["running"] else "")
        if "nohup" in command:
            state["running"] = True
            return FakeResult("12345\n")
        return FakeResult("")

    monkeypatch.setattr(ssh_mod, "run_command", fake_run)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        await client.put("/settings", json={"llamaCpp": {"ctxSize": 8192, "gpuLayers": "all", "threads": 6}})
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
        assert node["serverParams"]["ctxSize"] is None
        started = await client.post(f"/nodes/{node['id']}/engine/start", json={})
        assert started.status_code == 200
        argv = started.json()["lastStart"]["argv"]
        assert argv[argv.index("--ctx-size") + 1] == "8192"
        assert argv[argv.index("--n-gpu-layers") + 1] == "all"
        assert argv[argv.index("--threads") + 1] == "6"

        other = (await client.post(
            f"/clusters/{cluster['id']}/nodes",
            json={
                "name": "mac-2",
                "host": "192.168.1.11",
                "sshUser": "fernando",
                "sshAuthType": "password",
                "sshPassword": "secret",
                "openaiBaseUrl": "http://192.168.1.11:8080/v1",
                "serverParams": {"ctxSize": 2048, "gpuLayers": 12},
            },
        )).json()
        state["running"] = False
        started_other = await client.post(f"/nodes/{other['id']}/engine/start", json={})
        other_argv = started_other.json()["lastStart"]["argv"]
        assert other_argv[other_argv.index("--ctx-size") + 1] == "2048"
        assert other_argv[other_argv.index("--n-gpu-layers") + 1] == "12"
        assert other_argv[other_argv.index("--threads") + 1] == "6"


@pytest.mark.asyncio
async def test_start_inherits_global_vllm_params(app, monkeypatch):
    state = {"running": False}

    async def fake_run(node, command, timeout=30.0):
        if "mkdir -p" in command or "printf" in command or "echo ~" in command:
            return FakeResult("/models\n")
        if "command -v docker" in command:
            return FakeResult("/usr/bin/docker\n")
        if "State.Running" in command:
            return FakeResult("true\nalive\n" if state["running"] else "false\n")
        if "docker inspect" in command:
            return FakeResult("abc123def456\n" if state["running"] else "")
        if "docker run" in command:
            state["running"] = True
            return FakeResult("abc123def456\n")
        return FakeResult("")

    async def no_sleep(_delay):
        return None

    monkeypatch.setattr(ssh_mod, "run_command", fake_run)
    monkeypatch.setattr("api.routes.nodes.asyncio.sleep", no_sleep)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        await client.put(
            "/settings",
            json={"vllm": {"tensorParallelSize": 2, "gpuMemoryUtilization": 0.75, "maxModelLen": 32768}},
        )
        cluster = (await client.post("/clusters", json={"name": "gpu-box", "engine": "vllm"})).json()
        node = (await client.post(
            f"/clusters/{cluster['id']}/nodes",
            json={
                "name": "gpu-1",
                "host": "192.168.1.20",
                "sshUser": "fernando",
                "sshAuthType": "password",
                "sshPassword": "secret",
                "openaiBaseUrl": "http://192.168.1.20:8000/v1",
                "listenPort": 8000,
                "selectedModel": "Qwen--Qwen2.5-7B-Instruct",
            },
        )).json()
        assert node["serverParams"]["tensorParallelSize"] is None
        started = await client.post(f"/nodes/{node['id']}/engine/start", json={})
        assert started.status_code == 200
        argv = started.json()["lastStart"]["argv"]
        assert argv[argv.index("--tensor-parallel-size") + 1] == "2"
        assert argv[argv.index("--gpu-memory-utilization") + 1] == "0.75"
        assert argv[argv.index("--max-model-len") + 1] == "32768"

        other = (await client.post(
            f"/clusters/{cluster['id']}/nodes",
            json={
                "name": "gpu-2",
                "host": "192.168.1.21",
                "sshUser": "fernando",
                "sshAuthType": "password",
                "sshPassword": "secret",
                "openaiBaseUrl": "http://192.168.1.21:8000/v1",
                "listenPort": 8000,
                "selectedModel": "Qwen--Qwen2.5-7B-Instruct",
                "serverParams": {"tensorParallelSize": 1, "gpuMemoryUtilization": 0.5},
            },
        )).json()
        state["running"] = False
        started_other = await client.post(f"/nodes/{other['id']}/engine/start", json={})
        other_argv = started_other.json()["lastStart"]["argv"]
        assert other_argv[other_argv.index("--tensor-parallel-size") + 1] == "1"
        assert other_argv[other_argv.index("--gpu-memory-utilization") + 1] == "0.5"
        assert other_argv[other_argv.index("--max-model-len") + 1] == "32768"
