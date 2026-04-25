import hashlib
import uuid

from fastapi import UploadFile


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
