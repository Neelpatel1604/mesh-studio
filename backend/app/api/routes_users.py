from fastapi import APIRouter, HTTPException

from app.api.deps import artifact_registry_service, compile_service
from app.schemas.artifact import (
    SaveUserArtifactRequest,
    SaveUserArtifactResponse,
    SaveUploadedArtifactRequest,
    UserArtifactListResponse,
    UserArtifactRecord,
)

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/{user_id}/artifacts", response_model=UserArtifactListResponse)
def get_user_artifacts(user_id: str) -> UserArtifactListResponse:
    records = artifact_registry_service.list_for_user(user_id)
    items = [UserArtifactRecord(**record) for record in records]
    return UserArtifactListResponse(user_id=user_id, items=items)


@router.post("/{user_id}/artifacts/save", response_model=SaveUserArtifactResponse)
def save_user_artifact(user_id: str, payload: SaveUserArtifactRequest) -> SaveUserArtifactResponse:
    job = compile_service.get_job(payload.compile_job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Compile job not found")
    if job.get("status") != "completed":
        raise HTTPException(status_code=409, detail="Compile job is not completed yet")
    output = job.get("output")
    if not isinstance(output, dict) or not output.get("stl_url"):
        raise HTTPException(status_code=409, detail="Compile output is not available for saving")

    saved_to, error_msg = artifact_registry_service.save_compile_artifact(
        user_id=user_id,
        job_id=payload.compile_job_id,
        output=output,
    )
    message = error_msg or "Model saved successfully."
    return SaveUserArtifactResponse(
        user_id=user_id,
        compile_job_id=payload.compile_job_id,
        saved_to=saved_to,
        message=message,
    )


@router.post("/{user_id}/artifacts/save-upload", response_model=SaveUserArtifactResponse)
def save_uploaded_artifact(user_id: str, payload: SaveUploadedArtifactRequest) -> SaveUserArtifactResponse:
    upload_job_id = f"upload:{payload.file_id}"
    saved_to, error_msg = artifact_registry_service.save_compile_artifact(
        user_id=user_id,
        job_id=upload_job_id,
        output={
            "stl_url": payload.file_url,
            "model_3mf_url": None,
            "preview_url": None,
        },
    )
    message = error_msg or "Uploaded model saved successfully."
    return SaveUserArtifactResponse(
        user_id=user_id,
        compile_job_id=upload_job_id,
        saved_to=saved_to,
        message=message,
    )
