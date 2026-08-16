# Platform.AI

Local control plane for llama.cpp inferencing clusters.

## Layout

```
api/            FastAPI :8091
ui/             Vite React :3091
docker-compose.yml   Mongo only — platformai-mongodb :27091
_ai/            knowledge vault (Obsidian, wiki-linked) — primary brain
scripts/update-brain.sh   regenerate _ai/generated
```

## Working rules

**`_ai/` is the primary knowledge base.** Start at `_ai/00-index.md`. Change behaviour, update the note that describes it, keep `[[wiki-link]]` See-also lines connected.

**Keep `_ai/` in step with the code.** After route/model/helper changes, run `./scripts/update-brain.sh` (the pre-commit hook also runs it). After changing SSH/localhost, engine start, screens, or ports, update the matching hand note in `_ai/`.

**No login.** SSH secrets stay in Mongo as entered. Do not expose the API.

**Ports:** API `8091`, UI `3091`, Mongo `27091`.

**Localhost nodes** (`localhost`, `127.0.0.1`, `::1`, `0.0.0.0`) skip SSH. See `_ai/local-vs-ssh.md`.

## graphify

If `graphify-out/graph.json` exists, answer codebase questions with `graphify query` first. After code commits, `graphify update .` keeps the AST graph current. After `_ai/` or README edits, run `/graphify --update` so markdown is re-extracted.
