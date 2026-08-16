---
title: UI
tags: [ui]
updated: 2026-08-16
---

# UI

Vite React on `:3091`. Theme copied from `claude.sessions` / Agent OS: GitHub-night (`#0d1117` / `#161b22` / accent `#58a6ff`), sticky top bar, cards, pills.

Tokens and shared classes live in `ui/index.css`.

## Routes

| Path | Screen |
|---|---|
| `/` | Cluster list |
| `/clusters/:id` | Cluster detail (nodes table + probes) |
| `/clusters/:id/nodes/new` | Register node |
| `/nodes/:id` | Node detail — chat 75% left; combined status/engine + models on the right |
| `/nodes/:id/edit` | Edit node |

No login screen.

Command preview has **Copy**. Each form parameter has an **i** button that opens the purpose on click.

Node table: Access, Engine, OpenAI (healthy/down + last check time), Model. OpenAI and the old Status column are the same check.

Cluster list **Nodes** is live `running / stopped`, not a bare count. Timestamps are SGT (`Asia/Singapore`), format `DD-MMM-YYYY HH:mm`. Naive API ISO strings are UTC.

Edit and delete live on the detail page only. Cluster list and the node table have no action buttons. Cluster delete with nodes asks first, then `DELETE /clusters/{id}?cascade=true`.

## Node form

Sections: Identity, SSH (or local note), OpenAI, Server, Load, Advanced, Extra flags, Command preview, Setup (after save).

See [[local-vs-ssh]] for the localhost path.

## Related

[[architecture]] · [[api]] · [[runbook]]
