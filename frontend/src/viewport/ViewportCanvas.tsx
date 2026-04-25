import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { AxisGizmo } from "./AxisGizmo";
import { InfiniteGrid } from "./InfiniteGrid";
import { ModelStage } from "./ModelStage";

export function ViewportCanvas() {
  const controlsRef = useRef<OrbitControlsImpl>(null);

  useEffect(() => {
    if (!controlsRef.current) {
      return;
    }

    (controlsRef.current as OrbitControlsImpl & { dollyToCursor?: boolean }).dollyToCursor =
      true;
  }, []);

  return (
    <Canvas
      gl={{ antialias: true, alpha: true }}
      camera={{ position: [8, 6, 8], fov: 45, near: 0.01, far: 2000 }}
      dpr={[1, 2]}
    >
      <ambientLight intensity={0.55} />
      <directionalLight position={[8, 14, 10]} intensity={0.75} />

      <InfiniteGrid />
      <AxisGizmo />
      <ModelStage />

      <OrbitControls
        ref={controlsRef}
        makeDefault
        enableDamping
        dampingFactor={0.08}
        minDistance={0.05}
        maxDistance={1200}
        minPolarAngle={-Infinity}
        maxPolarAngle={Infinity}
      />
    </Canvas>
  );
}
