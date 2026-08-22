# Graph Report - platform.ai  (2026-08-17)

## Corpus Check
- 91 files · ~39,852 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 476 nodes · 806 edges · 55 communities (48 shown, 7 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 15 edges (avg confidence: 0.76)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `fd9ec3f1`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- 00-index.md
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

## God Nodes (most connected - your core abstractions)
1. `LlamaCppEngine` - 29 edges
2. `run_command()` - 20 edges
3. `_require_node()` - 18 edges
4. `node_helper()` - 16 edges
5. `download_model()` - 13 edges
6. `start_engine()` - 12 edges
7. `_seed()` - 11 edges
8. `parse_object_id()` - 11 edges
9. `get_status()` - 10 edges
10. `_node()` - 9 edges

## Surprising Connections (you probably didn't know these)
- `FakeResult` --uses--> `LlamaCppEngine`  [INFERRED]
  api/tests/test_models_ops.py → api/engines/llama_cpp.py
- `test_is_local_node_uses_type_first()` --calls--> `is_local_node()`  [EXTRACTED]
  api/tests/test_helpers.py → api/helpers.py
- `test_timeout_error_message_is_not_empty()` --calls--> `_exc_text()`  [EXTRACTED]
  api/tests/test_ssh.py → api/services/ssh.py
- `test_run_command_bad_private_key_is_ssh_error()` --calls--> `run_command()`  [EXTRACTED]
  api/tests/test_ssh.py → api/services/ssh.py
- `test_run_command_localhost_skips_ssh()` --calls--> `run_command()`  [EXTRACTED]
  api/tests/test_ssh.py → api/services/ssh.py

## Import Cycles
- None detected.

## Communities (55 total, 7 thin omitted)

### Community 1 - "test_helpers.py"
Cohesion: 0.11
Nodes (41): apply_node_location(), cluster_helper(), default_server_params(), download_helper(), is_local_host(), _iso(), _last_openai_check(), models_cache_helper() (+33 more)

### Community 2 - "nodes.py"
Cohesion: 0.12
Nodes (38): is_local_node(), DeleteModelIn, StartEngineIn, chat(), delete_model(), delete_node(), download_model(), engine_logs() (+30 more)

### Community 3 - "types.ts"
Cohesion: 0.06
Nodes (35): CacheType, ChatCompletion, ChatIn, ChatMessage, Cluster, ClusterIn, ClusterUpdate, DownloadJob (+27 more)

### Community 4 - "models.py"
Cohesion: 0.15
Nodes (23): CacheType, ChatIn, ChatMessage, ClusterIn, ClusterUpdate, DownloadModelIn, EngineType, FitMode (+15 more)

### Community 5 - "NodeDetailScreen.tsx"
Cohesion: 0.22
Nodes (8): ChatTurn, errorMessage(), formatBytes(), formatStamp(), newestFirst(), NodeDetailScreen(), parseOptionalInt(), parseOptionalNumber()

### Community 6 - "test_ssh.py"
Cohesion: 0.18
Nodes (4): FakeResult, test_run_command_bad_private_key_is_ssh_error(), test_run_command_localhost_skips_ssh(), test_timeout_error_message_is_not_empty()

### Community 7 - "ServerParamsFields.tsx"
Cohesion: 0.29
Nodes (8): CACHE_TYPES, errorMessage(), gpuMode(), INFO, parseOptionalInt(), parseRequiredInt(), ServerParamsFields(), ServerParamsFieldsProps

### Community 8 - "test_clusters.py"
Cohesion: 0.42
Nodes (8): _client(), test_create_and_list_cluster(), test_delete_cluster_cascade_removes_nodes(), test_delete_cluster_with_nodes_conflict(), test_delete_cluster_without_nodes(), test_get_missing_cluster(), test_invalid_cluster_id(), test_list_cluster_reports_stopped_nodes()

### Community 10 - "NodeFormScreen.tsx"
Cohesion: 0.39
Nodes (5): defaultServerParams(), errorMessage(), mergeServerParams(), NodeFormScreen(), parseRequiredInt()

### Community 11 - "test_nodes.py"
Cohesion: 0.60
Nodes (5): _node_payload(), test_delete_cluster_blocked_when_nodes_exist(), test_delete_node(), test_register_list_get_node(), test_register_node_on_missing_cluster()

### Community 12 - "test_openai_proxy.py"
Cohesion: 0.16
Nodes (15): _download_fake_run(), FakeResult, _seed(), test_download_cancel(), test_download_hf_resolves_ollama_quant(), test_download_retry_cancelled(), test_download_retry_failed(), test_download_url_and_hf() (+7 more)

### Community 13 - "ClusterDetailScreen.tsx"
Cohesion: 0.47
Nodes (4): ClusterDetailScreen(), errorMessage(), NodeProbe, probeFromNode()

### Community 14 - "Architecture"
Cohesion: 0.40
Nodes (5): Architecture, Key modules, Processes, Related, Rules

### Community 15 - "llama.cpp engine"
Cohesion: 0.40
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
Cohesion: 0.08
Nodes (18): _flag_value(), ForbiddenExtraFlagsError, LlamaCppEngine, cancel_download(), retry_download(), preview_llama_cpp(), _node(), test_chat_template_without_jinja_still_emits() (+10 more)

### Community 34 - "test_engine_lifecycle.py"
Cohesion: 0.22
Nodes (9): FakeResult, _seed(), test_engine_logs_missing(), test_engine_logs_tail(), test_restart_without_last_start(), test_start_already_running(), test_start_dead_pid_does_not_persist_last_start(), test_start_llama_server_not_found() (+1 more)

### Community 35 - "test_status_cache.py"
Cohesion: 0.44
Nodes (7): _client(), FakeResult, _make_node(), test_cluster_list_uses_status_cache_not_live_probe(), test_stale_status_cache_is_refreshed(), test_status_cached_for_thirty_minutes(), test_status_check_probes_one_part()

### Community 36 - "nodeService.ts"
Cohesion: 0.33
Nodes (4): api(), ApiError, nodeService, readDetail()

### Community 37 - "api-map.md"
Cohesion: 0.29
Nodes (3): Generated API map, Generated file map, Generated

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
Cohesion: 0.50
Nodes (4): Brain, First run, Related, Runbook

### Community 44 - "UI"
Cohesion: 0.50
Nodes (4): Node form, Related, Routes, UI

### Community 45 - "downloadService.ts"
Cohesion: 0.67
Nodes (3): api(), downloadService, readDetail()

### Community 46 - "Locked decisions"
Cohesion: 0.50
Nodes (3): Locked decisions, Out of v1, Related

### Community 47 - "API"
Cohesion: 0.29
Nodes (7): lifespan(), watch_downloads(), Probe a running download on the node and persist bytes/status., sync_active_jobs(), sync_job(), Event, FastAPI

### Community 52 - "status_cache.py"
Cohesion: 0.33
Nodes (11): node_status(), body_from_cache(), get_engine(), get_status(), _iso(), persist(), persist_partial(), probe_live() (+3 more)

### Community 54 - "EngineParamsModal.tsx"
Cohesion: 0.47
Nodes (5): display(), EngineParamsModal(), EngineParamsSource, Row, rowsFor()

## Knowledge Gaps
- **87 isolated node(s):** `Read in this order`, `Repo map`, `Generated`, `Related`, `Generated API map` (+82 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `LlamaCppEngine` connect `test_llama_cpp_argv.py` to `nodes.py`, `test_openai_proxy.py`?**
  _High betweenness centrality (0.037) - this node is a cross-community bridge._
- **Why does `run_command()` connect `nodes.py` to `status_cache.py`, `test_ssh.py`?**
  _High betweenness centrality (0.012) - this node is a cross-community bridge._
- **Why does `parse_object_id()` connect `test_helpers.py` to `nodes.py`?**
  _High betweenness centrality (0.010) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `datetime` (e.g. with `test_cluster_helper_serialises_id_and_dates()` and `test_node_helper_includes_ssh_secrets()`) actually correct?**
  _`datetime` has 4 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Read in this order`, `Repo map`, `Generated` to the rest of the system?**
  _87 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `test_helpers.py` be split into smaller, more focused modules?**
  _Cohesion score 0.10782241014799154 - nodes in this community are weakly interconnected._
- **Should `nodes.py` be split into smaller, more focused modules?**
  _Cohesion score 0.1173054587688734 - nodes in this community are weakly interconnected._