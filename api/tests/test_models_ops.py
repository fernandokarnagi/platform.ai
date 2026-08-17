import pytest
from httpx import ASGITransport, AsyncClient
from api.engines.llama_cpp import LlamaCppEngine
from api.services import ssh as ssh_mod


def test_hf_url():
    assert LlamaCppEngine.hf_url("org/model", "q.gguf") == "https://huggingface.co/org/model/resolve/main/q.gguf"
    assert LlamaCppEngine.hf_url("org/model", "q.gguf", "F16") == "https://huggingface.co/org/model/resolve/F16/q.gguf"


def test_parse_hf_ref_strips_ollama_quant():
    parsed = LlamaCppEngine.parse_hf_ref(
        "GnLOLot/MiniCPM5-1B-Claude-Opus-Fable5-V2-Thinking-GGUF:F16",
        "MiniCPM5-1B-Claude-Opus-Fable5-V2-Thinking-GGUF-F16.gguf",
    )
    assert parsed["repo"] == "GnLOLot/MiniCPM5-1B-Claude-Opus-Fable5-V2-Thinking-GGUF"
    assert parsed["quant"] == "F16"
    assert parsed["revision"] == "main"


def test_pick_hf_filename_fixes_gguf_in_name():
    files = [
        "MiniCPM5-1B-Claude-Opus-Fable5-V2-Thinking-F16.gguf",
        "MiniCPM5-1B-Claude-Opus-Fable5-V2-Thinking-Q8_0.gguf",
    ]
    picked = LlamaCppEngine.pick_hf_filename(
        files,
        "MiniCPM5-1B-Claude-Opus-Fable5-V2-Thinking-GGUF-F16.gguf",
        "F16",
    )
    assert picked == "MiniCPM5-1B-Claude-Opus-Fable5-V2-Thinking-F16.gguf"


class FakeResult:
    def __init__(self, stdout="", exit_status=0, stderr=""):
        self.stdout = stdout
        self.stderr = stderr
        self.exit_status = exit_status


async def _seed(client):
    cluster = (await client.post("/clusters", json={"name": "desk-macs"})).json()
    return (await client.post(
        f"/clusters/{cluster['id']}/nodes",
        json={
            "name": "mac-1",
            "host": "192.168.1.10",
            "sshUser": "fernando",
            "sshAuthType": "password",
            "sshPassword": "secret",
            "openaiBaseUrl": "http://192.168.1.10:8080/v1",
            "hfToken": "hf_node",
        },
    )).json()


@pytest.mark.asyncio
async def test_list_and_delete_models(app, monkeypatch):
    async def fake_run(node, command, timeout=30.0):
        if "stat" in command or "gguf" in command:
            return FakeResult("phi.gguf\t1234\t2026-08-15T00:00:00\n")
        return FakeResult("OK\n")

    monkeypatch.setattr(ssh_mod, "run_command", fake_run)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        node = await _seed(client)
        listed = await client.get(f"/nodes/{node['id']}/models")
        assert listed.status_code == 200
        assert listed.json()[0]["name"] == "phi.gguf"
        deleted = await client.request("DELETE", f"/nodes/{node['id']}/models", json={"filename": "phi.gguf"})
        assert deleted.status_code == 204
        bad = await client.request("DELETE", f"/nodes/{node['id']}/models", json={"filename": "../x"})
        assert bad.status_code == 400
        assert bad.json()["detail"] == "Invalid filename"


@pytest.mark.asyncio
async def test_list_models_uses_cache(app, monkeypatch):
    calls = {"list": 0}

    async def fake_run(node, command, timeout=30.0):
        if "stat" in command or "gguf" in command:
            calls["list"] += 1
            return FakeResult("phi.gguf\t1234\t2026-08-15T00:00:00\n")
        return FakeResult("/tmp/models\n")

    monkeypatch.setattr(ssh_mod, "run_command", fake_run)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        node = await _seed(client)
        first = await client.get(f"/nodes/{node['id']}/models")
        second = await client.get(f"/nodes/{node['id']}/models")
        assert first.json()[0]["name"] == "phi.gguf"
        assert second.json()[0]["name"] == "phi.gguf"
        assert calls["list"] == 1
        forced = await client.get(f"/nodes/{node['id']}/models?refresh=true")
        assert forced.status_code == 200
        assert calls["list"] == 2
        fetched = await client.get(f"/nodes/{node['id']}")
        assert fetched.json()["modelsCache"]["fresh"] is True
        assert fetched.json()["modelsCache"]["items"][0]["name"] == "phi.gguf"


