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
| GET | `/nodes/{id}/engine/logs` | last N lines of `~/.platformai/llama-server.log` |
| GET | `/nodes/{id}/models` | GGUF files on the node; cached 30 min; `?refresh=true` forces a live list |
| POST | `/nodes/{id}/models/download` | starts a background job, `202` |
| GET | `/downloads` | list download jobs + live progress |
| GET | `/downloads/{id}` | one job |
| POST | `/downloads/{id}/cancel` | kill curl on the node |
| DELETE | `/nodes/{id}/models` | body `{ filename }` |
| GET | `/nodes/{id}/models/openai` | proxy `/v1/models` |
| POST | `/nodes/{id}/chat` | non-stream chat completions |
| POST | `/engines/llama.cpp/preview` | argv + command string |

Route table is regenerated in [[generated/api-map]].

> [!note]
> Status probe fail is **200** with `openai: down` / `ssh: down`. Chat fail is **502**.

## Related

[[architecture]] · [[llama-cpp-engine]] · [[local-vs-ssh]]
