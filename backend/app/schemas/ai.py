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
    provider: str | None = None
    model: str | None = None
    messages: list[ChatMessage] = Field(default_factory=list)
    images: list[ChatImage] = Field(default_factory=list)


class ChatResponse(BaseModel):
    provider: str
    model: str
    response: str
