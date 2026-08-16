#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

kill_port() {
  local port="$1"
  local pids
  pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "${pids}" ]]; then
    # shellcheck disable=SC2086
    kill ${pids} 2>/dev/null || true
    echo "Stopped process on :${port}"
  fi
}

kill_port 8091
kill_port 3091

docker compose stop >/dev/null 2>&1 || true
if docker ps --format '{{.Names}}' | grep -qx platformai-mongodb; then
  docker stop platformai-mongodb >/dev/null || true
fi
echo "Stopped Mongo (platformai-mongodb)."
