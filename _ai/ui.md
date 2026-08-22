---
title: UI
tags: [ui]
updated: 2026-08-22
---

# UI

Vite React on `:3091`. Theme copied from `claude.sessions` / Agent OS: GitHub-night (`#0d1117` / `#161b22` / accent `#58a6ff`), sticky top bar, cards, pills. Favicon is a three-node cluster mark (`ui/public/favicon.svg`, plus `.ico` and apple-touch PNG); the same mark sits next to the top-bar brand.

Tokens and shared classes live in `ui/index.css`.

## Routes

| Path | Screen |
|---|---|
| `/` | Cluster list |
| `/clusters/:id` | Cluster detail (nodes table from 30 min status cache; click a row to open the node; Refresh forces a full live probe) |
| `/clusters/:id/nodes/new` | Register node |
| `/nodes/:id` | Node detail — opens from status/models cache (no live SSH); Check on SSH / Engine / OpenAI for an on-demand probe; Refresh forces live status + model list; **Show logs** (`?logs=1`) opens host metrics above the engine log. llama.cpp Chat and Served models keep OpenAI ids that match a GGUF in the model dir (cached llama-server presets and a leftover `selectedModel` are omitted). vLLM still inserts `selectedModel` while the engine is coming up. |

Pages use `width: 100%` and `max-width: 2000px`.
| `/nodes/:id/edit` | Edit node |
| `/downloads` | Model library catalog (Settings path) plus fetch-into-library. Jobs table covers library fetches and node copies. Failed and cancelled rows have Retry. Any row can be Deleted. |
| `/settings` | Common configuration. Hugging Face token, **model library path**, llama.cpp launch params, vLLM launch params. Cluster/node values override; empty inherits. Hugging Face, llama.cpp, vLLM, and each engine card (Load, Advanced, Extra flags, Command preview) collapse independently. Each launch field shows its source (`set` / `Settings` / `engine`) and the inherited value. Section headers count overrides. **Reset to engine** / **Reset to Settings** clears that section. |

No login screen.

Command preview has **Copy**. Each form parameter has an **i** button that opens the purpose on click. Launch fields inherit node → Settings → engine default; empty placeholders name the source and value (`engine: 0`, `Settings: all`). Hugging Face token inherits node → cluster → Settings.

Node table: Access, Engine, OpenAI (healthy/down + last check time), Model. OpenAI and the old Status column are the same check. llama.cpp Model keeps OpenAI ids that match a GGUF in the model dir. **Params** next to Engine (cluster table or node Status) opens a popup of the merged launch params Start uses (node → Settings → engine). Each row has a `set` / `Settings` / `engine` pill. Unset optionals stay hidden.

**Metrics** next to Host on the cluster table opens the node with **Show logs**. That panel shows live host spec + utilization (CPU, RAM remaining, disk remaining, GPU spec/util) above the engine log. It re-probes every 5s while open.

Create cluster picks **llama.cpp**, **vLLM AMD ROCm Linux** (`vllm`), or **vLLM Mac Metal** (`vllm-metal`). Hugging Face token lives in **Settings**. Cluster and node fields are optional overrides. The node form, setup steps, download dialog, and start path follow that engine. Existing `vllm` clusters stay ROCm Docker.

Node **Download** defaults to **Library** (copy from the Settings path). Hugging Face and URL still pull straight onto the node.

Node **Dry run** (next to Start) probes binary, model dir, model, port, GPU, and disk, then shows the command. It does not start the engine.

**Requests** under Chat lists the last proxied chats: time, model, latency, tokens, error body.

Cluster list **Nodes** is live `running / stopped`, not a bare count. Timestamps are SGT (`Asia/Singapore`), format `DD-MMM-YYYY HH:mm`. Naive API ISO strings are UTC.

Edit and delete live on the detail page only. Cluster list and the node table have no action buttons. Cluster delete with nodes asks first, then `DELETE /clusters/{id}?cascade=true`.

vLLM **Serve** writes `selectedModel`, points Chat at that snapshot, then starts the engine (or restarts it if it is already up). Confirm before a restart — it unloads the current model. **serving** means the live OpenAI list contains that snapshot; while it is still coming up the row says **selected** and Chat asks you to wait.

## Node form

Sections: Identity, SSH (or local note), OpenAI, Server (listen + model dir + optional binary path), Load, Advanced, Extra flags, Command preview, Setup (after save). ROCm vLLM uses a **Docker image** field and **Model to serve**; preview is `docker run … vllm serve`. Mac Metal uses **vLLM path** (empty = `~/.venv-vllm-metal/bin/vllm`) and the same model field; preview is `vllm serve`.

Advanced **Jinja** reveals a textarea for the chat template used on start (`--jinja` then `--chat-template`). Leave it empty to keep the model's built-in template. With Jinja off, Chat template is a single-line built-in name (`chatml`, `llama3`, …).

See [[local-vs-ssh]] for the localhost path.

## Related

[[architecture]] · [[api]] · [[runbook]]
