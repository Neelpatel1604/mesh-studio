from fastapi import APIRouter, HTTPException

from app.api.deps import compile_service
from app.schemas.compile import (
    CompileCreateResponse,
    CompileRequest,
    CompileStatusResponse,
)

router = APIRouter(prefix="/compile", tags=["compile"])


@router.post("", response_model=CompileCreateResponse)
async def create_compile(payload: CompileRequest) -> CompileCreateResponse:
    job_id = compile_service.create_job(payload)
    return CompileCreateResponse(job_id=job_id, status="queued")


@router.get("/{job_id}", response_model=CompileStatusResponse)
async def get_compile(job_id: str) -> CompileStatusResponse:
    job = compile_service.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Compile job not found")
    return CompileStatusResponse(
        job_id=job_id,
        status=job["status"],
        warnings=job["warnings"],
        output=job["output"],
        error=job["error"],
    )


@router.post("/{job_id}/cancel", response_model=CompileStatusResponse)
async def cancel_compile(job_id: str) -> CompileStatusResponse:
    job = compile_service.cancel_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Compile job not found")
    return CompileStatusResponse(
        job_id=job_id,
        status=job["status"],
        warnings=job["warnings"],
        output=job["output"],
        error=job["error"],
    )
