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
