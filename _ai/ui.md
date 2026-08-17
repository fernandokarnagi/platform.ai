---
title: UI
tags: [ui]
updated: 2026-08-17
---

# UI

Vite React on `:3091`. Theme copied from `claude.sessions` / Agent OS: GitHub-night (`#0d1117` / `#161b22` / accent `#58a6ff`), sticky top bar, cards, pills.

Tokens and shared classes live in `ui/index.css`.

## Routes

| Path | Screen |
|---|---|
| `/` | Cluster list |
| `/clusters/:id` | Cluster detail (nodes table from 30 min status cache; click a row to open the node; Refresh forces a full live probe) |
| `/clusters/:id/nodes/new` | Register node |
| `/nodes/:id` | Node detail — opens from status/models cache (no live SSH); Check on SSH / Engine / OpenAI for an on-demand probe; Refresh forces live status + model list; engine log hidden until Show logs |

Pages use `width: 100%` and `max-width: 2000px`.
| `/nodes/:id/edit` | Edit node |
| `/downloads` | Background model download progress from Mongo (watcher updates running jobs). Failed and cancelled rows have Retry. Any row can be Deleted. |

No login screen.

Command preview has **Copy**. Each form parameter has an **i** button that opens the purpose on click.

Node table: Access, Engine, OpenAI (healthy/down + last check time), Model. OpenAI and the old Status column are the same check. **Params** next to Engine (cluster table or node Status) opens a popup of launch parameter names and values.

Create cluster picks **llama.cpp** or **vLLM**. The node form, setup steps, download dialog, and start path follow that engine.

Cluster list **Nodes** is live `running / stopped`, not a bare count. Timestamps are SGT (`Asia/Singapore`), format `DD-MMM-YYYY HH:mm`. Naive API ISO strings are UTC.

Edit and delete live on the detail page only. Cluster list and the node table have no action buttons. Cluster delete with nodes asks first, then `DELETE /clusters/{id}?cascade=true`.

## Node form

Sections: Identity, SSH (or local note), OpenAI, Server (listen + model dir + optional binary path), Load, Advanced, Extra flags, Command preview, Setup (after save). vLLM uses a **Docker image** field and **Model to serve**. Preview is `docker run … vllm serve`.

Advanced **Jinja** reveals a textarea for the chat template used on start (`--jinja` then `--chat-template`). Leave it empty to keep the model's built-in template. With Jinja off, Chat template is a single-line built-in name (`chatml`, `llama3`, …).

See [[local-vs-ssh]] for the localhost path.

## Related

[[architecture]] · [[api]] · [[runbook]]
