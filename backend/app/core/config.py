from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Mesh Studio Backend"
    app_env: str = "development"
    storage_dir: Path = Path(__file__).resolve().parents[2] / "storage"
    max_upload_mb: int = 10
    default_provider: str = "gemini"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
