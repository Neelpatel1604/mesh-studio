import { Line } from "@react-three/drei";

const AXIS_LENGTH = 5;

export function AxisGizmo() {
  return (
    <group>
      <Line
        points={[
          [-AXIS_LENGTH, 0, 0],
          [AXIS_LENGTH, 0, 0],
        ]}
        color="#ff3b3b"
        lineWidth={1.5}
      />
      <Line
        points={[
          [0, 0, -AXIS_LENGTH],
          [0, 0, AXIS_LENGTH],
        ]}
        color="#3b7bff"
        lineWidth={1.5}
      />
    </group>
  );
}
