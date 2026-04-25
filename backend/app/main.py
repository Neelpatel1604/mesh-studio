from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from app.api.routes_ai import router as ai_router
from app.api.routes_compile import router as compile_router
from app.api.routes_editor import router as editor_router
from app.api.routes_sessions import router as sessions_router
from app.api.routes_uploads import router as uploads_router
from app.core.config import settings

app = FastAPI(title=settings.app_name)

allowed_origins = [origin.strip() for origin in settings.cors_allow_origins.split(",") if origin.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ai_router)
app.include_router(compile_router)
app.include_router(editor_router)
app.include_router(sessions_router)
app.include_router(uploads_router)
artifacts_dir = Path(settings.storage_dir) / "compile_artifacts"
artifacts_dir.mkdir(parents=True, exist_ok=True)
app.mount("/artifacts", StaticFiles(directory=artifacts_dir), name="artifacts")


@app.get("/health")
def health() -> JSONResponse:
    return JSONResponse({"status": "ok", "env": settings.app_env})
