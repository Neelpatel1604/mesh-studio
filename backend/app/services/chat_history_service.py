import json
import threading
import time
from collections import defaultdict
from typing import Any

import httpx

from app.core.config import settings


class ChatHistoryService:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._local_messages: list[dict[str, Any]] = []

    def record_message(
        self,
        user_id: str | None,
        chat_id: str,
        role: str,
        content: str,
        compile_job_id: str | None = None,
        model_url: str | None = None,
        preview_url: str | None = None,
    ) -> tuple[str, str | None]:
        clean_user = (user_id or "").strip()
        if not clean_user:
            return "skipped", "Missing user_id; chat history not persisted."
        payload = {
            "user_id": clean_user,
            "chat_id": chat_id.strip() or "default",
            "role": role,
            "content": content.strip(),
            "compile_job_id": compile_job_id,
            "model_url": model_url,
            "preview_url": preview_url,
            "created_at_epoch": time.time(),
        }
        stored, error_msg = self._write_remote(payload)
        if stored:
            return "supabase", None
        self._write_local(payload)
        if error_msg:
            return "local", f"Supabase history write failed; saved locally instead. {error_msg}"
        return "local", "Supabase not configured; saved history locally."

    def get_chat(self, user_id: str, chat_id: str) -> list[dict[str, Any]]:
        user_id = user_id.strip()
        chat_id = chat_id.strip()
        if not user_id or not chat_id:
            return []
        remote = self._read_remote_chat(user_id=user_id, chat_id=chat_id)
        if remote is not None:
            return remote
        with self._lock:
            items = [
                item for item in self._local_messages if item.get("user_id") == user_id and item.get("chat_id") == chat_id
            ]
        items.sort(key=lambda item: float(item.get("created_at_epoch", 0.0)))
        return items

    def list_chats(self, user_id: str) -> list[dict[str, Any]]:
        user_id = user_id.strip()
        if not user_id:
            return []
        remote = self._read_remote_user_messages(user_id=user_id)
        if remote is None:
            with self._lock:
                remote = [item for item in self._local_messages if item.get("user_id") == user_id]
        buckets: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for row in remote:
            chat_id = str(row.get("chat_id") or "").strip()
            if not chat_id:
                continue
            buckets[chat_id].append(row)
        summary: list[dict[str, Any]] = []
        for chat_id, rows in buckets.items():
            rows.sort(key=lambda item: float(item.get("created_at_epoch", 0.0)))
            last = rows[-1]
            summary.append(
                {
                    "chat_id": chat_id,
                    "last_message": str(last.get("content") or ""),
                    "last_role": str(last.get("role") or "assistant"),
                    "last_model_url": last.get("model_url"),
                    "last_preview_url": last.get("preview_url"),
                    "updated_at_epoch": float(last.get("created_at_epoch", 0.0)),
                }
            )
        summary.sort(key=lambda item: item["updated_at_epoch"], reverse=True)
        return summary

    def _write_remote(self, payload: dict[str, Any]) -> tuple[bool, str | None]:
        base_url = settings.supabase_url.strip().rstrip("/")
        service_key = settings.supabase_service_role_key.strip()
        table = settings.supabase_chat_messages_table.strip()
        if not base_url or not service_key or not table:
            return False, None
        url = f"{base_url}/rest/v1/{table}"
        headers = {
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        }
        try:
            with httpx.Client(timeout=15.0) as client:
                response = client.post(url, headers=headers, json=payload)
                response.raise_for_status()
            return True, None
        except Exception as exc:
            return False, str(exc)

    def _read_remote_chat(self, user_id: str, chat_id: str) -> list[dict[str, Any]] | None:
        base_url = settings.supabase_url.strip().rstrip("/")
        service_key = settings.supabase_service_role_key.strip()
        table = settings.supabase_chat_messages_table.strip()
        if not base_url or not service_key or not table:
            return None
        url = f"{base_url}/rest/v1/{table}"
        headers = {
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
        }
        params = {
            "select": "user_id,chat_id,role,content,compile_job_id,model_url,preview_url,created_at,created_at_epoch",
            "user_id": f"eq.{user_id}",
            "chat_id": f"eq.{chat_id}",
            "order": "created_at.asc",
        }
        try:
            with httpx.Client(timeout=15.0) as client:
                response = client.get(url, headers=headers, params=params)
                response.raise_for_status()
                data = response.json()
            return data if isinstance(data, list) else []
        except Exception:
            return None

    def _read_remote_user_messages(self, user_id: str) -> list[dict[str, Any]] | None:
        base_url = settings.supabase_url.strip().rstrip("/")
        service_key = settings.supabase_service_role_key.strip()
        table = settings.supabase_chat_messages_table.strip()
        if not base_url or not service_key or not table:
            return None
        url = f"{base_url}/rest/v1/{table}"
        headers = {
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
        }
        params = {
            "select": "user_id,chat_id,role,content,model_url,preview_url,created_at_epoch",
            "user_id": f"eq.{user_id}",
            "order": "created_at.asc",
        }
        try:
            with httpx.Client(timeout=15.0) as client:
                response = client.get(url, headers=headers, params=params)
                response.raise_for_status()
                data = response.json()
            return data if isinstance(data, list) else []
        except Exception:
            return None

    def _write_local(self, payload: dict[str, Any]) -> None:
        with self._lock:
            self._local_messages.append(json.loads(json.dumps(payload)))
