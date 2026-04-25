import { DisplayMode, DotDensityMode, MeasureSubtool } from "../viewport/editorTypes";

type DisplayControlsProps = {
  displayMode: DisplayMode;
  dotDensityMode: DotDensityMode;
  measureSubtool: MeasureSubtool;
  onDisplayModeChange: (value: DisplayMode) => void;
  onDotDensityModeChange: (value: DotDensityMode) => void;
  onMeasureSubtoolChange: (value: MeasureSubtool) => void;
};

export function DisplayControls({
  displayMode,
  dotDensityMode,
  measureSubtool,
  onDisplayModeChange,
  onDotDensityModeChange,
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
        value={dotDensityMode}
        onChange={(event) => onDotDensityModeChange(event.target.value as DotDensityMode)}
        aria-label="Dot density mode"
      >
        <option value="dense">Dots: Dense</option>
        <option value="all">Dots: All</option>
        <option value="sampled">Dots: Sampled</option>
        <option value="adaptive">Dots: Adaptive</option>
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
