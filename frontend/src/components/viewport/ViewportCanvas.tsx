import { OrbitControls } from "@react-three/drei";
import { Canvas, ThreeEvent, useLoader, useThree } from "@react-three/fiber";
import { memo, Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { BufferGeometry, Group, Material, Mesh, Vector3Tuple } from "three";
import { Box3, Plane, Raycaster, Vector2, Vector3 } from "three";
import { STLLoader, ThreeMFLoader } from "three-stdlib";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { Html, Line } from "@react-three/drei";
import { AxisGizmo } from "./AxisGizmo";
import { InfiniteGrid } from "./InfiniteGrid";
import { ModelStage } from "./ModelStage";
import { HudPanel } from "../ui/HudPanel";

type BoundsInfo = {
  min: [number, number, number];
  max: [number, number, number];
  width: number;
  height: number;
  depth: number;
};

type ViewportCanvasProps = {
  modelUrl?: string | null;
  modelRotationEuler?: [number, number, number];
  modelColor?: string;
  mode: "orbit" | "edit" | "measure";
  unit: "mm" | "cm" | "in";
  renderMeshView?: boolean;
  persistedEditorState?: {
    selected_control_point: { id: string; position: [number, number, number] } | null;
    measurement_points: [number, number, number][];
  } | null;
  onEditorStateChange?: (state: {
    model_url: string | null;
    mode: "orbit" | "edit" | "measure";
    unit: "mm" | "cm" | "in";
    selected_control_point: { id: string; position: [number, number, number] } | null;
    measurement_points: [number, number, number][];
  }) => void;
  clearMeasureNonce?: number;
};

const unitScale: Record<"mm" | "cm" | "in", number> = {
  mm: 1,
  cm: 0.1,
  in: 1 / 25.4,
};

function formatLength(valueMm: number, unit: "mm" | "cm" | "in"): string {
  const scaled = valueMm * unitScale[unit];
  const precision = unit === "mm" ? 2 : 3;
  return `${scaled.toFixed(precision)} ${unit}`;
}

function MeasurementDimensionsOverlay({
  min,
  max,
  unit,
}: {
  min: [number, number, number];
  max: [number, number, number];
  unit: "mm" | "cm" | "in";
}) {
  const [minX, minY, minZ] = min;
  const [maxX, maxY, maxZ] = max;
  const width = maxX - minX;
  const height = maxY - minY;
  const depth = maxZ - minZ;
  const widthStart: [number, number, number] = [minX, maxY, maxZ];
  const widthEnd: [number, number, number] = [maxX, maxY, maxZ];
  const widthLabel: [number, number, number] = [(minX + maxX) * 0.5, maxY, maxZ];
  const heightStart: [number, number, number] = [maxX, minY, maxZ];
  const heightEnd: [number, number, number] = [maxX, maxY, maxZ];
  const heightLabel: [number, number, number] = [maxX, (minY + maxY) * 0.5, maxZ];
  const depthStart: [number, number, number] = [maxX, maxY, minZ];
  const depthEnd: [number, number, number] = [maxX, maxY, maxZ];
  const depthLabel: [number, number, number] = [maxX, maxY, (minZ + maxZ) * 0.5];

  return (
    <group>
      <Line points={[widthStart, widthEnd]} color="#63c8ff" lineWidth={1.2} />
      <Line points={[heightStart, heightEnd]} color="#8dff9d" lineWidth={1.2} />
      <Line points={[depthStart, depthEnd]} color="#ffbc63" lineWidth={1.2} />
      <Html position={widthLabel} center distanceFactor={10}>
        <div className="measure-edge-label">{formatLength(width, unit)}</div>
      </Html>
      <Html position={heightLabel} center distanceFactor={10}>
        <div className="measure-edge-label">{formatLength(height, unit)}</div>
      </Html>
      <Html position={depthLabel} center distanceFactor={10}>
        <div className="measure-edge-label">{formatLength(depth, unit)}</div>
      </Html>
    </group>
  );
}

function EditableStlModel({
  modelUrl,
  modelRotationEuler,
  modelColor,
  mode,
  unit,
  renderMeshView,
  initialSelectedVertexId,
  onSelectionChange,
  onBoundsChange,
  onDragDeltaChange,
  controlsEnabled,
}: {
  modelUrl: string;
  modelRotationEuler: [number, number, number];
  modelColor: string;
  mode: "orbit" | "edit" | "measure";
  unit: "mm" | "cm" | "in";
  renderMeshView: boolean;
  initialSelectedVertexId: number | null;
  onSelectionChange: (value: { id: string; position: [number, number, number] } | null) => void;
  onBoundsChange: (value: BoundsInfo | null) => void;
  onDragDeltaChange: (value: [number, number, number] | null) => void;
  controlsEnabled: boolean;
}) {
  const geometry = useLoader(STLLoader, modelUrl) as BufferGeometry;
  const editableGeometry = useMemo(() => {
    const cloned = geometry.clone();
    cloned.computeVertexNormals();
    cloned.computeBoundingBox();
    return cloned;
  }, [geometry]);
  const meshRef = useRef<Mesh>(null);
  const [selectedVertexId, setSelectedVertexId] = useState<number | null>(initialSelectedVertexId);
  const dragStateRef = useRef<{
    active: boolean;
    vertexId: number | null;
    startLocal: Vector3;
    dragPlane: Plane;
  }>({
    active: false,
    vertexId: null,
    startLocal: new Vector3(),
    dragPlane: new Plane(new Vector3(0, 0, 1), 0),
  });
  const { camera, gl } = useThree();
  const raycasterRef = useRef(new Raycaster());

  useEffect(() => {
    setSelectedVertexId(initialSelectedVertexId);
  }, [initialSelectedVertexId, modelUrl]);

  useEffect(() => {
    if (!meshRef.current) {
      return;
    }
    const box = new Box3().setFromObject(meshRef.current);
    const size = new Vector3();
    box.getSize(size);
    onBoundsChange({
      min: [box.min.x, box.min.y, box.min.z],
      max: [box.max.x, box.max.y, box.max.z],
      width: size.x,
      height: size.y,
      depth: size.z,
    });
  }, [editableGeometry, onBoundsChange]);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      if (!dragStateRef.current.active || !meshRef.current || dragStateRef.current.vertexId == null) {
        return;
      }
      const rect = gl.domElement.getBoundingClientRect();
      const ndc = new Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycasterRef.current.setFromCamera(ndc, camera);
      const hit = new Vector3();
      const intersects = raycasterRef.current.ray.intersectPlane(dragStateRef.current.dragPlane, hit);
      if (!intersects) {
        return;
      }
      const localHit = meshRef.current.worldToLocal(hit.clone());
      const position = editableGeometry.getAttribute("position");
      const baseIdx = dragStateRef.current.vertexId * 3;
      position.array[baseIdx] = localHit.x;
      position.array[baseIdx + 1] = localHit.y;
      position.array[baseIdx + 2] = localHit.z;
      position.needsUpdate = true;
      editableGeometry.computeVertexNormals();
      editableGeometry.computeBoundingBox();
      const box = editableGeometry.boundingBox;
      if (box) {
        const size = new Vector3();
        box.getSize(size);
        onBoundsChange({
          min: [box.min.x, box.min.y, box.min.z],
          max: [box.max.x, box.max.y, box.max.z],
          width: size.x,
          height: size.y,
          depth: size.z,
        });
      }
      const delta = localHit.clone().sub(dragStateRef.current.startLocal);
      onDragDeltaChange([delta.x, delta.y, delta.z]);
      onSelectionChange({
        id: String(dragStateRef.current.vertexId),
        position: [localHit.x, localHit.y, localHit.z],
      });
    };

    const onPointerUp = () => {
      dragStateRef.current.active = false;
      dragStateRef.current.vertexId = null;
      onDragDeltaChange(null);
      gl.domElement.style.cursor = controlsEnabled ? "grab" : "default";
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [camera, controlsEnabled, editableGeometry, gl, onBoundsChange, onDragDeltaChange, onSelectionChange]);

  const selectedVertexPosition = useMemo(() => {
    if (selectedVertexId == null) {
      return null;
    }
    const position = editableGeometry.getAttribute("position");
    return new Vector3(
      position.array[selectedVertexId * 3],
      position.array[selectedVertexId * 3 + 1],
      position.array[selectedVertexId * 3 + 2],
    );
  }, [editableGeometry, selectedVertexId]);

  const handleMeshPointerDown = (event: ThreeEvent<PointerEvent>) => {
    if (mode !== "edit" || !meshRef.current || !event.face) {
      return;
    }
    event.stopPropagation();
    const position = editableGeometry.getAttribute("position");
    const candidates = [event.face.a, event.face.b, event.face.c];
    let selected = candidates[0];
    let minDist = Number.POSITIVE_INFINITY;
    const localHit = meshRef.current.worldToLocal(event.point.clone());
    for (const idx of candidates) {
      const vertex = new Vector3(
        position.array[idx * 3],
        position.array[idx * 3 + 1],
        position.array[idx * 3 + 2],
      );
      const dist = vertex.distanceToSquared(localHit);
      if (dist < minDist) {
        minDist = dist;
        selected = idx;
      }
    }
    const vertex = new Vector3(
      position.array[selected * 3],
      position.array[selected * 3 + 1],
      position.array[selected * 3 + 2],
    );
    setSelectedVertexId(selected);
    onSelectionChange({ id: String(selected), position: [vertex.x, vertex.y, vertex.z] });
    dragStateRef.current.active = true;
    dragStateRef.current.vertexId = selected;
    dragStateRef.current.startLocal = vertex.clone();
    const worldPoint = meshRef.current.localToWorld(vertex.clone());
    dragStateRef.current.dragPlane = new Plane().setFromNormalAndCoplanarPoint(
      camera.getWorldDirection(new Vector3()).clone().normalize(),
      worldPoint,
    );
    gl.domElement.style.cursor = "grabbing";
  };

  const bbox = editableGeometry.boundingBox;

  return (
    <group rotation={modelRotationEuler}>
      <mesh
        ref={meshRef}
        geometry={editableGeometry}
        castShadow
        onPointerDown={(event) => {
          handleMeshPointerDown(event);
        }}
      >
        <meshStandardMaterial
          color={modelColor}
          metalness={0.2}
          roughness={0.6}
          wireframe={mode === "edit" && renderMeshView}
        />
      </mesh>
      {selectedVertexPosition && mode === "edit" ? (
        <mesh position={selectedVertexPosition.toArray() as Vector3Tuple}>
          <sphereGeometry args={[0.5, 16, 16]} />
          <meshStandardMaterial color="#ffad4d" emissive="#6a3a00" />
        </mesh>
      ) : null}
      {mode === "measure" && bbox ? (
        <MeasurementDimensionsOverlay
          min={[bbox.min.x, bbox.min.y, bbox.min.z]}
          max={[bbox.max.x, bbox.max.y, bbox.max.z]}
          unit={unit}
        />
      ) : null}
    </group>
  );
}

