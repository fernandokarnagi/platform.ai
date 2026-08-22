import json
import math
from datetime import datetime

from api.helpers import is_local_node
from api.services import ssh as ssh_mod

COLLECT_COMMAND = r"""
if command -v python3 >/dev/null 2>&1; then P=python3
elif command -v python >/dev/null 2>&1; then P=python
else echo '{"error":"python3 not found"}'; exit 1
fi
$P - <<'PY'
import glob, json, os, platform, re, shutil, subprocess, time

def sh(cmd, timeout=8):
    try:
        proc = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=timeout)
        return (proc.stdout or "").strip()
    except Exception:
        return ""

def num(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return None

def remaining(total, used, free=None):
    if free is not None:
        return max(0, free)
    if total is not None and used is not None:
        return max(0, total - used)
    return None

out = {
    "hostname": "",
    "os": platform.system(),
    "osVersion": platform.release(),
    "arch": platform.machine(),
    "cpuModel": "",
    "cpuCores": os.cpu_count() or 0,
    "cpuPercent": None,
    "load1": None,
    "load5": None,
    "load15": None,
    "memTotalBytes": None,
    "memUsedBytes": None,
    "memFreeBytes": None,
    "diskTotalBytes": None,
    "diskUsedBytes": None,
    "diskFreeBytes": None,
    "diskMount": "/",
    "gpus": [],
}
out["hostname"] = sh("hostname -s") or platform.node()
try:
    out["load1"], out["load5"], out["load15"] = os.getloadavg()
except OSError:
    pass

system = platform.system()
if system == "Darwin":
    out["cpuModel"] = sh("sysctl -n machdep.cpu.brand_string") or sh("sysctl -n hw.model")
    mem = sh("sysctl -n hw.memsize")
    if mem.isdigit():
        out["memTotalBytes"] = int(mem)
    vm = sh("vm_stat")
    page = 16384
    match = re.search(r"page size of (\d+)", vm)
    if match:
        page = int(match.group(1))
    def pages(label):
        found = re.search(rf"{re.escape(label)}:\s+(\d+)", vm)
        return int(found.group(1)) * page if found else 0
    available = (
        pages("Pages free")
        + pages("Pages speculative")
        + pages("Pages purgeable")
        + pages("Pages inactive")
    )
    if out["memTotalBytes"] is not None:
        out["memFreeBytes"] = available
        out["memUsedBytes"] = max(0, out["memTotalBytes"] - available)
    cores = out["cpuCores"] or 1
    cpu_sum = 0.0
    for token in sh("ps -A -o %cpu=").split():
        try:
            cpu_sum += float(token)
        except ValueError:
            pass
    out["cpuPercent"] = round(min(100.0, cpu_sum / cores), 1)
    gpu = {
        "name": out["cpuModel"] or "Apple GPU",
        "vendor": "Apple",
        "cores": None,
        "memoryTotalBytes": out["memTotalBytes"],
        "memoryUsedBytes": None,
        "memoryFreeBytes": None,
        "percent": None,
        "unified": True,
    }
    io = sh("ioreg -r -d 1 -w 0 -c IOAccelerator", timeout=8)
    model = re.search(r'"model"\s*=\s*"([^"]+)"', io)
    if model:
        gpu["name"] = model.group(1)
    core = re.search(r'"gpu-core-count"\s*=\s*(\d+)', io)
    if core:
        gpu["cores"] = int(core.group(1))
    util = re.search(r'"Device Utilization %"\s*=\s*(\d+)', io)
    if util:
        gpu["percent"] = float(util.group(1))
    used = re.search(r'"In use system memory"\s*=\s*(\d+)', io)
    if used:
        gpu["memoryUsedBytes"] = int(used.group(1))
    gpu["memoryFreeBytes"] = remaining(gpu["memoryTotalBytes"], gpu["memoryUsedBytes"])
    out["gpus"].append(gpu)
else:
    cpuinfo = sh("grep -m1 'model name' /proc/cpuinfo") or sh("grep -m1 'Hardware' /proc/cpuinfo")
    if ":" in cpuinfo:
        out["cpuModel"] = cpuinfo.split(":", 1)[1].strip()
    meminfo = {}
    for line in sh("cat /proc/meminfo").splitlines():
        if ":" not in line:
            continue
        key, rest = line.split(":", 1)
        found = re.search(r"(\d+)", rest)
        if found:
            meminfo[key] = int(found.group(1)) * 1024
    if "MemTotal" in meminfo:
        out["memTotalBytes"] = meminfo["MemTotal"]
        available = meminfo.get("MemAvailable", meminfo.get("MemFree", 0))
        out["memFreeBytes"] = available
        out["memUsedBytes"] = max(0, meminfo["MemTotal"] - available)
    def cpu_times():
        with open("/proc/stat", encoding="utf-8") as fh:
            parts = [int(x) for x in fh.readline().split()[1:]]
        idle = parts[3] + (parts[4] if len(parts) > 4 else 0)
        return idle, sum(parts)
    try:
        idle1, total1 = cpu_times()
        time.sleep(0.2)
        idle2, total2 = cpu_times()
        delta = total2 - total1
        if delta > 0:
            out["cpuPercent"] = round(100.0 * (1.0 - (idle2 - idle1) / delta), 1)
    except Exception:
        pass
    nvsmi = shutil.which("nvidia-smi")
    if nvsmi:
        rows = sh(
            "nvidia-smi --query-gpu=name,memory.total,memory.used,memory.free,utilization.gpu "
            "--format=csv,noheader,nounits"
        )
        for line in rows.splitlines():
            parts = [part.strip() for part in line.split(",")]
            if len(parts) < 5:
                continue
            try:
                total = int(float(parts[1]) * 1024 * 1024)
                used = int(float(parts[2]) * 1024 * 1024)
                free = int(float(parts[3]) * 1024 * 1024)
                out["gpus"].append({
                    "name": parts[0],
                    "vendor": "NVIDIA",
                    "cores": None,
                    "memoryTotalBytes": total,
                    "memoryUsedBytes": used,
                    "memoryFreeBytes": free,
                    "percent": float(parts[4]),
                    "unified": False,
                })
            except ValueError:
                continue
    if not out["gpus"]:
        seen = set()
        for device in sorted(glob.glob("/sys/class/drm/card*/device")):
            total_path = os.path.join(device, "mem_info_vram_total")
            if not os.path.isfile(total_path):
                continue
            real = os.path.realpath(device)
            if real in seen:
                continue
            seen.add(real)
            name = "AMD GPU"
            for filename in ("product_name", "marketing_name", "gpu_model"):
                path = os.path.join(device, filename)
                if os.path.isfile(path):
                    text = open(path, encoding="utf-8", errors="replace").read().strip()
                    if text:
                        name = text
                        break
            gpu = {
                "name": name,
                "vendor": "AMD",
                "cores": None,
                "memoryTotalBytes": num(open(total_path, encoding="utf-8").read().strip()),
                "memoryUsedBytes": None,
                "memoryFreeBytes": None,
                "percent": None,
                "unified": False,
            }
            used_path = os.path.join(device, "mem_info_vram_used")
            if os.path.isfile(used_path):
                gpu["memoryUsedBytes"] = num(open(used_path, encoding="utf-8").read().strip())
            busy_path = os.path.join(device, "gpu_busy_percent")
            if os.path.isfile(busy_path):
                try:
                    gpu["percent"] = float(open(busy_path, encoding="utf-8").read().strip())
                except ValueError:
                    pass
            gpu["memoryFreeBytes"] = remaining(gpu["memoryTotalBytes"], gpu["memoryUsedBytes"])
            out["gpus"].append(gpu)

df = sh("df -kP / | tail -1").split()
if len(df) >= 4 and df[1].isdigit() and df[2].isdigit():
    out["diskTotalBytes"] = int(df[1]) * 1024
    out["diskUsedBytes"] = int(df[2]) * 1024
    if df[3].isdigit():
        out["diskFreeBytes"] = int(df[3]) * 1024
    else:
        out["diskFreeBytes"] = remaining(out["diskTotalBytes"], out["diskUsedBytes"])
    out["diskMount"] = df[-1]

print(json.dumps(out, separators=(",", ":")))
PY
""".strip()


