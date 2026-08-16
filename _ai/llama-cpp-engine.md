---
title: llama.cpp engine
tags: [llama-cpp, engine]
updated: 2026-08-16
---

# llama.cpp engine

`LlamaCppEngine` in `api/engines/llama_cpp.py` is the only place that turns `serverParams` into argv.

## Install

Manual. The UI shows Homebrew steps. The API never installs the engine. See [[ui]].

## Launch params

Always emitted: `--ctx-size` (even 0), `--n-gpu-layers`, `--flash-attn`, `--parallel`, `--kv-offload` / `--no-kv-offload`, `--fit`.

Owned by the form — extraFlags may **not** contain `-m`, `--model`, `--host`, `--port` (400).

Preview: `POST /engines/llama.cpp/preview`. UI never concatenates argv for execution.

Sampling (`temperature`, `top-p`) is Chat, not launch.

## Process

| File | Path |
|---|---|
| PID | `~/.platformai/llama-server.pid` |
| Log | `~/.platformai/llama-server.log` |

Start writes `lastStart` only after a live pid (`kill -0`). Restart rebuilds argv from **current** `serverParams` + `lastStart.modelFilename`.

## Related

[[local-vs-ssh]] · [[data-model]] · [[decisions]]
