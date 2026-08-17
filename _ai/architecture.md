---
title: Architecture
tags: [architecture]
updated: 2026-08-16
---

# Architecture

```
[Browser :3091] --HTTP--> [FastAPI :8091] --SSH or local bash--> [Node: llama-server or vllm, modelDir]
                              |                --HTTP--> [Node OpenAI URL /v1]
                              v
                     [Mongo :27091  platformai-mongodb]
```

## Rules

- The browser never SSHs and never calls a node OpenAI URL.
- The API is the only component that holds SSH secrets and talks to nodes.
- Engine-specific logic lives in `LlamaCppEngine` / `VllmEngine`. `get_engine(cluster.engine)` picks the class.
- Mongo is the only Docker service in v1. API and UI run on the host so SSH to LAN Macs is straightforward.

## Processes

| Piece | How it starts | Port |
|---|---|---|
| Mongo | `docker compose up -d` — container `platformai-mongodb` | `27091` |
| API | `uvicorn api.main:app --host 0.0.0.0 --port 8091` | `8091` |
| UI | Vite `npm run dev` | `3091` |

Use [[runbook]] / `./start.sh`. If the Mongo container already exists, start reuses it.

## Key modules

| Path | Role |
|---|---|
| `api/main.py` | FastAPI app, CORS, routers, `/health` |
| `api/database.py` | Motor client, unique index on `clusters.name` |
| `api/routes/clusters.py` | Cluster CRUD |
| `api/routes/nodes.py` | Node CRUD + SSH/local + engine + models + chat |
| `api/routes/engines.py` | `POST /engines/{engine}/preview` |
| `api/engines/llama_cpp.py` | llama.cpp argv + shell scripts |
| `api/engines/vllm.py` | vLLM argv + snapshot download scripts |
| `api/services/ssh.py` | `run_command` — SSH or local bash |
| `api/services/openai_proxy.py` | `/models` and `/chat/completions` |
| `api/helpers.py` | `is_local_host`, serialisers, `safe_model_filename` |

See [[generated/file-map]] for the current file list.

## Related

[[data-model]] · [[api]] · [[local-vs-ssh]] · [[llama-cpp-engine]] · [[vllm-engine]]
