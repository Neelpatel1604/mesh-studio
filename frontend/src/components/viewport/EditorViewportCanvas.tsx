import { Html, Line, OrbitControls } from "@react-three/drei";
import { Canvas, ThreeEvent, useLoader, useThree } from "@react-three/fiber";
import { memo, Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { BufferGeometry, Material, Vector3Tuple } from "three";
import { Box3, Group, Matrix4, Mesh, MeshStandardMaterial, Points, Raycaster, Vector2, Vector3 } from "three";
import { STLLoader, ThreeMFLoader } from "three-stdlib";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { HudPanel } from "../ui/HudPanel";
import { AxisGizmo } from "./AxisGizmo";
import { BoundsInfo, DisplayMode, EditorControlPoint, EditorTool, MeasureSubtool, PersistedEditorState, Unit } from "./editorTypes";
import { InfiniteGrid } from "./InfiniteGrid";
import { dragPlaneFromCamera, nearestVertexFromFace } from "./meshEditingUtils";
import { ModelStage } from "./ModelStage";

type ViewportCanvasProps = {
  modelUrl?: string | null;
  modelRotationEuler?: [number, number, number];
  modelColor?: string;
  activeTool: EditorTool;
  unit: Unit;
  displayMode: DisplayMode;
  measureSubtool: MeasureSubtool;
  persistedEditorState?: PersistedEditorState | null;
  onEditorStateChange?: (state: PersistedEditorState) => void;
  clearMeasureNonce?: number;
};

const unitScale: Record<Unit, number> = { mm: 1, cm: 0.1, in: 1 / 25.4 };
const formatLength = (valueMm: number, unit: Unit) =>
  `${(valueMm * unitScale[unit]).toFixed(unit === "mm" ? 2 : 3)} ${unit}`;

function MeasureOverlay({ min, max, unit }: { min: [number, number, number]; max: [number, number, number]; unit: Unit }) {
  const [minX, minY, minZ] = min;
  const [maxX, maxY, maxZ] = max;
  const width = maxX - minX;
  const height = maxY - minY;
  const depth = maxZ - minZ;
  return (
    <group>
      <Line points={[[minX, maxY, maxZ], [maxX, maxY, maxZ]]} color="#63c8ff" lineWidth={1.2} />
      <Line points={[[maxX, minY, maxZ], [maxX, maxY, maxZ]]} color="#8dff9d" lineWidth={1.2} />
      <Line points={[[maxX, maxY, minZ], [maxX, maxY, maxZ]]} color="#ffbc63" lineWidth={1.2} />
      <Html position={[(minX + maxX) * 0.5, maxY, maxZ]} center distanceFactor={10}><div className="measure-edge-label">{formatLength(width, unit)}</div></Html>
      <Html position={[maxX, (minY + maxY) * 0.5, maxZ]} center distanceFactor={10}><div className="measure-edge-label">{formatLength(height, unit)}</div></Html>
      <Html position={[maxX, maxY, (minZ + maxZ) * 0.5]} center distanceFactor={10}><div className="measure-edge-label">{formatLength(depth, unit)}</div></Html>
    </group>
  );
}

function EditableMeshPrimitive({
  object,
  activeTool,
  modelRotationEuler,
  displayMode,
  unit,
  measureSubtool,
  onBoundsChange,
  onSelectionChange,
  onEditablePointCountChange,
  onDragDeltaChange,
  setInteractionOwner,
  onMeasurePoint,
}: {
  object: Group;
  activeTool: EditorTool;
  modelRotationEuler: [number, number, number];
  displayMode: DisplayMode;
  unit: Unit;
  measureSubtool: MeasureSubtool;
  onBoundsChange: (value: BoundsInfo) => void;
  onSelectionChange: (value: EditorControlPoint) => void;
  onEditablePointCountChange: (count: number) => void;
  onDragDeltaChange: (value: [number, number, number] | null) => void;
  setInteractionOwner: (owner: "camera" | "tool") => void;
  onMeasurePoint: (point: [number, number, number]) => void;
}) {
  const groupRef = useRef<Group>(null);
  const { camera, gl } = useThree();
  const raycasterRef = useRef(new Raycaster());
  const [selectedPoint, setSelectedPoint] = useState<[number, number, number] | null>(null);
  const dragRef = useRef<{ mesh: Mesh | null; vid: number | null; start: Vector3; active: boolean; planeNormalPoint: Vector3 }>({
    mesh: null,
    vid: null,
    start: new Vector3(),
    active: false,
    planeNormalPoint: new Vector3(),
  });
  const measureDownRef = useRef<{ x: number; y: number; point: [number, number, number] } | null>(null);

  useEffect(() => {
    let editablePointCount = 0;
    object.traverse((node) => {
      const mesh = node as Mesh;
      if (!mesh.isMesh) return;
      const geometry = mesh.geometry as BufferGeometry;
      const positions = geometry.getAttribute("position");
      if (positions) {
        editablePointCount += positions.count;
      }
      const material = mesh.material as Material | Material[] | undefined;
      const apply = (m: Material & { wireframe?: boolean; transparent?: boolean; opacity?: number; needsUpdate?: boolean }) => {
        if (typeof m.wireframe === "boolean") m.wireframe = displayMode === "wireframe";
        if (typeof m.transparent === "boolean") m.transparent = displayMode === "solid_wire";
        if (typeof m.opacity === "number") m.opacity = displayMode === "solid_wire" ? 0.75 : 1;
        if (typeof m.needsUpdate === "boolean") m.needsUpdate = true;
      };
      if (Array.isArray(material)) material.forEach((m) => apply(m as any));
      else if (material) apply(material as any);
    });
    onEditablePointCountChange(editablePointCount);
  }, [displayMode, object, onEditablePointCountChange]);

  const grabPointOverlays = useMemo(() => {
    if (displayMode !== "wireframe") {
      return [];
    }
    object.updateMatrixWorld(true);
    const inverseRoot = new Matrix4().copy(object.matrixWorld).invert();
    const overlays: Array<{ id: string; geometry: BufferGeometry; matrix: Matrix4; mesh: Mesh }> = [];
    let idx = 0;
    object.traverse((node) => {
      const mesh = node as Mesh;
      if (!mesh.isMesh) {
        return;
      }
      const relativeMatrix = new Matrix4().copy(inverseRoot).multiply(mesh.matrixWorld);
      overlays.push({
        id: `grab-points-${idx}`,
        geometry: mesh.geometry as BufferGeometry,
        matrix: relativeMatrix,
        mesh,
      });
      idx += 1;
    });
    return overlays;
  }, [displayMode, object]);

  const bounds = useMemo(() => {
    const box = new Box3().setFromObject(object);
    const size = new Vector3();
    box.getSize(size);
    return { min: [box.min.x, box.min.y, box.min.z] as [number, number, number], max: [box.max.x, box.max.y, box.max.z] as [number, number, number], width: size.x, height: size.y, depth: size.z };
  }, [object]);

  useEffect(() => {
    onBoundsChange(bounds);
  }, [bounds, onBoundsChange]);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      if (!dragRef.current.active || !dragRef.current.mesh || dragRef.current.vid == null) return;
      const rect = gl.domElement.getBoundingClientRect();
      const ndc = new Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycasterRef.current.setFromCamera(ndc, camera);
      const hit = new Vector3();
      const plane = dragPlaneFromCamera(camera.getWorldDirection(new Vector3()), dragRef.current.planeNormalPoint);
      if (!raycasterRef.current.ray.intersectPlane(plane, hit)) return;
      const mesh = dragRef.current.mesh;
      const local = mesh.worldToLocal(hit.clone());
      const geometry = mesh.geometry as BufferGeometry;
      const pos = geometry.getAttribute("position");
      const base = dragRef.current.vid * 3;
      pos.array[base] = local.x;
      pos.array[base + 1] = local.y;
      pos.array[base + 2] = local.z;
      pos.needsUpdate = true;
      geometry.computeVertexNormals();
      const world = mesh.localToWorld(local.clone());
      const grp = groupRef.current ? groupRef.current.worldToLocal(world.clone()) : world;
      setSelectedPoint([grp.x, grp.y, grp.z]);
      onSelectionChange({ id: `v:${dragRef.current.vid}`, position: [local.x, local.y, local.z] });
      const delta = local.clone().sub(dragRef.current.start);
      onDragDeltaChange([delta.x, delta.y, delta.z]);
    };
    const onPointerUp = () => {
      const hadDrag = dragRef.current.active;
      dragRef.current.active = false;
      dragRef.current.mesh = null;
      dragRef.current.vid = null;
      setInteractionOwner("camera");
      onDragDeltaChange(null);
      if (hadDrag) {
        setSelectedPoint(null);
        onSelectionChange(null);
      }
      gl.domElement.style.cursor = "grab";
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [camera, gl, onDragDeltaChange, onSelectionChange, setInteractionOwner]);

  const beginDragFromVertex = (mesh: Mesh, vertexIndex: number) => {
    const geometry = mesh.geometry as BufferGeometry;
    const pos = geometry.getAttribute("position");
    const nearest = {
      index: vertexIndex,
      vertex: new Vector3(pos.array[vertexIndex * 3], pos.array[vertexIndex * 3 + 1], pos.array[vertexIndex * 3 + 2]),
    };
    const world = mesh.localToWorld(nearest.vertex.clone());
    const grp = groupRef.current ? groupRef.current.worldToLocal(world.clone()) : world;
    setSelectedPoint([grp.x, grp.y, grp.z]);
    onSelectionChange({ id: `v:${nearest.index}`, position: [nearest.vertex.x, nearest.vertex.y, nearest.vertex.z] });
    dragRef.current = { mesh, vid: nearest.index, start: nearest.vertex.clone(), active: true, planeNormalPoint: world.clone() };
    setInteractionOwner("tool");
    gl.domElement.style.cursor = "grabbing";
  };

  const handlePointerDown = (event: ThreeEvent<PointerEvent>) => {
    if (activeTool === "measure" && measureSubtool === "point_to_point") {
      measureDownRef.current = { x: event.clientX, y: event.clientY, point: [event.point.x, event.point.y, event.point.z] };
      return;
    }
    if (activeTool !== "move") return;
    event.stopPropagation();

    // Direct vertex grab from visible dot cloud (wireframe helper points).
    const pointsObject = event.object as Points;
    const pointsMesh = pointsObject?.userData?.sourceMesh as Mesh | undefined;
    if (pointsObject?.isPoints && pointsMesh && typeof event.index === "number") {
      beginDragFromVertex(pointsMesh, event.index);
      return;
    }

    // Fallback: click mesh face and pick nearest vertex.
    if (!event.face) return;
    const mesh = event.object as Mesh;
    if (!mesh?.isMesh) return;
    const geometry = mesh.geometry as BufferGeometry;
    const pos = geometry.getAttribute("position");
    const localHit = mesh.worldToLocal(event.point.clone());
    const nearest = nearestVertexFromFace([event.face.a, event.face.b, event.face.c], pos.array, localHit);
    beginDragFromVertex(mesh, nearest.index);
  };

  const handlePointerUp = (event: ThreeEvent<PointerEvent>) => {
    if (!(activeTool === "measure" && measureSubtool === "point_to_point")) return;
    const down = measureDownRef.current;
    measureDownRef.current = null;
    if (!down) return;
    if (Math.hypot(event.clientX - down.x, event.clientY - down.y) > 5) return;
    onMeasurePoint(down.point);
  };

  return (
    <group ref={groupRef} rotation={modelRotationEuler} onPointerDown={handlePointerDown} onPointerUp={handlePointerUp}>
      <primitive object={object} />
      {grabPointOverlays.map((overlay) => (
        <points
          key={overlay.id}
          geometry={overlay.geometry}
          matrix={overlay.matrix}
          userData={{ sourceMesh: overlay.mesh }}
          matrixAutoUpdate={false}
          frustumCulled={false}
          renderOrder={2}
        >
          <pointsMaterial color="#ffd78e" size={0.5} sizeAttenuation />
        </points>
      ))}
      {selectedPoint && activeTool === "move" ? (
        <mesh position={selectedPoint as Vector3Tuple}>
          <sphereGeometry args={[0.5, 16, 16]} />
          <meshStandardMaterial color="#ffad4d" emissive="#6a3a00" />
        </mesh>
      ) : null}
      {activeTool === "measure" && measureSubtool === "bounding_dimensions" ? (
        <MeasureOverlay min={bounds.min} max={bounds.max} unit={unit} />
      ) : null}
    </group>
  );
}

