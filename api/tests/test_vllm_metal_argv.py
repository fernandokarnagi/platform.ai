import pytest
from api.engines.vllm_metal import VllmMetalEngine
from api.engines.llama_cpp import ForbiddenExtraFlagsError
from api.helpers import default_server_params


def _node(**overrides):
    params = default_server_params()
    params.update(overrides.pop("serverParams", {}))
    node = {
        "listenHost": "0.0.0.0",
        "listenPort": 8000,
        "modelDir": "~/models",
        "selectedModel": "Qwen--Qwen2.5-7B-Instruct",
        "serverParams": params,
    }
    node.update(overrides)
    return node


def test_argv_matches_vllm_serve():
    argv = VllmMetalEngine.build_argv(_node(), "/Users/x/models")
    assert argv[:6] == [
        "serve",
        "/Users/x/models/Qwen--Qwen2.5-7B-Instruct",
        "--host",
        "0.0.0.0",
        "--port",
        "8000",
    ]
    assert argv[argv.index("--tensor-parallel-size") + 1] == "1"


def test_preview_is_native_vllm_not_docker():
    command = VllmMetalEngine.preview_command(_node())
    assert command.startswith("vllm serve")
    assert "docker" not in command
    assert "--host 0.0.0.0" in command
    assert "--port 8000" in command


def test_preview_uses_configured_path():
    command = VllmMetalEngine.preview_command(_node(llamaServerPath="~/.venv-vllm-metal/bin/vllm"))
    assert command.startswith("~/.venv-vllm-metal/bin/vllm serve")
    assert "docker" not in command


def test_start_is_nohup_pid_file():
    cmd = VllmMetalEngine.start_command(
        "/Users/x/.venv-vllm-metal/bin/vllm",
        ["serve", "/m/qwen", "--host", "0.0.0.0", "--port", "8000"],
    )
    assert "nohup" in cmd
    assert "docker" not in cmd
    assert "~/.platformai/vllm.pid" in cmd
    assert "~/.platformai/vllm.log" in cmd


def test_stop_kills_pid_file():
    cmd = VllmMetalEngine.stop_command()
    assert "vllm.pid" in cmd
    assert "docker" not in cmd


def test_resolve_prefers_venv():
    cmd = VllmMetalEngine.resolve_binary_command()
    assert ".venv-vllm-metal/bin/vllm" in cmd
    assert "command -v vllm" in cmd


def test_forbidden_extra_flags():
    with pytest.raises(ForbiddenExtraFlagsError):
        VllmMetalEngine.build_argv(_node(serverParams={"extraFlags": "--port 9"}), "/m")


@pytest.mark.asyncio
async def test_preview_endpoint(app):
    from httpx import ASGITransport, AsyncClient

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        ok = await client.post(
            "/engines/vllm-metal/preview",
            json={"listenPort": 8000, "modelFilename": "org/model", "serverParams": {"tensorParallelSize": 1}},
        )
        assert ok.status_code == 200
        body = ok.json()
        assert body["argv"][0] == "serve"
        assert body["argv"][1] == "org/model"
        assert body["command"].startswith("vllm serve")
        assert "docker" not in body["command"]
