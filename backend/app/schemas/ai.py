from pydantic import BaseModel, Field


class ProviderListResponse(BaseModel):
    providers: list[str]


class ModelListResponse(BaseModel):
    provider: str
    models: list[str]


class ChatImage(BaseModel):
    name: str
    content_type: str
    data_base64: str


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    session_id: str = "default"
    current_code: str | None = None
    provider: str | None = None
    model: str | None = None
    messages: list[ChatMessage] = Field(default_factory=list)
    images: list[ChatImage] = Field(default_factory=list)


class ChatResponse(BaseModel):
    provider: str
    model: str
    response: str
    updated_code: str
    code_change_applied: bool
    code_change_mode: str
    replacement_count: int = 0
    code_change_error: str | None = None
    compile_job_id: str | None = None
    compile_status: str | None = None


class TextToSpeechRequest(BaseModel):
    text: str
    voice_id: str | None = None
