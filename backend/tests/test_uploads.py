from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_upload_image_metadata_only() -> None:
    response = client.post(
        "/uploads/images",
        files={"file": ("test.png", b"fakepng-bytes", "image/png")},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["filename"] == "test.png"
    assert body["content_type"] == "image/png"
    assert body["size_bytes"] == len(b"fakepng-bytes")
    assert body["sha256"]
    assert "not stored" in body["message"].lower()


def test_upload_mesh_stores_file() -> None:
    response = client.post(
        "/uploads/meshes",
        files={"file": ("edited.stl", b"solid test\nendsolid test\n", "application/sla")},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["filename"] == "edited.stl"
    assert body["file_url"].startswith("/edited/")
    assert body["size_bytes"] > 0
