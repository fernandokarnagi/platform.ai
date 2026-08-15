# Platform.AI

Local control plane for llama.cpp inferencing clusters.

## Start

```bash
docker compose up -d
cd api && python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cd .. && PYTHONPATH=. uvicorn api.main:app --reload --host 0.0.0.0 --port 8091
```

```bash
cd ui && npm install && npm run dev
```

UI: http://localhost:3091  
API: http://localhost:8091  
Mongo: localhost:27091 (container `platformai-mongodb`)

No login. Do not expose the API.

## First run

1. Create cluster `desk-macs`.
2. Register a Mac node (SSH user + password or key).
3. Follow the Homebrew steps on the form.
4. Test SSH, download a GGUF, set launch params, Start, Chat.
