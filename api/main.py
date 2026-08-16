import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api.logger import configure_logging
from api.database import connect_to_mongo, close_mongo_connection
from api.routes import clusters_router, downloads_router, engines_router, nodes_router
from api.services.download_watcher import watch_downloads

configure_logging()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_to_mongo()
    stop = asyncio.Event()
    watcher = asyncio.create_task(watch_downloads(stop))
    yield
    stop.set()
    await watcher
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

app.include_router(clusters_router)
app.include_router(downloads_router)
app.include_router(engines_router)
app.include_router(nodes_router)


@app.get("/health")
async def health_check():
    return {"status": "healthy"}
