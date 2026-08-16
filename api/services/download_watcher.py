import asyncio
from api.logger import get_logger
from api.services.downloads import sync_active_jobs

logger = get_logger(__name__)
POLL_SECONDS = 3.0


async def watch_downloads(stop: asyncio.Event) -> None:
    while not stop.is_set():
        try:
            await sync_active_jobs()
        except Exception:
            logger.exception("download watcher tick failed")
        try:
            await asyncio.wait_for(stop.wait(), timeout=POLL_SECONDS)
        except TimeoutError:
            pass
