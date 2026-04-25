from fastapi import FastAPI
from fastapi.responses import JSONResponse

from app.api.routes_ai import router as ai_router
from app.api.routes_compile import router as compile_router
from app.api.routes_sessions import router as sessions_router
from app.core.config import settings

app = FastAPI(title=settings.app_name)

app.include_router(ai_router)
app.include_router(compile_router)
app.include_router(sessions_router)


@app.get("/health")
def health() -> JSONResponse:
    return JSONResponse({"status": "ok", "env": settings.app_env})
