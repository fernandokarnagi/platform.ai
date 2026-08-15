# Platform.AI Inferencing Control Plane — Design

Date: 2026-08-15  
Status: draft for review  
Scope: v1 — llama.cpp only, Mac-first, two local Mac nodes

## 1. Purpose

A local web app that lets you manage LLM inferencing clusters. You register clusters and nodes, follow on-screen engine install steps, then use the app to download/delete GGUF models, start/stop/restart `llama-server`, check OpenAI-compatible status, list served models, and chat.

v1 engine: **llama.cpp**. Later engines (vLLM, SGLang, Ollama) plug in without changing cluster/node screens.

## 2. Locked decisions

| Topic | Decision |
|---|---|
| Access | No login. Local single operator. API trusts whoever can reach it. |
| First nodes | Two macOS machines. Linux path exists behind the Mac path. |
| Engine install | Manual. UI shows Homebrew (Mac) and later Linux notes at node registration. API never installs the engine. |
| Process control | App-managed `llama-server`. PID file + last start command. |
| Model source | Hugging Face **or** direct `.gguf` URL. |
| Shape | CTC local control plane: React + Vite UI, FastAPI API, Mongo only in Docker. |
| Ports | API `8091`, UI `3091`, Mongo `27091`. |
| Mongo container | Name: `platformai-mongodb`. DB name: `platformai`. |
| Launch params | Structured LM Studio-style fields on the node. Extra flags as escape hatch. |
| Chat | Non-streaming OpenAI chat completions, proxied by the API. |

## 3. Architecture

Three processes on the operator laptop:

```
[Browser :3091] --HTTP--> [FastAPI :8091] --SSH--> [Node: llama-server, modelDir]
                              |                --HTTP--> [Node OpenAI URL /v1]
                              v
                     [Mongo :27091  platformai-mongodb]
```

- The browser never SSHs and never calls a node OpenAI URL.
- The API is the only component that holds SSH secrets and talks to nodes.
- Engine-specific logic lives in `LlamaCppEngine`. Other engines are a later plugin, not v1 code.

### 3.1 Runtime

| Piece | How you start it |
|---|---|
| Mongo | `docker run` / compose service named `platformai-mongodb`, host port `27091` |
| API | `uvicorn` on `0.0.0.0:8091` from the host (not in Docker in v1) so SSH to LAN Macs is straightforward |
| UI | Vite dev server on `0.0.0.0:3091` |

Compose file starts **Mongo only**. A comment in the file notes how to add API/UI later.

### 3.2 Out of scope for v1

- Authentication, users, RBAC
- Streaming chat
- Auto-install of llama.cpp over SSH
- Encrypting SSH secrets at rest
- Multi-model / multi-process per node
- vLLM, SGLang, Ollama implementations
- Kubernetes / GitLab CI

## 4. Data model

### 4.1 `clusters`

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `name` | string | required, unique |
| `engine` | string | v1: always `llama.cpp` |
| `description` | string | optional |
| `createdAt` | datetime | |
| `updatedAt` | datetime | |

### 4.2 `nodes`

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `clusterId` | ObjectId | required |
| `name` | string | required |
| `host` | string | IP or hostname |
| `sshPort` | int | default `22` |
| `sshUser` | string | required |
| `sshAuthType` | `password` \| `private_key` | |
| `sshPassword` | string | if password |
| `sshPrivateKey` | string | PEM text if private_key |
| `sshPassphrase` | string | optional |
| `openaiBaseUrl` | string | e.g. `http://192.168.1.20:8080/v1` |
| `openaiApiKey` | string | optional |
| `hfToken` | string | optional; used for gated Hugging Face downloads |
| `listenHost` | string | default `0.0.0.0` |
| `listenPort` | int | default `8080` |
| `modelDir` | string | default `~/models` |
| `serverParams` | object | see §5 |
| `lastStart` | object \| null | last successful start payload + built argv |
| `createdAt` | datetime | |
| `updatedAt` | datetime | |

SSH secrets are stored as entered. No encryption in v1. Do not expose the API off the laptop.

Delete cluster is rejected if any node still belongs to it.

## 5. `serverParams` (launch)

Sampling (`temperature`, `top-p`) is **not** a launch param. It belongs to Chat.

### 5.1 Always-visible load fields

