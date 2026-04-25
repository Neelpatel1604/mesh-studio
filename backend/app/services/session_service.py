from app.schemas.editor import EditorState
from app.schemas.session import SessionDocument


class SessionService:
    def __init__(self) -> None:
        self._sessions: dict[str, SessionDocument] = {}

    def get(self, session_id: str) -> SessionDocument:
        return self._sessions.get(session_id, SessionDocument(id=session_id))

    def save(self, payload: SessionDocument) -> SessionDocument:
        self._sessions[payload.id] = payload
        return payload

    def get_editor_state(self, session_id: str) -> EditorState:
        return self.get(session_id).editor_state

    def save_editor_state(self, session_id: str, editor_state: EditorState) -> EditorState:
        session = self.get(session_id)
        session.editor_state = editor_state
        self.save(session)
        return editor_state
