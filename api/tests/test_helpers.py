from datetime import datetime
from bson import ObjectId
import pytest
from fastapi import HTTPException
from api.helpers import (
    apply_node_location,
    cluster_helper,
    is_local_host,
    is_local_node,
    node_helper,
    parse_object_id,
    safe_model_filename,
    default_server_params,
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


def test_safe_model_filename_rejects_escape():
    with pytest.raises(ValueError):
        safe_model_filename("../etc/passwd")
    with pytest.raises(ValueError):
        safe_model_filename("/tmp/x.gguf")
    assert safe_model_filename("model.gguf") == "model.gguf"
