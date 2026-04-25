import { useLayoutEffect, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import { Box3, Group, Vector3 } from "three";

type ModelStageProps = {
  children?: ReactNode;
  centerOnXZ?: boolean;
};

const box = new Box3();
const center = new Vector3();

export function ModelStage({ children, centerOnXZ = true }: ModelStageProps) {
  const groupRef = useRef<Group>(null);

  useLayoutEffect(() => {
    if (!groupRef.current) {
      return;
    }

    groupRef.current.updateWorldMatrix(true, true);
    box.setFromObject(groupRef.current);

    if (box.isEmpty()) {
      return;
    }

    box.getCenter(center);
    const minY = box.min.y;

    groupRef.current.position.y -= minY;
    if (centerOnXZ) {
      groupRef.current.position.x -= center.x;
      groupRef.current.position.z -= center.z;
    }
  }, [children, centerOnXZ]);

  const fallback = useMemo(
    () => (
      <mesh position={[0, 1, 0]} castShadow>
        <boxGeometry args={[1.4, 2, 1.4]} />
        <meshStandardMaterial color="#b5b5b5" metalness={0.2} roughness={0.6} />
      </mesh>
    ),
    [],
  );

  return <group ref={groupRef}>{children ?? fallback}</group>;
}
