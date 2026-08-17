---
title: API
tags: [api]
updated: 2026-08-16
---

# API

No auth. Base `http://localhost:8091`.

Locked HTTP: `201` create, `204` delete, `400` bad input, `404` missing, `409` conflict, `502` SSH/local or node OpenAI failure. `detail` is a short string.

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | `{ status: healthy }` |
| GET/POST | `/clusters` | list / create. List includes `runningCount` / `stoppedCount` |
| GET/PUT/DELETE | `/clusters/{id}` | 409 if nodes remain unless `?cascade=true` |
| GET/POST | `/clusters/{id}/nodes` | list / register |
| GET/PUT/DELETE | `/nodes/{id}` | |
| POST | `/nodes/{id}/test-ssh` | probe; `local: true` when no SSH |
| GET | `/nodes/{id}/status` | cached 30 min; `?refresh=true` live-probes all; `?check=ssh\|engine\|openai` live-probes that part only. 200 even when down |
| GET | `/nodes/{id}/engine` | running, pid, lastStart from the same cache |
| POST | `/nodes/{id}/engine/start\|stop\|restart` | |
| GET | `/nodes/{id}/engine/logs` | last N lines of the engine log |
| GET | `/nodes/{id}/models` | GGUF files (llama.cpp) or HF folders (vLLM); cached 30 min; `?refresh=true` forces a live list |
| POST | `/nodes/{id}/models/download` | starts a background job, `202` |
| GET | `/downloads` | list jobs from Mongo only. A watcher updates running jobs every 3s |
| GET | `/downloads/{id}` | one job from Mongo |
| POST | `/downloads/{id}/cancel` | kill curl on the node |
| POST | `/downloads/{id}/retry` | restart a failed or cancelled job on the same node |
| DELETE | `/downloads/{id}` | remove the job from the list; cancels first if still running |
| DELETE | `/nodes/{id}/models` | body `{ filename }` |
| GET | `/nodes/{id}/models/openai` | proxy `/v1/models` |
| POST | `/nodes/{id}/chat` | non-stream chat completions |
| POST | `/engines/{engine}/preview` | argv + command string (`llama.cpp` or `vllm`) |

Route table is regenerated in [[generated/api-map]].

> [!note]
> Status probe fail is **200** with `openai: down` / `ssh: down`. Chat fail is **502**.

## Related

[[architecture]] · [[llama-cpp-engine]] · [[vllm-engine]] · [[local-vs-ssh]]
