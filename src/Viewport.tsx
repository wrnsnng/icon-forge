import { Environment, OrbitControls, useProgress } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Suspense } from "react";
import { ExtrudeGeometry, Shape } from "three";
import { getLook, useLook } from "./look";

const LOADING_LIGHTING = "Loading lighting…";
const WEBGL_ERROR = "Icon Forge needs WebGL 2, which isn't available in this browser.";
const CAMERA_DISTANCE = 3;

const hasWebGL2 = (() => {
  const gl = document.createElement("canvas").getContext("webgl2");
  gl?.getExtension("WEBGL_lose_context")?.loseContext();
  return gl !== null;
})();

const square = new Shape().moveTo(-0.5, -0.5).lineTo(0.5, -0.5).lineTo(0.5, 0.5).lineTo(-0.5, 0.5).closePath();
const placeholder = new ExtrudeGeometry(square, {
  depth: 0.2,
  bevelEnabled: true,
  bevelSize: 0.012,
  bevelThickness: 0.012,
  bevelSegments: 6,
}).center();

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

function Scene() {
  const color = useLook((look) => look.material.color);
  const roughness = useLook((look) => look.material.roughness);
  const background = useLook((look) => look.camera.background);

  return (
    <>
      {background !== "transparent" && <color attach="background" args={[background]} />}
      <Suspense fallback={null}>
        <Environment files="/hdri/studio_small_09_1k.hdr" />
        <mesh geometry={placeholder}>
          <meshPhysicalMaterial color={color} roughness={roughness} metalness={0} />
        </mesh>
      </Suspense>
      <OrbitControls makeDefault enablePan={false} />
    </>
  );
}

export function Viewport() {
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
        <Scene />
      </Canvas>
      {loading && <div className="viewport-status">{LOADING_LIGHTING}</div>}
    </div>
  );
}
