from datetime import datetime
from bson import ObjectId
import pytest
from fastapi import HTTPException
from api.helpers import (
    DEFAULT_LIBRARY_DIR,
    apply_node_location,
    cluster_helper,
    is_local_host,
    is_local_node,
    node_helper,
    parse_object_id,
    resolve_hf_token,
    resolve_library_dir,
    safe_model_filename,
    settings_helper,
    default_server_params,
    merge_llama_cpp_params,
    merge_vllm_params,
    apply_llama_cpp_settings,
    apply_vllm_settings,
)


def test_is_local_host():
    assert is_local_host("localhost")
    assert is_local_host("127.0.0.1")
    assert is_local_host("::1")
    assert not is_local_host("192.168.1.10")
    assert not is_local_host("mac.local")


def test_is_local_node_uses_type_first():
    assert is_local_node({"nodeType": "local", "host": "192.168.1.10"})
    assert not is_local_node({"nodeType": "remote", "host": "localhost"})
    assert is_local_node({"host": "127.0.0.1"})


def test_apply_node_location_local_clears_ssh():
    doc = {
        "host": "192.168.1.10",
        "sshPort": 2222,
        "sshUser": "fernando",
        "sshAuthType": "password",
        "sshPassword": "secret",
        "sshPrivateKey": "key",
        "sshPassphrase": "ph",
    }
    apply_node_location(doc, "local", None)
    assert doc["nodeType"] == "local"
    assert doc["host"] == "localhost"
    assert doc["sshPort"] == 22
    assert doc["sshAuthType"] == "none"
    assert doc["sshUser"] == ""
    assert doc["sshPassword"] == ""
    assert doc["sshPrivateKey"] == ""
    assert doc["sshPassphrase"] == ""


def test_apply_node_location_remote_rejects_localhost_host():
    doc = {"sshUser": "fernando", "sshAuthType": "password"}
    with pytest.raises(HTTPException) as exc:
        apply_node_location(doc, "remote", "127.0.0.1")
    assert exc.value.status_code == 400
    assert "Host" in exc.value.detail


def test_parse_object_id_rejects_bad():
    with pytest.raises(HTTPException) as exc:
        parse_object_id("nope")
    assert exc.value.status_code == 400
    assert exc.value.detail == "Invalid id"


def test_cluster_helper_serialises_id_and_dates():
    oid = ObjectId()
    now = datetime(2026, 8, 15, 12, 0, 0)
    out = cluster_helper(
        {"_id": oid, "name": "desk-macs", "engine": "llama.cpp", "description": "", "createdAt": now, "updatedAt": now},
        node_count=2,
    )
    assert out["id"] == str(oid)
    assert out["nodeCount"] == 2
    assert out["runningCount"] == 0
    assert out["stoppedCount"] == 2
    assert out["createdAt"].startswith("2026-08-15")
    assert out["hfToken"] == ""


def test_cluster_helper_includes_hf_token():
    oid = ObjectId()
    out = cluster_helper({"_id": oid, "name": "desk-macs", "hfToken": "hf_cluster", "createdAt": None, "updatedAt": None})
    assert out["hfToken"] == "hf_cluster"


def test_resolve_hf_token_order():
    node = {"hfToken": "hf_node"}
    cluster = {"hfToken": "hf_cluster"}
    settings = {"hfToken": "hf_settings"}
    assert resolve_hf_token(node, cluster, "hf_payload", settings) == "hf_payload"
    assert resolve_hf_token(node, cluster, "", settings) == "hf_node"
    assert resolve_hf_token({"hfToken": ""}, cluster, None, settings) == "hf_cluster"
    assert resolve_hf_token({}, {}, None, settings) == "hf_settings"
    assert resolve_hf_token({}, {}, None, {}) == ""


def test_settings_helper_defaults():
    out = settings_helper(None)
    assert out["hfToken"] == ""
    assert out["libraryDir"] == DEFAULT_LIBRARY_DIR
    assert out["updatedAt"] == ""
    assert out["llamaCpp"]["ctxSize"] is None
    assert out["llamaCpp"]["extraFlags"] == ""
    assert out["vllm"]["tensorParallelSize"] is None
    assert out["vllm"]["extraFlags"] == ""
    stamped = settings_helper({"hfToken": "hf_settings", "updatedAt": datetime(2026, 8, 22, 12, 0, 0)})
    assert stamped["hfToken"] == "hf_settings"
    assert stamped["libraryDir"] == DEFAULT_LIBRARY_DIR
    assert stamped["updatedAt"].startswith("2026-08-22")


def test_resolve_library_dir_expands_and_defaults():
    assert resolve_library_dir(None) == DEFAULT_LIBRARY_DIR
    assert resolve_library_dir({}) == DEFAULT_LIBRARY_DIR
    assert resolve_library_dir({"libraryDir": "  "}) == DEFAULT_LIBRARY_DIR
    assert resolve_library_dir({"libraryDir": "/tmp/models-lib"}) == "/tmp/models-lib"


