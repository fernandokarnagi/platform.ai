---
title: vLLM engine
tags: [vllm, engine]
updated: 2026-08-22
---

# vLLM engine

Two cluster engines, same `vllm serve` argv and Hugging Face snapshot models. Process control differs.

| Cluster engine | Class | Host | How it runs |
|---|---|---|---|
| `vllm` | `VllmEngine` | AMD/ROCm Linux | Docker `rocm/vllm` |
| `vllm-metal` | `VllmMetalEngine` | Apple Silicon Mac | native `~/.venv-vllm-metal/bin/vllm` |

Existing clusters with `engine: vllm` stay ROCm Docker. Pick **vLLM Mac Metal** (`vllm-metal`) for a Mac.

## Install

Manual. The API never installs the engine.

**ROCm Linux (`vllm`):** the node needs `docker`, groups `video` / `render` / `docker`, `/dev/kfd`, and `/dev/dri`. Default image: `rocm/vllm:rocm7.14.0_cdna_ubuntu24.04_py3.14_pytorch_2.11.0_vllm_0.23.0` (Instinct / CDNA). Radeon uses the `rdna` tag. Override with `vllmImage`. Do not run the CUDA pip `vllm` on an AMD box.

**Mac Metal (`vllm-metal`):** Apple Silicon, native arm64 Python 3.12. Do **not** rely on `curl … raw.githubusercontent.com … | bash` — that URL 429s. Clone and run the script:

```
git clone --depth 1 https://github.com/vllm-project/vllm-metal.git ~/App/vllm-metal
cd ~/App/vllm-metal && ./install.sh
```

Local `./install.sh` puts the CLI at `~/App/vllm-metal/.venv-vllm-metal/bin/vllm`. The curl path (when GitHub allows it) uses `~/.venv-vllm-metal/bin/vllm`. Override with `llamaServerPath` (shown as **vLLM path**).

If `./install.sh` dies on `xcodebuild` / Metal toolchain, the Python plugin is already installed. Overlay the prebuilt wheel from the [vllm-metal releases](https://github.com/vllm-project/vllm-metal/releases) so paged attention does not need a local compile.

## Launch params

Preview and Start emit the same serve argv:

`vllm serve MODEL --host --port --tensor-parallel-size --gpu-memory-utilization`

ROCm Start: `docker rm -f platformai-vllm` then `docker run -d --name platformai-vllm … vllm serve …`

ROCm Stop: `docker stop platformai-vllm` then `docker rm -f platformai-vllm`

Metal Start: `nohup ~/.venv-vllm-metal/bin/vllm serve … > ~/.platformai/vllm.log` + pid file

Metal Stop: kill the pid in `~/.platformai/vllm.pid`

`MODEL` is `selectedModel` (or the start payload). A local folder name is joined to the model dir and that dir is bind-mounted into the container.

Owned by the form — extraFlags may **not** contain `--host`, `--port`, `--model`, `-m` (400).

Preview: `POST /engines/vllm/preview`. Start, dry-run, and preview merge Settings `vllm` into empty node fields first.

Sampling stays on Chat.

Long-context snapshots (Qwen 256k, etc.) use the model default `max_model_len` when that field is empty. After weights load, leftover KV cache is often too small and EngineCore dies. Set **Max model length** on the node (32768 is a safe start; the log also prints an estimated max). `ctc-vllm` is capped at 32768 for `Qwen--Qwen3.8-27B`.

## Models

List = directories under `modelDir` that contain `config.json`.

Download from Hugging Face pulls a full snapshot (`hf` CLI, then `huggingface_hub`) into `modelDir/org--model`. The downloader uses `setsid -f` on Linux so SSH logout does not kill `hf` and the stored pid is the bash child, not the short-lived `setsid` parent. macOS has no `setsid` and uses `nohup` only. Progress treats `config.json` in the dest dir as done even if the wrapper pid vanished. Watcher parsing ignores tqdm `\r` fragments so a live snapshot is not marked **download stopped**. Retry kills the previous `hf` but keeps `.partial` so Hugging Face can resume. Do not Retry a still-running snapshot — that used to `rm -rf` the folder and start a second `hf` against the same lock.

Do not point vLLM at a `*-GGUF` repo — download the original safetensors model (`org/model`, not `org/model-GGUF`).

## Process

| Item | ROCm (`vllm`) | Metal (`vllm-metal`) |
|---|---|---|
| Process | container `platformai-vllm` | pid `~/.platformai/vllm.pid` |
| Running check | `docker inspect` State.Running | `kill -0` on the pid |
| Log | `docker logs --tail N platformai-vllm` | `~/.platformai/vllm.log` |

Start writes `lastStart` only after the process is running. Restart is stop then start with current `serverParams` + the selected model.

## Related

[[llama-cpp-engine]] · [[data-model]] · [[local-vs-ssh]]
