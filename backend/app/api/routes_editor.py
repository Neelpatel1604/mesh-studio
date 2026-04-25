import math

from fastapi import APIRouter

from app.api.deps import session_service
from app.schemas.editor import EditorState, MeasurementRequest, MeasurementResult

router = APIRouter(tags=["editor"])

UNIT_SCALE = {"mm": 1.0, "cm": 0.1, "in": 1.0 / 25.4}


def _format_distance(value_mm: float, unit: str) -> str:
    scale = UNIT_SCALE.get(unit, 1.0)
    precision = 2 if unit == "mm" else 3
    return f"{value_mm * scale:.{precision}f} {unit}"


@router.get("/sessions/{session_id}/editor-state", response_model=EditorState)
def get_editor_state(session_id: str) -> EditorState:
    return session_service.get_editor_state(session_id)


@router.put("/sessions/{session_id}/editor-state", response_model=EditorState)
def put_editor_state(session_id: str, payload: EditorState) -> EditorState:
    return session_service.save_editor_state(session_id, payload)


@router.post("/measurements", response_model=MeasurementResult)
def measure_distance(payload: MeasurementRequest) -> MeasurementResult:
    distance = math.dist(payload.point_a, payload.point_b)
    return MeasurementResult(
        unit=payload.unit,
        distance=distance,
        formatted_distance=_format_distance(distance, payload.unit),
    )
