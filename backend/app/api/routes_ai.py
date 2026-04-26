from fastapi import APIRouter
from fastapi import HTTPException
from fastapi.responses import StreamingResponse

from app.api.deps import ai_service, chat_history_service, compile_service, session_service
from app.schemas.compile import CompileRequest
from app.services.code_change_service import apply_ai_code_change
from app.schemas.ai import (
    ChatRequest,
    ChatResponse,
    ModelListResponse,
    ProviderListResponse,
    TextToSpeechRequest,
)

router = APIRouter(prefix="/ai", tags=["ai"])


@router.get("/providers", response_model=ProviderListResponse)
def get_providers() -> ProviderListResponse:
    return ProviderListResponse(providers=ai_service.list_providers())


@router.get("/models", response_model=ModelListResponse)
def get_models(provider: str | None = None) -> ModelListResponse:
    selected_provider, models = ai_service.list_models(provider)
    return ModelListResponse(provider=selected_provider, models=models)


@router.post("/chat", response_model=ChatResponse)
async def chat(payload: ChatRequest) -> ChatResponse:
    try:
        provider, model, response = await ai_service.chat(payload)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    session_doc = session_service.get(payload.session_id)
    current_code = payload.current_code if payload.current_code is not None else session_doc.source_code
    code_change = apply_ai_code_change(current_code=current_code, ai_text=response)

    session_doc.source_code = code_change.updated_code
    session_service.save(session_doc)

    compile_job_id: str | None = None
    compile_status: str | None = None
    predicted_model_url: str | None = None
    predicted_preview_url: str | None = None
    if code_change.applied:
        compile_job_id = compile_service.create_job(
            CompileRequest(
                source_code=code_change.updated_code,
                user_id=payload.user_id,
            )
        )
        compile_status = "queued"
        predicted_model_url = f"/artifacts/{compile_job_id}/model.stl"
        predicted_preview_url = f"/artifacts/{compile_job_id}/preview.png"

    latest_user_message = next(
        (msg for msg in reversed(payload.messages) if msg.role == "user" and msg.content.strip()),
        None,
    )
    if latest_user_message:
        chat_history_service.record_message(
            user_id=payload.user_id,
            chat_id=payload.session_id,
            role="user",
            content=latest_user_message.content,
        )
    chat_history_service.record_message(
        user_id=payload.user_id,
        chat_id=payload.session_id,
        role="assistant",
        content=response,
        compile_job_id=compile_job_id,
        model_url=predicted_model_url,
        preview_url=predicted_preview_url,
    )

    return ChatResponse(
        provider=provider,
        model=model,
        response=response,
        updated_code=code_change.updated_code,
        code_change_applied=code_change.applied,
        code_change_mode=code_change.mode,
        replacement_count=code_change.replacement_count,
        code_change_error=code_change.error,
        compile_job_id=compile_job_id,
        compile_status=compile_status,
    )


@router.post("/chat/stream")
async def stream_chat(payload: ChatRequest) -> StreamingResponse:
    return StreamingResponse(
        ai_service.stream_chat(payload),
        media_type="text/event-stream",
    )


@router.post("/speak")
async def speak(payload: TextToSpeechRequest) -> StreamingResponse:
    try:
        audio_bytes = await ai_service.text_to_speech(
            text=payload.text,
            voice_id=payload.voice_id,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return StreamingResponse(
        iter([audio_bytes]),
        media_type="audio/mpeg",
        headers={"Content-Disposition": "inline; filename=ai-voice.mp3"},
    )
