import pytest
from api.services.downloads import parse_progress, sync_job
from api.engines.vllm import VllmEngine
from api.services import ssh as ssh_mod


def test_parse_progress_ignores_tqdm_carriage_returns():
    stdout = (
        "1\t\t7704862720\t0\tFetching 32 files:   0%|          | 0/32 [00:00<?, ?it/s]\r"
        "Fetching 32 files:   3%|▎         | 1/32 [00:00<00:09,  3.36it/s]\r"
        "Fetching 32 files:  25%|██▌       | 8/32 [00:01<00:07,  3.41it/s] "
    )
    alive, exit_code, size, done, err = parse_progress(stdout)
    assert alive == "1"
    assert exit_code == ""
    assert size == 7704862720
    assert done == "0"


def test_parse_progress_reads_plain_failure():
    alive, exit_code, size, done, err = parse_progress("0\t22\t0\t0\tcurl exit 22\n")
    assert alive == "0"
    assert exit_code == "22"
    assert size == 0
    assert done == "0"
    assert "curl" in err


def test_vllm_start_download_keeps_partial_and_records_child_pid():
    cmd = VllmEngine.start_download_command(
        "/mnt/data/vllmmodels",
        "Qwen--Qwen3.8-27B",
        "Qwen/Qwen3.8-27B",
        "job1",
    )
    assert "rm -rf /mnt/data/vllmmodels/Qwen--Qwen3.8-27B.partial" not in cmd
    assert "setsid -f" in cmd
    assert "echo $$" in cmd
    assert "tr '\\r' '\\n'" in VllmEngine.download_progress_command(
        "/mnt/data/vllmmodels", "Qwen--Qwen3.8-27B", "job1"
    )


def test_vllm_cancel_can_keep_partial():
    wipe = VllmEngine.cancel_download_command("/m", "Qwen--Qwen3.8-27B", "job1")
    keep = VllmEngine.cancel_download_command("/m", "Qwen--Qwen3.8-27B", "job1", wipe=False)
    assert "rm -rf" in wipe
    assert "rm -rf" not in keep
    assert "pkill" in keep


@pytest.mark.asyncio
async def test_sync_job_does_not_fail_on_tqdm_cr(app, monkeypatch):
    from api.database import get_database
    from bson import ObjectId
    from datetime import datetime

    class FakeResult:
        def __init__(self, stdout=""):
            self.stdout = stdout
            self.stderr = ""
            self.exit_status = 0

    async def fake_run(node, command, timeout=30.0):
        return FakeResult(
            "1\t\t7704862720\t0\tFetching 32 files:   0%|          | 0/32 [00:00<?, ?it/s]\r"
            "Fetching 32 files:  25%|██▌       | 8/32 [00:01<00:07,  3.41it/s] "
        )

    monkeypatch.setattr(ssh_mod, "run_command", fake_run)
    db = get_database()
    now = datetime.utcnow()
    node_id = ObjectId()
    await db.nodes.insert_one(
        {"_id": node_id, "name": "ctc-vllm", "host": "ctcollama", "engine": "vllm", "modelDir": "/m"}
    )
    inserted = await db.downloads.insert_one(
        {
            "nodeId": node_id,
            "filename": "Qwen--Qwen3.8-27B",
            "modelDir": "/m",
            "engine": "vllm",
            "status": "running",
            "bytes": 0,
            "updatedAt": now,
        }
    )
    doc = await db.downloads.find_one({"_id": inserted.inserted_id})
    updated = await sync_job(db, doc)
    assert updated["status"] == "running"
    assert updated["bytes"] == 7704862720
    assert updated.get("detail") == ""