def _download_fake_run(seen):
    async def fake_run(node, command, timeout=30.0):
        seen["cmd"] = command
        if "nohup" in command:
            seen["start"] = command
        if "mkdir -p" in command and "echo" in command and "nohup" not in command:
            return FakeResult("/Users/x/models\n")
        if "nohup" in command:
            return FakeResult("4242\n")
        if "alive=" in command or "printf" in command:
            if "missing.gguf" in command:
                return FakeResult("0\t22\t0\t0\tcurl: (22) The requested URL returned error: 404\n")
            return FakeResult("0\t0\t1234\t1\t\n")
        return FakeResult("OK\n")

    return fake_run


@pytest.mark.asyncio
async def test_download_url_and_hf(app, monkeypatch):
    from api.routes import nodes as nodes_mod

    seen = {}

    async def fake_list(repo, revision, token):
        return []

    monkeypatch.setattr(ssh_mod, "run_command", _download_fake_run(seen))
    monkeypatch.setattr(nodes_mod, "_list_hf_files", fake_list)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        node = await _seed(client)
        ok = await client.post(
            f"/nodes/{node['id']}/models/download",
            json={"source": "url", "url": "https://example.com/a.gguf", "filename": "a.gguf"},
        )
        assert ok.status_code == 202
        assert ok.json()["status"] == "running"
        assert ok.json()["filename"] == "a.gguf"
        from api.database import get_database
        from api.services.downloads import sync_job
        from bson import ObjectId

        db = get_database()
        ok_doc = await db.downloads.find_one({"_id": ObjectId(ok.json()["id"])})
        await sync_job(db, ok_doc)
        polled = await client.get(f"/downloads/{ok.json()['id']}")
        assert polled.status_code == 200
        assert polled.json()["status"] == "done"
        fail = await client.post(
            f"/nodes/{node['id']}/models/download",
            json={"source": "huggingface", "repo": "org/model", "filename": "missing.gguf"},
        )
        assert fail.status_code == 202
        fail_doc = await db.downloads.find_one({"_id": ObjectId(fail.json()["id"])})
        await sync_job(db, fail_doc)
        failed = await client.get(f"/downloads/{fail.json()['id']}")
        assert failed.json()["status"] == "failed"
        assert "Authorization: Bearer hf_node" in seen.get("start", "")


@pytest.mark.asyncio
async def test_download_hf_resolves_ollama_quant(app, monkeypatch):
    from api.routes import nodes as nodes_mod

    seen = {}

    async def fake_run(node, command, timeout=30.0):
        seen["cmd"] = command
        return FakeResult("OK\n")

    async def fake_list(repo, revision, token):
        assert repo == "GnLOLot/MiniCPM5-1B-Claude-Opus-Fable5-V2-Thinking-GGUF"
        return [
            "MiniCPM5-1B-Claude-Opus-Fable5-V2-Thinking-F16.gguf",
            "MiniCPM5-1B-Claude-Opus-Fable5-V2-Thinking-Q8_0.gguf",
        ]

    monkeypatch.setattr(ssh_mod, "run_command", fake_run)
    monkeypatch.setattr(nodes_mod, "_list_hf_files", fake_list)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        node = await _seed(client)
        ok = await client.post(
            f"/nodes/{node['id']}/models/download",
            json={
                "source": "huggingface",
                "repo": "GnLOLot/MiniCPM5-1B-Claude-Opus-Fable5-V2-Thinking-GGUF:F16",
                "filename": "MiniCPM5-1B-Claude-Opus-Fable5-V2-Thinking-GGUF-F16.gguf",
            },
        )
        assert ok.status_code == 202
        assert ok.json()["filename"] == "MiniCPM5-1B-Claude-Opus-Fable5-V2-Thinking-F16.gguf"
        assert "MiniCPM5-1B-Claude-Opus-Fable5-V2-Thinking-F16.gguf" in seen["cmd"]
        assert "GGUF:F16" not in seen["cmd"]


