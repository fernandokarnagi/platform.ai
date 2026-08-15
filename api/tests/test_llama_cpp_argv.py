import pytest
from api.engines.llama_cpp import ForbiddenExtraFlagsError, LlamaCppEngine
from api.helpers import default_server_params


def _node(**overrides):
    params = default_server_params()
    params.update(overrides.pop("serverParams", {}))
    node = {
        "listenHost": "0.0.0.0",
        "listenPort": 8080,
        "modelDir": "~/models",
        "serverParams": params,
    }
    node.update(overrides)
    return node


def test_defaults_include_owned_flags_and_omit_optional():
    argv = LlamaCppEngine.build_argv(_node(), "phi.gguf", "/Users/x/models")
    assert argv[:6] == ["-m", "/Users/x/models/phi.gguf", "--host", "0.0.0.0", "--port", "8080"]
    assert "--ctx-size" in argv and argv[argv.index("--ctx-size") + 1] == "0"
    assert "--n-gpu-layers" in argv and argv[argv.index("--n-gpu-layers") + 1] == "auto"
    assert "--flash-attn" in argv and argv[argv.index("--flash-attn") + 1] == "auto"
    assert "--parallel" in argv and argv[argv.index("--parallel") + 1] == "1"
    assert "--kv-offload" in argv
    assert "--fit" in argv and argv[argv.index("--fit") + 1] == "on"
    assert "--threads" not in argv
    assert "--batch-size" not in argv
    assert "--jinja" not in argv
    assert "--metrics" not in argv


def test_optional_and_boolean_flags():
    argv = LlamaCppEngine.build_argv(
        _node(serverParams={"threads": 8, "jinja": True, "metrics": True, "kvOffload": False, "alias": "phi"}),
        "phi.gguf",
        "/m",
    )
    assert argv[argv.index("--threads") + 1] == "8"
    assert "--jinja" in argv
    assert "--metrics" in argv
    assert "--no-kv-offload" in argv
    assert "-a" in argv and argv[argv.index("-a") + 1] == "phi"


def test_extra_flags_appended_last():
    argv = LlamaCppEngine.build_argv(
        _node(serverParams={"extraFlags": "--verbose --offline"}),
        "phi.gguf",
        "/m",
    )
    assert argv[-2:] == ["--verbose", "--offline"]


def test_forbidden_extra_flags():
    for extra in ["--port 9", "--host 1.2.3.4", "-m x.gguf", "--model x.gguf"]:
        with pytest.raises(ForbiddenExtraFlagsError):
            LlamaCppEngine.build_argv(_node(serverParams={"extraFlags": extra}), "phi.gguf", "/m")


def test_preview_uses_placeholder_path():
    command = LlamaCppEngine.preview_command(_node(), "$MODEL")
    assert "-m $MODEL" in command or "-m ~/models/$MODEL" in command


@pytest.mark.asyncio
async def test_preview_endpoint(app):
    from httpx import ASGITransport, AsyncClient
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/engines/llama.cpp/preview",
            json={"serverParams": {"extraFlags": "--port 9"}},
        )
        assert response.status_code == 400
