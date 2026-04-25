from pydantic import BaseModel, Field


class CompileRequest(BaseModel):
    source_code: str = ""
    user_id: str | None = None


class CompileCreateResponse(BaseModel):
    job_id: str
    status: str


class CompileStatusResponse(BaseModel):
    job_id: str
    status: str
    warnings: list[str] = Field(default_factory=list)
    output: dict | None = None
    error: str | None = None
