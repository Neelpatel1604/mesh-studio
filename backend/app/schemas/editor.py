from pydantic import BaseModel, Field


class ControlPoint(BaseModel):
    id: str
    position: tuple[float, float, float]


class EditorState(BaseModel):
    model_url: str | None = None
    mode: str = "orbit"
    active_tool: str = "orbit"
    unit: str = "mm"
    display_mode: str = "solid"
    measure_subtool: str = "bounding_dimensions"
    snap_enabled: bool = False
    selected_control_point: ControlPoint | None = None
    measurement_points: list[tuple[float, float, float]] = Field(default_factory=list)


class MeasurementRequest(BaseModel):
    unit: str = "mm"
    point_a: tuple[float, float, float]
    point_b: tuple[float, float, float]


class MeasurementResult(BaseModel):
    unit: str
    distance: float
    formatted_distance: str