@pytest.mark.asyncio
async def test_download_cancel(app, monkeypatch):
    seen = {}
    monkeypatch.setattr(ssh_mod, "run_command", _download_fake_run(seen))
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        node = await _seed(client)
        started = await client.post(
            f"/nodes/{node['id']}/models/download",
            json={"source": "url", "url": "https://example.com/b.gguf", "filename": "b.gguf"},
        )
        assert started.status_code == 202
        # Pretend it is still running when we cancel
        async def still_running(node, command, timeout=30.0):
            seen["cmd"] = command
            if "CANCELLED" in command or "kill" in command:
                return FakeResult("CANCELLED\n")
            if "alive=" in command or "printf" in command:
                return FakeResult("1\t\t100\t0\t\n")
            if "nohup" in command:
                return FakeResult("4242\n")
            if "mkdir -p" in command and "echo" in command:
                return FakeResult("/Users/x/models\n")
            return FakeResult("OK\n")

        monkeypatch.setattr(ssh_mod, "run_command", still_running)
        cancelled = await client.post(f"/downloads/{started.json()['id']}/cancel")
        assert cancelled.status_code == 200
        assert cancelled.json()["status"] == "cancelled"


@pytest.mark.asyncio
async def test_download_retry_failed(app, monkeypatch):
    seen = {}
    monkeypatch.setattr(ssh_mod, "run_command", _download_fake_run(seen))
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        node = await _seed(client)
        started = await client.post(
            f"/nodes/{node['id']}/models/download",
            json={"source": "url", "url": "https://example.com/c.gguf", "filename": "c.gguf"},
        )
        assert started.status_code == 202
        from api.database import get_database
        from bson import ObjectId
        from datetime import datetime

        db = get_database()
        await db.downloads.update_one(
            {"_id": ObjectId(started.json()["id"])},
            {"$set": {"status": "failed", "detail": "curl: (23) Failure writing output to destination", "finishedAt": datetime.utcnow()}},
        )
        retried = await client.post(f"/downloads/{started.json()['id']}/retry")
        assert retried.status_code == 200
        assert retried.json()["status"] == "running"
        assert retried.json()["detail"] == ""
        assert retried.json()["finishedAt"] == ""
        assert "nohup" in seen.get("start", "")
        assert "rm -f" in seen.get("start", "")
        running = await client.post(f"/downloads/{started.json()['id']}/retry")
        assert running.status_code == 409
        assert running.json()["detail"] == "Download cannot be retried"


@pytest.mark.asyncio
async def test_download_retry_cancelled(app, monkeypatch):
    seen = {}
    monkeypatch.setattr(ssh_mod, "run_command", _download_fake_run(seen))
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        node = await _seed(client)
        from api.database import get_database
        from bson import ObjectId
        from datetime import datetime

        now = datetime.utcnow()
        db = get_database()
        inserted = await db.downloads.insert_one(
            {
                "nodeId": ObjectId(node["id"]),
                "clusterId": ObjectId(node["clusterId"]),
                "nodeName": node["name"],
                "source": "huggingface",
                "repo": "org/model",
                "filename": "a.gguf",
                "url": "https://huggingface.co/org/model/resolve/main/a.gguf",
                "modelDir": "/tmp/models",
                "status": "cancelled",
                "bytes": 0,
                "totalBytes": 100,
                "detail": "Cancelled",
                "createdAt": now,
                "updatedAt": now,
                "finishedAt": now,
            }
        )
        retried = await client.post(f"/downloads/{inserted.inserted_id}/retry")
        assert retried.status_code == 200
        assert retried.json()["status"] == "running"
        assert "Authorization: Bearer hf_node" in seen.get("start", "")


