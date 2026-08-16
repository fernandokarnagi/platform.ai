---
title: Data model
tags: [data, mongodb]
updated: 2026-08-16
---

# Data model

Database name: `platformai`. Test DB: `platformai_test`.

## `clusters`

| Field | Notes |
|---|---|
| `name` | required, unique |
| `engine` | v1 always `llama.cpp` |
| `description` | optional |
| `createdAt` / `updatedAt` | |

Delete is **409** `Cluster has nodes` while any node remains.

## `nodes`

| Field | Notes |
|---|---|
| `clusterId` | ObjectId |
| `name`, `host` | host may be `localhost` / `127.0.0.1` / `::1` / `0.0.0.0` |
| `sshPort` | default 22 — unused when local |
| `sshAuthType` | `password` \| `private_key` \| `none` |
| `sshUser` / `sshPassword` / `sshPrivateKey` / `sshPassphrase` | empty when local |
| `openaiBaseUrl` | e.g. `http://127.0.0.1:8080/v1` |
| `openaiApiKey`, `hfToken` | optional |
| `listenHost` / `listenPort` | default `0.0.0.0` / `8080` |
| `modelDir` | default `~/models` |
| `llamaServerPath` | optional full path to `llama-server`; empty = auto-detect |
| `serverParams` | see [[llama-cpp-engine]] |
| `lastStart` | `{ modelFilename, argv, startedAt }` or null |
| `lastOpenAICheck` | `{ openai, checkedAt, models, detail }` — last `/v1/models` probe |
| `statusCache` | `{ ssh, openai, running, pid, models, detail, checkedAt }` — full probe, reused for 30 min |
| `modelsCache` | `{ items, checkedAt }` — GGUF dir listing, reused for 30 min |

API responses use camelCase. Mongo `_id` becomes `id`. Responses include SSH secrets so the local edit form can round-trip.

## Related

[[local-vs-ssh]] · [[api]] · [[decisions]]
