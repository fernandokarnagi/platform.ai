#!/usr/bin/env bash
# Refresh _ai/generated from the current tree. Safe to run any time.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
OUT="_ai/generated"
TODAY="$(date +%F)"
mkdir -p "$OUT"

python3 - "$ROOT" "$OUT" "$TODAY" <<'PY'
import ast
import re
import sys
from datetime import date
from pathlib import Path

root = Path(sys.argv[1])
out = Path(sys.argv[2])
today = sys.argv[3]

# --- api-map from route decorators ---
rows = []
for path in sorted((root / "api" / "routes").glob("*.py")):
    text = path.read_text(encoding="utf-8")
    prefix = ""
    m = re.search(r'APIRouter\([^)]*prefix\s*=\s*["\']([^"\']+)', text)
    if m:
        prefix = m.group(1).rstrip("/")
    for dec, func in re.findall(
        r'@router\.(get|post|put|delete|patch)\(\s*["\']([^"\']*)["\']',
        text,
        flags=re.I,
    ):
        route = prefix + (func if func.startswith("/") else f"/{func}" if func else "")
        route = route.replace("//", "/") or "/"
        rows.append((dec.upper(), route or "/", path.name))

# health from main
if (root / "api" / "main.py").exists():
    main = (root / "api" / "main.py").read_text(encoding="utf-8")
    for dec, func in re.findall(
        r'@app\.(get|post|put|delete|patch)\(\s*["\']([^"\']*)["\']',
        main,
        flags=re.I,
    ):
        rows.append((dec.upper(), func or "/", "main.py"))

rows = sorted(set(rows), key=lambda r: (r[1], r[0]))
lines = [
    "---",
    "title: Generated API map",
    "tags: [generated, api]",
    f"updated: {today}",
    "---",
    "",
    "# Generated API map",
    "",
    f"Written by `scripts/update-brain.sh` on {today}. Do not edit.",
    "",
    "| Method | Path | File |",
    "|---|---|---|",
]
for method, route, fname in rows:
    lines.append(f"| {method} | `{route}` | `{fname}` |")
lines.append("")
(out / "api-map.md").write_text("\n".join(lines), encoding="utf-8")

# --- file-map ---
keep = []
for rel in (
    "api",
    "ui",
    "docs",
    "_ai",
    "scripts",
):
    base = root / rel
    if not base.exists():
        continue
    for p in sorted(base.rglob("*")):
        if not p.is_file():
            continue
        s = str(p.relative_to(root))
        if any(
            part in s
            for part in (
                "node_modules/",
                "__pycache__/",
                "ui/dist/",
                ".venv/",
                "generated/",
            )
        ):
            continue
        if p.suffix in {".py", ".ts", ".tsx", ".css", ".md", ".sh", ".yml", ".yaml"}:
            keep.append(s)

keep.extend(
    sorted(
        p.name
        for p in root.iterdir()
        if p.is_file() and p.suffix in {".md", ".sh", ".yml"}
    )
)
keep = sorted(set(keep))
flines = [
    "---",
    "title: Generated file map",
    "tags: [generated]",
    f"updated: {today}",
    "---",
    "",
    "# Generated file map",
    "",
    f"Written by `scripts/update-brain.sh` on {today}. Do not edit.",
    "",
]
for s in keep:
    flines.append(f"- `{s}`")
flines.append("")
(out / "file-map.md").write_text("\n".join(flines), encoding="utf-8")
print(f"brain: {len(rows)} routes, {len(keep)} files → {out}")
PY

# Stamp the index if present
if [[ -f _ai/00-index.md ]]; then
  python3 - "$TODAY" <<'PY'
import re, sys
from pathlib import Path
today = sys.argv[1]
p = Path("_ai/00-index.md")
text = p.read_text(encoding="utf-8")
text = re.sub(r"^updated:.*$", f"updated: {today}", text, count=1, flags=re.M)
p.write_text(text, encoding="utf-8")
PY
fi
