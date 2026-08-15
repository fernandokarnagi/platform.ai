import pytest_asyncio
from api.config import settings
import api.database as database
from api.database import connect_to_mongo, close_mongo_connection


@pytest_asyncio.fixture
async def app():
    from api.main import app as fastapi_app
    settings.database_name = settings.test_database_name
    await connect_to_mongo()
    db = database.client[settings.test_database_name]
    for name in await db.list_collection_names():
        await db[name].delete_many({})
    yield fastapi_app
    close_mongo_connection()
