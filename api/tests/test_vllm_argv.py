import pytest
from api.engines.vllm import VllmEngine
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


def test_defaults_include_owned_flags():
    argv = VllmEngine.build_argv(_node(), "/models")
    assert argv[:6] == [
        "serve",
        "/models/Qwen--Qwen2.5-7B-Instruct",
        "--host",
        "0.0.0.0",
        "--port",
        "8000",
    ]
    assert argv[argv.index("--tensor-parallel-size") + 1] == "1"
    assert argv[argv.index("--gpu-memory-utilization") + 1] == "0.9"
    assert "--max-model-len" not in argv
    assert "--trust-remote-code" not in argv


def test_hub_model_is_not_joined_to_dir():
    argv = VllmEngine.build_argv(_node(selectedModel="Qwen/Qwen2.5-7B-Instruct"), "/models")
    assert argv[1] == "Qwen/Qwen2.5-7B-Instruct"


def test_optional_flags():
    argv = VllmEngine.build_argv(
        _node(
            serverParams={
                "tensorParallelSize": 2,
                "maxModelLen": 8192,
                "dtype": "bfloat16",
                "trustRemoteCode": True,
                "enforceEager": True,
                "enablePrefixCaching": True,
                "alias": "qwen",
            }
        ),
        "/m",
    )
    assert argv[argv.index("--tensor-parallel-size") + 1] == "2"
    assert argv[argv.index("--max-model-len") + 1] == "8192"
    assert argv[argv.index("--dtype") + 1] == "bfloat16"
    assert "--trust-remote-code" in argv
    assert "--enforce-eager" in argv
    assert "--enable-prefix-caching" in argv
    assert argv[argv.index("--served-model-name") + 1] == "qwen"


def test_extra_flags_appended_last():
    argv = VllmEngine.build_argv(_node(serverParams={"extraFlags": "--disable-log-requests"}), "/m")
    assert argv[-1] == "--disable-log-requests"


def test_forbidden_extra_flags():
    for extra in ["--port 9", "--host 1.2.3.4", "--model x", "-m x"]:
        with pytest.raises(ForbiddenExtraFlagsError):
            VllmEngine.build_argv(_node(serverParams={"extraFlags": extra}), "/m")


def test_preview_uses_docker_run_vllm_serve():
    command = VllmEngine.preview_command(_node())
    assert "docker run" in command
    assert "vllm serve" in command
    assert "--device /dev/kfd" in command
    assert "--host 0.0.0.0" in command
    assert "--port 8000" in command
    assert "-d --name" not in command


def test_start_is_docker_rm_then_run():
    cmd = VllmEngine.start_command("docker", ["serve", "/m/qwen", "--host", "0.0.0.0", "--port", "8001"], _node())
    assert cmd.startswith("docker rm -f platformai-vllm")
    assert "docker run -d --name platformai-vllm" in cmd
    assert "vllm serve" in cmd


def test_stop_is_docker_stop_and_rm():
    cmd = VllmEngine.stop_command()
    assert "docker stop platformai-vllm" in cmd
    assert "docker rm -f platformai-vllm" in cmd


def test_snapshot_dirname():
    assert VllmEngine.snapshot_dirname("Qwen/Qwen2.5-7B-Instruct") == "Qwen--Qwen2.5-7B-Instruct"


def test_snapshot_download_prefers_hf_cli():
    cmd = VllmEngine.start_download_command(
        "/mnt/data/vllmmodels",
        "LiquidAI--LFM2.5-2.6B",
        "LiquidAI/LFM2.5-2.6B",
        "job1",
    )
    assert "hf download" in cmd
    assert "huggingface-cli" not in cmd
    assert "huggingface_hub" in cmd
    assert "setsid" in cmd


@pytest.mark.asyncio
async def test_preview_endpoint(app):
    from httpx import ASGITransport, AsyncClient

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        bad = await client.post(
            "/engines/vllm/preview",
            json={"serverParams": {"extraFlags": "--port 9"}, "modelFilename": "m"},
        )
        assert bad.status_code == 400
        ok = await client.post(
            "/engines/vllm/preview",
            json={"listenPort": 8000, "modelFilename": "org/model", "serverParams": {"tensorParallelSize": 2}},
        )
        assert ok.status_code == 200
        body = ok.json()
        assert body["argv"][0] == "serve"
        assert body["argv"][1] == "org/model"
        assert "--tensor-parallel-size" in body["argv"]
        assert "docker run" in body["command"]
        assert "vllm serve" in body["command"]
