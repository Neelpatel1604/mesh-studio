from fastapi import APIRouter, File, HTTPException, UploadFile

from app.api.deps import upload_service
from app.core.config import settings
from app.schemas.upload import UploadResponse

router = APIRouter(prefix="/uploads", tags=["uploads"])


@router.post("/images", response_model=UploadResponse)
async def upload_image(file: UploadFile = File(...)) -> UploadResponse:
    content_type = (file.content_type or "").lower()
    if not content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image uploads are supported")

    max_bytes = settings.max_upload_mb * 1024 * 1024
    file_data = await file.read()
    if len(file_data) > max_bytes:
        raise HTTPException(status_code=413, detail="Image exceeds size limit")

    await file.seek(0)
    saved = await upload_service.save_image_metadata(file)
    return UploadResponse(**saved)
