---
title: Generated API map
tags: [generated, api]
updated: 2026-08-17
---

# Generated API map

Written by `scripts/update-brain.sh` on 2026-08-17. Do not edit.

| Method | Path | File |
|---|---|---|
| GET | `/clusters` | `clusters.py` |
| POST | `/clusters` | `clusters.py` |
| DELETE | `/clusters/{cluster_id}` | `clusters.py` |
| GET | `/clusters/{cluster_id}` | `clusters.py` |
| PUT | `/clusters/{cluster_id}` | `clusters.py` |
| GET | `/clusters/{cluster_id}/nodes` | `nodes.py` |
| POST | `/clusters/{cluster_id}/nodes` | `nodes.py` |
| GET | `/downloads` | `downloads.py` |
| DELETE | `/downloads/{job_id}` | `downloads.py` |
| GET | `/downloads/{job_id}` | `downloads.py` |
| POST | `/downloads/{job_id}/cancel` | `downloads.py` |
| POST | `/downloads/{job_id}/retry` | `downloads.py` |
| POST | `/engines/{engine_name}/preview` | `engines.py` |
| GET | `/health` | `main.py` |
| DELETE | `/nodes/{node_id}` | `nodes.py` |
| GET | `/nodes/{node_id}` | `nodes.py` |
| PUT | `/nodes/{node_id}` | `nodes.py` |
| POST | `/nodes/{node_id}/chat` | `nodes.py` |
| GET | `/nodes/{node_id}/engine` | `nodes.py` |
| GET | `/nodes/{node_id}/engine/logs` | `nodes.py` |
| POST | `/nodes/{node_id}/engine/restart` | `nodes.py` |
| POST | `/nodes/{node_id}/engine/start` | `nodes.py` |
| POST | `/nodes/{node_id}/engine/stop` | `nodes.py` |
| DELETE | `/nodes/{node_id}/models` | `nodes.py` |
| GET | `/nodes/{node_id}/models` | `nodes.py` |
| POST | `/nodes/{node_id}/models/download` | `nodes.py` |
| GET | `/nodes/{node_id}/models/huggingface` | `nodes.py` |
| GET | `/nodes/{node_id}/models/openai` | `nodes.py` |
| GET | `/nodes/{node_id}/status` | `nodes.py` |
| POST | `/nodes/{node_id}/test-ssh` | `nodes.py` |
