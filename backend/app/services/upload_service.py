import hashlib
import uuid
from pathlib import Path

from fastapi import UploadFile
from app.core.config import settings


class UploadService:
    async def save_image_metadata(self, file: UploadFile) -> dict:
        content = await file.read()
        sha256 = hashlib.sha256(content).hexdigest()
        # Intentionally do not keep image bytes in memory or on disk.
        return {
            "file_id": str(uuid.uuid4()),
            "filename": file.filename or "upload.bin",
            "content_type": file.content_type or "application/octet-stream",
            "size_bytes": len(content),
            "sha256": sha256,
            "message": "Image received; file bytes are not stored.",
        }

    async def save_mesh_file(self, file: UploadFile) -> dict:
        content = await file.read()
        sha256 = hashlib.sha256(content).hexdigest()
        file_id = str(uuid.uuid4())
        suffix = Path(file.filename or "edited.stl").suffix or ".stl"
        filename = f"{file_id}{suffix}"
        mesh_dir = settings.storage_dir / "edited_meshes"
        mesh_dir.mkdir(parents=True, exist_ok=True)
        target = mesh_dir / filename
        target.write_bytes(content)
        return {
            "file_id": file_id,
            "filename": file.filename or filename,
            "content_type": file.content_type or "application/sla",
            "size_bytes": len(content),
            "sha256": sha256,
            "message": "Mesh uploaded and stored successfully.",
            "file_url": f"/edited/{filename}",
        }
