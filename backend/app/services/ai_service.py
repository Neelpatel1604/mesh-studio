import asyncio
from typing import AsyncGenerator

import httpx

from app.core.config import settings
from app.schemas.ai import ChatRequest

DEFAULT_SYSTEM_PROMPT = """You are an AI assistant for a 3D CAD application.
The user is building 3D models with OpenSCAD-style workflows.

Behavior requirements:
- Stay focused on 3D modeling and CAD intent.
- Provide practical geometry changes, dimensions, and structure.
- Prefer physically plausible results (clearances, hollow parts where needed, support, fit).
- If user intent is ambiguous, ask a short clarifying question.
- Be concise and implementation-oriented.
- Avoid unrelated generic answers unless explicitly requested.

Code edit output rules:
- For targeted edits, output ONLY one or more blocks in this exact format:
<<<REPLACE
<exact current text from code>
===
<replacement text>
>>>
- For full rewrites, output ONLY one fenced code block tagged as synapscad.
- Do NOT use placeholders like <current_size>.
- Do NOT output markdown "Find/Replace" prose.
- Always produce a valid 3D top-level object suitable for STL export.
- If your shape is 2D, convert it to 3D using operations like linear_extrude(), rotate_extrude(), or explicit 3D primitives.
"""


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

    async def chat(self, payload: ChatRequest) -> tuple[str, str, str]:
        provider, models = self.list_models(payload.provider)
        model = payload.model or models[0]
        api_key = settings.gemini_api_key.strip()
        if not api_key:
            raise RuntimeError("GEMINI_API_KEY is missing in backend environment")

        conversation = [
            {
                "role": "user" if message.role == "user" else "model",
                "parts": [{"text": message.content}],
            }
            for message in payload.messages
            if message.content.strip()
        ]
        if not conversation:
            conversation = [
                {
                    "role": "user",
                    "parts": [
                        {
                            "text": (
                                "You are helping in a 3D CAD viewport. "
                                "Please ask what object the user wants to model."
                            )
                        }
                    ],
                }
            ]

        # Add lightweight multimodal context notice when frontend attaches image refs.
        if payload.images:
            image_note = (
                f"User attached {len(payload.images)} image reference(s). "
                "Treat them as design references for 3D CAD guidance."
            )
            conversation.append({"role": "user", "parts": [{"text": image_note}]})

        if payload.current_code is not None and payload.current_code.strip():
            code_context = (
                "Current OpenSCAD code (use exact text when creating <<<REPLACE>>> blocks):\n"
                f"```openscad\n{payload.current_code}\n```"
            )
            conversation.append({"role": "user", "parts": [{"text": code_context}]})

        url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
            f"?key={api_key}"
        )
        body = {
            "system_instruction": {
                "parts": [{"text": DEFAULT_SYSTEM_PROMPT}],
            },
            "contents": conversation,
            "generationConfig": {
                "temperature": 0.2,
            },
        }

        async with httpx.AsyncClient(timeout=60.0) as client:
            api_response = await client.post(url, json=body)
            api_response.raise_for_status()
            data = api_response.json()

        text_parts = []
        for candidate in data.get("candidates", []):
            content = candidate.get("content", {})
            for part in content.get("parts", []):
                text = part.get("text")
                if text:
                    text_parts.append(text)
        response = "\n".join(text_parts).strip() or "No response returned by Gemini."
        return provider, model, response

    async def stream_chat(self, payload: ChatRequest) -> AsyncGenerator[str, None]:
        provider, model, response = await self.chat(payload)
        yield f"event: meta\ndata: {{\"provider\":\"{provider}\",\"model\":\"{model}\"}}\n\n"
        for chunk in response.split(" "):
            await asyncio.sleep(0.02)
            yield f"event: chunk\ndata: {chunk}\n\n"
        yield "event: done\ndata: [DONE]\n\n"