type CompiledAssetProps = {
  modelUrl: string;
  modelRotationEuler: [number, number, number];
  modelColor: string;
  activeTool: EditorTool;
  unit: Unit;
  displayMode: DisplayMode;
  measureSubtool: MeasureSubtool;
  onBoundsChange: (value: BoundsInfo) => void;
  onSelectionChange: (value: EditorControlPoint) => void;
  onEditablePointCountChange: (count: number) => void;
  onDragDeltaChange: (value: [number, number, number] | null) => void;
  setInteractionOwner: (owner: "camera" | "tool") => void;
  onMeasurePoint: (point: [number, number, number]) => void;
};

function CompiledStlAsset(props: CompiledAssetProps) {
  const stlGeometry = useLoader(STLLoader, props.modelUrl) as BufferGeometry;
  const object = useMemo(() => {
    const g = new Group();
    const m = new Mesh(stlGeometry.clone(), new MeshStandardMaterial({ color: props.modelColor, metalness: 0.2, roughness: 0.6 }));
    g.add(m);
    return g;
  }, [props.modelColor, stlGeometry]);
  return <EditableMeshPrimitive object={object} {...props} />;
}

function Compiled3MFAsset(props: CompiledAssetProps) {
  const threemfObject = useLoader(ThreeMFLoader, props.modelUrl) as Group;
  const object = useMemo(() => {
    const g = threemfObject.clone(true) as Group;
    g.traverse((node) => {
      const mesh = node as Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      const mat = mesh.material as Material | Material[] | undefined;
      const applyColor = (material: any) => {
        if (material?.color?.set) material.color.set(props.modelColor);
      };
      if (Array.isArray(mat)) mat.forEach(applyColor);
      else if (mat) applyColor(mat);
    });
    return g;
  }, [props.modelColor, threemfObject]);
  return <EditableMeshPrimitive object={object} {...props} />;
}