| UI field | JSON key | CLI | Default / omit |
|---|---|---|---|
| Context length | `ctxSize` | `--ctx-size` | `0` (model default). Include even when 0. |
| GPU layers | `gpuLayers` | `--n-gpu-layers` | `"auto"` (`"auto"` \| `"all"` \| number) |
| Flash attention | `flashAttn` | `--flash-attn` | `"auto"` (`"auto"` \| `"on"` \| `"off"`) |
| CPU threads | `threads` | `--threads` | unset → omit |
| Parallel slots | `parallel` | `--parallel` | `1` |
| Batch size | `batchSize` | `--batch-size` | unset → omit |
| µbatch size | `ubatchSize` | `--ubatch-size` | unset → omit |
| KV offload | `kvOffload` | `--kv-offload` / `--no-kv-offload` | `true` |
| Fit in memory | `fit` | `--fit` | `"on"` (`"on"` \| `"off"`) |
| Cache type K | `cacheTypeK` | `--cache-type-k` | unset → omit. Allowed: `f32`, `f16`, `bf16`, `q8_0`, `q4_0`, `q4_1`, `iq4_nl`, `q5_0`, `q5_1` |
| Cache type V | `cacheTypeV` | `--cache-type-v` | unset → omit. Same allowed set |

### 5.2 Advanced (collapsed)

| UI field | JSON key | CLI |
|---|---|---|
| Max predict | `nPredict` | `--n-predict` |
| Keep tokens | `keep` | `--keep` |
| Batch threads | `threadsBatch` | `--threads-batch` |
| Split mode | `splitMode` | `--split-mode` |
| Main GPU | `mainGpu` | `--main-gpu` |
| Tensor split | `tensorSplit` | `--tensor-split` |
| Device list | `device` | `--device` |
| CPU MoE | `cpuMoe` | `--cpu-moe` |
| N CPU MoE layers | `nCpuMoe` | `--n-cpu-moe` |
| Load mode | `loadMode` | `--load-mode` |
| Jinja | `jinja` | `--jinja` when `true` |
| Chat template | `chatTemplate` | `--chat-template` |
| Metrics | `metrics` | `--metrics` when `true` |
| Model alias | `alias` | `-a` / `--alias` |

### 5.3 Extra flags

`extraFlags` (string). Appended last. Operator-owned. Not parsed.

### 5.4 Build rules

- `LlamaCppEngine.build_argv(node, model_filename)` is the only place that turns `serverParams` into argv.
- Unset / empty / null fields are omitted.
- UI never concatenates a shell string for execution.
- UI **does** show a live command preview (`$MODEL` placeholder) on the node form.
- Start uses saved `serverParams` + the GGUF picked in the Start dialog.
- Restart rebuilds from current `serverParams` + `lastStart.modelFilename`. If `serverParams` changed since last start, Restart picks up the new values.
- Listen host/port and model path always come from `listenHost`, `listenPort`, `modelDir`, and the Start dialog. If `extraFlags` contains `-m`, `--model`, `--host`, or `--port`, Start returns 400 — those are owned by the form.

## 6. API

No auth. All routes open on localhost.

| Method | Path | Behaviour |
|---|---|---|
| GET | `/health` | `{ "status": "healthy" }` |
| GET/POST | `/clusters` | list / create |
| GET/PUT/DELETE | `/clusters/{id}` | read / update / delete (409 if nodes remain) |
| GET/POST | `/clusters/{id}/nodes` | list / register |
| GET/PUT/DELETE | `/nodes/{id}` | read / update / delete |
| POST | `/nodes/{id}/test-ssh` | SSH `uname -s`; resolve `llama-server` path |
| GET | `/nodes/{id}/status` | probe `{openaiBaseUrl}/models` → `up`/`down` + model ids |
| GET | `/nodes/{id}/engine` | SSH: running?, pid, last start command |
| POST | `/nodes/{id}/engine/start` | body: `{ modelFilename }` — start `llama-server` |
| POST | `/nodes/{id}/engine/stop` | kill managed pid |
| POST | `/nodes/{id}/engine/restart` | stop then start with `lastStart.modelFilename` + current `serverParams` |
| GET | `/nodes/{id}/models` | SSH: list `*.gguf` in `modelDir` |
| POST | `/nodes/{id}/models/download` | `{ source, repo?, filename?, url? }` |
| DELETE | `/nodes/{id}/models` | `{ filename }` — delete file on node |
| GET | `/nodes/{id}/models/openai` | proxy `GET /v1/models` |
| POST | `/nodes/{id}/chat` | proxy `POST /v1/chat/completions` (non-stream) |

