from pydantic import BaseModel, Field


class SessionDocument(BaseModel):
    id: str
    source_code: str = ""
    chat_history: list[dict] = Field(default_factory=list)
    settings: dict = Field(default_factory=dict)
