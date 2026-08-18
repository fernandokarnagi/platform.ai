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
| Engine install | Manual. UI shows Homebrew for llama.cpp, Docker/ROCm for vLLM Linux, vllm-metal install script for Mac Metal. |
| Process control | App-managed `llama-server`, Docker `vllm serve` (ROCm), or native `vllm serve` (Mac Metal). Engine-specific PID/container + last start. |
| Model source | Hugging Face GGUF (llama.cpp) or HF snapshot / repo id (vLLM). |
| Shape | CTC local control plane: React + FastAPI + Mongo-in-Docker. |
| Ports | API `8091`, UI `3091`, Mongo `27091`. |
| Mongo container | `platformai-mongodb`. DB `platformai`. |
| Launch params | LM Studio-style fields + extraFlags escape hatch. |
| Chat | Non-streaming, API-proxied. |
| Look | Agent OS / `claude.sessions` dark theme. |
| Brain | `_ai/` Obsidian vault. Generated notes via `scripts/update-brain.sh`. |

## Out of v1

Auth, streaming chat, auto-install, encryption at rest, multi-process per node, SGLang / Ollama, K8s / GitLab CI.

## Related

[[architecture]] · [[00-index]]
