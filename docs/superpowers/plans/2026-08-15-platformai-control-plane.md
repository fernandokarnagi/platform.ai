# Platform.AI Control Plane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a local web app that manages llama.cpp inferencing clusters: register clusters/nodes, show manual Homebrew setup, download/delete GGUFs over SSH, start/stop/restart `llama-server` with LM Studio-style launch params, probe OpenAI status, and chat.

**Architecture:** React UI on :3091 talks only to FastAPI on :8091. The API owns Mongo (`platformai-mongodb` on :27091), SSH to nodes, and OpenAI-compatible proxies. `LlamaCppEngine.build_argv` is the only place that turns `serverParams` into process argv. No login.

**Tech Stack:** Python 3.10+, FastAPI, Motor, asyncssh, httpx, pytest; React 19, TypeScript, Vite 6, Tailwind, react-router-dom v7; MongoDB 7 in Docker.

**Spec:** `docs/superpowers/specs/2026-08-15-platformai-control-plane-design.md`

## Global Constraints

- Ports: API `8091`, UI `3091`, Mongo host `27091`.
- Mongo container name: `platformai-mongodb`. DB name: `platformai`. Test DB name: `platformai_test`.
- No authentication. No JWT. No users collection.
- Engine v1: `llama.cpp` only. Do not implement vLLM / SGLang / Ollama.
- API never installs the engine over SSH. UI shows Homebrew instructions only.
- Browser never SSHs and never calls a node OpenAI URL.
- JSON API fields are camelCase. Mongo `_id` serialises as `id`.
- SSH library: asyncssh. Connect timeout 10s.
- PID file: `~/.platformai/llama-server.pid`. Log: `~/.platformai/llama-server.log`.
- `extraFlags` containing `-m`, `--model`, `--host`, or `--port` is 400.
- Responses return SSH secrets (laptop-local, no auth).
- UI: no E2E suite. Manual check at the end.
- Do not add Kubernetes, GitLab CI, or encryption-at-rest.

---

## File map

| File | Responsibility |
|---|---|
| `docker-compose.yml` | Mongo only, container `platformai-mongodb`, `27091:27017` |
| `.gitignore` | venv, node_modules, `.env`, `__pycache__`, dist |
| `README.md` | How to start Mongo, API, UI |
| `api/requirements.txt` | Runtime + test deps |
| `api/pytest.ini` | asyncio mode, test paths |
| `api/config.py` | Settings from env |
| `api/logger.py` | stdout logging |
| `api/database.py` | Motor client, `get_database()`, indexes |
| `api/main.py` | FastAPI app, CORS, routers, `/health` |
| `api/models/models.py` | Enums + Pydantic in/update/out models |
| `api/helpers.py` | ObjectId checks, `cluster_helper`, `node_helper` |
| `api/engines/base.py` | Engine protocol |
| `api/engines/llama_cpp.py` | argv builder + remote start/stop/models scripts |
| `api/services/ssh.py` | asyncssh connect + run |
| `api/services/openai_proxy.py` | `/models` and `/chat/completions` |
| `api/routes/clusters.py` | Cluster CRUD |
| `api/routes/nodes.py` | Node CRUD + SSH + engine + models + chat |
| `api/routes/engines.py` | `POST /engines/llama.cpp/preview` |
| `api/tests/conftest.py` | Test app + Mongo `platformai_test` |
| `api/tests/test_health.py` | Health |
| `api/tests/test_helpers.py` | Serialisers + filename safety |
| `api/tests/test_clusters.py` | Cluster CRUD + 409 |
| `api/tests/test_nodes.py` | Node CRUD |
| `api/tests/test_llama_cpp_argv.py` | Launch argv rules |
| `api/tests/test_ssh.py` | test-ssh mocked |
| `api/tests/test_engine_lifecycle.py` | start/stop/restart mocked |
| `api/tests/test_models_ops.py` | list/download/delete mocked |
| `api/tests/test_openai_proxy.py` | status + chat mocked |
| `ui/*` | CTC React app as specified |

---

### Task 1: Scaffold — Mongo compose + API health

**Files:**
- Create: `docker-compose.yml`
- Create: `.gitignore`
- Create: `api/requirements.txt`
- Create: `api/pytest.ini`
- Create: `api/.env.example`
- Create: `api/.env`
- Create: `api/config.py`
- Create: `api/logger.py`
- Create: `api/database.py`
- Create: `api/main.py`
- Create: `api/tests/conftest.py`
- Create: `api/tests/test_health.py`

**Interfaces:**
- Consumes: nothing
- Produces: `settings` (`mongodb_url`, `database_name`, `test_database_name`); `connect_to_mongo()` / `close_mongo_connection()` / `get_database()`; FastAPI `app` with `GET /health`

- [ ] **Step 1: Write the failing health test**

Create `api/tests/test_health.py`:

```python
import pytest
from httpx import ASGITransport, AsyncClient


@pytest.mark.asyncio
async def test_health_returns_healthy(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}
```

Create `api/tests/conftest.py`:

```python
import pytest_asyncio
from api.config import settings
from api.database import client, connect_to_mongo, close_mongo_connection


@pytest_asyncio.fixture
async def app():
    from api.main import app as fastapi_app
    settings.database_name = settings.test_database_name
    await connect_to_mongo()
    db = client[settings.test_database_name]
    for name in await db.list_collection_names():
        await db[name].delete_many({})
    yield fastapi_app
    await close_mongo_connection()
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/fernando.karnagi/Workspace/WorkspaceAI/platform.ai
python3 -m venv api/.venv
source api/.venv/bin/activate
pip install -r api/requirements.txt
# requirements.txt must exist first — write it in this same task before this step if needed
PYTHONPATH=. pytest api/tests/test_health.py::test_health_returns_healthy -v
```

Expected: FAIL (missing modules or missing `/health`) until implementation exists. Write `requirements.txt` first so pip works, then run pytest and confirm the test fails on import/`/health`.

`api/requirements.txt`:

```
fastapi
uvicorn[standard]
pymongo
motor
pydantic>=2.5.0
pydantic-settings>=2.1.0
python-dotenv>=1.0.0
httpx>=0.26.0
asyncssh>=2.14.0
pytest>=8.0.0
pytest-asyncio>=0.23.0
```

`api/pytest.ini`:

```ini
[pytest]
asyncio_mode = auto
pythonpath = .
testpaths = api/tests
```

- [ ] **Step 3: Write scaffold implementation**

`.gitignore`:

```
.venv
api/.venv
__pycache__/
*.pyc
.env
node_modules/
ui/dist/
.DS_Store
```

`docker-compose.yml`:

```yaml
# Mongo only in v1. API and UI run on the host so SSH to LAN Macs is straightforward.
services:
  mongo:
    image: mongo:7
    container_name: platformai-mongodb
    ports:
      - "27091:27017"
    volumes:
      - platformai-mongo-data:/data/db

volumes:
  platformai-mongo-data:
```

`api/.env.example` and `api/.env`:

```
MONGODB_URL=mongodb://localhost:27091
DATABASE_NAME=platformai
TEST_DATABASE_NAME=platformai_test
```

`api/config.py`:

```python
from pathlib import Path
from dotenv import load_dotenv
from pydantic_settings import BaseSettings

_env_file = Path(__file__).parent / ".env"
load_dotenv(_env_file)


class Settings(BaseSettings):
    mongodb_url: str = "mongodb://localhost:27091"
    database_name: str = "platformai"
    test_database_name: str = "platformai_test"

    class Config:
        env_file = str(_env_file)
        env_file_encoding = "utf-8"


settings = Settings()
```

`api/logger.py`:

```python
import logging
import sys


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)


def configure_logging(level: str = "INFO") -> None:
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        stream=sys.stdout,
    )
```

`api/database.py`:

```python
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from api.config import settings
from api.logger import get_logger

logger = get_logger(__name__)
client: AsyncIOMotorClient | None = None
database: AsyncIOMotorDatabase | None = None


async def connect_to_mongo() -> None:
    global client, database
    client = AsyncIOMotorClient(settings.mongodb_url)
    database = client[settings.database_name]
    await database.clusters.create_index("name", unique=True)
    logger.info("Connected to MongoDB database %s", settings.database_name)


def close_mongo_connection() -> None:
    global client
    if client:
        client.close()


def get_database() -> AsyncIOMotorDatabase:
    if database is None:
        raise RuntimeError("Database is not connected")
    return database
```

`api/main.py`:

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api.logger import configure_logging
from api.database import connect_to_mongo, close_mongo_connection

configure_logging()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_to_mongo()
    yield
    close_mongo_connection()


