import pytest

from api.helpers import DEFAULT_LIBRARY_DIR, resolve_library_dir
from api.services import library as library_mod
from api.services import ssh as ssh_mod


def test_list_library_scans_gguf_and_snapshots(tmp_path, monkeypatch):
    root = tmp_path / "globalmodel"
    llama = root / "llama.cpp"
    vllm = root / "vllm" / "Qwen--Qwen2.5"
    llama.mkdir(parents=True)
    vllm.mkdir(parents=True)
    (llama / "model.gguf").write_bytes(b"gguf")
    (llama / "notes.txt").write_text("skip")
    (vllm / "config.json").write_text("{}")
    (vllm / "weights.bin").write_bytes(b"1234")
    monkeypatch.setattr(library_mod, "resolve_library_dir", lambda _settings=None: str(root))

    items = library_mod.list_library({})
    assert [item["name"] for item in items] == ["model.gguf", "Qwen--Qwen2.5"]
    assert items[0]["kind"] == "llama.cpp"
    assert items[0]["sizeBytes"] == 4
    assert items[1]["kind"] == "vllm"
    assert items[1]["sizeBytes"] >= 2
    only_llama = library_mod.list_library({}, kind="llama.cpp")
    assert [item["name"] for item in only_llama] == ["model.gguf"]


def test_normalize_kind():
    assert library_mod.normalize_kind("vllm-metal") == "vllm"
    assert library_mod.normalize_kind("vllm") == "vllm"
    assert library_mod.normalize_kind("llama.cpp") == "llama.cpp"
    with pytest.raises(ValueError):
        library_mod.normalize_kind("ollama")


@pytest.mark.asyncio
async def test_copy_to_local_node(tmp_path):
    src = tmp_path / "lib" / "model.gguf"
    src.parent.mkdir()
    src.write_bytes(b"abc")
    dest = tmp_path / "node" / "model.gguf"
    await library_mod.copy_to_node({"host": "localhost", "nodeType": "local"}, str(src), str(dest))
    assert dest.read_bytes() == b"abc"


@pytest.mark.asyncio
async def test_copy_snapshot_replaces_existing(tmp_path):
    src = tmp_path / "lib" / "Qwen--Qwen"
    src.mkdir(parents=True)
    (src / "config.json").write_text('{"a":1}')
    dest = tmp_path / "node" / "Qwen--Qwen"
    dest.mkdir(parents=True)
    (dest / "old.bin").write_text("stale")
    await library_mod.copy_to_node({"host": "127.0.0.1"}, str(src), str(dest))
    assert (dest / "config.json").read_text() == '{"a":1}'
    assert not (dest / "old.bin").exists()


def test_default_library_dir():
    assert resolve_library_dir(None) == DEFAULT_LIBRARY_DIR
    assert DEFAULT_LIBRARY_DIR == "/Users/fernando.karnagi/App/globalmodel"


@pytest.mark.asyncio
async def test_copy_to_remote_uses_push_path(tmp_path, monkeypatch):
    seen = {}

    async def fake_push(node, local_path, remote_path):
        seen["node"] = node["host"]
        seen["local"] = local_path
        seen["remote"] = remote_path

    monkeypatch.setattr(ssh_mod, "push_path", fake_push)
    src = tmp_path / "a.gguf"
    src.write_text("x")
    await library_mod.copy_to_node({"host": "192.168.1.10", "nodeType": "remote"}, str(src), "/models/a.gguf")
    assert seen["node"] == "192.168.1.10"
    assert seen["remote"] == "/models/a.gguf"