@pytest.mark.asyncio
async def test_download_retry_missing(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        missing = await client.post("/downloads/64b64b64b64b64b64b64b64b/retry")
        assert missing.status_code == 404


@pytest.mark.asyncio
async def test_delete_download_removes_row(app, monkeypatch):
    seen = {}
    monkeypatch.setattr(ssh_mod, "run_command", _download_fake_run(seen))
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        node = await _seed(client)
        started = await client.post(
            f"/nodes/{node['id']}/models/download",
            json={"source": "url", "url": "https://example.com/del.gguf", "filename": "del.gguf"},
        )
        job_id = started.json()["id"]
        deleted = await client.delete(f"/downloads/{job_id}")
        assert deleted.status_code == 204
        assert (await client.get(f"/downloads/{job_id}")).status_code == 404
        listed = await client.get("/downloads")
        assert all(item["id"] != job_id for item in listed.json())


@pytest.mark.asyncio
async def test_delete_download_missing(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        missing = await client.delete("/downloads/64b64b64b64b64b64b64b64b")
        assert missing.status_code == 404


def test_start_download_command_clears_stale_job_files():
    cmd = LlamaCppEngine.start_download_command("/tmp/models", "a.gguf", "https://example.com/a.gguf", "job1")
    assert "rm -f" in cmd
    assert "/tmp/models/a.gguf.part" in cmd
    assert "~/.platformai/downloads/job1/exit" in cmd


@pytest.mark.asyncio
async def test_list_downloads_reads_db_only(app, monkeypatch):
    async def boom(*args, **kwargs):
        raise AssertionError("GET /downloads must not SSH")

    monkeypatch.setattr(ssh_mod, "run_command", boom)
    from api.database import get_database
    from bson import ObjectId
    from datetime import datetime

    db = get_database()
    now = datetime.utcnow()
    await db.downloads.insert_one(
        {
            "nodeId": ObjectId(),
            "clusterId": ObjectId(),
            "nodeName": "this-mac",
            "source": "url",
            "repo": "",
            "filename": "a.gguf",
            "url": "https://example.com/a.gguf",
            "modelDir": "/tmp",
            "status": "running",
            "bytes": 100,
            "totalBytes": 400,
            "detail": "",
            "createdAt": now,
            "updatedAt": now,
            "finishedAt": None,
        }
    )
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        listed = await client.get("/downloads")
        assert listed.status_code == 200
        assert listed.json()[0]["status"] == "running"
        assert listed.json()[0]["bytes"] == 100
        assert listed.json()[0]["filename"] == "a.gguf"


@pytest.mark.asyncio
async def test_list_hf_repo_files(app, monkeypatch):
    from api.routes import nodes as nodes_mod

    async def fake_details(repo, revision, token, suffixes=(".gguf",)):
        assert repo == "org/model"
        return [{"name": "a-F16.gguf", "sizeBytes": 10}, {"name": "a-Q8_0.gguf", "sizeBytes": 5}]

    monkeypatch.setattr(nodes_mod, "_list_hf_file_details", fake_details)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        node = await _seed(client)
        listed = await client.get(f"/nodes/{node['id']}/models/huggingface?repo=org/model:F16")
        assert listed.status_code == 200
        body = listed.json()
        assert body["repo"] == "org/model"
        assert body["quant"] == "F16"
        assert [item["name"] for item in body["files"]] == ["a-F16.gguf", "a-Q8_0.gguf"]


@pytest.mark.asyncio
async def test_list_failed_command_is_502(app, monkeypatch):
    async def fake_run(node, command, timeout=30.0):
        if "stat" in command or "find" in command:
            return FakeResult("", exit_status=1, stderr="find: error")
        return FakeResult("/Users/x/models\n")

    monkeypatch.setattr(ssh_mod, "run_command", fake_run)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        node = await _seed(client)
        listed = await client.get(f"/nodes/{node['id']}/models")
        assert listed.status_code == 502
        assert listed.json()["detail"].startswith("SSH failed:")


@pytest.mark.asyncio
async def test_list_skips_malformed_stat_lines(app, monkeypatch):
    async def fake_run(node, command, timeout=30.0):
        if "stat" in command or "gguf" in command:
            return FakeResult(
                "not-a-stat-line\n"
                "phi.gguf\tnot-a-number\t2026-08-15T00:00:00\n"
                "phi.gguf\t1234\t2026-08-15T00:00:00\n"
            )
        return FakeResult("OK\n")

    monkeypatch.setattr(ssh_mod, "run_command", fake_run)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        node = await _seed(client)
        listed = await client.get(f"/nodes/{node['id']}/models")
        assert listed.status_code == 200
        assert listed.json() == [
            {"name": "phi.gguf", "sizeBytes": 1234, "mtime": "2026-08-15T00:00:00"}
        ]
