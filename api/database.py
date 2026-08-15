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
