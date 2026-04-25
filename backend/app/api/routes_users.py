from fastapi import APIRouter

from app.api.deps import artifact_registry_service
from app.schemas.artifact import UserArtifactListResponse, UserArtifactRecord

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/{user_id}/artifacts", response_model=UserArtifactListResponse)
def get_user_artifacts(user_id: str) -> UserArtifactListResponse:
    records = artifact_registry_service.list_for_user(user_id)
    items = [UserArtifactRecord(**record) for record in records]
    return UserArtifactListResponse(user_id=user_id, items=items)
