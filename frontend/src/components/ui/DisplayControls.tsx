import { DisplayMode, MeasureSubtool } from "../viewport/editorTypes";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "../ui/select";

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
