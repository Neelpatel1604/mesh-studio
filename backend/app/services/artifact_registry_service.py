import json
import threading
import time
from pathlib import Path
from typing import Any

import httpx

from app.core.config import settings


class ArtifactRegistryService:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._local_path = settings.storage_dir / "user_artifacts.json"
        self._local_records: list[dict[str, Any]] = []
        self._load_local_records()

    def record_compile_artifact(self, user_id: str | None, job_id: str, output: dict | None) -> tuple[str, str | None]:
        if not user_id or not user_id.strip():
            return "skipped", "Missing user_id; artifact not linked to any user."
        payload = self._build_record(user_id=user_id.strip(), job_id=job_id, output=output)
        stored, error_msg = self._write_remote(payload)
        if not stored:
            self._write_local(payload)
            if error_msg:
                return "local", f"Supabase write failed; saved locally instead. {error_msg}"
            return "local", "Supabase not configured; saved locally instead."
        return "supabase", None

    def list_for_user(self, user_id: str) -> list[dict[str, Any]]:
        user_id = user_id.strip()
        if not user_id:
            return []
        remote = self._read_remote(user_id)
        if remote is not None:
            return remote
        with self._lock:
            records = [r for r in self._local_records if r.get("user_id") == user_id]
        records.sort(key=lambda item: float(item.get("created_at_epoch", 0.0)), reverse=True)
        return records

    def save_compile_artifact(self, user_id: str, job_id: str, output: dict | None) -> tuple[str, str | None]:
        payload = self._build_record(user_id=user_id.strip(), job_id=job_id, output=output)
        stored, error_msg, inserted = self._write_remote_if_changed(user_id=user_id.strip(), payload=payload)
        if not stored:
            inserted_local = self._write_local_if_changed(user_id=user_id.strip(), payload=payload)
            if error_msg:
                return "local", f"Supabase save failed; saved locally instead. {error_msg}"
            if inserted_local:
                return "local", "Supabase not configured; saved locally instead."
            return "local", "No change detected; existing saved row already matches."
        if not inserted:
            return "supabase", "No change detected; existing saved row already matches."
        return "supabase", None

    def _build_record(self, user_id: str, job_id: str, output: dict | None) -> dict[str, Any]:
        output = output or {}
        now = time.time()
        return {
            "user_id": user_id,
            "compile_job_id": job_id,
            "stl_url": output.get("stl_url"),
            "model_3mf_url": output.get("model_3mf_url"),
            "preview_url": output.get("preview_url"),
            "status": "completed",
            "created_at_epoch": now,
        }

    def _write_remote(self, payload: dict[str, Any]) -> tuple[bool, str | None]:
        base_url = settings.supabase_url.strip().rstrip("/")
        service_key = settings.supabase_service_role_key.strip()
        table = settings.supabase_artifacts_table.strip()
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

    def _write_remote_if_changed(self, user_id: str, payload: dict[str, Any]) -> tuple[bool, str | None, bool]:
        base_url = settings.supabase_url.strip().rstrip("/")
        service_key = settings.supabase_service_role_key.strip()
        table = settings.supabase_artifacts_table.strip()
        if not base_url or not service_key or not table:
            return False, None, False
        url = f"{base_url}/rest/v1/{table}"
        base_headers = {
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
        }
        try:
            with httpx.Client(timeout=15.0) as client:
                latest_resp = client.get(
                    url,
                    headers=base_headers,
                    params={
                        "select": "user_id,compile_job_id,stl_url,model_3mf_url,preview_url,status",
                        "user_id": f"eq.{user_id}",
                        "order": "created_at.desc",
                        "limit": "1",
                    },
                )
                latest_resp.raise_for_status()
                latest_data = latest_resp.json()
                if isinstance(latest_data, list) and latest_data:
                    latest = latest_data[0]
                    if self._records_equivalent(latest, payload):
                        return True, None, False
                insert_headers = {
                    **base_headers,
                    "Content-Type": "application/json",
                    "Prefer": "return=minimal",
                }
                insert_resp = client.post(url, headers=insert_headers, json=payload)
                insert_resp.raise_for_status()
            return True, None, True
        except Exception as exc:
            return False, str(exc), False

    def _read_remote(self, user_id: str) -> list[dict[str, Any]] | None:
        base_url = settings.supabase_url.strip().rstrip("/")
        service_key = settings.supabase_service_role_key.strip()
        table = settings.supabase_artifacts_table.strip()
        if not base_url or not service_key or not table:
            return None
        url = f"{base_url}/rest/v1/{table}"
        params = {
            "select": "user_id,compile_job_id,stl_url,model_3mf_url,preview_url,status,created_at,created_at_epoch",
            "user_id": f"eq.{user_id}",
            "order": "created_at.desc",
        }
        headers = {
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
        }
        try:
            with httpx.Client(timeout=15.0) as client:
                response = client.get(url, headers=headers, params=params)
                response.raise_for_status()
                data = response.json()
            return data if isinstance(data, list) else []
        except Exception:
            return None

    def _load_local_records(self) -> None:
        if not self._local_path.exists():
            return
        try:
            raw = json.loads(self._local_path.read_text(encoding="utf-8"))
        except Exception:
            return
        if isinstance(raw, list):
            self._local_records = [item for item in raw if isinstance(item, dict)]

    def _write_local(self, payload: dict[str, Any]) -> None:
        with self._lock:
            self._local_records = [
                item
                for item in self._local_records
                if not (
                    item.get("user_id") == payload.get("user_id")
                    and item.get("compile_job_id") == payload.get("compile_job_id")
                )
            ]
            self._local_records.append(payload)
            serialized = list(self._local_records)
        self._local_path.parent.mkdir(parents=True, exist_ok=True)
        self._local_path.write_text(json.dumps(serialized, indent=2), encoding="utf-8")

    def _write_local_replace_user(self, user_id: str, payload: dict[str, Any]) -> None:
        with self._lock:
            self._local_records = [item for item in self._local_records if item.get("user_id") != user_id]
            self._local_records.append(payload)
            serialized = list(self._local_records)
        self._local_path.parent.mkdir(parents=True, exist_ok=True)
        self._local_path.write_text(json.dumps(serialized, indent=2), encoding="utf-8")

    def _write_local_if_changed(self, user_id: str, payload: dict[str, Any]) -> bool:
        inserted = True
        with self._lock:
            user_records = [item for item in self._local_records if item.get("user_id") == user_id]
            user_records.sort(key=lambda item: float(item.get("created_at_epoch", 0.0)), reverse=True)
            if user_records and self._records_equivalent(user_records[0], payload):
                inserted = False
            else:
                self._local_records.append(payload)
            serialized = list(self._local_records)
        self._local_path.parent.mkdir(parents=True, exist_ok=True)
        self._local_path.write_text(json.dumps(serialized, indent=2), encoding="utf-8")
        return inserted

    def _records_equivalent(self, a: dict[str, Any], b: dict[str, Any]) -> bool:
        keys = ("user_id", "compile_job_id", "stl_url", "model_3mf_url", "preview_url", "status")
        for key in keys:
            if a.get(key) != b.get(key):
                return False
        return True