JSON field names in API responses are camelCase, matching the UI.

Helpers convert Mongo `_id` → `id` and datetimes → ISO strings. Responses **do** return SSH secrets to the same local UI so edit forms can round-trip. Acceptable only because there is no auth and the API is laptop-local.

HTTP: `201` create, `204` delete, `400` bad input, `404` missing, `409` cluster still has nodes, `502` SSH or node OpenAI failure with short `detail`.

## 7. SSH and engine behaviour

Library: **asyncssh**. Timeout: 10s connect.

### 7.1 Auth

- `password`: username + password
- `private_key`: PEM + optional passphrase

### 7.2 Paths

- Detect OS with `uname -s`.
- Resolve binary: `command -v llama-server`, then `$(brew --prefix)/bin/llama-server`, then `/usr/local/bin/llama-server`.
- Expand `modelDir` with `echo` on the remote shell so `~/models` works.
- PID file: `~/.platformai/llama-server.pid`
- Log file: `~/.platformai/llama-server.log`

### 7.3 Start

1. Fail if PID file exists and that pid is still alive.
2. Ensure `~/.platformai` and `modelDir` exist.
3. Build argv from `serverParams` + `-m $modelDir/$modelFilename --host $listenHost --port $listenPort`.
4. Remote:

```bash
nohup <llama-server> <argv> > ~/.platformai/llama-server.log 2>&1 & echo $!
```

5. Write pid to the PID file. Persist `lastStart` on the node (`modelFilename`, `argv`, `startedAt`).

### 7.4 Stop

Read PID file. If process exists, `kill` then wait up to 8s, then `kill -9`. Remove PID file. If no pid / already dead, treat as stopped (200, not 404).

### 7.5 Restart

Stop, then Start with `lastStart.modelFilename`. 400 if `lastStart` is missing.

### 7.6 Models

- List: `ls` of `*.gguf` in `modelDir` (name, size bytes, mtime).
- Download URL: `curl -L --fail --output "$modelDir/$filename" "$url"` (filename from URL if not supplied).
- Download Hugging Face: `https://huggingface.co/{repo}/resolve/main/{filename}` via the same `curl`. Optional `hfToken` on the download body (or node-level `hfToken`) sent as `Authorization: Bearer`. Gated repos fail with the curl error if no token.
- Delete: `rm` only if the path stays inside `modelDir` (reject `..` and absolute paths).
- Do not require `huggingface-cli` on the node.

### 7.7 OpenAI proxy

- Status / model list: `GET {openaiBaseUrl}/models` (handle both `/v1` and `/v1/` base).
- Chat: `POST {openaiBaseUrl}/chat/completions` with `{ model, messages, stream: false }` plus optional sampling from the Chat UI (`temperature`, `topP`, `maxTokens`).
- Optional `Authorization: Bearer {openaiApiKey}`.
- Timeouts: status 5s, chat 120s.

## 8. UI

Stack: React 19, TypeScript, Vite 6, Tailwind, react-router-dom v7. Dev server port **3091**. `VITE_API_URL=http://localhost:8091`.

No login screen.

### 8.1 Screens

| Route | Screen |
|---|---|
| `/` | Cluster list |
| `/clusters/:id` | Cluster detail (nodes table) |
| `/clusters/:id/nodes/new` | Register node |
| `/nodes/:id` | Node detail |
| `/nodes/:id/edit` | Edit node |

Sidebar: **Clusters** only. Dark slate nav (`bg-slate-900`), light content (`bg-slate-50`).

### 8.2 Cluster list

Table: name, engine, node count, created. Create / edit / delete. Delete disabled while nodes exist.

### 8.3 Cluster detail

Nodes table: name, host, SSH (last probe), engine (running/stopped), OpenAI (up/down), current model. Actions: register node, open node. Refresh probes all nodes.

### 8.4 Node register / edit

Sections:

1. Identity — name, host, SSH port
2. SSH — user, auth type, password **or** private key + passphrase
3. OpenAI — base URL, optional API key, optional Hugging Face token
4. Server — listen host, listen port, model dir, alias
5. Load parameters — §5.1 fields
6. Advanced — collapsed, §5.2
7. Extra flags — textarea
8. Command preview — read-only
9. **Setup** (after save, and on edit) — copy-paste Homebrew steps for Mac; Linux notes for later. API never runs these.

