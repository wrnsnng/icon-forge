import { Environment, OrbitControls, useProgress } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Suspense, useEffect, useMemo } from "react";
import { ExtrudeGeometry, type ExtrudeGeometryOptions } from "three";
import { getLook, useLook, type Look } from "./look";
import type { IconGeometry } from "./svgIcon";

export type Toast = { id: number; message: string };

const LOADING_LIGHTING = "Loading lighting…";
const DROP_OVERLAY = "Drop SVG to load";
const WEBGL_ERROR = "Icon Forge needs WebGL 2, which isn't available in this browser.";
const CAMERA_DISTANCE = 3;
const DEPTH_AT_100 = 0.2;
const MAX_BEVEL = 0.04;
const BEVEL_SEGMENTS = 6;
const BEVEL_STROKE_FRACTION = 0.4;

const hasWebGL2 = (() => {
  const gl = document.createElement("canvas").getContext("webgl2");
  gl?.getExtension("WEBGL_lose_context")?.loseContext();
  return gl !== null;
})();

function initialCameraPosition(): [number, number, number] {
  const { azimuth, elevation } = getLook().camera;
  const az = (azimuth * Math.PI) / 180;
  const el = (elevation * Math.PI) / 180;
  return [
    CAMERA_DISTANCE * Math.cos(el) * Math.sin(az),
    CAMERA_DISTANCE * Math.sin(el),
    CAMERA_DISTANCE * Math.cos(el) * Math.cos(az),
  ];
}

export function extrusionOptions(shape: Look["shape"], thinnest: number): ExtrudeGeometryOptions {
  const size = Math.min((shape.bevel / 100) * MAX_BEVEL, BEVEL_STROKE_FRACTION * thinnest);
  return {
    depth: (shape.depth / 100) * DEPTH_AT_100,
    bevelEnabled: size > 0,
    bevelSize: size,
    bevelThickness: size,
    bevelSegments: BEVEL_SEGMENTS,
  };
}

function Icon({ icon }: { icon: IconGeometry }) {
  const shape = useLook((look) => look.shape);
  const { scaleX, scaleY } = shape;
  const geometry = useMemo(
    () => new ExtrudeGeometry(icon.shapes, extrusionOptions(shape, icon.thinnest)).center(),
    [icon, shape],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);

  const color = useLook((look) => look.material.color);
  const roughness = useLook((look) => look.material.roughness);

  return (
    <mesh geometry={geometry} scale={[scaleX / 100, scaleY / 100, 1]}>
      <meshPhysicalMaterial color={color} roughness={roughness} metalness={0} />
    </mesh>
  );
}

function Scene({ icon }: { icon: IconGeometry }) {
  const background = useLook((look) => look.camera.background);

  return (
    <>
      {background !== "transparent" && <color attach="background" args={[background]} />}
      <Suspense fallback={null}>
        <Environment files="/hdri/studio_small_09_1k.hdr" />
        <Icon icon={icon} />
      </Suspense>
      <OrbitControls makeDefault enablePan={false} />
    </>
  );
}

export function Viewport({ icon, dragging, toast }: { icon: IconGeometry; dragging: boolean; toast: Toast | null }) {
  const loading = useProgress((state) => state.active);

  if (!hasWebGL2) {
    return (
      <div className="viewport viewport-error" role="alert">
        {WEBGL_ERROR}
      </div>
    );
  }
  return (
    <div className="viewport">
      <Canvas camera={{ fov: 30, position: initialCameraPosition() }}>
        <Scene icon={icon} />
      </Canvas>
      {loading && <div className="viewport-status">{LOADING_LIGHTING}</div>}
      {dragging && <div className="viewport-drop">{DROP_OVERLAY}</div>}
      {toast && (
        <div key={toast.id} className="toast" role="alert">
          {toast.message}
        </div>
      )}
    </div>
  );
}
