import { Plane, Vector3 } from "three";

export function nearestVertexFromFace(
  indices: [number, number, number],
  positions: ArrayLike<number>,
  localHit: Vector3,
): { index: number; vertex: Vector3 } {
  let selected = indices[0];
  let minDist = Number.POSITIVE_INFINITY;
  for (const idx of indices) {
    const vertex = new Vector3(positions[idx * 3], positions[idx * 3 + 1], positions[idx * 3 + 2]);
    const dist = vertex.distanceToSquared(localHit);
    if (dist < minDist) {
      minDist = dist;
      selected = idx;
    }
  }
  return {
    index: selected,
    vertex: new Vector3(positions[selected * 3], positions[selected * 3 + 1], positions[selected * 3 + 2]),
  };
}

export function dragPlaneFromCamera(cameraDir: Vector3, worldPoint: Vector3): Plane {
  return new Plane().setFromNormalAndCoplanarPoint(cameraDir.clone().normalize(), worldPoint);
}