Test SSH button on the form.

### 8.5 Node detail

Four blocks:

- **Status** — SSH reachable, `llama-server` pid, OpenAI `/v1/models`, served model ids
- **Engine** — Start (modal: pick a local GGUF), Stop, Restart
- **Models** — GGUF table; download dialog (HF repo+file **or** URL); delete with confirm
- **Chat** — pick served model, message list, composer, optional temperature / top-p / max tokens. Non-streaming.

Errors render `detail` from the API. No silent empty failures.

### 8.6 Setup instructions (Mac)

Shown verbatim after register:

```text
# 1. Install Homebrew if needed: https://brew.sh
# 2. brew install llama.cpp
# 3. confirm: llama-server --version
# 4. mkdir -p ~/models
# 5. allow SSH: System Settings → General → Sharing → Remote Login
```

Linux block is a short placeholder (install binary, same model dir, open the listen port).

## 9. Project layout

CTC layout, trimmed (no JWT, no EKS, no GitLab):

```
api/
  main.py
  config.py
  database.py
  logger.py
  models/models.py
  engines/base.py
  engines/llama_cpp.py
  services/ssh.py
  services/openai_proxy.py
  routes/clusters.py
  routes/nodes.py
  requirements.txt
  .env.example
ui/
  index.tsx
  index.html
  types.ts
  routes/index.tsx
  screens/App.tsx
  screens/ClustersScreen.tsx
  screens/ClusterDetailScreen.tsx
  screens/NodeFormScreen.tsx
  screens/NodeDetailScreen.tsx
  components/Sidebar.tsx
  contexts/ClusterContext.tsx
  services/clusterService.ts
  services/nodeService.ts
  package.json
  vite.config.ts
  tsconfig.json
docker-compose.yml          # Mongo only
docs/superpowers/specs/...
```

## 10. Config

`api/.env`:

```
MONGODB_URL=mongodb://localhost:27091
DATABASE_NAME=platformai
```

`ui/.env`:

```
VITE_API_URL=http://localhost:8091
```

`docker-compose.yml` Mongo service:

- container_name: `platformai-mongodb`
- image: `mongo:7`
- ports: `27091:27017`
- volume: `platformai-mongo-data`

## 11. Error handling

| Case | HTTP | `detail` |
|---|---|---|
| Invalid ObjectId | 400 | Invalid id |
| Missing cluster/node | 404 | Not found |
| Delete cluster with nodes | 409 | Cluster has nodes |
| SSH connect/auth fail | 502 | SSH failed: … |
| `llama-server` not on PATH | 502 | llama-server not found on node |
| Start while already running | 409 | Engine already running |
| Restart with no lastStart | 400 | No previous start |
| Model file missing | 404 | Model not found |
| Download curl fail | 502 | Download failed: … |
| Path escape on delete | 400 | Invalid filename |
| OpenAI probe fail | 200 on `/status` with `openai: down`; 502 on `/chat` | |

UI shows `detail` in a red banner on the active screen.

## 12. Testing

- API: pytest + httpx against a test Mongo (or mongomock if we can keep Motor). Prefer a real local Mongo on `27091` when present.
- Engine: unit tests for `build_argv` (defaults omitted, extra flags last, host/port, ctx/gpu/flash).
- SSH/OpenAI routes: mocked asyncssh and httpx.
- UI: no E2E in v1. Manual check against two Macs.

## 13. Success criteria

You can, from the web app only:

1. Create a cluster `desk-macs` (engine `llama.cpp`).
2. Register two Mac nodes with SSH password or key.
3. Read Homebrew setup steps on the node form.
4. Test SSH and see `Darwin` + `llama-server` path (after you installed it).
5. Download a GGUF from Hugging Face or a URL into `~/models`.
6. Set LM Studio-style load params, preview the command, start `llama-server`.
7. See OpenAI status up and the served model id.
8. Chat with that model.
9. Stop, restart, delete a model.

## 14. Implementation order (for the later plan)

1. Compose + API skeleton + Mongo
2. Cluster/node CRUD
3. SSH client + test-ssh
4. `LlamaCppEngine` argv + start/stop/restart + models
5. OpenAI status + chat proxy
6. UI shell + cluster screens
7. Node form (including launch params + preview + setup)
8. Node detail (status, engine, models, chat)
