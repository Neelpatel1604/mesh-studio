from pydantic import BaseModel, Field
from app.schemas.editor import EditorState


class SessionDocument(BaseModel):
    id: str
    source_code: str = ""
    chat_history: list[dict] = Field(default_factory=list)
    settings: dict = Field(default_factory=dict)
    editor_state: EditorState = Field(default_factory=EditorState)
