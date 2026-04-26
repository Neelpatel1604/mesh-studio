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
- If user intent is ambiguous, do not ask clarifying questions; choose sensible defaults and proceed.
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
- Use OpenSCAD-compatible syntax only: do NOT use typed declarations like `float`, `int`, `var`, or semicolon-less syntax.
- Default placement: keep objects centered in X and Y around origin.
- Keep all geometry at or above Z=0 by default (no negative Z), unless user explicitly requests otherwise.
"""

TEXT_TO_3D_PROMPT_SUFFIX = """
Text-to-3D mode is enabled.
- Treat the latest user prompt as a fresh text-to-3D generation request.
- Return ONLY one fenced code block tagged as synapscad.
- Do NOT return <<<REPLACE>>> blocks in this mode.
- Generate complete code that can be compiled as a standalone 3D model.
- On the first user generation response, do NOT use `center=true` in primitives.
- Keep model placement centered in X/Y and above Z=0.
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

        if (
            payload.generation_mode != "text_to_3d"
            and payload.current_code is not None
            and payload.current_code.strip()
        ):
            code_context = (
                "Current OpenSCAD code (use exact text when creating <<<REPLACE>>> blocks):\n"
                f"```openscad\n{payload.current_code}\n```"
            )
            conversation.append({"role": "user", "parts": [{"text": code_context}]})

        system_prompt = DEFAULT_SYSTEM_PROMPT
        if payload.generation_mode == "text_to_3d":
            system_prompt = f"{DEFAULT_SYSTEM_PROMPT}\n\n{TEXT_TO_3D_PROMPT_SUFFIX.strip()}"

        url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
            f"?key={api_key}"
        )
        body = {
            "system_instruction": {
                "parts": [{"text": system_prompt}],
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

    async def text_to_speech(self, text: str, voice_id: str | None = None) -> bytes:
        api_key = settings.elevenlabs_api_key.strip()
        if not api_key:
            raise RuntimeError("ELEVENLABS_API_KEY is missing in backend environment")
        cleaned_text = text.strip()
        if not cleaned_text:
            raise RuntimeError("No text provided for text-to-speech")

        selected_voice = (voice_id or settings.elevenlabs_voice_id).strip()
        if not selected_voice:
            raise RuntimeError("No ElevenLabs voice ID configured")

        url = f"https://api.elevenlabs.io/v1/text-to-speech/{selected_voice}"
        payload = {
            "text": cleaned_text,
            "model_id": "eleven_multilingual_v2",
            "voice_settings": {
                "stability": 0.45,
                "similarity_boost": 0.75,
            },
        }
        headers = {
            "xi-api-key": api_key,
            "accept": "audio/mpeg",
            "content-type": "application/json",
        }
        async with httpx.AsyncClient(timeout=45.0) as client:
            try:
                response = await client.post(url, json=payload, headers=headers)
                response.raise_for_status()
            except httpx.HTTPStatusError as exc:
                if exc.response.status_code == 401:
                    raise RuntimeError(
                        "ElevenLabs rejected the API key (401 Unauthorized). "
                        "Check ELEVENLABS_API_KEY format and restart backend."
                    ) from exc
                raise
            return response.content