app = FastAPI(
    title="Platform.AI API",
    description="Inferencing cluster control plane",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check():
    return {"status": "healthy"}
```

Start Mongo:

```bash
docker compose up -d
docker ps --filter name=platformai-mongodb
```

Expected: container `platformai-mongodb` listening on `27091`.

- [ ] **Step 4: Run the health test**

```bash
source api/.venv/bin/activate
PYTHONPATH=. pytest api/tests/test_health.py -v
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml .gitignore api
git commit -m "feat: scaffold API, Mongo compose, and health endpoint"
```

---

### Task 2: Pydantic models + helpers

**Files:**
- Create: `api/models/__init__.py`
- Create: `api/models/models.py`
- Create: `api/helpers.py`
- Create: `api/tests/test_helpers.py`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `EngineType`, `SshAuthType`, `CacheType`, `FlashAttn`, `FitMode`, `GpuLayers` helpers
  - `ServerParams`, `ClusterIn`, `ClusterUpdate`, `NodeIn`, `NodeUpdate`, `DownloadModelIn`, `StartEngineIn`, `ChatIn`, `DeleteModelIn`
  - `parse_object_id(id: str) -> ObjectId` raises `HTTPException` 400
  - `cluster_helper(doc: dict, node_count: int = 0) -> dict`
  - `node_helper(doc: dict) -> dict`
  - `safe_model_filename(filename: str) -> str` raises `ValueError`
  - `default_server_params() -> dict`

- [ ] **Step 1: Write failing helper tests**

```python
from datetime import datetime
from bson import ObjectId
import pytest
from fastapi import HTTPException
from api.helpers import (
    cluster_helper,
    node_helper,
    parse_object_id,
    safe_model_filename,
    default_server_params,
)


def test_parse_object_id_rejects_bad():
    with pytest.raises(HTTPException) as exc:
        parse_object_id("nope")
    assert exc.value.status_code == 400
    assert exc.value.detail == "Invalid id"


def test_cluster_helper_serialises_id_and_dates():
    oid = ObjectId()
    now = datetime(2026, 8, 15, 12, 0, 0)
    out = cluster_helper(
        {"_id": oid, "name": "desk-macs", "engine": "llama.cpp", "description": "", "createdAt": now, "updatedAt": now},
        node_count=2,
    )
    assert out["id"] == str(oid)
    assert out["nodeCount"] == 2
    assert out["createdAt"].startswith("2026-08-15")


def test_node_helper_includes_ssh_secrets():
    oid = ObjectId()
    cluster_id = ObjectId()
    out = node_helper({
        "_id": oid,
        "clusterId": cluster_id,
        "name": "mac-1",
        "host": "192.168.1.10",
        "sshPort": 22,
        "sshUser": "fernando",
        "sshAuthType": "password",
        "sshPassword": "secret",
        "sshPrivateKey": "",
        "sshPassphrase": "",
        "openaiBaseUrl": "http://192.168.1.10:8080/v1",
        "openaiApiKey": "",
        "hfToken": "",
        "listenHost": "0.0.0.0",
        "listenPort": 8080,
        "modelDir": "~/models",
        "serverParams": default_server_params(),
        "lastStart": None,
        "createdAt": datetime(2026, 8, 15),
        "updatedAt": datetime(2026, 8, 15),
    })
    assert out["sshPassword"] == "secret"
    assert out["clusterId"] == str(cluster_id)


def test_safe_model_filename_rejects_escape():
    with pytest.raises(ValueError):
        safe_model_filename("../etc/passwd")
    with pytest.raises(ValueError):
        safe_model_filename("/tmp/x.gguf")
    assert safe_model_filename("model.gguf") == "model.gguf"
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
source api/.venv/bin/activate
PYTHONPATH=. pytest api/tests/test_helpers.py -v
```

Expected: FAIL (import error)

- [ ] **Step 3: Implement models and helpers**

`api/models/__init__.py`:

```python
from api.models.models import *  # noqa: F401,F403
```

`api/models/models.py`:

```python
from enum import Enum
from typing import Any, List, Optional, Union
from pydantic import BaseModel, Field


class EngineType(str, Enum):
    LLAMA_CPP = "llama.cpp"


class SshAuthType(str, Enum):
    PASSWORD = "password"
    PRIVATE_KEY = "private_key"


class FlashAttn(str, Enum):
    AUTO = "auto"
    ON = "on"
    OFF = "off"


class FitMode(str, Enum):
    ON = "on"
    OFF = "off"


class CacheType(str, Enum):
    F32 = "f32"
    F16 = "f16"
    BF16 = "bf16"
    Q8_0 = "q8_0"
    Q4_0 = "q4_0"
    Q4_1 = "q4_1"
    IQ4_NL = "iq4_nl"
    Q5_0 = "q5_0"
    Q5_1 = "q5_1"


class ServerParams(BaseModel):
    """llama-server launch parameters. Unset optional fields are omitted from argv."""
    ctxSize: int = 0
    gpuLayers: Union[str, int] = "auto"
    flashAttn: FlashAttn = FlashAttn.AUTO
    threads: Optional[int] = None
    parallel: int = 1
    batchSize: Optional[int] = None
    ubatchSize: Optional[int] = None
    kvOffload: bool = True
    fit: FitMode = FitMode.ON
    cacheTypeK: Optional[CacheType] = None
    cacheTypeV: Optional[CacheType] = None
    nPredict: Optional[int] = None
    keep: Optional[int] = None
    threadsBatch: Optional[int] = None
    splitMode: Optional[str] = None
    mainGpu: Optional[int] = None
    tensorSplit: Optional[str] = None
    device: Optional[str] = None
    cpuMoe: Optional[bool] = None
    nCpuMoe: Optional[int] = None
    loadMode: Optional[str] = None
    jinja: Optional[bool] = None
    chatTemplate: Optional[str] = None
    metrics: Optional[bool] = None
    alias: Optional[str] = None
    extraFlags: str = ""


class ClusterIn(BaseModel):
    """Payload to create a cluster."""
    name: str
    engine: EngineType = EngineType.LLAMA_CPP
    description: str = ""


class ClusterUpdate(BaseModel):
    """Payload to update a cluster."""
    name: Optional[str] = None
    engine: Optional[EngineType] = None
    description: Optional[str] = None


class NodeIn(BaseModel):
    """Payload to register a node."""
    name: str
    host: str
    sshPort: int = 22
    sshUser: str
    sshAuthType: SshAuthType
    sshPassword: str = ""
    sshPrivateKey: str = ""
    sshPassphrase: str = ""
    openaiBaseUrl: str
    openaiApiKey: str = ""
    hfToken: str = ""
    listenHost: str = "0.0.0.0"
    listenPort: int = 8080
    modelDir: str = "~/models"
    serverParams: ServerParams = Field(default_factory=ServerParams)


class NodeUpdate(BaseModel):
    """Payload to update a node."""
    name: Optional[str] = None
    host: Optional[str] = None
    sshPort: Optional[int] = None
    sshUser: Optional[str] = None
    sshAuthType: Optional[SshAuthType] = None
    sshPassword: Optional[str] = None
    sshPrivateKey: Optional[str] = None
    sshPassphrase: Optional[str] = None
    openaiBaseUrl: Optional[str] = None
    openaiApiKey: Optional[str] = None
    hfToken: Optional[str] = None
    listenHost: Optional[str] = None
    listenPort: Optional[int] = None
    modelDir: Optional[str] = None
    serverParams: Optional[ServerParams] = None


class StartEngineIn(BaseModel):
    modelFilename: str


class DownloadModelIn(BaseModel):
    source: str
    repo: Optional[str] = None
    filename: Optional[str] = None
    url: Optional[str] = None
    hfToken: Optional[str] = None


class DeleteModelIn(BaseModel):
    filename: str


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatIn(BaseModel):
    model: str
    messages: List[ChatMessage]
    temperature: Optional[float] = None
    topP: Optional[float] = None
    maxTokens: Optional[int] = None


class PreviewIn(BaseModel):
    listenHost: str = "0.0.0.0"
    listenPort: int = 8080
    modelDir: str = "~/models"
    serverParams: ServerParams = Field(default_factory=ServerParams)
    modelFilename: str = "$MODEL"
```

`api/helpers.py`:

```python
from datetime import datetime
from bson import ObjectId
from fastapi import HTTPException, status
from api.models.models import ServerParams


def parse_object_id(value: str) -> ObjectId:
    if not ObjectId.is_valid(value):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid id")
    return ObjectId(value)


def _iso(value) -> str:
    if isinstance(value, datetime):
        return value.isoformat()
    return value or ""


def default_server_params() -> dict:
    return ServerParams().model_dump()


def cluster_helper(doc: dict, node_count: int = 0) -> dict:
    return {
        "id": str(doc["_id"]),
        "name": doc.get("name", ""),
        "engine": doc.get("engine", "llama.cpp"),
        "description": doc.get("description", ""),
        "nodeCount": node_count,
        "createdAt": _iso(doc.get("createdAt")),
        "updatedAt": _iso(doc.get("updatedAt")),
    }


def node_helper(doc: dict) -> dict:
    cluster_id = doc.get("clusterId")
    return {
        "id": str(doc["_id"]),
        "clusterId": str(cluster_id) if cluster_id is not None else "",
        "name": doc.get("name", ""),
        "host": doc.get("host", ""),
        "sshPort": doc.get("sshPort", 22),
        "sshUser": doc.get("sshUser", ""),
        "sshAuthType": doc.get("sshAuthType", "password"),
        "sshPassword": doc.get("sshPassword", ""),
        "sshPrivateKey": doc.get("sshPrivateKey", ""),
        "sshPassphrase": doc.get("sshPassphrase", ""),
        "openaiBaseUrl": doc.get("openaiBaseUrl", ""),
        "openaiApiKey": doc.get("openaiApiKey", ""),
        "hfToken": doc.get("hfToken", ""),
        "listenHost": doc.get("listenHost", "0.0.0.0"),
        "listenPort": doc.get("listenPort", 8080),
        "modelDir": doc.get("modelDir", "~/models"),
        "serverParams": doc.get("serverParams") or default_server_params(),
        "lastStart": doc.get("lastStart"),
        "createdAt": _iso(doc.get("createdAt")),
        "updatedAt": _iso(doc.get("updatedAt")),
    }


def safe_model_filename(filename: str) -> str:
    name = (filename or "").strip()
    if not name or name.startswith("/") or ".." in name or "/" in name or "\\" in name:
        raise ValueError("Invalid filename")
    return name
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
source api/.venv/bin/activate
PYTHONPATH=. pytest api/tests/test_helpers.py -v
```

- [ ] **Step 5: Commit**

```bash
git add api/models api/helpers.py api/tests/test_helpers.py
git commit -m "feat: add cluster/node models and serialisers"
```

---

### Task 3: Cluster CRUD

**Files:**
- Create: `api/routes/__init__.py`
- Create: `api/routes/clusters.py`
- Create: `api/tests/test_clusters.py`
- Modify: `api/main.py` — `app.include_router(clusters_router)`

**Interfaces:**
- Consumes: `ClusterIn`, `ClusterUpdate`, `cluster_helper`, `parse_object_id`, `get_database()`
- Produces: routes under `/clusters`

- [ ] **Step 1: Write failing cluster tests**

```python
import pytest
from httpx import ASGITransport, AsyncClient


async def _client(app):
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.mark.asyncio
async def test_create_and_list_cluster(app):
    async with await _client(app) as client:
        created = await client.post("/clusters", json={"name": "desk-macs", "description": "two macs"})
        assert created.status_code == 201
        body = created.json()
        assert body["name"] == "desk-macs"
        assert body["engine"] == "llama.cpp"
        assert body["nodeCount"] == 0
        listed = await client.get("/clusters")
        assert listed.status_code == 200
        assert len(listed.json()) == 1


@pytest.mark.asyncio
async def test_delete_cluster_without_nodes(app):
    async with await _client(app) as client:
        created = await client.post("/clusters", json={"name": "tmp"})
        cluster_id = created.json()["id"]
        deleted = await client.delete(f"/clusters/{cluster_id}")
        assert deleted.status_code == 204


@pytest.mark.asyncio
async def test_get_missing_cluster(app):
    async with await _client(app) as client:
        response = await client.get("/clusters/64b64b64b64b64b64b64b64b")
        assert response.status_code == 404
        assert response.json()["detail"] == "Not found"


@pytest.mark.asyncio
async def test_invalid_cluster_id(app):
    async with await _client(app) as client:
        response = await client.get("/clusters/nope")
        assert response.status_code == 400
        assert response.json()["detail"] == "Invalid id"
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
source api/.venv/bin/activate
PYTHONPATH=. pytest api/tests/test_clusters.py -v
```

Expected: 404 on `/clusters` (router missing)

- [ ] **Step 3: Implement cluster routes**

`api/routes/__init__.py`:

```python
from api.routes.clusters import router as clusters_router

__all__ = ["clusters_router"]
```

`api/routes/clusters.py`:

```python
from datetime import datetime
from fastapi import APIRouter, HTTPException, status
from api.database import get_database
from api.helpers import cluster_helper, parse_object_id
from api.logger import get_logger
from api.models.models import ClusterIn, ClusterUpdate

router = APIRouter(tags=["clusters"], prefix="/clusters")
logger = get_logger(__name__)


async def _node_count(db, cluster_id) -> int:
    return await db.nodes.count_documents({"clusterId": cluster_id})


@router.get("/")
async def list_clusters():
    db = get_database()
    items = []
    async for doc in db.clusters.find().sort("createdAt", -1):
        items.append(cluster_helper(doc, await _node_count(db, doc["_id"])))
    return items


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_cluster(payload: ClusterIn):
    db = get_database()
    now = datetime.utcnow()
    doc = payload.model_dump()
    doc["engine"] = payload.engine.value
    doc["createdAt"] = now
    doc["updatedAt"] = now
    result = await db.clusters.insert_one(doc)
    created = await db.clusters.find_one({"_id": result.inserted_id})
    logger.info("Cluster created: %s", str(result.inserted_id))
    return cluster_helper(created, 0)


@router.get("/{cluster_id}")
async def get_cluster(cluster_id: str):
    db = get_database()
    oid = parse_object_id(cluster_id)
    doc = await db.clusters.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    return cluster_helper(doc, await _node_count(db, oid))


@router.put("/{cluster_id}")
async def update_cluster(cluster_id: str, update: ClusterUpdate):
    db = get_database()
    oid = parse_object_id(cluster_id)
    doc = await db.clusters.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    data = {k: v for k, v in update.model_dump().items() if v is not None}
    if "engine" in data and hasattr(data["engine"], "value"):
        data["engine"] = data["engine"].value
    data["updatedAt"] = datetime.utcnow()
    await db.clusters.update_one({"_id": oid}, {"$set": data})
    updated = await db.clusters.find_one({"_id": oid})
    return cluster_helper(updated, await _node_count(db, oid))


@router.delete("/{cluster_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_cluster(cluster_id: str):
    db = get_database()
    oid = parse_object_id(cluster_id)
    if await _node_count(db, oid) > 0:
        raise HTTPException(status_code=409, detail="Cluster has nodes")
    result = await db.clusters.delete_one({"_id": oid})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return None
```

In `api/main.py` add:

```python
from api.routes import clusters_router
app.include_router(clusters_router)
```

Note: FastAPI matches `/clusters` and `/clusters/` — the tests post to `/clusters` without trailing slash. Set the router so both work. Use `prefix="/clusters"` and `@router.post("")` **or** keep `@router.post("/")` and in tests use `/clusters/` OR enable redirect. **Use empty-string paths** (`@router.get("")`, `@router.post("")`) so `/clusters` works without redirect.

Update `clusters.py` route decorators to `@router.get("")`, `@router.post("", ...)`.

- [ ] **Step 4: Run tests — expect PASS**

```bash
source api/.venv/bin/activate
PYTHONPATH=. pytest api/tests/test_clusters.py -v
```

- [ ] **Step 5: Commit**

```bash
git add api/routes api/main.py api/tests/test_clusters.py
git commit -m "feat: add cluster CRUD"
```

---

### Task 4: Node CRUD

**Files:**
- Create: `api/routes/nodes.py`
- Create: `api/tests/test_nodes.py`
- Modify: `api/routes/__init__.py` — export `nodes_router`
- Modify: `api/main.py` — include `nodes_router`
- Modify: `api/tests/test_clusters.py` — add `test_delete_cluster_with_nodes_conflict`

**Interfaces:**
- Consumes: `NodeIn`, `NodeUpdate`, `node_helper`, `parse_object_id`
- Produces: `POST/GET /clusters/{id}/nodes`, `GET/PUT/DELETE /nodes/{id}`

- [ ] **Step 1: Write failing node tests**

```python
import pytest
from httpx import ASGITransport, AsyncClient


def _node_payload():
    return {
        "name": "mac-1",
        "host": "192.168.1.10",
        "sshUser": "fernando",
        "sshAuthType": "password",
        "sshPassword": "secret",
        "openaiBaseUrl": "http://192.168.1.10:8080/v1",
    }


@pytest.mark.asyncio
async def test_register_list_get_node(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        cluster = (await client.post("/clusters", json={"name": "desk-macs"})).json()
        created = await client.post(f"/clusters/{cluster['id']}/nodes", json=_node_payload())
        assert created.status_code == 201
        node = created.json()
        assert node["sshPassword"] == "secret"
        assert node["listenPort"] == 8080
        assert node["serverParams"]["ctxSize"] == 0
        assert node["serverParams"]["gpuLayers"] == "auto"
        listed = await client.get(f"/clusters/{cluster['id']}/nodes")
        assert len(listed.json()) == 1
        fetched = await client.get(f"/nodes/{node['id']}")
        assert fetched.json()["name"] == "mac-1"


@pytest.mark.asyncio
async def test_delete_cluster_blocked_when_nodes_exist(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        cluster = (await client.post("/clusters", json={"name": "desk-macs"})).json()
        await client.post(f"/clusters/{cluster['id']}/nodes", json=_node_payload())
        deleted = await client.delete(f"/clusters/{cluster['id']}")
        assert deleted.status_code == 409
        assert deleted.json()["detail"] == "Cluster has nodes"


@pytest.mark.asyncio
async def test_register_node_on_missing_cluster(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/clusters/64b64b64b64b64b64b64b64b/nodes",
            json=_node_payload(),
        )
        assert response.status_code == 404
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
source api/.venv/bin/activate
PYTHONPATH=. pytest api/tests/test_nodes.py -v
```

- [ ] **Step 3: Implement node routes**

`api/routes/nodes.py` (CRUD only in this task):

```python
from datetime import datetime
from fastapi import APIRouter, HTTPException, status
from api.database import get_database
from api.helpers import node_helper, parse_object_id
from api.logger import get_logger
from api.models.models import NodeIn, NodeUpdate

router = APIRouter(tags=["nodes"])
logger = get_logger(__name__)


async def _require_cluster(db, cluster_id: str):
    oid = parse_object_id(cluster_id)
    doc = await db.clusters.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    return oid


async def _require_node(db, node_id: str):
    oid = parse_object_id(node_id)
    doc = await db.nodes.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    return doc


@router.get("/clusters/{cluster_id}/nodes")
async def list_nodes(cluster_id: str):
    db = get_database()
    oid = await _require_cluster(db, cluster_id)
    items = []
    async for doc in db.nodes.find({"clusterId": oid}).sort("createdAt", -1):
        items.append(node_helper(doc))
    return items


@router.post("/clusters/{cluster_id}/nodes", status_code=status.HTTP_201_CREATED)
async def create_node(cluster_id: str, payload: NodeIn):
    db = get_database()
    oid = await _require_cluster(db, cluster_id)
    now = datetime.utcnow()
    doc = payload.model_dump()
    doc["sshAuthType"] = payload.sshAuthType.value
    doc["clusterId"] = oid
    doc["lastStart"] = None
    doc["createdAt"] = now
    doc["updatedAt"] = now
    result = await db.nodes.insert_one(doc)
    created = await db.nodes.find_one({"_id": result.inserted_id})
    logger.info("Node created: %s", str(result.inserted_id))
    return node_helper(created)


@router.get("/nodes/{node_id}")
async def get_node(node_id: str):
    db = get_database()
    return node_helper(await _require_node(db, node_id))


@router.put("/nodes/{node_id}")
async def update_node(node_id: str, update: NodeUpdate):
    db = get_database()
    doc = await _require_node(db, node_id)
    data = {k: v for k, v in update.model_dump().items() if v is not None}
    if "sshAuthType" in data and hasattr(data["sshAuthType"], "value"):
        data["sshAuthType"] = data["sshAuthType"].value
    if "serverParams" in data and data["serverParams"] is not None:
        data["serverParams"] = update.serverParams.model_dump()
    data["updatedAt"] = datetime.utcnow()
    await db.nodes.update_one({"_id": doc["_id"]}, {"$set": data})
    updated = await db.nodes.find_one({"_id": doc["_id"]})
    return node_helper(updated)


@router.delete("/nodes/{node_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_node(node_id: str):
    db = get_database()
    doc = await _require_node(db, node_id)
    await db.nodes.delete_one({"_id": doc["_id"]})
    return None
```

Export and include the router.

- [ ] **Step 4: Run tests — expect PASS**

```bash
source api/.venv/bin/activate
PYTHONPATH=. pytest api/tests/test_nodes.py api/tests/test_clusters.py -v
```

- [ ] **Step 5: Commit**

```bash
git add api/routes api/main.py api/tests/test_nodes.py
git commit -m "feat: add node CRUD under clusters"
```

---

### Task 5: `LlamaCppEngine.build_argv` + preview

**Files:**
- Create: `api/engines/__init__.py`
- Create: `api/engines/base.py`
- Create: `api/engines/llama_cpp.py`
- Create: `api/routes/engines.py`
- Create: `api/tests/test_llama_cpp_argv.py`
- Modify: `api/routes/__init__.py`
- Modify: `api/main.py`

**Interfaces:**
- Consumes: `ServerParams` dump, node listen fields
- Produces:
  - `ForbiddenExtraFlagsError`
  - `LlamaCppEngine.build_argv(node: dict, model_filename: str, model_dir_expanded: str) -> list[str]`
  - `LlamaCppEngine.preview_command(node: dict, model_filename: str) -> str`
  - `POST /engines/llama.cpp/preview` body `PreviewIn` → `{ "argv": [...], "command": "..." }`

- [ ] **Step 1: Write failing argv tests**

```python
import pytest
from api.engines.llama_cpp import ForbiddenExtraFlagsError, LlamaCppEngine
from api.helpers import default_server_params


def _node(**overrides):
    params = default_server_params()
    params.update(overrides.pop("serverParams", {}))
    node = {
        "listenHost": "0.0.0.0",
        "listenPort": 8080,
        "modelDir": "~/models",
        "serverParams": params,
    }
    node.update(overrides)
    return node


def test_defaults_include_owned_flags_and_omit_optional():
    argv = LlamaCppEngine.build_argv(_node(), "phi.gguf", "/Users/x/models")
    assert argv[:6] == ["-m", "/Users/x/models/phi.gguf", "--host", "0.0.0.0", "--port", "8080"]
    assert "--ctx-size" in argv and argv[argv.index("--ctx-size") + 1] == "0"
    assert "--n-gpu-layers" in argv and argv[argv.index("--n-gpu-layers") + 1] == "auto"
    assert "--flash-attn" in argv and argv[argv.index("--flash-attn") + 1] == "auto"
    assert "--parallel" in argv and argv[argv.index("--parallel") + 1] == "1"
    assert "--kv-offload" in argv
    assert "--fit" in argv and argv[argv.index("--fit") + 1] == "on"
    assert "--threads" not in argv
    assert "--batch-size" not in argv
    assert "--jinja" not in argv
    assert "--metrics" not in argv


def test_optional_and_boolean_flags():
    argv = LlamaCppEngine.build_argv(
        _node(serverParams={"threads": 8, "jinja": True, "metrics": True, "kvOffload": False, "alias": "phi"}),
        "phi.gguf",
        "/m",
    )
    assert argv[argv.index("--threads") + 1] == "8"
    assert "--jinja" in argv
    assert "--metrics" in argv
    assert "--no-kv-offload" in argv
    assert "-a" in argv and argv[argv.index("-a") + 1] == "phi"


def test_extra_flags_appended_last():
    argv = LlamaCppEngine.build_argv(
        _node(serverParams={"extraFlags": "--verbose --offline"}),
        "phi.gguf",
        "/m",
    )
    assert argv[-2:] == ["--verbose", "--offline"]


def test_forbidden_extra_flags():
    for extra in ["--port 9", "--host 1.2.3.4", "-m x.gguf", "--model x.gguf"]:
        with pytest.raises(ForbiddenExtraFlagsError):
            LlamaCppEngine.build_argv(_node(serverParams={"extraFlags": extra}), "phi.gguf", "/m")


def test_preview_uses_placeholder_path():
    command = LlamaCppEngine.preview_command(_node(), "$MODEL")
    assert "-m $MODEL" in command or "-m ~/models/$MODEL" in command
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
source api/.venv/bin/activate
PYTHONPATH=. pytest api/tests/test_llama_cpp_argv.py -v
```

- [ ] **Step 3: Implement engine argv + preview route**

`api/engines/base.py`:

```python
from typing import Protocol


class Engine(Protocol):
    def build_argv(self, node: dict, model_filename: str, model_dir_expanded: str) -> list[str]:
        ...
```

`api/engines/llama_cpp.py`:

```python
import shlex
from api.helpers import safe_model_filename

FORBIDDEN_EXTRA = {"-m", "--model", "--host", "--port"}


class ForbiddenExtraFlagsError(ValueError):
    pass


class LlamaCppEngine:
    PID_FILE = "~/.platformai/llama-server.pid"
    LOG_FILE = "~/.platformai/llama-server.log"

    @staticmethod
    def _extra_tokens(extra: str) -> list[str]:
        tokens = shlex.split(extra or "")
        if any(tok in FORBIDDEN_EXTRA for tok in tokens):
            raise ForbiddenExtraFlagsError(
                "extraFlags cannot include -m, --model, --host, or --port"
            )
        return tokens

    @staticmethod
    def build_argv(node: dict, model_filename: str, model_dir_expanded: str) -> list[str]:
        filename = model_filename if model_filename == "$MODEL" else safe_model_filename(model_filename)
        model_path = f"{model_dir_expanded.rstrip('/')}/{filename}"
        params = node.get("serverParams") or {}
        argv = [
            "-m", model_path,
            "--host", str(node.get("listenHost") or "0.0.0.0"),
            "--port", str(node.get("listenPort") or 8080),
            "--ctx-size", str(params.get("ctxSize", 0)),
            "--n-gpu-layers", str(params.get("gpuLayers", "auto")),
            "--flash-attn", str(params.get("flashAttn", "auto")),
            "--parallel", str(params.get("parallel", 1)),
        ]
        if params.get("kvOffload", True):
            argv.append("--kv-offload")
        else:
            argv.append("--no-kv-offload")
        argv.extend(["--fit", str(params.get("fit", "on"))])

        optional_int = [
            ("threads", "--threads"),
            ("batchSize", "--batch-size"),
            ("ubatchSize", "--ubatch-size"),
            ("nPredict", "--n-predict"),
            ("keep", "--keep"),
            ("threadsBatch", "--threads-batch"),
            ("mainGpu", "--main-gpu"),
            ("nCpuMoe", "--n-cpu-moe"),
        ]
        for key, flag in optional_int:
            if params.get(key) is not None:
                argv.extend([flag, str(params[key])])

        optional_str = [
            ("cacheTypeK", "--cache-type-k"),
            ("cacheTypeV", "--cache-type-v"),
            ("splitMode", "--split-mode"),
            ("tensorSplit", "--tensor-split"),
            ("device", "--device"),
            ("loadMode", "--load-mode"),
            ("chatTemplate", "--chat-template"),
        ]
        for key, flag in optional_str:
            value = params.get(key)
            if value:
                argv.extend([flag, str(value)])

        if params.get("cpuMoe"):
            argv.append("--cpu-moe")
        if params.get("jinja"):
            argv.append("--jinja")
        if params.get("metrics"):
            argv.append("--metrics")
        if params.get("alias"):
            argv.extend(["-a", str(params["alias"])])

        argv.extend(LlamaCppEngine._extra_tokens(params.get("extraFlags") or ""))
        return argv

    @staticmethod
    def preview_command(node: dict, model_filename: str = "$MODEL") -> str:
        model_dir = node.get("modelDir") or "~/models"
        argv = LlamaCppEngine.build_argv(node, model_filename, model_dir)
        return "llama-server " + " ".join(argv)
```

`api/routes/engines.py`:

```python
from fastapi import APIRouter, HTTPException
from api.engines.llama_cpp import ForbiddenExtraFlagsError, LlamaCppEngine
from api.models.models import PreviewIn

router = APIRouter(tags=["engines"], prefix="/engines")


@router.post("/llama.cpp/preview")
async def preview_llama_cpp(payload: PreviewIn):
    node = {
        "listenHost": payload.listenHost,
        "listenPort": payload.listenPort,
        "modelDir": payload.modelDir,
        "serverParams": payload.serverParams.model_dump(),
    }
    try:
        argv = LlamaCppEngine.build_argv(node, payload.modelFilename, payload.modelDir)
    except ForbiddenExtraFlagsError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"argv": argv, "command": "llama-server " + " ".join(argv)}
```

Include the router in `main.py`.

Add one HTTP test in `test_llama_cpp_argv.py`:

```python
@pytest.mark.asyncio
async def test_preview_endpoint(app):
    from httpx import ASGITransport, AsyncClient
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/engines/llama.cpp/preview", json={"extraFlags": "--port 9"})
        # extraFlags is nested
        response = await client.post(
            "/engines/llama.cpp/preview",
            json={"serverParams": {"extraFlags": "--port 9"}},
        )
        assert response.status_code == 400
```

Keep a single request (the second one). Remove the unused first call.

- [ ] **Step 4: Run tests — expect PASS**

```bash
source api/.venv/bin/activate
PYTHONPATH=. pytest api/tests/test_llama_cpp_argv.py -v
```

- [ ] **Step 5: Commit**

```bash
git add api/engines api/routes/engines.py api/routes/__init__.py api/main.py api/tests/test_llama_cpp_argv.py
git commit -m "feat: build llama-server argv from structured launch params"
```

---

### Task 6: SSH client + test-ssh

**Files:**
- Create: `api/services/__init__.py`
- Create: `api/services/ssh.py`
- Create: `api/tests/test_ssh.py`
- Modify: `api/routes/nodes.py` — add `POST /nodes/{id}/test-ssh`
- Modify: `api/engines/llama_cpp.py` — add `resolve_binary_script()` and `probe_script()`

**Interfaces:**
- Consumes: node SSH fields
- Produces:
  - `class SshResult`: `stdout: str`, `stderr: str`, `exit_status: int`
  - `async def run_command(node: dict, command: str, timeout: float = 30.0) -> SshResult`
  - `class SshError(Exception)`
  - `POST /nodes/{id}/test-ssh` → `{ "ok": true, "uname": "Darwin", "llamaServer": "/opt/homebrew/bin/llama-server" }` or 502

- [ ] **Step 1: Write failing tests with mocked SSH**

```python
import pytest
from httpx import ASGITransport, AsyncClient
from api.services import ssh as ssh_mod


class FakeResult:
    def __init__(self, stdout, exit_status=0, stderr=""):
        self.stdout = stdout
        self.stderr = stderr
        self.exit_status = exit_status


@pytest.mark.asyncio
async def test_test_ssh_success(app, monkeypatch):
    async def fake_run(node, command, timeout=30.0):
        if "uname" in command:
            return FakeResult("Darwin\n/opt/homebrew/bin/llama-server\n")
        return FakeResult("")

    monkeypatch.setattr(ssh_mod, "run_command", fake_run)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        cluster = (await client.post("/clusters", json={"name": "desk-macs"})).json()
        node = (await client.post(
            f"/clusters/{cluster['id']}/nodes",
            json={
                "name": "mac-1",
                "host": "192.168.1.10",
                "sshUser": "fernando",
                "sshAuthType": "password",
                "sshPassword": "secret",
                "openaiBaseUrl": "http://192.168.1.10:8080/v1",
            },
        )).json()
        response = await client.post(f"/nodes/{node['id']}/test-ssh")
        assert response.status_code == 200
        assert response.json()["uname"] == "Darwin"
        assert "llama-server" in response.json()["llamaServer"]


@pytest.mark.asyncio
async def test_test_ssh_failure(app, monkeypatch):
    async def fake_run(node, command, timeout=30.0):
        raise ssh_mod.SshError("Authentication failed")

    monkeypatch.setattr(ssh_mod, "run_command", fake_run)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        cluster = (await client.post("/clusters", json={"name": "desk-macs"})).json()
        node = (await client.post(
            f"/clusters/{cluster['id']}/nodes",
            json={
                "name": "mac-1",
                "host": "127.0.0.1",
                "sshUser": "x",
                "sshAuthType": "password",
                "sshPassword": "bad",
                "openaiBaseUrl": "http://127.0.0.1:8080/v1",
            },
        )).json()
        response = await client.post(f"/nodes/{node['id']}/test-ssh")
        assert response.status_code == 502
        assert response.json()["detail"].startswith("SSH failed:")
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
source api/.venv/bin/activate
PYTHONPATH=. pytest api/tests/test_ssh.py -v
```

- [ ] **Step 3: Implement SSH + test-ssh**

`api/services/ssh.py`:

```python
from dataclasses import dataclass
import asyncssh
from api.logger import get_logger

logger = get_logger(__name__)


class SshError(Exception):
    pass


@dataclass
class SshResult:
    stdout: str
    stderr: str
    exit_status: int


async def run_command(node: dict, command: str, timeout: float = 30.0) -> SshResult:
    connect_kwargs = {
        "host": node["host"],
        "port": int(node.get("sshPort") or 22),
        "username": node["sshUser"],
        "known_hosts": None,
        "connect_timeout": 10,
    }
    if node.get("sshAuthType") == "private_key":
        connect_kwargs["client_keys"] = [asyncssh.import_private_key(
            node.get("sshPrivateKey") or "",
            passphrase=node.get("sshPassphrase") or None,
        )]
    else:
        connect_kwargs["password"] = node.get("sshPassword") or ""
    try:
        async with asyncssh.connect(**connect_kwargs) as conn:
            result = await conn.run(command, check=False, timeout=timeout)
    except Exception as exc:
        raise SshError(str(exc)) from exc
    return SshResult(
        stdout=str(result.stdout or ""),
        stderr=str(result.stderr or ""),
        exit_status=int(result.exit_status or 0),
    )
```

Add to `LlamaCppEngine`:

```python
    @staticmethod
    def probe_command() -> str:
        return (
            "uname -s; "
            "if command -v llama-server >/dev/null 2>&1; then command -v llama-server; "
            "elif [ -x \"$(brew --prefix 2>/dev/null)/bin/llama-server\" ]; then echo \"$(brew --prefix)/bin/llama-server\"; "
            "elif [ -x /usr/local/bin/llama-server ]; then echo /usr/local/bin/llama-server; "
            "else echo MISSING; fi"
        )
```

Add route on `nodes.py`:

```python
from api.engines.llama_cpp import LlamaCppEngine
from api.services.ssh import SshError, run_command

@router.post("/nodes/{node_id}/test-ssh")
async def test_ssh(node_id: str):
    db = get_database()
    node = await _require_node(db, node_id)
    try:
        result = await run_command(node, LlamaCppEngine.probe_command())
    except SshError as exc:
        raise HTTPException(status_code=502, detail=f"SSH failed: {exc}") from exc
    lines = [line.strip() for line in result.stdout.splitlines() if line.strip()]
    uname = lines[0] if lines else ""
    binary = lines[1] if len(lines) > 1 else "MISSING"
    if result.exit_status != 0:
        raise HTTPException(status_code=502, detail=f"SSH failed: {result.stderr or result.stdout}")
    return {"ok": True, "uname": uname, "llamaServer": binary}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
source api/.venv/bin/activate
PYTHONPATH=. pytest api/tests/test_ssh.py -v
```

- [ ] **Step 5: Commit**

```bash
git add api/services api/engines/llama_cpp.py api/routes/nodes.py api/tests/test_ssh.py
git commit -m "feat: add SSH probe for nodes"
```

---

### Task 7: Engine start / stop / restart

**Files:**
- Modify: `api/engines/llama_cpp.py` — remote shell scripts + `async` start/stop/status helpers
- Modify: `api/routes/nodes.py` — engine endpoints
- Create: `api/tests/test_engine_lifecycle.py`

**Interfaces:**
- Consumes: `run_command`, `build_argv`, `StartEngineIn`
- Produces:
  - `GET /nodes/{id}/engine` → `{ running, pid, lastStart, llamaServer }`
  - `POST /nodes/{id}/engine/start` body `{ modelFilename }`
  - `POST /nodes/{id}/engine/stop`
  - `POST /nodes/{id}/engine/restart`
  - persist `lastStart: { modelFilename, argv, startedAt }`

- [ ] **Step 1: Write failing lifecycle tests**

```python
import pytest
from httpx import ASGITransport, AsyncClient
from api.services import ssh as ssh_mod


class FakeResult:
    def __init__(self, stdout="", exit_status=0, stderr=""):
        self.stdout = stdout
        self.stderr = stderr
        self.exit_status = exit_status


async def _seed(client):
    cluster = (await client.post("/clusters", json={"name": "desk-macs"})).json()
    node = (await client.post(
        f"/clusters/{cluster['id']}/nodes",
        json={
            "name": "mac-1",
            "host": "192.168.1.10",
            "sshUser": "fernando",
            "sshAuthType": "password",
            "sshPassword": "secret",
            "openaiBaseUrl": "http://192.168.1.10:8080/v1",
            "serverParams": {"ctxSize": 8192, "gpuLayers": "all"},
        },
    )).json()
    return node


@pytest.mark.asyncio
async def test_start_stop_restart(app, monkeypatch):
    state = {"running": False, "pid": ""}

    async def fake_run(node, command, timeout=30.0):
        if "echo ~" in command or "printf" in command and "MODEL_DIR" in command:
            return FakeResult("/Users/x/models\n")
        if "command -v llama-server" in command or "brew --prefix" in command:
            return FakeResult("/opt/homebrew/bin/llama-server\n")
        if "PID_FILE" in command and "cat" in command and "kill" not in command and "nohup" not in command:
            return FakeResult("12345\n" if state["running"] else "")
        if "nohup" in command:
            if state["running"]:
                return FakeResult("ALREADY\n", exit_status=1)
            state["running"] = True
            state["pid"] = "12345"
            return FakeResult("12345\n")
        if "kill" in command:
            state["running"] = False
            return FakeResult("STOPPED\n")
        if "test -f" in command and ".gguf" in command:
            return FakeResult("OK\n")
        return FakeResult("")

    monkeypatch.setattr(ssh_mod, "run_command", fake_run)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        node = await _seed(client)
        started = await client.post(f"/nodes/{node['id']}/engine/start", json={"modelFilename": "phi.gguf"})
        assert started.status_code == 200
        body = started.json()
        assert body["running"] is True
        assert "--ctx-size" in " ".join(body["lastStart"]["argv"])
        engine = await client.get(f"/nodes/{node['id']}/engine")
        assert engine.json()["running"] is True
        stopped = await client.post(f"/nodes/{node['id']}/engine/stop")
        assert stopped.status_code == 200
        assert stopped.json()["running"] is False
        restarted = await client.post(f"/nodes/{node['id']}/engine/restart")
        assert restarted.status_code == 200
        assert restarted.json()["running"] is True


@pytest.mark.asyncio
async def test_restart_without_last_start(app, monkeypatch):
    async def fake_run(node, command, timeout=30.0):
        return FakeResult("")

    monkeypatch.setattr(ssh_mod, "run_command", fake_run)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        node = await _seed(client)
        response = await client.post(f"/nodes/{node['id']}/engine/restart")
        assert response.status_code == 400
        assert response.json()["detail"] == "No previous start"


@pytest.mark.asyncio
async def test_start_already_running(app, monkeypatch):
    async def fake_run(node, command, timeout=30.0):
        if "nohup" in command or "already" in command.lower():
            return FakeResult("ALREADY\n", exit_status=9)
        if "PID_FILE" in command or "llama-server.pid" in command:
            return FakeResult("111\n")
        if "ps -p" in command or "kill -0" in command:
            return FakeResult("alive\n")
        return FakeResult("/opt/homebrew/bin/llama-server\n")

    monkeypatch.setattr(ssh_mod, "run_command", fake_run)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        node = await _seed(client)
        response = await client.post(f"/nodes/{node['id']}/engine/start", json={"modelFilename": "phi.gguf"})
        assert response.status_code == 409
        assert response.json()["detail"] == "Engine already running"
```

Implement start/stop so these exact `detail` strings match. Prefer a Python-side already-running check: `GET engine` reads pid via SSH; if alive, start returns 409. The test's fake_run can return pid `111` for pid-file reads and `alive` for `kill -0`.

- [ ] **Step 2: Run tests — expect FAIL**

```bash
source api/.venv/bin/activate
PYTHONPATH=. pytest api/tests/test_engine_lifecycle.py -v
```

- [ ] **Step 3: Implement lifecycle**

Add helpers on `LlamaCppEngine` (keep argv code intact):

```python
    @staticmethod
    def resolve_binary_command() -> str:
        return (
            "if command -v llama-server >/dev/null 2>&1; then command -v llama-server; "
            "elif command -v brew >/dev/null 2>&1 && [ -x \"$(brew --prefix)/bin/llama-server\" ]; "
            "then echo \"$(brew --prefix)/bin/llama-server\"; "
            "elif [ -x /usr/local/bin/llama-server ]; then echo /usr/local/bin/llama-server; "
            "else echo MISSING; fi"
        )

    @staticmethod
    def expand_model_dir_command(model_dir: str) -> str:
        return f"mkdir -p {shlex.quote(model_dir)} ~/.platformai && echo {model_dir}"

    @staticmethod
    def read_pid_command() -> str:
        return "if [ -f ~/.platformai/llama-server.pid ]; then cat ~/.platformai/llama-server.pid; fi"

    @staticmethod
    def pid_alive_command(pid: str) -> str:
        return f"if kill -0 {shlex.quote(pid)} 2>/dev/null; then echo alive; fi"

    @staticmethod
    def start_command(binary: str, argv: list[str]) -> str:
        quoted = " ".join(shlex.quote(part) for part in argv)
        return (
            f"mkdir -p ~/.platformai && "
            f"nohup {shlex.quote(binary)} {quoted} > ~/.platformai/llama-server.log 2>&1 & echo $! "
            f"| tee ~/.platformai/llama-server.pid"
        )

    @staticmethod
    def stop_command() -> str:
        return (
            "if [ -f ~/.platformai/llama-server.pid ]; then "
            "PID=$(cat ~/.platformai/llama-server.pid); "
            "if kill -0 $PID 2>/dev/null; then kill $PID; "
            "for i in 1 2 3 4 5 6 7 8; do kill -0 $PID 2>/dev/null || break; sleep 1; done; "
            "kill -0 $PID 2>/dev/null && kill -9 $PID; fi; "
            "rm -f ~/.platformai/llama-server.pid; echo STOPPED; "
            "else echo STOPPED; fi"
        )

    @staticmethod
    def model_exists_command(model_dir: str, filename: str) -> str:
        path = f"{model_dir.rstrip('/')}/{filename}"
        return f"if [ -f {shlex.quote(path)} ]; then echo OK; else echo MISSING; fi"
```

Engine routes (same `nodes.py` file):

```python
from datetime import datetime
from api.engines.llama_cpp import ForbiddenExtraFlagsError, LlamaCppEngine
from api.helpers import safe_model_filename
from api.models.models import StartEngineIn


async def _expand_dir(node):
    result = await run_command(node, f"echo {node.get('modelDir') or '~/models'}")
    return result.stdout.strip().splitlines()[0]


async def _resolve_binary(node):
    result = await run_command(node, LlamaCppEngine.resolve_binary_command())
    binary = result.stdout.strip().splitlines()[0] if result.stdout.strip() else "MISSING"
    if binary == "MISSING":
        raise HTTPException(status_code=502, detail="llama-server not found on node")
    return binary


async def _engine_status(node):
    pid_res = await run_command(node, LlamaCppEngine.read_pid_command())
    pid = pid_res.stdout.strip()
    running = False
    if pid:
        alive = await run_command(node, LlamaCppEngine.pid_alive_command(pid))
        running = "alive" in alive.stdout
    return {"running": running, "pid": pid if running else None, "lastStart": node.get("lastStart")}


@router.get("/nodes/{node_id}/engine")
async def get_engine(node_id: str):
    db = get_database()
    node = await _require_node(db, node_id)
    try:
        status_body = await _engine_status(node)
        try:
            status_body["llamaServer"] = await _resolve_binary(node)
        except HTTPException:
            status_body["llamaServer"] = None
        return status_body
    except SshError as exc:
        raise HTTPException(status_code=502, detail=f"SSH failed: {exc}") from exc


@router.post("/nodes/{node_id}/engine/start")
async def start_engine(node_id: str, payload: StartEngineIn):
    db = get_database()
    node = await _require_node(db, node_id)
    try:
        filename = safe_model_filename(payload.modelFilename)
        current = await _engine_status(node)
        if current["running"]:
            raise HTTPException(status_code=409, detail="Engine already running")
        model_dir = await _expand_dir(node)
        exists = await run_command(node, LlamaCppEngine.model_exists_command(model_dir, filename))
        if "OK" not in exists.stdout:
            raise HTTPException(status_code=404, detail="Model not found")
        binary = await _resolve_binary(node)
        argv = LlamaCppEngine.build_argv(node, filename, model_dir)
        started = await run_command(node, LlamaCppEngine.start_command(binary, argv), timeout=20)
        pid = started.stdout.strip().splitlines()[-1]
        last_start = {"modelFilename": filename, "argv": argv, "startedAt": datetime.utcnow().isoformat()}
        await db.nodes.update_one({"_id": node["_id"]}, {"$set": {"lastStart": last_start, "updatedAt": datetime.utcnow()}})
        return {"running": True, "pid": pid, "lastStart": last_start}
    except ForbiddenExtraFlagsError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except HTTPException:
        raise
    except SshError as exc:
        raise HTTPException(status_code=502, detail=f"SSH failed: {exc}") from exc


@router.post("/nodes/{node_id}/engine/stop")
async def stop_engine(node_id: str):
    db = get_database()
    node = await _require_node(db, node_id)
    try:
        await run_command(node, LlamaCppEngine.stop_command(), timeout=20)
        return {"running": False, "pid": None, "lastStart": node.get("lastStart")}
    except SshError as exc:
        raise HTTPException(status_code=502, detail=f"SSH failed: {exc}") from exc


@router.post("/nodes/{node_id}/engine/restart")
async def restart_engine(node_id: str):
    db = get_database()
    node = await _require_node(db, node_id)
    last = node.get("lastStart") or {}
    filename = last.get("modelFilename")
    if not filename:
        raise HTTPException(status_code=400, detail="No previous start")
    await stop_engine(node_id)
    return await start_engine(node_id, StartEngineIn(modelFilename=filename))
```

Tune `fake_run` in tests if the exact command strings differ — the implementer should adjust the mock matchers to the real commands, not the other way around, **except** HTTP status and `detail` strings are spec-locked.

- [ ] **Step 4: Run tests — expect PASS**

```bash
source api/.venv/bin/activate
PYTHONPATH=. pytest api/tests/test_engine_lifecycle.py api/tests/test_llama_cpp_argv.py -v
```

- [ ] **Step 5: Commit**

```bash
git add api/engines/llama_cpp.py api/routes/nodes.py api/tests/test_engine_lifecycle.py
git commit -m "feat: start stop and restart llama-server over SSH"
```

---

### Task 8: Model list / download / delete

**Files:**
- Modify: `api/engines/llama_cpp.py` — list/download/delete command builders + `hf_url`
- Modify: `api/routes/nodes.py` — model endpoints
- Create: `api/tests/test_models_ops.py`

**Interfaces:**
- Consumes: `DownloadModelIn`, `DeleteModelIn`, `safe_model_filename`, `run_command`
- Produces:
  - `GET /nodes/{id}/models` → `[{ name, sizeBytes, mtime }]`
  - `POST /nodes/{id}/models/download` `{ source: "huggingface"|"url", repo?, filename?, url?, hfToken? }`
  - `DELETE /nodes/{id}/models` `{ filename }`
  - `LlamaCppEngine.hf_url(repo: str, filename: str) -> str` = `https://huggingface.co/{repo}/resolve/main/{filename}`

- [ ] **Step 1: Write failing tests**

```python
import pytest
from httpx import ASGITransport, AsyncClient
from api.engines.llama_cpp import LlamaCppEngine
from api.services import ssh as ssh_mod


def test_hf_url():
    assert LlamaCppEngine.hf_url("org/model", "q.gguf") == "https://huggingface.co/org/model/resolve/main/q.gguf"


class FakeResult:
    def __init__(self, stdout="", exit_status=0, stderr=""):
        self.stdout = stdout
        self.stderr = stderr
        self.exit_status = exit_status


async def _seed(client):
    cluster = (await client.post("/clusters", json={"name": "desk-macs"})).json()
    return (await client.post(
        f"/clusters/{cluster['id']}/nodes",
        json={
            "name": "mac-1",
            "host": "192.168.1.10",
            "sshUser": "fernando",
            "sshAuthType": "password",
            "sshPassword": "secret",
            "openaiBaseUrl": "http://192.168.1.10:8080/v1",
            "hfToken": "hf_node",
        },
    )).json()


@pytest.mark.asyncio
async def test_list_and_delete_models(app, monkeypatch):
    async def fake_run(node, command, timeout=30.0):
        if "stat" in command or "gguf" in command:
            return FakeResult("phi.gguf\t1234\t2026-08-15T00:00:00\n")
        return FakeResult("OK\n")

    monkeypatch.setattr(ssh_mod, "run_command", fake_run)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        node = await _seed(client)
        listed = await client.get(f"/nodes/{node['id']}/models")
        assert listed.status_code == 200
        assert listed.json()[0]["name"] == "phi.gguf"
        deleted = await client.request("DELETE", f"/nodes/{node['id']}/models", json={"filename": "phi.gguf"})
        assert deleted.status_code == 204
        bad = await client.request("DELETE", f"/nodes/{node['id']}/models", json={"filename": "../x"})
        assert bad.status_code == 400
        assert bad.json()["detail"] == "Invalid filename"


@pytest.mark.asyncio
async def test_download_url_and_hf(app, monkeypatch):
    seen = {}

    async def fake_run(node, command, timeout=30.0):
        seen["cmd"] = command
        if "curl" in command and "fail" in command:
            return FakeResult("", exit_status=22, stderr="404")
        return FakeResult("OK\n")

    monkeypatch.setattr(ssh_mod, "run_command", fake_run)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        node = await _seed(client)
        ok = await client.post(
            f"/nodes/{node['id']}/models/download",
            json={"source": "url", "url": "https://example.com/a.gguf", "filename": "a.gguf"},
        )
        assert ok.status_code == 200
        fail = await client.post(
            f"/nodes/{node['id']}/models/download",
            json={"source": "huggingface", "repo": "org/model", "filename": "missing.gguf"},
        )
        assert fail.status_code == 502
        assert fail.json()["detail"].startswith("Download failed:")
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
source api/.venv/bin/activate
PYTHONPATH=. pytest api/tests/test_models_ops.py -v
```

- [ ] **Step 3: Implement model ops**

```python
    @staticmethod
    def hf_url(repo: str, filename: str) -> str:
        return f"https://huggingface.co/{repo}/resolve/main/{filename}"

    @staticmethod
    def list_models_command(model_dir: str) -> str:
        return (
            f"mkdir -p {shlex.quote(model_dir)} && "
            f"find {shlex.quote(model_dir)} -maxdepth 1 -name '*.gguf' -type f -print0 | "
            "while IFS= read -r -d '' f; do "
            "stat -f '%N\t%z\t%Sm' -t '%Y-%m-%dT%H:%M:%S' \"$f\" 2>/dev/null || "
            "stat -c '%n\t%s\t%y' \"$f\"; "
            "done"
        )

    @staticmethod
    def download_command(model_dir: str, filename: str, url: str, token: str = "") -> str:
        dest = f"{model_dir.rstrip('/')}/{filename}"
        header = f"-H {shlex.quote('Authorization: Bearer ' + token)} " if token else ""
        return (
            f"mkdir -p {shlex.quote(model_dir)} && "
            f"curl -L --fail {header}-o {shlex.quote(dest)} {shlex.quote(url)}"
        )

    @staticmethod
    def delete_model_command(model_dir: str, filename: str) -> str:
        dest = f"{model_dir.rstrip('/')}/{filename}"
        return f"rm -f {shlex.quote(dest)}"
```

Routes:

```python
from api.models.models import DeleteModelIn, DownloadModelIn

@router.get("/nodes/{node_id}/models")
async def list_models(node_id: str):
    db = get_database()
    node = await _require_node(db, node_id)
    try:
        model_dir = await _expand_dir(node)
        result = await run_command(node, LlamaCppEngine.list_models_command(model_dir))
    except SshError as exc:
        raise HTTPException(status_code=502, detail=f"SSH failed: {exc}") from exc
    items = []
    for line in result.stdout.splitlines():
        parts = line.split("\t")
        if len(parts) >= 3:
            name = parts[0].rstrip("/").split("/")[-1]
            items.append({"name": name, "sizeBytes": int(parts[1]), "mtime": parts[2]})
    return items


@router.post("/nodes/{node_id}/models/download")
async def download_model(node_id: str, payload: DownloadModelIn):
    db = get_database()
    node = await _require_node(db, node_id)
    try:
        if payload.source == "huggingface":
            if not payload.repo or not payload.filename:
                raise HTTPException(status_code=400, detail="repo and filename required")
            filename = safe_model_filename(payload.filename)
            url = LlamaCppEngine.hf_url(payload.repo, filename)
            token = payload.hfToken or node.get("hfToken") or ""
        elif payload.source == "url":
            if not payload.url:
                raise HTTPException(status_code=400, detail="url required")
            filename = payload.filename or payload.url.rstrip("/").split("?")[0].split("/")[-1]
            filename = safe_model_filename(filename)
            url = payload.url
            token = ""
        else:
            raise HTTPException(status_code=400, detail="source must be huggingface or url")
        model_dir = await _expand_dir(node)
        result = await run_command(
            node,
            LlamaCppEngine.download_command(model_dir, filename, url, token),
            timeout=3600,
        )
        if result.exit_status != 0:
            raise HTTPException(status_code=502, detail=f"Download failed: {result.stderr or result.stdout}")
        return {"name": filename, "url": url}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid filename") from exc
    except HTTPException:
        raise
    except SshError as exc:
        raise HTTPException(status_code=502, detail=f"SSH failed: {exc}") from exc


@router.delete("/nodes/{node_id}/models", status_code=status.HTTP_204_NO_CONTENT)
async def delete_model(node_id: str, payload: DeleteModelIn):
    db = get_database()
    node = await _require_node(db, node_id)
    try:
        filename = safe_model_filename(payload.filename)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid filename") from exc
    try:
        model_dir = await _expand_dir(node)
        await run_command(node, LlamaCppEngine.delete_model_command(model_dir, filename))
    except SshError as exc:
        raise HTTPException(status_code=502, detail=f"SSH failed: {exc}") from exc
    return None
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
source api/.venv/bin/activate
PYTHONPATH=. pytest api/tests/test_models_ops.py -v
```

- [ ] **Step 5: Commit**

```bash
git add api/engines/llama_cpp.py api/routes/nodes.py api/tests/test_models_ops.py
git commit -m "feat: list download and delete GGUF models over SSH"
```

---

### Task 9: OpenAI status + chat proxy

**Files:**
- Create: `api/services/openai_proxy.py`
- Create: `api/tests/test_openai_proxy.py`
- Modify: `api/routes/nodes.py` — `/status`, `/models/openai`, `/chat`

**Interfaces:**
- Consumes: `node["openaiBaseUrl"]`, `node["openaiApiKey"]`, `ChatIn`
- Produces:
  - `normalize_base_url(url: str) -> str` — strip trailing slash
  - `async def fetch_models(base_url: str, api_key: str) -> list[dict]`
  - `async def chat_completions(base_url, api_key, payload: dict) -> dict`
  - `GET /nodes/{id}/status` → `{ ssh: "up"|"down", openai: "up"|"down", models: [ids], detail?: str }`
  - `GET /nodes/{id}/models/openai` → upstream JSON
  - `POST /nodes/{id}/chat` — 502 if upstream fails

Status: OpenAI probe fail is **200** with `openai: "down"`. SSH fail on status: still 200 with `ssh: "down"` so the UI can render both lights. Chat: 502.

- [ ] **Step 1: Write failing tests**

```python
import pytest
from httpx import ASGITransport, AsyncClient
from api.services.openai_proxy import normalize_base_url
from api.services import openai_proxy as proxy
from api.services import ssh as ssh_mod


def test_normalize_base_url():
    assert normalize_base_url("http://x:8080/v1/") == "http://x:8080/v1"
    assert normalize_base_url("http://x:8080/v1") == "http://x:8080/v1"


class FakeResult:
    def __init__(self, stdout="", exit_status=0, stderr=""):
        self.stdout = stdout
        self.stderr = stderr
        self.exit_status = exit_status


@pytest.mark.asyncio
async def test_status_up_and_chat(app, monkeypatch):
    async def fake_ssh(node, command, timeout=30.0):
        return FakeResult("Darwin\n")

    async def fake_models(base_url, api_key):
        return [{"id": "phi"}]

    async def fake_chat(base_url, api_key, payload):
        assert payload["stream"] is False
        return {"choices": [{"message": {"role": "assistant", "content": "hi"}}]}

    monkeypatch.setattr(ssh_mod, "run_command", fake_ssh)
    monkeypatch.setattr(proxy, "fetch_models", fake_models)
    monkeypatch.setattr(proxy, "chat_completions", fake_chat)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        cluster = (await client.post("/clusters", json={"name": "desk-macs"})).json()
        node = (await client.post(
            f"/clusters/{cluster['id']}/nodes",
            json={
                "name": "mac-1",
                "host": "192.168.1.10",
                "sshUser": "fernando",
                "sshAuthType": "password",
                "sshPassword": "secret",
                "openaiBaseUrl": "http://192.168.1.10:8080/v1/",
            },
        )).json()
        status = await client.get(f"/nodes/{node['id']}/status")
        assert status.status_code == 200
        assert status.json()["openai"] == "up"
        assert status.json()["models"] == ["phi"]
        chat = await client.post(
            f"/nodes/{node['id']}/chat",
            json={"model": "phi", "messages": [{"role": "user", "content": "hi"}]},
        )
        assert chat.status_code == 200
        assert chat.json()["choices"][0]["message"]["content"] == "hi"


@pytest.mark.asyncio
async def test_status_openai_down_is_200(app, monkeypatch):
    async def fake_ssh(node, command, timeout=30.0):
        return FakeResult("Darwin\n")

    async def fake_models(base_url, api_key):
        raise proxy.OpenAIProxyError("connection refused")

    monkeypatch.setattr(ssh_mod, "run_command", fake_ssh)
    monkeypatch.setattr(proxy, "fetch_models", fake_models)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        cluster = (await client.post("/clusters", json={"name": "c"})).json()
        node = (await client.post(
            f"/clusters/{cluster['id']}/nodes",
            json={
                "name": "n",
                "host": "h",
                "sshUser": "u",
                "sshAuthType": "password",
                "sshPassword": "p",
                "openaiBaseUrl": "http://h:8080/v1",
            },
        )).json()
        status = await client.get(f"/nodes/{node['id']}/status")
        assert status.status_code == 200
        assert status.json()["openai"] == "down"
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
source api/.venv/bin/activate
PYTHONPATH=. pytest api/tests/test_openai_proxy.py -v
```

- [ ] **Step 3: Implement proxy + routes**

`api/services/openai_proxy.py`:

```python
import httpx

class OpenAIProxyError(Exception):
    pass


def normalize_base_url(url: str) -> str:
    return (url or "").rstrip("/")


async def fetch_models(base_url: str, api_key: str) -> list[dict]:
    headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(f"{normalize_base_url(base_url)}/models", headers=headers)
            response.raise_for_status()
            data = response.json()
    except Exception as exc:
        raise OpenAIProxyError(str(exc)) from exc
    return data.get("data") or []


async def chat_completions(base_url: str, api_key: str, payload: dict) -> dict:
    headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                f"{normalize_base_url(base_url)}/chat/completions",
                headers=headers,
                json=payload,
            )
            response.raise_for_status()
            return response.json()
    except Exception as exc:
        raise OpenAIProxyError(str(exc)) from exc
```

Routes:

```python
from api.models.models import ChatIn
from api.services import openai_proxy as openai_proxy


@router.get("/nodes/{node_id}/status")
async def node_status(node_id: str):
    db = get_database()
    node = await _require_node(db, node_id)
    body = {"ssh": "down", "openai": "down", "models": [], "detail": None}
    try:
        await run_command(node, "uname -s")
        body["ssh"] = "up"
    except SshError as exc:
        body["detail"] = f"SSH failed: {exc}"
        return body
    try:
        models = await openai_proxy.fetch_models(node.get("openaiBaseUrl") or "", node.get("openaiApiKey") or "")
        body["openai"] = "up"
        body["models"] = [m.get("id") for m in models if m.get("id")]
    except openai_proxy.OpenAIProxyError as exc:
        body["detail"] = str(exc)
    return body


@router.get("/nodes/{node_id}/models/openai")
async def openai_models(node_id: str):
    db = get_database()
    node = await _require_node(db, node_id)
    try:
        models = await openai_proxy.fetch_models(node.get("openaiBaseUrl") or "", node.get("openaiApiKey") or "")
        return {"data": models}
    except openai_proxy.OpenAIProxyError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("/nodes/{node_id}/chat")
async def chat(node_id: str, payload: ChatIn):
    db = get_database()
    node = await _require_node(db, node_id)
    body = {
        "model": payload.model,
        "messages": [m.model_dump() for m in payload.messages],
        "stream": False,
    }
    if payload.temperature is not None:
        body["temperature"] = payload.temperature
    if payload.topP is not None:
        body["top_p"] = payload.topP
    if payload.maxTokens is not None:
        body["max_tokens"] = payload.maxTokens
    try:
        return await openai_proxy.chat_completions(
            node.get("openaiBaseUrl") or "",
            node.get("openaiApiKey") or "",
            body,
        )
    except openai_proxy.OpenAIProxyError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
```

- [ ] **Step 4: Run full API suite**

```bash
source api/.venv/bin/activate
PYTHONPATH=. pytest api/tests -v
```

Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add api/services/openai_proxy.py api/routes/nodes.py api/tests/test_openai_proxy.py
git commit -m "feat: proxy OpenAI status and chat through the API"
```

---

### Task 10: UI shell + cluster screens

**Files:**
- Create: `ui/package.json`, `ui/tsconfig.json`, `ui/tsconfig.node.json`, `ui/vite.config.ts`, `ui/index.html`, `ui/index.tsx`, `ui/.env`, `ui/.env.example`
- Create: `ui/types.ts`
- Create: `ui/routes/index.tsx`
- Create: `ui/screens/App.tsx`
- Create: `ui/screens/ClustersScreen.tsx`
- Create: `ui/screens/ClusterDetailScreen.tsx`
- Create: `ui/components/Sidebar.tsx`
- Create: `ui/components/ErrorBanner.tsx`
- Create: `ui/contexts/ClusterContext.tsx`
- Create: `ui/services/clusterService.ts`
- Create: `ui/services/nodeService.ts`
- Create: `ui/styles.css` only if Tailwind via CDN is **not** used — use Tailwind Vite plugin, no extra CSS file beyond `@tailwind` in `ui/index.css`

**Interfaces:**
- Consumes: `/clusters`, `/clusters/:id`, `/clusters/:id/nodes`, `/nodes/:id/status`
- Produces: routes `/`, `/clusters/:id`

No automated UI tests. Verify with `npm run build`.

- [ ] **Step 1: Scaffold Vite + Tailwind**

```bash
cd ui
npm create vite@6 . -- --template react-ts
# If directory must be created first, mkdir ui and run from repo root:
# npm create vite@6 ui -- --template react-ts
npm install
npm install react-router-dom
npm install -D tailwindcss @tailwindcss/vite
```

`ui/vite.config.ts` — port **3091**, aliases `@`, `@components`, `@screens`, `@services`, `@routes`, `@contexts`.

```ts
import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  server: { port: 3091, host: '0.0.0.0' },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      '@components': path.resolve(__dirname, 'components'),
      '@screens': path.resolve(__dirname, 'screens'),
      '@services': path.resolve(__dirname, 'services'),
      '@routes': path.resolve(__dirname, 'routes'),
      '@contexts': path.resolve(__dirname, 'contexts'),
    },
  },
});
```

`ui/.env` and `ui/.env.example`:

```
VITE_API_URL=http://localhost:8091
```

`ui/index.css`:

```css
@import "tailwindcss";
```

Entry: `ui/index.tsx` mounts `AppRoutes`. If Vite scaffolded `main.tsx`, replace it and point `index.html` at `/index.tsx`.

- [ ] **Step 2: Types + services**

`ui/types.ts` — mirror API camelCase: `Cluster`, `ClusterIn`, `Node`, `NodeIn`, `ServerParams`, `SshAuthType`, `NodeStatus`, `EngineStatus`, `RemoteModel`, `ChatMessage`.

`ui/services/clusterService.ts` and `nodeService.ts` — `fetch` wrappers, `Authorization` not required, throw `Error(detail)` on `!response.ok`.

Base URL: `import.meta.env.VITE_API_URL || 'http://localhost:8091'`.

Implement every method the later screens need now:

- cluster: `list`, `get`, `create`, `update`, `remove`
- node: `listByCluster`, `get`, `create`, `update`, `remove`, `testSsh`, `status`, `engine`, `start`, `stop`, `restart`, `listModels`, `downloadModel`, `deleteModel`, `openaiModels`, `chat`, `previewCommand`

- [ ] **Step 3: Shell + cluster screens**

- `Sidebar`: brand "Platform.AI", one nav item Clusters, `bg-slate-900`, active `bg-blue-600 text-white`.
- `App.tsx`: `ClusterProvider` + layout (sidebar + `bg-slate-50` main + `<Outlet />`).
- `ClustersScreen`: table name / engine / nodeCount / created; modal create; edit name; delete disabled when `nodeCount > 0`.
- `ClusterDetailScreen`: load cluster + nodes; table name, host, SSH, engine, OpenAI, current model (from `/status` per node); Register node → `/clusters/:id/nodes/new`; row click → `/nodes/:id`; Refresh probes all.

`ErrorBanner` shows a string.

Placeholder routes for node form/detail can render "Coming in later task" **only if** those files are created as stubs that compile. Prefer creating stub screens that say "Node form" so the router is complete.

- [ ] **Step 4: Build UI**

```bash
cd ui && npm run build
```

Expected: exit 0

- [ ] **Step 5: Commit**

```bash
git add ui
git commit -m "feat: add cluster list and cluster detail UI"
```

---

### Task 11: Node form — launch params, preview, setup

**Files:**
- Create: `ui/screens/NodeFormScreen.tsx`
- Create: `ui/components/ServerParamsFields.tsx`
- Create: `ui/components/SetupInstructions.tsx`
- Modify: `ui/routes/index.tsx` — `/clusters/:id/nodes/new`, `/nodes/:id/edit`

**Interfaces:**
- Consumes: `nodeService.create`, `update`, `get`, `testSsh`, `previewCommand`
- Produces: working register/edit form

- [ ] **Step 1: Setup instructions component**

`ui/components/SetupInstructions.tsx` must render this Mac block verbatim:

```text
# 1. Install Homebrew if needed: https://brew.sh
# 2. brew install llama.cpp
# 3. confirm: llama-server --version
# 4. mkdir -p ~/models
# 5. allow SSH: System Settings → General → Sharing → Remote Login
```

Plus a short Linux note: install a `llama-server` binary, create the model dir, open the listen port.

Show this after successful create and on edit.

- [ ] **Step 2: ServerParamsFields**

Always-visible: ctxSize, gpuLayers (`auto` / `all` / number), flashAttn, threads, parallel, batchSize, ubatchSize, kvOffload, fit, cacheTypeK, cacheTypeV.

Advanced `<details>`: nPredict, keep, threadsBatch, splitMode, mainGpu, tensorSplit, device, cpuMoe, nCpuMoe, loadMode, jinja, chatTemplate, metrics, alias, extraFlags.

On any change, call `nodeService.previewCommand` (debounce 300ms) and show read-only command. If API returns 400, show `detail` under extra flags.

- [ ] **Step 3: NodeFormScreen**

Sections in spec order: Identity, SSH (password **or** key), OpenAI + hfToken, Server (listenHost, listenPort, modelDir, alias lives in serverParams), Load, Advanced, Extra flags, Preview, Setup, Test SSH button.

Defaults from `NodeIn` / `ServerParams`.

Save → create or update, then stay on form (edit URL after create: navigate to `/nodes/{id}/edit`).

- [ ] **Step 4: Build UI**

```bash
cd ui && npm run build
```

Expected: exit 0

- [ ] **Step 5: Commit**

```bash
git add ui
git commit -m "feat: add node form with llama-server launch params"
```

---

### Task 12: Node detail + README

**Files:**
- Create: `ui/screens/NodeDetailScreen.tsx`
- Modify: `ui/routes/index.tsx` — `/nodes/:id`
- Create: `README.md`

**Interfaces:**
- Consumes: status, engine, models, chat, start/stop/restart, download/delete
- Produces: the operator workflow in spec §13

- [ ] **Step 1: Node detail four blocks**

1. **Status** — SSH, pid / running, OpenAI up/down, served model ids. Refresh button.
2. **Engine** — Start modal (select GGUF from `listModels`), Stop, Restart. Disable Start when running.
3. **Models** — table; download modal (source HF or URL); delete confirm.
4. **Chat** — model select from status.models; messages; composer; temperature, topP, maxTokens optional. Non-streaming. Append assistant reply.

Red `ErrorBanner` for any `detail`.

Link to Edit node.

- [ ] **Step 2: README**

```markdown
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
```

- [ ] **Step 3: Build UI + run API tests**

```bash
cd ui && npm run build
cd .. && source api/.venv/bin/activate && PYTHONPATH=. pytest api/tests -v
```

Expected: both green

- [ ] **Step 4: Manual smoke (operator)**

1. API + UI + Mongo running.
2. Create `desk-macs`.
3. Register a node against one of the two Macs.
4. Confirm setup text is visible.
5. Test SSH (after Homebrew install on that Mac).
6. Download a small GGUF or point at one already in `~/models`.
7. Start with ctx 8192 / gpuLayers all / flash auto.
8. Status OpenAI up; send a chat turn.
9. Stop.

- [ ] **Step 5: Commit**

```bash
git add ui README.md
git commit -m "feat: add node detail operations and project README"
```

---

## Self-review

**Spec coverage**

| Spec section | Task |
|---|---|
| §2 ports, mongo name, no login | 1, 10 |
| §3 compose Mongo only, host API/UI | 1, 12 README |
| §4 clusters/nodes fields + secrets + 409 | 2, 3, 4 |
| §5 serverParams + extraFlags 400 | 2, 5, 11 |
| §6 all API routes | 3–9 |
| §7 SSH / start-stop / models / proxy | 6–9 |
| §8 screens + setup text + chat | 10–12 |
| §11 error details | 3–9, 10 ErrorBanner |
| §13 success criteria | 12 manual smoke |
| Out of scope (auth, stream, auto-install, other engines) | not in any task |

**Type names locked:** `ServerParams`, `LlamaCppEngine.build_argv`, `ForbiddenExtraFlagsError`, `run_command`, `SshError`, `SshResult`, `fetch_models`, `chat_completions`, `OpenAIProxyError`, `normalize_base_url`, helper names as Task 2.

**Preview:** UI calls `POST /engines/llama.cpp/preview` — single argv builder.
