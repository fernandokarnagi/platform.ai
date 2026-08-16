---
title: Runbook
tags: [ops]
updated: 2026-08-16
---

# Runbook

```bash
./start.sh    # Mongo + API :8091 + UI :3091
./stop.sh     # kill API/UI ports; stop Mongo container
```

`start.sh` reuses an existing `platformai-mongodb` container instead of failing on a name clash.

| Surface | URL |
|---|---|
| UI | http://localhost:3091 |
| API | http://localhost:8091 |
| Mongo | localhost:27091 |

## First run

1. Create cluster `desk-macs`.
2. Register a node — `localhost` for this Mac, or SSH for a remote.
3. Follow Homebrew setup on the form if the engine is not installed.
4. Test local / Test SSH → download a GGUF → set load params → Start → Chat → Stop.

## Brain

```bash
./scripts/update-brain.sh
```

The git pre-commit hook runs this so [[generated/api-map]] stays current. Hand notes are your job — see [[README]].

## Related

[[architecture]] · [[00-index]]
