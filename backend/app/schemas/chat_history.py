from pydantic import BaseModel, Field


class ChatHistoryMessage(BaseModel):
    user_id: str
    chat_id: str
    role: str
    content: str
    compile_job_id: str | None = None
    model_url: str | None = None
    preview_url: str | None = None
    created_at: str | None = None
    created_at_epoch: float | None = None


class ChatHistoryResponse(BaseModel):
    chat_id: str
    items: list[ChatHistoryMessage] = Field(default_factory=list)


class ChatHistorySummaryItem(BaseModel):
    chat_id: str
    last_message: str
    last_role: str
    last_model_url: str | None = None
    last_preview_url: str | None = None
    updated_at_epoch: float


class ChatHistoryListResponse(BaseModel):
    user_id: str
    chats: list[ChatHistorySummaryItem] = Field(default_factory=list)
