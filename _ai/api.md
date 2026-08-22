---
title: API
tags: [api]
updated: 2026-08-22
---

# API

No auth. Base `http://localhost:8091`.

Locked HTTP: `201` create, `204` delete, `400` bad input, `404` missing, `409` conflict, `502` SSH/local or node OpenAI failure. `detail` is a short string.

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | `{ status: healthy }` |
| GET/PUT | `/settings` | singleton common config. `hfToken`, `libraryDir`, `llamaCpp`, `vllm`. Missing doc returns empty defaults. Empty `libraryDir` reads as `/Users/fernando.karnagi/App/globalmodel` |
| GET/POST | `/clusters` | list / create. List includes `runningCount` / `stoppedCount`. Optional `hfToken` overrides Settings for that cluster |
| GET/PUT/DELETE | `/clusters/{id}` | 409 if nodes remain unless `?cascade=true` |
| GET/POST | `/clusters/{id}/nodes` | list / register |
| GET/PUT/DELETE | `/nodes/{id}` | |
| POST | `/nodes/{id}/test-ssh` | probe; `local: true` when no SSH |
| GET | `/nodes/{id}/metrics` | live host spec + utilization (CPU/RAM remaining/disk remaining/GPU spec+util). 502 if local/SSH fails |
| GET | `/nodes/{id}/status` | cached 30 min; `?refresh=true` live-probes all; `?check=ssh\|engine\|openai` live-probes that part only. 200 even when down |
| GET | `/nodes/{id}/engine` | running, pid, lastStart from the same cache |
| POST | `/nodes/{id}/engine/start\|stop\|restart` | |
| POST | `/nodes/{id}/engine/dry-run` | same payload as start. Checks binary, model dir, model, port, GPU, disk. Returns argv + command. Does not start. 200 even when checks fail; 502 if SSH/local fails |
| GET | `/nodes/{id}/requests` | last 50 proxied chats, newest first |
| GET | `/nodes/{id}/engine/logs` | last N lines of the engine log |
| GET | `/nodes/{id}/models` | GGUF files (llama.cpp) or HF folders (vLLM); cached 30 min; `?refresh=true` forces a live list |
| GET | `/library/models` | catalog of GGUF + vLLM snapshots in Settings `libraryDir`. Optional `?kind=llama.cpp\|vllm` |
| GET | `/library/huggingface` | list HF files for a library fetch (`repo`, `kind`) |
| POST | `/library/download` | fetch Hugging Face/URL into the library on the control plane, `202` |
| POST | `/nodes/{id}/models/download` | starts a background job on the node, `202`. Prefer copy-from-library |
| POST | `/nodes/{id}/models/copy` | copy a library file onto the node (`kind` + `filename`), `202` |
| GET | `/downloads` | list jobs from Mongo only. A watcher updates running jobs every 3s. Library fetches have empty `nodeId` and `target: library` |
| GET | `/downloads/{id}` | one job from Mongo |
| POST | `/downloads/{id}/cancel` | kill curl on the node |
| POST | `/downloads/{id}/retry` | restart a failed or cancelled job on the same node. vLLM retry kills the old `hf` but keeps `.partial` so the snapshot can resume |
| DELETE | `/downloads/{id}` | remove the job from the list; cancels first if still running |
| DELETE | `/nodes/{id}/models` | body `{ filename }` |
| GET | `/nodes/{id}/models/openai` | proxy `/v1/models` |
| POST | `/nodes/{id}/chat` | non-stream chat completions. Also appends a row to the node request log |
| POST | `/engines/{engine}/preview` | argv + command string (`llama.cpp`, `vllm`, or `vllm-metal`) |

Route table is regenerated in [[generated/api-map]].

> [!note]
> Status probe fail is **200** with `openai: down` / `ssh: down`. Chat fail is **502**.

## Related

[[architecture]] · [[llama-cpp-engine]] · [[vllm-engine]] · [[local-vs-ssh]]
