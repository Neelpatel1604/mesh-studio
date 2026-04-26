import { useFrame } from "@react-three/fiber";
import { forwardRef, RefObject, useEffect, useImperativeHandle, useRef } from "react";
import {
  ArrowHelper,
  OrthographicCamera,
  Quaternion,
  Scene,
  SphereGeometry,
  MeshBasicMaterial,
  Mesh,
  Vector3,
  WebGLRenderer,
} from "three";

export type AxisCornerHandle = {
  syncQuaternion: (q: Quaternion) => void;
};

export const AxisCornerIndicator = forwardRef<AxisCornerHandle>(function AxisCornerIndicator(_, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const quatRef = useRef(new Quaternion());

  useImperativeHandle(ref, () => ({
    syncQuaternion(q: Quaternion) {
      quatRef.current.copy(q);
    },
  }));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const SIZE = 116;
    const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(SIZE, SIZE);
    renderer.setClearColor(0x000000, 0);

    const scene = new Scene();
    const cam = new OrthographicCamera(-1.4, 1.4, 1.4, -1.4, 0.01, 20);
    cam.position.set(0, 0, 5);
    cam.lookAt(0, 0, 0);

    const xArr = new ArrowHelper(new Vector3(1, 0, 0), new Vector3(), 0.9, 0xe74c3c, 0.22, 0.12); // red
    const yArr = new ArrowHelper(new Vector3(0, 1, 0), new Vector3(), 0.9, 0xf5c518, 0.22, 0.12); // yellow
    const zArr = new ArrowHelper(new Vector3(0, 0, 1), new Vector3(), 0.9, 0x3b9ddd, 0.22, 0.12); // blue
    scene.add(xArr, yArr, zArr);

    const dot = new Mesh(
      new SphereGeometry(0.06, 12, 12),
      new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75 }),
    );
    scene.add(dot);

    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const inv = quatRef.current.clone().invert();
      xArr.setDirection(new Vector3(1, 0, 0).applyQuaternion(inv));
      yArr.setDirection(new Vector3(0, 1, 0).applyQuaternion(inv));
      zArr.setDirection(new Vector3(0, 0, 1).applyQuaternion(inv));
      renderer.render(scene, cam);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      renderer.dispose();
    };
  }, []);

  return <canvas ref={canvasRef} width={116} height={116} style={{ display: "block", width: 116, height: 116 }} />;
});

AxisCornerIndicator.displayName = "AxisCornerIndicator";

export function AxisCameraSync({ handle }: { handle: RefObject<AxisCornerHandle | null> }) {
  useFrame(({ camera }) => {
    handle.current?.syncQuaternion(camera.quaternion);
  });
  return null;
}

