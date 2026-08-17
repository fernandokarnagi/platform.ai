---
title: vLLM engine
tags: [vllm, engine]
updated: 2026-08-17
---

# vLLM engine

`VllmEngine` in `api/engines/vllm.py` turns `serverParams` + a selected model into a **Docker** `vllm serve` command. Use this for AMD/ROCm Linux (Instinct MI210 = `gfx90a`). Pick `engine: vllm` when you create the cluster.

## Install

Manual. The UI shows Docker + ROCm steps. The API never installs the engine.

The node needs `docker`, groups `video` / `render` / `docker`, `/dev/kfd`, and `/dev/dri`. Default image: `rocm/vllm:rocm7.14.0_cdna_ubuntu24.04_py3.14_pytorch_2.11.0_vllm_0.23.0` (Instinct / CDNA). Radeon uses the `rdna` tag. Override with `vllmImage`.

Do not run the CUDA pip `vllm` on an AMD box.

## Launch params

Preview and Start emit:

`docker run … IMAGE vllm serve MODEL --host --port --tensor-parallel-size --gpu-memory-utilization`

Start: `docker rm -f platformai-vllm` then `docker run -d --name platformai-vllm … vllm serve …`

Stop: `docker stop platformai-vllm` then `docker rm -f platformai-vllm`

`MODEL` is `selectedModel` (or the start payload). A local folder name is joined to the model dir and that dir is bind-mounted into the container.

Owned by the form — extraFlags may **not** contain `--host`, `--port`, `--model`, `-m` (400).

Preview: `POST /engines/vllm/preview`.

Sampling stays on Chat.

## Models

List = directories under `modelDir` that contain `config.json`.

Download from Hugging Face pulls a full snapshot (`hf` CLI, then `huggingface_hub`) into `modelDir/org--model`. The downloader uses `setsid` so SSH logout does not kill `hf`. Progress treats `config.json` in the dest dir as done even if the wrapper pid vanished.

Do not point vLLM at a `*-GGUF` repo — download the original safetensors model (`org/model`, not `org/model-GGUF`).

## Process

| Item | Value |
|---|---|
| Container | `platformai-vllm` |
| Running check | `docker inspect` State.Running |
| Log | `docker logs --tail N platformai-vllm` |

Start writes `lastStart` only after the container is running. Restart is stop then start with current `serverParams` + the selected model.

## Related

[[llama-cpp-engine]] · [[data-model]] · [[local-vs-ssh]]
