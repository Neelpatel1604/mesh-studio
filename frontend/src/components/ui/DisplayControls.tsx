import { DisplayMode, DotDensityMode, MeasureSubtool } from "../viewport/editorTypes";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "../ui/select";

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
      <Select value={displayMode} onValueChange={(value: string) => onDisplayModeChange(value as DisplayMode)}>
        <SelectTrigger aria-label="Display mode">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="solid">Solid</SelectItem>
            <SelectItem value="wireframe">Wireframe</SelectItem>
            <SelectItem value="solid_wire">Solid+Wire</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
      <Select value={dotDensityMode} onValueChange={(value: string) => onDotDensityModeChange(value as DotDensityMode)}>
        <SelectTrigger aria-label="Dot density mode">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="dense">Dots: Dense</SelectItem>
            <SelectItem value="all">Dots: All</SelectItem>
            <SelectItem value="sampled">Dots: Sampled</SelectItem>
            <SelectItem value="adaptive">Dots: Adaptive</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
      <Select value={measureSubtool} onValueChange={(value: string) => onMeasureSubtoolChange(value as MeasureSubtool)}>
        <SelectTrigger aria-label="Measure subtool">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="bounding_dimensions">Measure: Bounds</SelectItem>
            <SelectItem value="point_to_point">Measure: Points</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    </>
  );
}
