# Graph Report - platform.ai  (2026-08-18)

## Corpus Check
- 99 files · ~47,321 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 609 nodes · 1015 edges · 59 communities (52 shown, 7 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 23 edges (avg confidence: 0.73)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `e383f5c0`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- test_helpers.py
- nodes.py
- types.ts
- models.py
- NodeDetailScreen.tsx
- test_ssh.py
- ServerParamsFields.tsx
- test_clusters.py
- StatusIcon.tsx
- NodeFormScreen.tsx
- test_nodes.py
- test_openai_proxy.py
- ClusterDetailScreen.tsx
- Architecture
- llama.cpp engine
- Platform.AI
- post-commit
- start.sh
- format.ts
- app.json
- post-checkout
- clusterService.ts
- stop.sh
- AGENTS.md
- pre-commit
- update-brain.sh
- test_llama_cpp_argv.py
- test_engine_lifecycle.py
- test_status_cache.py
- nodeService.ts
- api-map.md
- DownloadsScreen.tsx
- Platform.AI
- Data model
- Local vs SSH
- _ai — Platform.AI brain
- Runbook
- UI
- downloadService.ts
- Locked decisions
- API
- status_cache.py
- test_openai_proxy.py
- EngineParamsModal.tsx
- Platform.AI
- API
- get_engine
- VllmMetalEngine

## God Nodes (most connected - your core abstractions)
1. `VllmEngine` - 32 edges
2. `LlamaCppEngine` - 30 edges
3. `_require_node()` - 17 edges
4. `VllmMetalEngine` - 15 edges
5. `get_engine()` - 14 edges
6. `ForbiddenExtraFlagsError` - 12 edges
7. `_engine_for()` - 12 edges
8. `_seed()` - 12 edges
9. `start_engine()` - 11 edges
10. `node_helper()` - 11 edges

## Surprising Connections (you probably didn't know these)
- `VllmEngine` --uses--> `ForbiddenExtraFlagsError`  [INFERRED]
  api/engines/vllm.py → api/engines/llama_cpp.py
- `VllmEngine` --uses--> `LlamaCppEngine`  [INFERRED]
  api/engines/vllm.py → api/engines/llama_cpp.py
- `FakeResult` --uses--> `LlamaCppEngine`  [INFERRED]
  api/tests/test_models_ops.py → api/engines/llama_cpp.py
- `VllmMetalEngine` --uses--> `VllmEngine`  [INFERRED]
  api/engines/vllm_metal.py → api/engines/vllm.py
- `cancel_download()` --calls--> `get_engine()`  [EXTRACTED]
  api/routes/downloads.py → api/engines/__init__.py

## Import Cycles
- None detected.

## Communities (59 total, 7 thin omitted)

### Community 1 - "test_helpers.py"
Cohesion: 0.11
Nodes (39): apply_node_location(), cluster_helper(), default_server_params(), download_helper(), is_local_host(), is_local_node(), _iso(), _last_openai_check() (+31 more)

### Community 2 - "nodes.py"
Cohesion: 0.11
Nodes (40): is_docker_vllm(), is_vllm_engine(), get_logger(), DeleteModelIn, StartEngineIn, chat(), _cluster_engine_name(), _confirm_vllm_stayed_up() (+32 more)

### Community 3 - "types.ts"
Cohesion: 0.06
Nodes (35): CacheType, ChatCompletion, ChatIn, ChatMessage, Cluster, ClusterIn, ClusterUpdate, DownloadJob (+27 more)

### Community 4 - "models.py"
Cohesion: 0.18
Nodes (20): CacheType, ChatIn, ChatMessage, ClusterIn, ClusterUpdate, DownloadModelIn, EngineType, FitMode (+12 more)

### Community 5 - "NodeDetailScreen.tsx"
Cohesion: 0.22
Nodes (8): ChatTurn, errorMessage(), formatBytes(), formatStamp(), newestFirst(), NodeDetailScreen(), parseOptionalInt(), parseOptionalNumber()

### Community 6 - "test_ssh.py"
Cohesion: 0.09
Nodes (21): _exc_text(), run_command(), _run_local(), SshError, SshResult, body_from_cache(), get_engine(), get_status() (+13 more)

### Community 7 - "ServerParamsFields.tsx"
Cohesion: 0.29
Nodes (8): CACHE_TYPES, errorMessage(), gpuMode(), INFO, parseOptionalInt(), parseRequiredInt(), ServerParamsFields(), ServerParamsFieldsProps

### Community 8 - "test_clusters.py"
Cohesion: 0.35
Nodes (10): _client(), test_create_and_list_cluster(), test_create_vllm_cluster(), test_create_vllm_metal_cluster(), test_delete_cluster_cascade_removes_nodes(), test_delete_cluster_with_nodes_conflict(), test_delete_cluster_without_nodes(), test_get_missing_cluster() (+2 more)

### Community 10 - "NodeFormScreen.tsx"
Cohesion: 0.39
Nodes (5): defaultServerParams(), errorMessage(), mergeServerParams(), NodeFormScreen(), parseRequiredInt()

### Community 11 - "test_nodes.py"
Cohesion: 0.60
Nodes (5): _node_payload(), test_delete_cluster_blocked_when_nodes_exist(), test_delete_node(), test_register_list_get_node(), test_register_node_on_missing_cluster()

### Community 12 - "test_openai_proxy.py"
Cohesion: 0.11
Nodes (25): _download_fake_run(), FakeResult, _seed(), test_delete_download_removes_row(), test_download_cancel(), test_download_hf_resolves_ollama_quant(), test_download_retry_cancelled(), test_download_retry_failed() (+17 more)

### Community 13 - "ClusterDetailScreen.tsx"
Cohesion: 0.47
Nodes (4): ClusterDetailScreen(), errorMessage(), NodeProbe, probeFromNode()

### Community 14 - "Architecture"
Cohesion: 0.40
Nodes (5): Architecture, Key modules, Processes, Related, Rules

### Community 15 - "llama.cpp engine"
Cohesion: 0.33
Nodes (5): Install, Launch params, llama.cpp engine, Process, Related

### Community 16 - "Platform.AI"
Cohesion: 0.40
Nodes (4): graphify, Layout, Platform.AI, Working rules

### Community 17 - "post-commit"
Cohesion: 0.40
Nodes (4): post-commit script, GRAPHIFY_CHANGED, GRAPHIFY_REBUILD_LOG, PYTHONHASHSEED

### Community 18 - "start.sh"
Cohesion: 0.70
Nodes (4): cleanup(), log(), start.sh script, wait_port()

### Community 19 - "format.ts"
Cohesion: 0.70
Nodes (4): formatDateTime(), formatFileTime(), formatInSgt(), parseInstant()

### Community 20 - "app.json"
Cohesion: 0.50
Nodes (3): alwaysUpdateLinks, newLinkFormat, useMarkdownLinks

### Community 21 - "post-checkout"
Cohesion: 0.50
Nodes (3): post-checkout script, GRAPHIFY_REBUILD_LOG, PYTHONHASHSEED

### Community 23 - "clusterService.ts"
Cohesion: 0.67
Nodes (3): api(), clusterService, readDetail()

### Community 33 - "test_llama_cpp_argv.py"
Cohesion: 0.09
Nodes (13): _flag_value(), ForbiddenExtraFlagsError, LlamaCppEngine, _node(), test_chat_template_without_jinja_still_emits(), test_defaults_include_owned_flags_and_omit_optional(), test_extra_flags_appended_last(), test_forbidden_extra_flags() (+5 more)

### Community 34 - "test_engine_lifecycle.py"
Cohesion: 0.13
Nodes (16): FakeResult, _seed(), _seed_vllm(), _seed_vllm_metal(), test_engine_logs_missing(), test_engine_logs_tail(), test_restart_without_last_start(), test_start_already_running() (+8 more)

### Community 35 - "test_status_cache.py"
Cohesion: 0.07
Nodes (21): _flag_value(), _image(), _is_hub_model(), _model_arg(), _quote_parts(), VllmEngine, test_vllm_cancel_can_keep_partial(), test_vllm_start_download_keeps_partial_and_records_child_pid() (+13 more)

### Community 36 - "nodeService.ts"
Cohesion: 0.33
Nodes (4): api(), ApiError, nodeService, readDetail()

### Community 37 - "api-map.md"
Cohesion: 0.18
Nodes (7): Generated API map, Generated file map, Generated, Brain, First run, Related, Runbook

### Community 38 - "DownloadsScreen.tsx"
Cohesion: 0.70
Nodes (4): DownloadsScreen(), errorMessage(), formatBytes(), statusLabel()

### Community 39 - "Platform.AI"
Cohesion: 0.50
Nodes (4): Generated, Platform.AI, Read in this order, Repo map

### Community 40 - "Data model"
Cohesion: 0.50
Nodes (4): `clusters`, Data model, `nodes`, Related

### Community 41 - "Local vs SSH"
Cohesion: 0.40
Nodes (4): Local vs SSH, Localhost, Related, Remote

### Community 42 - "_ai — Platform.AI brain"
Cohesion: 0.50
Nodes (4): _ai — Platform.AI brain, Always update, Layout, Rules

### Community 43 - "Runbook"
Cohesion: 0.33
Nodes (7): errorMessage(), INFO, parseOptionalInt(), parseRequiredFloat(), parseRequiredInt(), VllmParamsFields(), VllmParamsFieldsProps

### Community 44 - "UI"
Cohesion: 0.50
Nodes (4): Node form, Related, Routes, UI

### Community 45 - "downloadService.ts"
Cohesion: 0.67
Nodes (3): api(), downloadService, readDetail()

### Community 46 - "Locked decisions"
Cohesion: 0.67
Nodes (3): Locked decisions, Out of v1, Related

### Community 47 - "API"
Cohesion: 0.33
Nodes (6): Install, Launch params, Models, Process, Related, vLLM engine

### Community 52 - "status_cache.py"
Cohesion: 0.36
Nodes (4): defaultListenPort(), engineBinaryName(), isVllm(), previewEnginePath()

### Community 54 - "EngineParamsModal.tsx"
Cohesion: 0.47
Nodes (5): display(), EngineParamsModal(), EngineParamsSource, Row, rowsFor()

### Community 55 - "Platform.AI"
Cohesion: 0.50
Nodes (3): First run, Platform.AI, Start

### Community 57 - "get_engine"
Cohesion: 0.11
Nodes (21): get_engine(), lifespan(), PreviewIn, cancel_download(), delete_download(), retry_download(), preview_engine(), watch_downloads() (+13 more)

### Community 58 - "VllmMetalEngine"
Cohesion: 0.15
Nodes (10): Native vLLM on Apple Silicon (vllm-metal / MLX). Same serve argv as ROCm, no Doc, VllmMetalEngine, _node(), test_argv_matches_vllm_serve(), test_forbidden_extra_flags(), test_preview_is_native_vllm_not_docker(), test_preview_uses_configured_path(), test_resolve_prefers_venv() (+2 more)

## Knowledge Gaps
- **96 isolated node(s):** `Read in this order`, `Repo map`, `Generated`, `Related`, `Rules` (+91 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `VllmEngine` connect `test_status_cache.py` to `test_llama_cpp_argv.py`, `VllmMetalEngine`, `get_engine`?**
  _High betweenness centrality (0.046) - this node is a cross-community bridge._
- **Why does `LlamaCppEngine` connect `test_llama_cpp_argv.py` to `VllmMetalEngine`, `test_status_cache.py`, `test_openai_proxy.py`?**
  _High betweenness centrality (0.044) - this node is a cross-community bridge._
- **Why does `ForbiddenExtraFlagsError` connect `test_llama_cpp_argv.py` to `nodes.py`, `test_status_cache.py`, `test_ssh.py`, `get_engine`, `VllmMetalEngine`?**
  _High betweenness centrality (0.024) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `VllmEngine` (e.g. with `VllmMetalEngine` and `ForbiddenExtraFlagsError`) actually correct?**
  _`VllmEngine` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `LlamaCppEngine` (e.g. with `VllmEngine` and `FakeResult`) actually correct?**
  _`LlamaCppEngine` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Read in this order`, `Repo map`, `Generated` to the rest of the system?**
  _96 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `test_helpers.py` be split into smaller, more focused modules?**
  _Cohesion score 0.11382113821138211 - nodes in this community are weakly interconnected._