from pydantic import BaseModel, Field


class UserArtifactRecord(BaseModel):
    user_id: str
    compile_job_id: str
    stl_url: str | None = None
    model_3mf_url: str | None = None
    preview_url: str | None = None
    status: str = "completed"
    created_at: str | None = None
    created_at_epoch: float | None = None


class UserArtifactListResponse(BaseModel):
    user_id: str
    items: list[UserArtifactRecord] = Field(default_factory=list)