export const EditorViewportCanvas = memo(function EditorViewportCanvas({
  modelUrl,
  modelRotationEuler = [0, 0, 0],
  modelColor = "#b5b5b5",
  activeTool,
  unit,
  displayMode,
  measureSubtool,
  persistedEditorState,
  onEditorStateChange,
  clearMeasureNonce = 0,
}: ViewportCanvasProps) {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const [interactionOwner, setInteractionOwner] = useState<"camera" | "tool">("camera");
  const [selectedControlPoint, setSelectedControlPoint] = useState<EditorControlPoint>(null);
  const [editablePointCount, setEditablePointCount] = useState(0);
  const [measurePoints, setMeasurePoints] = useState<[number, number, number][]>([]);
  const [bounds, setBounds] = useState<BoundsInfo | null>(null);
  const [dragDelta, setDragDelta] = useState<[number, number, number] | null>(null);
  const navOverrideRef = useRef(false);

  useEffect(() => {
    if (!controlsRef.current) return;
    controlsRef.current.enabled = interactionOwner === "camera";
  }, [interactionOwner]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space") return;
      navOverrideRef.current = true;
      setInteractionOwner("camera");
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code !== "Space") return;
      navOverrideRef.current = false;
      if (activeTool === "move") setInteractionOwner("tool");
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [activeTool]);

  useEffect(() => {
    if (!persistedEditorState) return;
    setSelectedControlPoint(persistedEditorState.selected_control_point ?? null);
    setMeasurePoints(persistedEditorState.measurement_points ?? []);
  }, [modelUrl, persistedEditorState]);

  useEffect(() => {
    setMeasurePoints([]);
  }, [clearMeasureNonce]);

  useEffect(() => {
    onEditorStateChange?.({
      model_url: modelUrl ?? null,
      mode: activeTool,
      active_tool: activeTool,
      unit,
      display_mode: displayMode,
      measure_subtool: measureSubtool,
      selected_control_point: selectedControlPoint,
      measurement_points: measurePoints,
    });
  }, [activeTool, displayMode, measurePoints, measureSubtool, modelUrl, onEditorStateChange, selectedControlPoint, unit]);

  const pointDistanceLabel = useMemo(() => {
    if (measurePoints.length !== 2) return null;
    return formatLength(new Vector3(...measurePoints[0]).distanceTo(new Vector3(...measurePoints[1])), unit);
  }, [measurePoints, unit]);

  return (
    <div className="viewport-canvas-wrap">
      <HudPanel className="viewport-hud">
        <div>Tool: {activeTool}</div>
        <div>Display: {displayMode}</div>
        <div>Unit: {unit}</div>
        {bounds ? <div>Bounds: {formatLength(bounds.width, unit)} / {formatLength(bounds.height, unit)} / {formatLength(bounds.depth, unit)}</div> : null}
        {activeTool === "measure" ? <div>Measure mode: {measureSubtool === "point_to_point" ? "click two points" : "bounding dimensions"}</div> : null}
        {activeTool === "move" ? <div>Editable points: {editablePointCount}</div> : null}
        {pointDistanceLabel ? <div>Point distance: {pointDistanceLabel}</div> : null}
        {dragDelta ? <div>Move delta: {formatLength(Math.hypot(...dragDelta), unit)}</div> : null}
      </HudPanel>
      <Canvas gl={{ antialias: true, alpha: true }} camera={{ position: [8, 6, 8], fov: 45, near: 0.01, far: 2000 }} dpr={[1, 2]}>
        <ambientLight intensity={0.55} />
        <directionalLight position={[8, 14, 10]} intensity={0.75} />
        <InfiniteGrid />
        <AxisGizmo />
        <ModelStage recenterKey={modelUrl ?? null}>
          {modelUrl ? (
            <Suspense fallback={null}>
              {modelUrl.toLowerCase().includes(".3mf") ? (
                <Compiled3MFAsset
                  modelUrl={modelUrl}
                  modelRotationEuler={modelRotationEuler}
                  modelColor={modelColor}
                  activeTool={activeTool}
                  unit={unit}
                  displayMode={displayMode}
                  measureSubtool={measureSubtool}
                  onBoundsChange={setBounds}
                  onSelectionChange={setSelectedControlPoint}
                onEditablePointCountChange={setEditablePointCount}
                  onDragDeltaChange={setDragDelta}
                  setInteractionOwner={setInteractionOwner}
                  onMeasurePoint={(point) => setMeasurePoints((prev) => [...prev, point].slice(-2))}
                />
              ) : (
                <CompiledStlAsset
                  modelUrl={modelUrl}
                  modelRotationEuler={modelRotationEuler}
                  modelColor={modelColor}
                  activeTool={activeTool}
                  unit={unit}
                  displayMode={displayMode}
                  measureSubtool={measureSubtool}
                  onBoundsChange={setBounds}
                  onSelectionChange={setSelectedControlPoint}
                onEditablePointCountChange={setEditablePointCount}
                  onDragDeltaChange={setDragDelta}
                  setInteractionOwner={setInteractionOwner}
                  onMeasurePoint={(point) => setMeasurePoints((prev) => [...prev, point].slice(-2))}
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