function Editable3MFModel({
  modelUrl,
  modelRotationEuler,
  modelColor,
  mode,
  unit,
  renderMeshView,
  onSelectionChange,
  onBoundsChange,
  onDragDeltaChange,
  controlsEnabled,
}: {
  modelUrl: string;
  modelRotationEuler: [number, number, number];
  modelColor: string;
  mode: "orbit" | "edit" | "measure";
  unit: "mm" | "cm" | "in";
  renderMeshView: boolean;
  onSelectionChange: (value: { id: string; position: [number, number, number] } | null) => void;
  onBoundsChange: (value: BoundsInfo | null) => void;
  onDragDeltaChange: (value: [number, number, number] | null) => void;
  controlsEnabled: boolean;
}) {
  const object = useLoader(ThreeMFLoader, modelUrl) as Group;
  const coloredObject = useMemo(() => {
    const clone = object.clone(true) as Group;
    clone.traverse((node) => {
      const mesh = node as Mesh;
      if (!mesh.isMesh) {
        return;
      }
      mesh.castShadow = true;
      const mat = mesh.material as Material | Material[] | undefined;
      if (!mat) {
        return;
      }
      const applyColor = (material: Material) => {
        const m = material as Material & {
          color?: { set: (c: string) => void };
          wireframe?: boolean;
          needsUpdate?: boolean;
        };
        if (m.color?.set) {
          m.color.set(modelColor);
        }
        if (typeof m.wireframe === "boolean") {
          m.wireframe = mode === "edit" && renderMeshView;
          if (typeof m.needsUpdate === "boolean") {
            m.needsUpdate = true;
          }
        }
      };
      if (Array.isArray(mat)) {
        mat.forEach(applyColor);
      } else {
        applyColor(mat);
      }
    });
    return clone;
  }, [mode, modelColor, object, renderMeshView]);
  const groupRef = useRef<Group>(null);
  const [selectedPointInGroup, setSelectedPointInGroup] = useState<[number, number, number] | null>(null);
  const dragStateRef = useRef<{
    active: boolean;
    vertexId: number | null;
    mesh: Mesh | null;
    startLocal: Vector3;
    dragPlane: Plane;
  }>({
    active: false,
    vertexId: null,
    mesh: null,
    startLocal: new Vector3(),
    dragPlane: new Plane(new Vector3(0, 0, 1), 0),
  });
  const { camera, gl } = useThree();
  const raycasterRef = useRef(new Raycaster());

  const calculateBounds = () => {
    const box = new Box3().setFromObject(coloredObject);
    const size = new Vector3();
    box.getSize(size);
    return {
      min: [box.min.x, box.min.y, box.min.z] as [number, number, number],
      max: [box.max.x, box.max.y, box.max.z] as [number, number, number],
      width: size.x,
      height: size.y,
      depth: size.z,
    };
  };

  const localBounds = useMemo(() => {
    return calculateBounds();
  }, [coloredObject]);

  useEffect(() => {
    onBoundsChange(localBounds);
  }, [localBounds, onBoundsChange]);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      if (!dragStateRef.current.active || !dragStateRef.current.mesh || dragStateRef.current.vertexId == null) {
        return;
      }
      const rect = gl.domElement.getBoundingClientRect();
      const ndc = new Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycasterRef.current.setFromCamera(ndc, camera);
      const hit = new Vector3();
      const intersects = raycasterRef.current.ray.intersectPlane(dragStateRef.current.dragPlane, hit);
      if (!intersects) {
        return;
      }
      const mesh = dragStateRef.current.mesh;
      const localHit = mesh.worldToLocal(hit.clone());
      const geometry = mesh.geometry as BufferGeometry;
      const position = geometry.getAttribute("position");
      const baseIdx = dragStateRef.current.vertexId * 3;
      position.array[baseIdx] = localHit.x;
      position.array[baseIdx + 1] = localHit.y;
      position.array[baseIdx + 2] = localHit.z;
      position.needsUpdate = true;
      geometry.computeVertexNormals();
      geometry.computeBoundingBox();

      const worldVertex = mesh.localToWorld(localHit.clone());
      const groupSpace = groupRef.current
        ? groupRef.current.worldToLocal(worldVertex.clone())
        : worldVertex.clone();
      setSelectedPointInGroup([groupSpace.x, groupSpace.y, groupSpace.z]);
      onSelectionChange({
        id: `3mf:${dragStateRef.current.vertexId}`,
        position: [localHit.x, localHit.y, localHit.z],
      });
      const delta = localHit.clone().sub(dragStateRef.current.startLocal);
      onDragDeltaChange([delta.x, delta.y, delta.z]);
      onBoundsChange(calculateBounds());
    };

    const onPointerUp = () => {
      dragStateRef.current.active = false;
      dragStateRef.current.vertexId = null;
      dragStateRef.current.mesh = null;
      onDragDeltaChange(null);
      gl.domElement.style.cursor = controlsEnabled ? "grab" : "default";
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [camera, controlsEnabled, gl, onBoundsChange, onDragDeltaChange, onSelectionChange]);

  const handlePointerDown = (event: ThreeEvent<PointerEvent>) => {
    if (mode !== "edit" || !event.face) {
      return;
    }
    const picked = event.object as Mesh;
    if (!picked?.isMesh || !picked.geometry) {
      return;
    }
    event.stopPropagation();
    const geometry = picked.geometry as BufferGeometry;
    const position = geometry.getAttribute("position");
    if (!position) {
      return;
    }
    const candidates = [event.face.a, event.face.b, event.face.c];
    const localHit = picked.worldToLocal(event.point.clone());
    let selected = candidates[0];
    let minDist = Number.POSITIVE_INFINITY;
    for (const idx of candidates) {
      const vertex = new Vector3(position.array[idx * 3], position.array[idx * 3 + 1], position.array[idx * 3 + 2]);
      const dist = vertex.distanceToSquared(localHit);
      if (dist < minDist) {
        minDist = dist;
        selected = idx;
      }
    }
    const selectedVertex = new Vector3(
      position.array[selected * 3],
      position.array[selected * 3 + 1],
      position.array[selected * 3 + 2],
    );
    const worldVertex = picked.localToWorld(selectedVertex.clone());
    const groupSpace = groupRef.current
      ? groupRef.current.worldToLocal(worldVertex.clone())
      : worldVertex.clone();
    setSelectedPointInGroup([groupSpace.x, groupSpace.y, groupSpace.z]);
    onSelectionChange({ id: `3mf:${selected}`, position: [selectedVertex.x, selectedVertex.y, selectedVertex.z] });

    dragStateRef.current.active = true;
    dragStateRef.current.vertexId = selected;
    dragStateRef.current.mesh = picked;
    dragStateRef.current.startLocal = selectedVertex.clone();
    dragStateRef.current.dragPlane = new Plane().setFromNormalAndCoplanarPoint(
      camera.getWorldDirection(new Vector3()).clone().normalize(),
      worldVertex,
    );
    gl.domElement.style.cursor = "grabbing";
  };

  return (
    <group ref={groupRef} rotation={modelRotationEuler} onPointerDown={handlePointerDown}>
      <primitive object={coloredObject} />
      {selectedPointInGroup && mode === "edit" ? (
        <mesh position={selectedPointInGroup}>
          <sphereGeometry args={[0.5, 16, 16]} />
          <meshStandardMaterial color="#ffad4d" emissive="#6a3a00" />
        </mesh>
      ) : null}
      {mode === "measure" ? (
        <MeasurementDimensionsOverlay min={localBounds.min} max={localBounds.max} unit={unit} />
      ) : null}
    </group>
  );
}

