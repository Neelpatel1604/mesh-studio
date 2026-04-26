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


class SaveUserArtifactRequest(BaseModel):
    compile_job_id: str


class SaveUploadedArtifactRequest(BaseModel):
    file_id: str
    file_url: str


class SaveUserArtifactResponse(BaseModel):
    user_id: str
    compile_job_id: str
    saved_to: str
    message: str
