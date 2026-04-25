from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_editor_state_roundtrip() -> None:
    payload = {
        "model_url": "/artifacts/demo/model.stl",
        "mode": "edit",
        "unit": "mm",
        "selected_control_point": {"id": "3", "position": [1.0, 2.0, 3.0]},
        "measurement_points": [[0.0, 0.0, 0.0], [10.0, 0.0, 0.0]],
    }
    put_resp = client.put("/sessions/default/editor-state", json=payload)
    assert put_resp.status_code == 200
    get_resp = client.get("/sessions/default/editor-state")
    assert get_resp.status_code == 200
    body = get_resp.json()
    assert body["mode"] == "edit"
    assert body["selected_control_point"]["id"] == "3"
    assert body["measurement_points"] == [[0.0, 0.0, 0.0], [10.0, 0.0, 0.0]]


def test_measurement_endpoint() -> None:
    resp = client.post(
        "/measurements",
        json={"unit": "mm", "point_a": [0.0, 0.0, 0.0], "point_b": [3.0, 4.0, 0.0]},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["unit"] == "mm"
    assert body["distance"] == 5.0
    assert body["formatted_distance"] == "5.00 mm"
