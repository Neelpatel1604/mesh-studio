from fastapi import APIRouter

from app.api.deps import session_service
from app.schemas.session import SessionDocument

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.get("/{session_id}", response_model=SessionDocument)
def get_session(session_id: str) -> SessionDocument:
    return session_service.get(session_id)


@router.put("/{session_id}", response_model=SessionDocument)
def put_session(session_id: str, payload: SessionDocument) -> SessionDocument:
    if payload.id != session_id:
        payload.id = session_id
    return session_service.save(payload)
