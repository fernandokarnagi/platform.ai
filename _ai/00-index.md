---
title: Platform.AI — Index
tags: [moc, platform-ai]
updated: 2026-08-18
---

# Platform.AI

Local control plane for llama.cpp and vLLM inferencing clusters. React UI talks only to FastAPI. FastAPI owns Mongo, SSH (or local shell), and OpenAI-compatible proxies.

## Read in this order

1. [[architecture]] — three processes, who talks to whom
2. [[data-model]] — clusters and nodes
3. [[local-vs-ssh]] — localhost needs no SSH
4. [[llama-cpp-engine]] — llama.cpp launch params and process control
5. [[vllm-engine]] — vLLM launch params, snapshots, process control
6. [[api]] — HTTP surface (see also [[generated/api-map]])
7. [[ui]] — screens and Agent OS look
8. [[runbook]] — `./start.sh`
9. [[decisions]] — locked product choices

## Repo map

```
api/           FastAPI on :8091
ui/            Vite React on :3091
docker-compose.yml   Mongo only — platformai-mongodb :27091
start.sh / stop.sh
docs/superpowers/    spec + implementation plan
_ai/           this vault
```

> [!warning]
> No login. The API stores SSH secrets as entered. Bind it to the laptop. Do not expose it.

## Generated

![[generated/api-map]]
