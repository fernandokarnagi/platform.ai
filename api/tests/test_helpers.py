from datetime import datetime
from bson import ObjectId
import pytest
from fastapi import HTTPException
from api.helpers import (
    cluster_helper,
    node_helper,
    parse_object_id,
    safe_model_filename,
    default_server_params,
)


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
        "createdAt": datetime(2026, 8, 15),
        "updatedAt": datetime(2026, 8, 15),
    })
    assert out["sshPassword"] == "secret"
    assert out["clusterId"] == str(cluster_id)


def test_safe_model_filename_rejects_escape():
    with pytest.raises(ValueError):
        safe_model_filename("../etc/passwd")
    with pytest.raises(ValueError):
        safe_model_filename("/tmp/x.gguf")
    assert safe_model_filename("model.gguf") == "model.gguf"
