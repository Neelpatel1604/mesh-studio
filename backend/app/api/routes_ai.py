from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.api.deps import ai_service
from app.schemas.ai import ChatRequest, ChatResponse, ModelListResponse, ProviderListResponse

router = APIRouter(prefix="/ai", tags=["ai"])


@router.get("/providers", response_model=ProviderListResponse)
def get_providers() -> ProviderListResponse:
    return ProviderListResponse(providers=ai_service.list_providers())


@router.get("/models", response_model=ModelListResponse)
def get_models(provider: str | None = None) -> ModelListResponse:
    selected_provider, models = ai_service.list_models(provider)
    return ModelListResponse(provider=selected_provider, models=models)


@router.post("/chat", response_model=ChatResponse)
def chat(payload: ChatRequest) -> ChatResponse:
    provider, model, response = ai_service.chat(payload)
    return ChatResponse(provider=provider, model=model, response=response)


@router.post("/chat/stream")
async def stream_chat(payload: ChatRequest) -> StreamingResponse:
    return StreamingResponse(
        ai_service.stream_chat(payload),
        media_type="text/event-stream",
    )
