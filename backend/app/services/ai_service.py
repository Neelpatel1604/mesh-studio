import asyncio
from typing import AsyncGenerator

from app.core.config import settings
from app.schemas.ai import ChatRequest


class AIService:
    def __init__(self) -> None:
        self._provider_models = {
            "gemini": ["gemini-2.5-pro"],
        }

    def list_providers(self) -> list[str]:
        return sorted(self._provider_models.keys())

    def list_models(self, provider: str | None) -> tuple[str, list[str]]:
        requested_provider = (provider or settings.default_provider).lower()
        # Keep API shape stable while enforcing single-provider operation.
        selected_provider = (
            requested_provider if requested_provider == "gemini" else "gemini"
        )
        models = self._provider_models[selected_provider]
        return selected_provider, models

    def chat(self, payload: ChatRequest) -> tuple[str, str, str]:
        provider, models = self.list_models(payload.provider)
        model = payload.model or models[0]
        latest_user_message = next(
            (msg.content for msg in reversed(payload.messages) if msg.role == "user"),
            "",
        )
        response = (
            f"Provider={provider}; Model={model}; "
            f"Echo='{latest_user_message[:200]}'"
        )
        return provider, model, response

    async def stream_chat(self, payload: ChatRequest) -> AsyncGenerator[str, None]:
        provider, model, response = self.chat(payload)
        yield f"event: meta\ndata: {{\"provider\":\"{provider}\",\"model\":\"{model}\"}}\n\n"
        for chunk in response.split(" "):
            await asyncio.sleep(0.02)
            yield f"event: chunk\ndata: {chunk}\n\n"
        yield "event: done\ndata: [DONE]\n\n"
