import { useLayoutEffect, useRef } from "react";
import type { ReactNode } from "react";
import { Box3, Group, Vector3 } from "three";

type ModelStageProps = {
  children?: ReactNode;
  centerOnXZ?: boolean;
  recenterKey?: string | null;
};

const box = new Box3();
const center = new Vector3();

export function ModelStage({ children, centerOnXZ = true, recenterKey = null }: ModelStageProps) {
  const groupRef = useRef<Group>(null);

  useLayoutEffect(() => {
    if (!groupRef.current) {
      return;
    }

    // Reset before measuring so recentering is stable across rerenders/reloads.
    groupRef.current.position.set(0, 0, 0);
    groupRef.current.updateWorldMatrix(true, true);
    box.setFromObject(groupRef.current);

    if (box.isEmpty()) {
      groupRef.current.position.set(0, 0, 0);
      return;
    }

    box.getCenter(center);
    const minY = box.min.y;

    const nextX = centerOnXZ ? -center.x : 0;
    const nextZ = centerOnXZ ? -center.z : 0;
    groupRef.current.position.set(nextX, -minY, nextZ);
  }, [centerOnXZ, recenterKey]);

  return <group ref={groupRef}>{children}</group>;
}
