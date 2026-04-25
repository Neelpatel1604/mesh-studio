import { OrbitControls } from "@react-three/drei";
import { Canvas, useLoader } from "@react-three/fiber";
import { memo, Suspense, useEffect, useMemo, useRef } from "react";
import type { BufferGeometry } from "three";
import { STLLoader } from "three-stdlib";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { AxisGizmo } from "./AxisGizmo";
import { InfiniteGrid } from "./InfiniteGrid";
import { ModelStage } from "./ModelStage";

type ViewportCanvasProps = {
  modelUrl?: string | null;
  modelRotationEuler?: [number, number, number];
};

function CompiledModel({
  modelUrl,
  modelRotationEuler,
}: {
  modelUrl: string;
  modelRotationEuler: [number, number, number];
}) {
  const geometry = useLoader(STLLoader, modelUrl) as BufferGeometry;
  const normalizedGeometry = useMemo(() => {
    geometry.computeVertexNormals();
    return geometry;
  }, [geometry]);

  return (
    <mesh geometry={normalizedGeometry} castShadow rotation={modelRotationEuler}>
      <meshStandardMaterial color="#b5b5b5" metalness={0.2} roughness={0.6} />
    </mesh>
  );
}

export const ViewportCanvas = memo(function ViewportCanvas({
  modelUrl,
  modelRotationEuler = [0, 0, 0],
}: ViewportCanvasProps) {
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
      <ModelStage recenterKey={modelUrl ?? null}>
        {modelUrl ? (
          <Suspense fallback={null}>
            <CompiledModel modelUrl={modelUrl} modelRotationEuler={modelRotationEuler} />
          </Suspense>
        ) : null}
      </ModelStage>

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
});
