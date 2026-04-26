import { DisplayMode, MeasureSubtool } from "../viewport/editorTypes";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "../ui/select";

type DisplayControlsProps = {
  displayMode: DisplayMode;
  measureSubtool: MeasureSubtool;
  onDisplayModeChange: (value: DisplayMode) => void;
  onMeasureSubtoolChange: (value: MeasureSubtool) => void;
};

const displayModeItems: Array<{ label: string; value: DisplayMode }> = [
  { label: "Solid", value: "solid" },
  { label: "Wireframe", value: "wireframe" },
];

export function DisplayControls({
  displayMode,
  measureSubtool,
  onDisplayModeChange,
  onMeasureSubtoolChange,
}: DisplayControlsProps) {
  return (
    <>
      <Select
        value={displayMode}
        onValueChange={(value) => {
          if (!value) return;
          onDisplayModeChange(value as DisplayMode);
        }}
      >
        <SelectTrigger aria-label="Display mode">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {displayModeItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <Select
        value={measureSubtool}
        onValueChange={(value) => {
          if (!value) return;
          onMeasureSubtoolChange(value as MeasureSubtool);
        }}
      >
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
