from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Mesh Studio Backend"
    app_env: str = "development"
    storage_dir: Path = Path(__file__).resolve().parents[2] / "storage"
    max_upload_mb: int = 10
    default_provider: str = "gemini"
    cors_allow_origins: str = "http://localhost:3000,http://127.0.0.1:3000"
    gemini_api_key: str = ""
    google_vision_api_key: str = ""
    image_to_3d_provider: str = "mock"
    elevenlabs_api_key: str = ""
    elevenlabs_voice_id: str = "JBFqnCBsd6RMkjVDRZzb"
    openscad_bin: str = "openscad"
    compile_timeout_sec: int = 900

    model_config = SettingsConfigDict(
        env_file=(".env", "app/.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
