import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type { Mesh, Vector3 } from "three";
import { AdditiveBlending, DoubleSide, Vector3 as Vector3Class } from "three";

type GridUniforms = {
  uMinorSpacing: { value: number };
  uMajorSpacing: { value: number };
  uMinorThickness: { value: number };
  uMajorThickness: { value: number };
  uFadeDistance: { value: number };
  uMinorColor: { value: Vector3 };
  uMajorColor: { value: Vector3 };
  uCenter: { value: Vector3 };
};

const VERTEX_SHADER = `
varying vec3 vWorldPos;

void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPos = worldPos.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

const FRAGMENT_SHADER = `
varying vec3 vWorldPos;

uniform float uMinorSpacing;
uniform float uMajorSpacing;
uniform float uMinorThickness;
uniform float uMajorThickness;
uniform float uFadeDistance;
uniform vec3 uMinorColor;
uniform vec3 uMajorColor;
uniform vec3 uCenter;

float gridLine(float coord, float spacing, float thickness) {
  float gridCoord = coord / spacing;
  float dist = abs(fract(gridCoord - 0.5) - 0.5) / fwidth(gridCoord);
  return 1.0 - smoothstep(0.0, thickness, dist);
}

void main() {
  float minorX = gridLine(vWorldPos.x, uMinorSpacing, uMinorThickness);
  float minorZ = gridLine(vWorldPos.z, uMinorSpacing, uMinorThickness);
  float majorX = gridLine(vWorldPos.x, uMajorSpacing, uMajorThickness);
  float majorZ = gridLine(vWorldPos.z, uMajorSpacing, uMajorThickness);

  float minorMask = max(minorX, minorZ) * (1.0 - max(majorX, majorZ));
  float majorMask = max(majorX, majorZ);

  float radialDistance = length(vWorldPos.xz - uCenter.xz);
  float fade = smoothstep(uFadeDistance, 0.0, radialDistance);

  vec3 color = (uMinorColor * minorMask) + (uMajorColor * majorMask);
  float alpha = (minorMask + majorMask) * fade;

  if (alpha < 0.001) discard;
  gl_FragColor = vec4(color, alpha);
}
`;

export function InfiniteGrid() {
  const meshRef = useRef<Mesh>(null);
  const { camera } = useThree();

  const uniforms = useMemo<GridUniforms>(
    () => ({
      uMinorSpacing: { value: 1.0 },
      uMajorSpacing: { value: 10.0 },
      uMinorThickness: { value: 0.65 },
      uMajorThickness: { value: 1.25 },
      uFadeDistance: { value: 280.0 },
      uMinorColor: { value: new Vector3Class(0.25, 0.25, 0.25) },
      uMajorColor: { value: new Vector3Class(0.48, 0.48, 0.48) },
      uCenter: { value: camera.position.clone() as Vector3 },
    }),
    [camera],
  );

  useFrame(() => {
    if (!meshRef.current) {
      return;
    }

    const cameraX = camera.position.x;
    const cameraZ = camera.position.z;

    meshRef.current.position.x = cameraX;
    meshRef.current.position.z = cameraZ;
    uniforms.uCenter.value.copy(camera.position);
  });

  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
      <planeGeometry args={[800, 800, 1, 1]} />
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={VERTEX_SHADER}
        fragmentShader={FRAGMENT_SHADER}
        transparent
        depthWrite={false}
        depthTest
        side={DoubleSide}
        blending={AdditiveBlending}
      />
    </mesh>
  );
}
