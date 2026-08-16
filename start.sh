#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

API_PORT=8091
UI_PORT=3091
MONGO_PORT=27091

log() { printf '%s\n' "$*"; }

wait_port() {
  local host="$1" port="$2" tries="${3:-30}"
  local i
  for i in $(seq 1 "$tries"); do
    if python3 -c "import socket; s=socket.create_connection(('${host}', ${port}), 1); s.close()" 2>/dev/null; then
      return 0
    fi
    sleep 1
  done
  return 1
}

[[ -f api/.env ]] || cp api/.env.example api/.env
[[ -f ui/.env ]] || cp ui/.env.example ui/.env

if [[ -x "$ROOT/scripts/update-brain.sh" ]]; then
  "$ROOT/scripts/update-brain.sh" >/dev/null || true
fi

log "Starting Mongo (platformai-mongodb) on :${MONGO_PORT}..."
if docker ps -a --format '{{.Names}}' | grep -qx platformai-mongodb; then
  log "Container already exists — reusing it."
  docker start platformai-mongodb >/dev/null || true
else
  docker compose up -d
fi
if ! wait_port 127.0.0.1 "$MONGO_PORT" 40; then
  log "Mongo did not become ready on port ${MONGO_PORT}."
  exit 1
fi

if [[ ! -x api/.venv/bin/python ]]; then
  log "Creating API virtualenv..."
  python3 -m venv api/.venv
fi
log "Installing API dependencies..."
api/.venv/bin/pip install -q -r api/requirements.txt

if [[ ! -d ui/node_modules ]]; then
  log "Installing UI dependencies..."
  (cd ui && npm install)
fi

API_PID=""
UI_PID=""
cleanup() {
  trap - EXIT INT TERM
  if [[ -n "${API_PID}" ]]; then kill "${API_PID}" 2>/dev/null || true; fi
  if [[ -n "${UI_PID}" ]]; then kill "${UI_PID}" 2>/dev/null || true; fi
  wait 2>/dev/null || true
  log "API and UI stopped. Mongo is still running (use ./stop.sh to stop it)."
}
trap cleanup EXIT INT TERM

log "Starting API on :${API_PORT}..."
PYTHONPATH="$ROOT" api/.venv/bin/uvicorn api.main:app --reload --host 0.0.0.0 --port "$API_PORT" &
API_PID=$!

log "Starting UI on :${UI_PORT}..."
(cd ui && npm run dev -- --port "$UI_PORT" --host 0.0.0.0) &
UI_PID=$!

if ! wait_port 127.0.0.1 "$API_PORT" 30; then
  log "API did not become ready on port ${API_PORT}."
  exit 1
fi

log ""
log "Platform.AI is up."
log "  UI    http://localhost:${UI_PORT}"
log "  API   http://localhost:${API_PORT}"
log "  Mongo localhost:${MONGO_PORT}  (container platformai-mongodb)"
log "No login. Do not expose the API."
log "Ctrl+C stops API and UI."
log ""

wait
