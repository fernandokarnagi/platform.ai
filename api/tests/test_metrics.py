import json
import pytest
from httpx import ASGITransport, AsyncClient
from api.services import ssh as ssh_mod
from api.services.metrics import parse_metrics_stdout


class FakeResult:
    def __init__(self, stdout="", exit_status=0, stderr=""):
        self.stdout = stdout
        self.stderr = stderr
        self.exit_status = exit_status


SAMPLE = {
    "hostname": "mac-1",
    "os": "Darwin",
    "osVersion": "24.5.0",
    "arch": "arm64",
    "cpuModel": "Apple M4 Max",
    "cpuCores": 14,
    "cpuPercent": 18.5,
    "load1": 2.1,
    "load5": 1.8,
    "load15": 1.4,
    "memTotalBytes": 137438953472,
    "memUsedBytes": 90000000000,
    "diskTotalBytes": 2000000000000,
    "diskUsedBytes": 800000000000,
    "diskMount": "/",
    "gpus": [
        {
            "name": "Apple M4 Max",
            "vendor": "Apple",
            "cores": 40,
            "memoryTotalBytes": 137438953472,
            "memoryUsedBytes": 4000000000,
            "percent": 23,
            "unified": True,
        }
    ],
}


def test_parse_metrics_stdout_reads_trailing_json():
    parsed = parse_metrics_stdout("warning: ignore me\n" + json.dumps(SAMPLE))
    assert parsed["hostname"] == "mac-1"
    assert parsed["cpuCores"] == 14
    assert parsed["cpuPercent"] == 18.5
    assert parsed["gpus"][0]["name"] == "Apple M4 Max"
    assert parsed["gpus"][0]["unified"] is True
    assert parsed["memFreeBytes"] == 137438953472 - 90000000000
    assert parsed["diskFreeBytes"] == 2000000000000 - 800000000000
    assert parsed["gpus"][0]["vendor"] == "Apple"
    assert parsed["gpus"][0]["cores"] == 40
    assert parsed["gpus"][0]["memoryFreeBytes"] == 137438953472 - 4000000000
    assert parsed["gpus"][0]["percent"] == 23.0


def test_parse_metrics_stdout_coerces_string_numbers():
    parsed = parse_metrics_stdout(
        json.dumps(
            {
                "hostname": "box",
                "cpuCores": "8",
                "cpuPercent": "12.25",
                "memTotalBytes": "1024",
                "memUsedBytes": "256",
                "gpus": [
                    {
                        "name": "AMD Instinct",
                        "memoryTotalBytes": "17179869184",
                        "memoryUsedBytes": "4294967296",
                        "percent": "41",
                        "unified": False,
                    }
                ],
            }
        )
    )
    assert parsed["cpuCores"] == 8
    assert parsed["cpuPercent"] == 12.25
    assert parsed["memTotalBytes"] == 1024
    assert parsed["gpus"][0]["memoryTotalBytes"] == 17179869184
    assert parsed["gpus"][0]["memoryFreeBytes"] == 17179869184 - 4294967296
    assert parsed["gpus"][0]["percent"] == 41.0
    assert parsed["gpus"][0]["unified"] is False
    assert parsed["memFreeBytes"] == 1024 - 256


def test_parse_metrics_stdout_rejects_error_payload():
    with pytest.raises(ValueError, match="python3 not found"):
        parse_metrics_stdout(json.dumps({"error": "python3 not found"}))


def test_parse_metrics_stdout_rejects_empty():
    with pytest.raises(ValueError, match="empty"):
        parse_metrics_stdout("   \n")


def test_collect_command_prints_json_on_this_host():
    import subprocess
    from api.services.metrics import COLLECT_COMMAND

    proc = subprocess.run(
        ["/bin/bash", "-lc", COLLECT_COMMAND],
        capture_output=True,
        text=True,
        timeout=20,
        check=False,
    )
    parsed = parse_metrics_stdout(proc.stdout)
    assert parsed["cpuCores"] and parsed["cpuCores"] >= 1
    assert parsed["memTotalBytes"] and parsed["memTotalBytes"] > 0
    assert parsed["memFreeBytes"] is not None
    assert parsed["diskFreeBytes"] is not None
    assert parsed["os"]
    if parsed["os"] == "Darwin":
        assert parsed["gpus"]
        assert parsed["gpus"][0]["vendor"] == "Apple"


async def _make_node(client):
    cluster = (await client.post("/clusters", json={"name": "desk-macs"})).json()
    node = (
        await client.post(
            f"/clusters/{cluster['id']}/nodes",
            json={
                "name": "mac-1",
                "host": "192.168.1.10",
                "sshUser": "fernando",
                "sshAuthType": "password",
                "sshPassword": "secret",
                "openaiBaseUrl": "http://192.168.1.10:8080/v1",
            },
        )
    ).json()
    return node


@pytest.mark.asyncio
async def test_node_metrics_returns_spec_and_utilization(app, monkeypatch):
    async def fake_run(node, command, timeout=30.0):
        assert "python3" in command or "python" in command
        return FakeResult(json.dumps(SAMPLE) + "\n")

    monkeypatch.setattr(ssh_mod, "run_command", fake_run)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        node = await _make_node(client)
        response = await client.get(f"/nodes/{node['id']}/metrics")
        assert response.status_code == 200
        body = response.json()
        assert body["hostname"] == "mac-1"
        assert body["cpuModel"] == "Apple M4 Max"
        assert body["cpuCores"] == 14
        assert body["cpuPercent"] == 18.5
        assert body["memTotalBytes"] == 137438953472
        assert body["memUsedBytes"] == 90000000000
        assert body["memFreeBytes"] == 137438953472 - 90000000000
        assert body["diskFreeBytes"] == 2000000000000 - 800000000000
        assert body["local"] is False
        assert body["checkedAt"]
        assert body["gpus"][0]["unified"] is True
        assert body["gpus"][0]["cores"] == 40
        assert body["gpus"][0]["percent"] == 23.0


@pytest.mark.asyncio
async def test_node_metrics_ssh_failure_is_502(app, monkeypatch):
    async def fake_run(node, command, timeout=30.0):
        raise ssh_mod.SshError("Authentication failed")

    monkeypatch.setattr(ssh_mod, "run_command", fake_run)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        node = await _make_node(client)
        response = await client.get(f"/nodes/{node['id']}/metrics")
        assert response.status_code == 502
        assert response.json()["detail"].startswith("SSH failed:")


@pytest.mark.asyncio
async def test_node_metrics_missing_node_is_404(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/nodes/64b64b64b64b64b64b64b64b/metrics")
        assert response.status_code == 404
