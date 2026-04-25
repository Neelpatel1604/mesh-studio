from app.schemas.session import SessionDocument


class SessionService:
    def __init__(self) -> None:
        self._sessions: dict[str, SessionDocument] = {}

    def get(self, session_id: str) -> SessionDocument:
        return self._sessions.get(session_id, SessionDocument(id=session_id))

    def save(self, payload: SessionDocument) -> SessionDocument:
        self._sessions[payload.id] = payload
        return payload