export const ViewportCanvas = memo(function ViewportCanvas({
  modelUrl,
  modelRotationEuler = [0, 0, 0],
  modelColor = "#b5b5b5",
  mode,
  unit,
  renderMeshView = false,
  persistedEditorState,
  onEditorStateChange,
  clearMeasureNonce = 0,
}: ViewportCanvasProps) {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const hasHydratedFromPersistedRef = useRef(false);
  const lastModelUrlRef = useRef<string | null>(null);
  const [selectedControlPoint, setSelectedControlPoint] = useState<{
    id: string;
    position: [number, number, number];
  } | null>(null);
  const [measurePoints, setMeasurePoints] = useState<[number, number, number][]>([]);
  const [bounds, setBounds] = useState<BoundsInfo | null>(null);
  const [dragDelta, setDragDelta] = useState<[number, number, number] | null>(null);

  useEffect(() => {
    if (!controlsRef.current) {
      return;
    }

    (controlsRef.current as OrbitControlsImpl & { dollyToCursor?: boolean }).dollyToCursor =
      true;
  }, []);

  useEffect(() => {
    if (!controlsRef.current) {
      return;
    }
    controlsRef.current.enabled = true;
  }, [mode]);

  useEffect(() => {
    if (!persistedEditorState) {
      return;
    }
    const modelChanged = lastModelUrlRef.current !== (modelUrl ?? null);
    if (hasHydratedFromPersistedRef.current && !modelChanged) {
      return;
    }
    setSelectedControlPoint(persistedEditorState.selected_control_point);
    setMeasurePoints(persistedEditorState.measurement_points);
    hasHydratedFromPersistedRef.current = true;
    lastModelUrlRef.current = modelUrl ?? null;
  }, [modelUrl, persistedEditorState]);

  useEffect(() => {
    setMeasurePoints([]);
  }, [clearMeasureNonce]);

  useEffect(() => {
    onEditorStateChange?.({
      model_url: modelUrl ?? null,
      mode,
      unit,
      selected_control_point: selectedControlPoint,
      measurement_points: measurePoints,
    });
  }, [measurePoints, mode, modelUrl, onEditorStateChange, selectedControlPoint, unit]);

  return (
    <div className="viewport-canvas-wrap">
      <HudPanel className="viewport-hud">
        <div>Mode: {mode}</div>
        <div>Unit: {unit}</div>
        {bounds ? (
          <div>
            Bounds (W/H/D): {formatLength(bounds.width, unit)} / {formatLength(bounds.height, unit)} /{" "}
            {formatLength(bounds.depth, unit)}
          </div>
        ) : null}
        {dragDelta ? (
          <div>
            Edit delta: {formatLength(Math.hypot(...dragDelta), unit)} (dx {formatLength(dragDelta[0], unit)}, dy{" "}
            {formatLength(dragDelta[1], unit)}, dz {formatLength(dragDelta[2], unit)})
          </div>
        ) : null}
        {mode === "measure" ? <div>Showing dimensions on model edges.</div> : null}
        {mode === "edit" ? (
          <div>{renderMeshView ? "Edit mesh view enabled. Drag vertices to edit." : "Click Render to view mesh edit mode."}</div>
        ) : null}
      </HudPanel>
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
              {modelUrl.toLowerCase().includes(".3mf") ? (
                <Editable3MFModel
                  modelUrl={modelUrl}
                  modelRotationEuler={modelRotationEuler}
                  modelColor={modelColor}
                  mode={mode}
                  unit={unit}
                  renderMeshView={renderMeshView}
                  onSelectionChange={setSelectedControlPoint}
                  onBoundsChange={setBounds}
                  onDragDeltaChange={setDragDelta}
                  controlsEnabled={mode !== "edit"}
                />
              ) : (
                <EditableStlModel
                  modelUrl={modelUrl}
                  modelRotationEuler={modelRotationEuler}
                  modelColor={modelColor}
                  mode={mode}
                  unit={unit}
                  renderMeshView={renderMeshView}
                  initialSelectedVertexId={selectedControlPoint ? Number(selectedControlPoint.id) : null}
                  onSelectionChange={setSelectedControlPoint}
                  onBoundsChange={setBounds}
                  onDragDeltaChange={setDragDelta}
                  controlsEnabled={mode !== "edit"}
                />
              )}
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
    </div>
  );
});
