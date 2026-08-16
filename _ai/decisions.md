---
title: Decisions
tags: [decisions]
updated: 2026-08-16
---

# Locked decisions

| Topic | Choice |
|---|---|
| Access | No login. Local single operator. |
| First nodes | Two Macs; Linux path exists. Localhost = this machine, no SSH. |
| Engine install | Manual Homebrew. UI shows steps only. |
| Process control | App-managed `llama-server`. PID file + last start. |
| Model source | Hugging Face or direct `.gguf` URL. |
| Shape | CTC local control plane: React + FastAPI + Mongo-in-Docker. |
| Ports | API `8091`, UI `3091`, Mongo `27091`. |
| Mongo container | `platformai-mongodb`. DB `platformai`. |
| Launch params | LM Studio-style fields + extraFlags escape hatch. |
| Chat | Non-streaming, API-proxied. |
| Look | Agent OS / `claude.sessions` dark theme. |
| Brain | `_ai/` Obsidian vault. Generated notes via `scripts/update-brain.sh`. |

## Out of v1

Auth, streaming chat, auto-install, encryption at rest, multi-process per node, vLLM / SGLang / Ollama implementations, K8s / GitLab CI.

## Related

[[architecture]] · [[00-index]]
