import { Html, Line, OrbitControls } from "@react-three/drei";
import { Canvas, ThreeEvent, useFrame, useLoader, useThree } from "@react-three/fiber";
import { memo, Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { Material, Vector3Tuple } from "three";
import { Box3, BufferAttribute, BufferGeometry, Group, Matrix4, Mesh, MeshStandardMaterial, Points, Raycaster, Vector2, Vector3 } from "three";
import { STLLoader, ThreeMFLoader } from "three-stdlib";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { HudPanel } from "../ui/HudPanel";
import { AxisGizmo } from "./AxisGizmo";
import { BoundsInfo, DisplayMode, DotDensityMode, EditorControlPoint, EditorTool, MeasureSubtool, PersistedEditorState, Unit } from "./editorTypes";
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
  dotDensityMode: DotDensityMode;
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
  dotDensityMode,
  onBoundsChange,
  onSelectionChange,
  onEditablePointCountChange,
  onLinkedVertexCountChange,
  onSnapHintChange,
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
  dotDensityMode: DotDensityMode;
  onBoundsChange: (value: BoundsInfo) => void;
  onSelectionChange: (value: EditorControlPoint) => void;
  onEditablePointCountChange: (count: number) => void;
  onLinkedVertexCountChange: (count: number) => void;
  onSnapHintChange: (hint: string | null) => void;
  onDragDeltaChange: (value: [number, number, number] | null) => void;
  setInteractionOwner: (owner: "camera" | "tool") => void;
  onMeasurePoint: (point: [number, number, number]) => void;
}) {
  const groupRef = useRef<Group>(null);
  const { camera, gl } = useThree();
  const raycasterRef = useRef(new Raycaster());
  const [selectedPoint, setSelectedPoint] = useState<[number, number, number] | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<[number, number, number] | null>(null);
  const [releasePoint, setReleasePoint] = useState<[number, number, number] | null>(null);
  const [releaseOpacity, setReleaseOpacity] = useState(0);
  const [axisLock, setAxisLock] = useState<"x" | "y" | "z" | null>(null);
  const dragRef = useRef<{
    mesh: Mesh | null;
    vid: number | null;
    start: Vector3;
    active: boolean;
    planeNormalPoint: Vector3;
    denseBinding: { a: number; b: number; c: number; wa: number; wb: number; wc: number } | null;
    denseStartVertices: { a: Vector3; b: Vector3; c: Vector3 } | null;
  }>({
    mesh: null,
    vid: null,
    start: new Vector3(),
    active: false,
    planeNormalPoint: new Vector3(),
    denseBinding: null,
    denseStartVertices: null,
  });
  const linkedVertexIndicesRef = useRef<number[]>([]);
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
    const overlays: Array<{
      id: string;
      geometry: BufferGeometry;
      matrix: Matrix4;
      mesh: Mesh;
      vertexMap: number[];
      displayIndicesByVertex: Map<number, number[]>;
      denseBindings: Array<{ a: number; b: number; c: number; wa: number; wb: number; wc: number }> | null;
      denseDisplayIndicesByVertex: Map<number, number[]> | null;
    }> = [];
    let idx = 0;
    object.traverse((node) => {
      const mesh = node as Mesh;
      if (!mesh.isMesh) {
        return;
      }
      const relativeMatrix = new Matrix4().copy(inverseRoot).multiply(mesh.matrixWorld);
      const sourceGeometry = mesh.geometry as BufferGeometry;
      const positions = sourceGeometry.getAttribute("position");
      const vertexMap: number[] = [];
      const displayIndicesByVertex = new Map<number, number[]>();
      const denseBindings: Array<{ a: number; b: number; c: number; wa: number; wb: number; wc: number }> = [];
      const denseDisplayIndicesByVertex = new Map<number, number[]>();
      const sampled: number[] = [];
      let displayIndex = 0;
      const addDisplayPoint = (
        x: number,
        y: number,
        z: number,
        sourceVertexIndex: number,
        denseBinding?: { a: number; b: number; c: number; wa: number; wb: number; wc: number },
      ) => {
        vertexMap.push(sourceVertexIndex);
        const existingIndices = displayIndicesByVertex.get(sourceVertexIndex);
        if (existingIndices) {
          existingIndices.push(displayIndex);
        } else {
          displayIndicesByVertex.set(sourceVertexIndex, [displayIndex]);
        }
        if (denseBinding) {
          denseBindings.push(denseBinding);
          const addDenseDisplayRef = (vertexIndex: number) => {
            const denseIndices = denseDisplayIndicesByVertex.get(vertexIndex);
            if (denseIndices) {
              denseIndices.push(displayIndex);
            } else {
              denseDisplayIndicesByVertex.set(vertexIndex, [displayIndex]);
            }
          };
          addDenseDisplayRef(denseBinding.a);
          addDenseDisplayRef(denseBinding.b);
          addDenseDisplayRef(denseBinding.c);
        }
        sampled.push(x, y, z);
        displayIndex += 1;
      };

      if (dotDensityMode === "dense") {
        const triDivisions = 3;
        const maxDensePoints = 200000;
        const index = sourceGeometry.getIndex();
        const triangleCount = index ? Math.floor(index.count / 3) : Math.floor(positions.count / 3);
        const readVertex = (idx: number) =>
          new Vector3(positions.array[idx * 3], positions.array[idx * 3 + 1], positions.array[idx * 3 + 2]);

        for (let tri = 0; tri < triangleCount; tri += 1) {
          if (vertexMap.length >= maxDensePoints) {
            break;
          }
          const aIdx = index ? index.array[tri * 3] : tri * 3;
          const bIdx = index ? index.array[tri * 3 + 1] : tri * 3 + 1;
          const cIdx = index ? index.array[tri * 3 + 2] : tri * 3 + 2;
          const a = readVertex(aIdx);
          const b = readVertex(bIdx);
          const c = readVertex(cIdx);

          for (let i = 0; i <= triDivisions; i += 1) {
            for (let j = 0; j <= triDivisions - i; j += 1) {
              const k = triDivisions - i - j;
              const wa = i / triDivisions;
              const wb = j / triDivisions;
              const wc = k / triDivisions;
              const x = a.x * wa + b.x * wb + c.x * wc;
              const y = a.y * wa + b.y * wb + c.y * wc;
              const z = a.z * wa + b.z * wb + c.z * wc;

              let mapped = aIdx;
              if (wb > wa && wb >= wc) {
                mapped = bIdx;
              } else if (wc > wa && wc > wb) {
                mapped = cIdx;
              }
              addDisplayPoint(x, y, z, mapped, { a: aIdx, b: bIdx, c: cIdx, wa, wb, wc });
            }
          }
        }
      } else {
        let step = 1;
        if (dotDensityMode === "sampled") {
          step = 4;
        } else if (dotDensityMode === "adaptive") {
          const count = positions.count;
          if (count > 400000) step = 16;
          else if (count > 200000) step = 12;
          else if (count > 100000) step = 8;
          else if (count > 50000) step = 6;
          else if (count > 20000) step = 4;
          else step = 2;
        }
        for (let i = 0; i < positions.count; i += step) {
          addDisplayPoint(positions.array[i * 3], positions.array[i * 3 + 1], positions.array[i * 3 + 2], i);
        }
      }
      const displayGeometry = new BufferGeometry();
      displayGeometry.setAttribute("position", new BufferAttribute(new Float32Array(sampled), 3));
      overlays.push({
        id: `grab-points-${idx}`,
        geometry: displayGeometry,
        matrix: relativeMatrix,
        mesh,
        vertexMap,
        displayIndicesByVertex,
        denseBindings: dotDensityMode === "dense" ? denseBindings : null,
        denseDisplayIndicesByVertex: dotDensityMode === "dense" ? denseDisplayIndicesByVertex : null,
      });
      idx += 1;
    });
    return overlays;
  }, [displayMode, dotDensityMode, object]);

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
    const onKeyDown = (event: KeyboardEvent) => {
      if (!dragRef.current.active) {
        return;
      }
      if (event.key.toLowerCase() === "x") {
        setAxisLock("x");
        onSnapHintChange("Axis lock: X");
      } else if (event.key.toLowerCase() === "y") {
        setAxisLock("y");
        onSnapHintChange("Axis lock: Y");
      } else if (event.key.toLowerCase() === "z") {
        setAxisLock("z");
        onSnapHintChange("Axis lock: Z");
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (!dragRef.current.active) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === "x" || key === "y" || key === "z") {
        setAxisLock(null);
        onSnapHintChange("Free move");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [onSnapHintChange]);

  useEffect(() => {
    if (!releasePoint) {
      return;
    }
    const started = performance.now();
    let raf = 0;
    const step = () => {
      const t = (performance.now() - started) / 220;
      const opacity = Math.max(0, 1 - t);
      setReleaseOpacity(opacity);
      if (t >= 1) {
        setReleasePoint(null);
        setReleaseOpacity(0);
        return;
      }
      raf = requestAnimationFrame(step);
    };
    setReleaseOpacity(1);
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [releasePoint]);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      if (!dragRef.current.active || !dragRef.current.mesh) return;
      const rect = gl.domElement.getBoundingClientRect();
      const ndc = new Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycasterRef.current.setFromCamera(ndc, camera);
      const hit = new Vector3();
      const plane = dragPlaneFromCamera(camera.getWorldDirection(new Vector3()), dragRef.current.planeNormalPoint);
      if (!raycasterRef.current.ray.intersectPlane(plane, hit)) return;
      const mesh = dragRef.current.mesh;
      const local = mesh.worldToLocal(hit.clone());
      if (axisLock === "x") {
        local.y = dragRef.current.start.y;
        local.z = dragRef.current.start.z;
      } else if (axisLock === "y") {
        local.x = dragRef.current.start.x;
        local.z = dragRef.current.start.z;
      } else if (axisLock === "z") {
        local.x = dragRef.current.start.x;
        local.y = dragRef.current.start.y;
      }
      const geometry = mesh.geometry as BufferGeometry;
      const pos = geometry.getAttribute("position");
      const touchedVertices = new Set<number>();
      if (dragRef.current.denseBinding && dragRef.current.denseStartVertices) {
        const { a, b, c, wa, wb, wc } = dragRef.current.denseBinding;
        const startVertices = dragRef.current.denseStartVertices;
        const delta = local.clone().sub(dragRef.current.start);
        const denom = Math.max(wa * wa + wb * wb + wc * wc, 1e-6);
        const applyDenseVertex = (vertexIndex: number, startVertex: Vector3, weight: number) => {
          const base = vertexIndex * 3;
          const factor = weight / denom;
          pos.array[base] = startVertex.x + delta.x * factor;
          pos.array[base + 1] = startVertex.y + delta.y * factor;
          pos.array[base + 2] = startVertex.z + delta.z * factor;
          touchedVertices.add(vertexIndex);
        };
        applyDenseVertex(a, startVertices.a, wa);
        applyDenseVertex(b, startVertices.b, wb);
        applyDenseVertex(c, startVertices.c, wc);
      } else if (dragRef.current.vid != null) {
        const base = dragRef.current.vid * 3;
        pos.array[base] = local.x;
        pos.array[base + 1] = local.y;
        pos.array[base + 2] = local.z;
        touchedVertices.add(dragRef.current.vid);
        for (const linkedIdx of linkedVertexIndicesRef.current) {
          const linkedBase = linkedIdx * 3;
          pos.array[linkedBase] = local.x;
          pos.array[linkedBase + 1] = local.y;
          pos.array[linkedBase + 2] = local.z;
          touchedVertices.add(linkedIdx);
        }
      }
      pos.needsUpdate = true;

      // Keep the visible wireframe point cloud in sync with edited vertices.
      const overlay = grabPointOverlays.find((item) => item.mesh === mesh);
      if (overlay) {
        const overlayPos = overlay.geometry.getAttribute("position");
        if (overlay.denseBindings && overlay.denseDisplayIndicesByVertex) {
          const updateDenseDisplayPoint = (displayVertexIndex: number) => {
            const binding = overlay.denseBindings![displayVertexIndex];
            if (!binding) {
              return;
            }
            const aBase = binding.a * 3;
            const bBase = binding.b * 3;
            const cBase = binding.c * 3;
            const displayBase = displayVertexIndex * 3;
            overlayPos.array[displayBase] =
              pos.array[aBase] * binding.wa + pos.array[bBase] * binding.wb + pos.array[cBase] * binding.wc;
            overlayPos.array[displayBase + 1] =
              pos.array[aBase + 1] * binding.wa + pos.array[bBase + 1] * binding.wb + pos.array[cBase + 1] * binding.wc;
            overlayPos.array[displayBase + 2] =
              pos.array[aBase + 2] * binding.wa + pos.array[bBase + 2] * binding.wb + pos.array[cBase + 2] * binding.wc;
          };
          const denseDisplayIndicesToUpdate = new Set<number>();
          for (const touchedVertex of touchedVertices) {
            const displayIndices = overlay.denseDisplayIndicesByVertex.get(touchedVertex);
            if (!displayIndices) {
              continue;
            }
            for (const displayIndex of displayIndices) {
              denseDisplayIndicesToUpdate.add(displayIndex);
            }
          }
          for (const displayIndex of denseDisplayIndicesToUpdate) {
            updateDenseDisplayPoint(displayIndex);
          }
        } else {
          const updateOverlayVertex = (sourceVertexIndex: number) => {
            const displayVertexIndices = overlay.displayIndicesByVertex.get(sourceVertexIndex);
            if (!displayVertexIndices || displayVertexIndices.length === 0) {
              return;
            }
            for (const displayVertexIndex of displayVertexIndices) {
              const displayBase = displayVertexIndex * 3;
              overlayPos.array[displayBase] = local.x;
              overlayPos.array[displayBase + 1] = local.y;
              overlayPos.array[displayBase + 2] = local.z;
            }
          };
          for (const touchedVertex of touchedVertices) {
            updateOverlayVertex(touchedVertex);
          }
        }
        overlayPos.needsUpdate = true;
      }

      mesh.updateMatrixWorld(true);
      groupRef.current?.updateMatrixWorld(true);
      geometry.computeVertexNormals();
      const world = mesh.localToWorld(local.clone());
      const grp = groupRef.current ? groupRef.current.worldToLocal(world.clone()) : world;
      setSelectedPoint([grp.x, grp.y, grp.z]);
      onSelectionChange({ id: `v:${dragRef.current.vid ?? "dense"}`, position: [local.x, local.y, local.z] });
      const delta = local.clone().sub(dragRef.current.start);
      onDragDeltaChange([delta.x, delta.y, delta.z]);
    };
    const onPointerUp = () => {
      const hadDrag = dragRef.current.active;
      dragRef.current.active = false;
      dragRef.current.mesh = null;
      dragRef.current.vid = null;
      dragRef.current.denseBinding = null;
      dragRef.current.denseStartVertices = null;
      linkedVertexIndicesRef.current = [];
      onLinkedVertexCountChange(0);
      setAxisLock(null);
      onSnapHintChange(null);
      setInteractionOwner("camera");
      onDragDeltaChange(null);
      setHoveredPoint(null);
      if (hadDrag) {
        if (selectedPoint) {
          setReleasePoint(selectedPoint);
        }
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
  }, [axisLock, camera, gl, grabPointOverlays, onDragDeltaChange, onLinkedVertexCountChange, onSelectionChange, onSnapHintChange, selectedPoint, setInteractionOwner]);

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
    dragRef.current = {
      mesh,
      vid: nearest.index,
      start: nearest.vertex.clone(),
      active: true,
      planeNormalPoint: world.clone(),
      denseBinding: null,
      denseStartVertices: null,
    };
    const linked: number[] = [];
    const eps = 1e-6;
    for (let i = 0; i < pos.count; i += 1) {
      const dx = pos.array[i * 3] - nearest.vertex.x;
      const dy = pos.array[i * 3 + 1] - nearest.vertex.y;
      const dz = pos.array[i * 3 + 2] - nearest.vertex.z;
      if (Math.abs(dx) < eps && Math.abs(dy) < eps && Math.abs(dz) < eps) {
        linked.push(i);
      }
    }
    linkedVertexIndicesRef.current = linked.length > 0 ? linked : [nearest.index];
    onLinkedVertexCountChange(linkedVertexIndicesRef.current.length);
    onSnapHintChange("Free move");
    setInteractionOwner("tool");
    gl.domElement.style.cursor = "grabbing";
  };

  const beginDragFromDensePoint = (
    mesh: Mesh,
    denseBinding: { a: number; b: number; c: number; wa: number; wb: number; wc: number },
    localDensePoint: Vector3,
  ) => {
    const geometry = mesh.geometry as BufferGeometry;
    const pos = geometry.getAttribute("position");
    const world = mesh.localToWorld(localDensePoint.clone());
    const grp = groupRef.current ? groupRef.current.worldToLocal(world.clone()) : world;
    setSelectedPoint([grp.x, grp.y, grp.z]);
    onSelectionChange({ id: "v:dense", position: [localDensePoint.x, localDensePoint.y, localDensePoint.z] });
    const aBase = denseBinding.a * 3;
    const bBase = denseBinding.b * 3;
    const cBase = denseBinding.c * 3;
    dragRef.current = {
      mesh,
      vid: null,
      start: localDensePoint.clone(),
      active: true,
      planeNormalPoint: world.clone(),
      denseBinding,
      denseStartVertices: {
        a: new Vector3(pos.array[aBase], pos.array[aBase + 1], pos.array[aBase + 2]),
        b: new Vector3(pos.array[bBase], pos.array[bBase + 1], pos.array[bBase + 2]),
        c: new Vector3(pos.array[cBase], pos.array[cBase + 1], pos.array[cBase + 2]),
      },
    };
    linkedVertexIndicesRef.current = [denseBinding.a, denseBinding.b, denseBinding.c];
    onLinkedVertexCountChange(3);
    onSnapHintChange("Free move");
    setInteractionOwner("tool");
    gl.domElement.style.cursor = "grabbing";
  };

  const handlePointerDown = (event: ThreeEvent<PointerEvent>) => {
    if (activeTool === "measure" && measureSubtool === "point_to_point") {
      measureDownRef.current = { x: event.clientX, y: event.clientY, point: [event.point.x, event.point.y, event.point.z] };
      return;
    }
    if (activeTool !== "edit") return;
    if (displayMode !== "wireframe") return;
    event.stopPropagation();
    setHoveredPoint(null);

    // Direct vertex grab from visible dot cloud (wireframe helper points).
    const pointsObject = event.object as Points;
    const pointsMesh = pointsObject?.userData?.sourceMesh as Mesh | undefined;
    if (pointsObject?.isPoints && pointsMesh && typeof event.index === "number") {
      const overlay = grabPointOverlays.find((item) => item.mesh === pointsMesh);
      if (overlay?.denseBindings && overlay.denseBindings[event.index]) {
        const positions = overlay.geometry.getAttribute("position");
        const pointBase = event.index * 3;
        const localDensePoint = new Vector3(positions.array[pointBase], positions.array[pointBase + 1], positions.array[pointBase + 2]);
        beginDragFromDensePoint(pointsMesh, overlay.denseBindings[event.index], localDensePoint);
        return;
      }
      const mappedIndex = overlay ? overlay.vertexMap[event.index] ?? event.index : event.index;
      beginDragFromVertex(pointsMesh, mappedIndex);
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
          onPointerMove={(event) => {
            if (activeTool !== "edit" || typeof event.index !== "number") {
              return;
            }
            const positions = overlay.geometry.getAttribute("position");
            const i = event.index;
            const localVertex = new Vector3(
              positions.array[i * 3],
              positions.array[i * 3 + 1],
              positions.array[i * 3 + 2],
            );
            const groupSpace = localVertex.applyMatrix4(overlay.matrix);
            setHoveredPoint([groupSpace.x, groupSpace.y, groupSpace.z]);
          }}
          onPointerOut={() => {
            setHoveredPoint(null);
          }}
        >
          <pointsMaterial color="#ffe3a8" size={0.7} sizeAttenuation />
        </points>
      ))}
      {hoveredPoint && activeTool === "edit" && !selectedPoint ? (
        <mesh position={hoveredPoint as Vector3Tuple}>
          <sphereGeometry args={[0.68, 16, 16]} />
          <meshStandardMaterial color="#ffd78e" emissive="#8a5c1b" />
        </mesh>
      ) : null}
      {selectedPoint && activeTool === "edit" ? (
        <mesh position={selectedPoint as Vector3Tuple}>
          <sphereGeometry args={[0.8, 18, 18]} />
          <meshStandardMaterial color="#ffd060" emissive="#8a4b00" />
        </mesh>
      ) : null}
      {releasePoint ? (
        <mesh position={releasePoint as Vector3Tuple}>
          <sphereGeometry args={[0.58, 16, 16]} />
          <meshStandardMaterial color="#ffd060" emissive="#8a4b00" transparent opacity={Math.max(0, releaseOpacity * 0.8)} />
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
  dotDensityMode: DotDensityMode;
  measureSubtool: MeasureSubtool;
  onBoundsChange: (value: BoundsInfo) => void;
  onSelectionChange: (value: EditorControlPoint) => void;
  onEditablePointCountChange: (count: number) => void;
  onLinkedVertexCountChange: (count: number) => void;
  onSnapHintChange: (hint: string | null) => void;
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
  dotDensityMode,
  measureSubtool,
  persistedEditorState,
  onEditorStateChange,
  clearMeasureNonce = 0,
}: ViewportCanvasProps) {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const [interactionOwner, setInteractionOwner] = useState<"camera" | "tool">("camera");
  const [selectedControlPoint, setSelectedControlPoint] = useState<EditorControlPoint>(null);
  const [editablePointCount, setEditablePointCount] = useState(0);
  const [linkedVertexCount, setLinkedVertexCount] = useState(0);
  const [snapHint, setSnapHint] = useState<string | null>(null);
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
      if (activeTool === "edit") setInteractionOwner("tool");
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
        {activeTool === "edit" ? <div>Editable points: {editablePointCount}</div> : null}
        {activeTool === "edit" && linkedVertexCount > 0 ? <div>Linked vertices moved: {linkedVertexCount}</div> : null}
        {activeTool === "edit" && snapHint ? <div>Snap hint: {snapHint}</div> : null}
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
                dotDensityMode={dotDensityMode}
                  measureSubtool={measureSubtool}
                  onBoundsChange={setBounds}
                  onSelectionChange={setSelectedControlPoint}
                  onEditablePointCountChange={setEditablePointCount}
                  onLinkedVertexCountChange={setLinkedVertexCount}
                  onSnapHintChange={setSnapHint}
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
                dotDensityMode={dotDensityMode}
                  measureSubtool={measureSubtool}
                  onBoundsChange={setBounds}
                  onSelectionChange={setSelectedControlPoint}
                  onEditablePointCountChange={setEditablePointCount}
                  onLinkedVertexCountChange={setLinkedVertexCount}
                  onSnapHintChange={setSnapHint}
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
