from fastapi import APIRouter

from app.api.deps import chat_history_service
from app.schemas.chat_history import (
    ChatHistoryListResponse,
    ChatHistoryMessage,
    ChatHistoryResponse,
    ChatHistorySummaryItem,
)

router = APIRouter(prefix="/chat-history", tags=["chat-history"])


@router.get("", response_model=ChatHistoryListResponse)
def list_chat_histories(user_id: str) -> ChatHistoryListResponse:
    rows = chat_history_service.list_chats(user_id=user_id)
    chats = [ChatHistorySummaryItem(**row) for row in rows]
    return ChatHistoryListResponse(user_id=user_id, chats=chats)


@router.get("/{chat_id}", response_model=ChatHistoryResponse)
def get_chat_history(chat_id: str, user_id: str) -> ChatHistoryResponse:
    rows = chat_history_service.get_chat(user_id=user_id, chat_id=chat_id)
    items = [ChatHistoryMessage(**row) for row in rows]
    return ChatHistoryResponse(chat_id=chat_id, items=items)
