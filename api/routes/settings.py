from datetime import datetime
from fastapi import APIRouter
from api.database import get_database
from api.helpers import SETTINGS_DOC_ID, settings_helper
from api.models.models import SettingsUpdate

router = APIRouter(tags=["settings"], prefix="/settings")


@router.get("")
async def get_settings():
    db = get_database()
    doc = await db.settings.find_one({"_id": SETTINGS_DOC_ID})
    return settings_helper(doc)


@router.put("")
async def update_settings(update: SettingsUpdate):
    db = get_database()
    data = {k: v for k, v in update.model_dump(mode="json").items() if v is not None}
    if "libraryDir" in data and isinstance(data["libraryDir"], str):
        data["libraryDir"] = data["libraryDir"].strip()
    now = datetime.utcnow()
    data["updatedAt"] = now
    await db.settings.update_one(
        {"_id": SETTINGS_DOC_ID},
        {"$set": data, "$setOnInsert": {"createdAt": now}},
        upsert=True,
    )
    doc = await db.settings.find_one({"_id": SETTINGS_DOC_ID})
    return settings_helper(doc)
