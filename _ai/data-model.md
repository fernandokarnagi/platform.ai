---
title: Data model
tags: [data, mongodb]
updated: 2026-08-22
---

# Data model

Database name: `platformai`. Test DB: `platformai_test`.

## `clusters`

| Field | Notes |
|---|---|
| `name` | required, unique |
| `engine` | `llama.cpp`, `vllm` (AMD ROCm Linux / Docker), or `vllm-metal` (Mac Metal / native) |
| `description` | optional |
| `hfToken` | optional. Nodes with an empty `hfToken` inherit this for Hugging Face list/download/retry. |
| `createdAt` / `updatedAt` | |

Delete is **409** `Cluster has nodes` while any node remains.

## `settings`

Singleton `_id: app`. Common configuration for the whole control plane.

| Field | Notes |
|---|---|
| `hfToken` | optional. Used for Hugging Face list/download/retry when cluster and node tokens are empty |
| `libraryDir` | path on the control plane for the model library. Default `/Users/fernando.karnagi/App/globalmodel`. Empty reads as that default. Layout: `llama.cpp/*.gguf`, `vllm/org--model/` snapshots |
| `llamaCpp` | optional launch params. Used when a llama.cpp node leaves a field empty. See [[llama-cpp-engine]] |
| `vllm` | optional launch params for ROCm and Mac Metal. Used when a vLLM node leaves a field empty. See [[vllm-engine]] |
| `createdAt` / `updatedAt` | |

GET returns defaults when the document is missing. PUT upserts.

Hugging Face token resolution: payload → node → cluster → Settings.

llama.cpp launch params: node field → Settings `llamaCpp` → engine defaults (`ctxSize` 0, `gpuLayers` auto, `parallel` 1, `kvOffload` on, `fit` on). Empty string and `null` inherit. `0` and `false` are real values.

vLLM launch params: node field → Settings `vllm` → engine defaults (`tensorParallelSize` 1, `gpuMemoryUtilization` 0.9). Same empty/`null` inherit rule.

## `nodes`

| Field | Notes |
|---|---|
| `clusterId` | ObjectId |
| `name`, `host` | host may be `localhost` / `127.0.0.1` / `::1` / `0.0.0.0` |
| `sshPort` | default 22 — unused when local |
| `sshAuthType` | `password` \| `private_key` \| `none` |
| `sshUser` / `sshPassword` / `sshPrivateKey` / `sshPassphrase` | empty when local |
| `openaiBaseUrl` | e.g. `http://127.0.0.1:8080/v1` |
| `openaiApiKey`, `hfToken` | optional. Empty `hfToken` inherits cluster, then Settings. |
| `requestLog` | last 50 proxied chats: `at`, `model`, `latencyMs`, `promptTokens`, `completionTokens`, `ok`, `error`. Not on GET node. |
| `listenHost` / `listenPort` | default `0.0.0.0` / `8080` |
| `modelDir` | default `~/models` |
| `engine` | copied from the parent cluster on create |
| `llamaServerPath` | optional full path to `llama-server` or the Metal `vllm` CLI; empty = auto-detect |
| `vllmImage` | ROCm Docker image for `vllm`; unused on `vllm-metal`; empty = Instinct CDNA default |
| `selectedModel` | required to start vLLM (local folder or `org/model`) |
| `serverParams` | see [[llama-cpp-engine]] or [[vllm-engine]] |
| `lastStart` | `{ modelFilename, argv, startedAt }` or null |
| `lastOpenAICheck` | `{ openai, checkedAt, models, detail }` — last `/v1/models` probe |
| `statusCache` | `{ ssh, openai, running, pid, models, detail, checkedAt }` — full probe, reused for 30 min |
| `modelsCache` | `{ items, checkedAt }` — model dir listing, reused for 30 min |

API responses use camelCase. Mongo `_id` becomes `id`. Responses include SSH secrets so the local edit form can round-trip.

## Related

[[local-vs-ssh]] · [[api]] · [[decisions]] · [[vllm-engine]]
