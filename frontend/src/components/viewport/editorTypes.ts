export type EditorTool = "orbit" | "edit" | "measure";
export type MeasureSubtool = "bounding_dimensions" | "point_to_point";
export type DisplayMode = "solid" | "wireframe" | "solid_wire";
export type Unit = "mm" | "cm" | "in";

export type BoundsInfo = {
  min: [number, number, number];
  max: [number, number, number];
  width: number;
  height: number;
  depth: number;
};

export type EditorControlPoint = {
  id: string;
  position: [number, number, number];
} | null;

export type PersistedEditorState = {
  model_url: string | null;
  mode?: string;
  active_tool?: EditorTool;
  unit: Unit;
  display_mode?: DisplayMode;
  measure_subtool?: MeasureSubtool;
  snap_enabled?: boolean;
  selected_control_point: EditorControlPoint;
  measurement_points: [number, number, number][];
};