def test_merge_llama_cpp_params_order():
    merged = merge_llama_cpp_params(
        {"ctxSize": None, "gpuLayers": "all", "extraFlags": ""},
        {"ctxSize": 8192, "gpuLayers": "auto", "threads": 8, "extraFlags": "--verbose"},
    )
    assert merged["ctxSize"] == 8192
    assert merged["gpuLayers"] == "all"
    assert merged["threads"] == 8
    assert merged["extraFlags"] == "--verbose"
    assert merged["parallel"] == 1
    node_wins = merge_llama_cpp_params({"ctxSize": 0, "threads": 4}, {"ctxSize": 8192, "threads": 8})
    assert node_wins["ctxSize"] == 0
    assert node_wins["threads"] == 4


def test_apply_llama_cpp_settings_skips_vllm():
    node = {"engine": "vllm", "serverParams": {"ctxSize": None}}
    out = apply_llama_cpp_settings(node, {"llamaCpp": {"ctxSize": 8192}})
    assert out is node
    llama = apply_llama_cpp_settings(
        {"engine": "llama.cpp", "serverParams": {}},
        {"llamaCpp": {"ctxSize": 4096}},
    )
    assert llama["serverParams"]["ctxSize"] == 4096


def test_merge_vllm_params_order():
    merged = merge_vllm_params(
        {"tensorParallelSize": None, "gpuMemoryUtilization": 0.7, "extraFlags": ""},
        {"tensorParallelSize": 2, "gpuMemoryUtilization": 0.9, "maxModelLen": 32768, "extraFlags": "--dtype auto"},
    )
    assert merged["tensorParallelSize"] == 2
    assert merged["gpuMemoryUtilization"] == 0.7
    assert merged["maxModelLen"] == 32768
    assert merged["extraFlags"] == "--dtype auto"
    node_wins = merge_vllm_params({"tensorParallelSize": 1}, {"tensorParallelSize": 4, "maxModelLen": 8192})
    assert node_wins["tensorParallelSize"] == 1
    assert node_wins["maxModelLen"] == 8192


def test_apply_vllm_settings_skips_llama():
    node = {"engine": "llama.cpp", "serverParams": {"tensorParallelSize": None}}
    assert apply_vllm_settings(node, {"vllm": {"tensorParallelSize": 2}}) is node
    vllm = apply_vllm_settings(
        {"engine": "vllm-metal", "serverParams": {}},
        {"vllm": {"gpuMemoryUtilization": 0.6, "maxModelLen": 16384}},
    )
    assert vllm["serverParams"]["gpuMemoryUtilization"] == 0.6
    assert vllm["serverParams"]["maxModelLen"] == 16384
    assert vllm["serverParams"]["tensorParallelSize"] == 1


def test_node_helper_includes_ssh_secrets():
    oid = ObjectId()
    cluster_id = ObjectId()
    out = node_helper({
        "_id": oid,
        "clusterId": cluster_id,
        "name": "mac-1",
        "host": "192.168.1.10",
        "sshPort": 22,
        "sshUser": "fernando",
        "sshAuthType": "password",
        "sshPassword": "secret",
        "sshPrivateKey": "",
        "sshPassphrase": "",
        "openaiBaseUrl": "http://192.168.1.10:8080/v1",
        "openaiApiKey": "",
        "hfToken": "",
        "listenHost": "0.0.0.0",
        "listenPort": 8080,
        "modelDir": "~/models",
        "serverParams": default_server_params(),
        "lastStart": None,
        "lastOpenAICheck": None,
        "createdAt": datetime(2026, 8, 15),
        "updatedAt": datetime(2026, 8, 15),
    })
    assert out["sshPassword"] == "secret"
    assert out["clusterId"] == str(cluster_id)
    assert out["lastOpenAICheck"] is None
    assert out["statusCache"] is None
    assert out["modelsCache"] is None


def test_node_helper_serialises_last_openai_check():
    oid = ObjectId()
    out = node_helper({
        "_id": oid,
        "clusterId": ObjectId(),
        "name": "n",
        "host": "localhost",
        "lastOpenAICheck": {
            "openai": "up",
            "checkedAt": datetime(2026, 8, 16, 14, 5),
            "models": ["phi"],
            "detail": None,
        },
        "createdAt": datetime(2026, 8, 16),
        "updatedAt": datetime(2026, 8, 16),
    })
    assert out["lastOpenAICheck"]["openai"] == "up"
    assert out["lastOpenAICheck"]["checkedAt"].startswith("2026-08-16")


def test_node_helper_serialises_status_cache():
    oid = ObjectId()
    out = node_helper({
        "_id": oid,
        "clusterId": ObjectId(),
        "name": "n",
        "host": "localhost",
        "statusCache": {
            "ssh": "up",
            "openai": "up",
            "running": True,
            "pid": "99",
            "models": ["phi"],
            "detail": None,
            "checkedAt": datetime(2026, 8, 16, 18, 0),
        },
        "createdAt": datetime(2026, 8, 16),
        "updatedAt": datetime(2026, 8, 16),
    })
    assert out["statusCache"]["running"] is True
    assert out["statusCache"]["pid"] == "99"
    assert out["statusCache"]["checkedAt"].startswith("2026-08-16")


def test_safe_model_filename_rejects_escape():
    with pytest.raises(ValueError):
        safe_model_filename("../etc/passwd")
    with pytest.raises(ValueError):
        safe_model_filename("/tmp/x.gguf")
    assert safe_model_filename("model.gguf") == "model.gguf"
