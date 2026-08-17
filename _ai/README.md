---
title: _ai vault
tags: [vault, index]
aliases: ["_ai vault", brain]
created: 2026-08-16
updated: 2026-08-16
---

# _ai — Platform.AI brain

Obsidian vault for this repo. Open `_ai/` as a vault. Wikilinks resolve by basename.

**Start at [[00-index]].**

## Layout

```
_ai/
├── 00-index.md           map of content
├── architecture.md       processes and data flow
├── data-model.md         Mongo collections
├── api.md                HTTP surface
├── local-vs-ssh.md       localhost vs remote nodes
├── llama-cpp-engine.md   llama.cpp argv and process control
├── vllm-engine.md        vLLM argv, snapshots, process control
├── ui.md                 screens and theme
├── runbook.md            start / stop / first run
├── decisions.md          locked choices
└── generated/            script-written — do not hand-edit
```

## Rules

- One note, one concern. Link instead of repeating.
- Hand notes describe *why* and *how*. Generated notes list *what exists now*.
- After you change behaviour, update the matching hand note in the same change.
- After you change routes or models, run `./scripts/update-brain.sh` (the pre-commit hook does this).
- Secrets never land here. No SSH passwords, keys, or HF tokens.
- `generated/` is replaced by the script. Do not edit it.

## Always update

| You change | You also update |
|---|---|
| Routes, models, helpers | `./scripts/update-brain.sh` (or commit — hook runs it) |
| SSH / localhost / engine start | [[local-vs-ssh]], [[llama-cpp-engine]], [[vllm-engine]] |
| Screens, theme | [[ui]] |
| Ports, start/stop | [[runbook]] |
| A locked product choice | [[decisions]] |