def _finite(value):
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(number):
        return None
    return number


def _int(value):
    number = _finite(value)
    return int(number) if number is not None else None


def _float(value):
    number = _finite(value)
    return float(number) if number is not None else None


def _remaining(total, used, free=None):
    got = _int(free)
    if got is not None:
        return max(0, got)
    total_n = _int(total)
    used_n = _int(used)
    if total_n is not None and used_n is not None:
        return max(0, total_n - used_n)
    return None


def _gpu(raw) -> dict:
    item = raw if isinstance(raw, dict) else {}
    total = _int(item.get("memoryTotalBytes"))
    used = _int(item.get("memoryUsedBytes"))
    return {
        "name": str(item.get("name") or "").strip() or "GPU",
        "vendor": str(item.get("vendor") or "").strip(),
        "cores": _int(item.get("cores")),
        "memoryTotalBytes": total,
        "memoryUsedBytes": used,
        "memoryFreeBytes": _remaining(total, used, item.get("memoryFreeBytes")),
        "percent": _float(item.get("percent")),
        "unified": bool(item.get("unified")),
    }


def parse_metrics_stdout(stdout: str) -> dict:
    text = (stdout or "").strip()
    if not text:
        raise ValueError("empty metrics output")
    start = text.find("{")
    end = text.rfind("}")
    if start < 0 or end <= start:
        raise ValueError("metrics output is not JSON")
    try:
        raw = json.loads(text[start : end + 1])
    except json.JSONDecodeError as exc:
        raise ValueError("metrics output is not JSON") from exc
    if not isinstance(raw, dict):
        raise ValueError("metrics output is not JSON")
    if raw.get("error"):
        raise ValueError(str(raw["error"]))
    mem_total = _int(raw.get("memTotalBytes"))
    mem_used = _int(raw.get("memUsedBytes"))
    disk_total = _int(raw.get("diskTotalBytes"))
    disk_used = _int(raw.get("diskUsedBytes"))
    gpus = [_gpu(item) for item in (raw.get("gpus") or []) if isinstance(item, dict)]
    return {
        "hostname": str(raw.get("hostname") or "").strip(),
        "os": str(raw.get("os") or "").strip(),
        "osVersion": str(raw.get("osVersion") or "").strip(),
        "arch": str(raw.get("arch") or "").strip(),
        "cpuModel": str(raw.get("cpuModel") or "").strip(),
        "cpuCores": _int(raw.get("cpuCores")),
        "cpuPercent": _float(raw.get("cpuPercent")),
        "load1": _float(raw.get("load1")),
        "load5": _float(raw.get("load5")),
        "load15": _float(raw.get("load15")),
        "memTotalBytes": mem_total,
        "memUsedBytes": mem_used,
        "memFreeBytes": _remaining(mem_total, mem_used, raw.get("memFreeBytes")),
        "diskTotalBytes": disk_total,
        "diskUsedBytes": disk_used,
        "diskFreeBytes": _remaining(disk_total, disk_used, raw.get("diskFreeBytes")),
        "diskMount": str(raw.get("diskMount") or "/").strip() or "/",
        "gpus": gpus,
        "detail": None,
    }


async def collect_node_metrics(node: dict) -> dict:
    local = is_local_node(node)
    label = "Local" if local else "SSH"
    try:
        result = await ssh_mod.run_command(node, COLLECT_COMMAND, timeout=20)
    except ssh_mod.SshError as exc:
        raise ssh_mod.SshError(f"{label} failed: {exc}") from exc
    try:
        body = parse_metrics_stdout(result.stdout)
    except ValueError as exc:
        tail = ((result.stderr or result.stdout or str(exc)).strip().splitlines() or [str(exc)])[-1]
        raise ssh_mod.SshError(f"{label} failed: {tail}") from exc
    body["local"] = local
    body["checkedAt"] = datetime.utcnow().isoformat()
    return body
