import { DisplayMode, MeasureSubtool } from "../viewport/editorTypes";

type DisplayControlsProps = {
  displayMode: DisplayMode;
  measureSubtool: MeasureSubtool;
  onDisplayModeChange: (value: DisplayMode) => void;
  onMeasureSubtoolChange: (value: MeasureSubtool) => void;
};

export function DisplayControls({
  displayMode,
  measureSubtool,
  onDisplayModeChange,
  onMeasureSubtoolChange,
}: DisplayControlsProps) {
  return (
    <>
      <select
        className="toolbar-unit-select"
        value={displayMode}
        onChange={(event) => onDisplayModeChange(event.target.value as DisplayMode)}
        aria-label="Display mode"
      >
        <option value="solid">Solid</option>
        <option value="wireframe">Wireframe</option>
        <option value="solid_wire">Solid+Wire</option>
      </select>
      <select
        className="toolbar-unit-select"
        value={measureSubtool}
        onChange={(event) => onMeasureSubtoolChange(event.target.value as MeasureSubtool)}
        aria-label="Measure subtool"
      >
        <option value="bounding_dimensions">Measure: Bounds</option>
        <option value="point_to_point">Measure: Points</option>
      </select>
    </>
  );
}
