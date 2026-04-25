from pydantic import BaseModel


class UploadResponse(BaseModel):
    file_id: str
    filename: str
    content_type: str
    size_bytes: int
    sha256: str
    message: str
