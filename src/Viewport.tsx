import { Environment, MeshTransmissionMaterial, OrbitControls, useEnvironment, useProgress } from "@react-three/drei";
import { Canvas, extend, useFrame, useThree } from "@react-three/fiber";
import { Bloom, DepthOfField, EffectComposer, ToneMapping } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { Suspense, useCallback, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { BufferAttribute, BufferGeometry, EquirectangularReflectionMapping, Euler, ExtrudeGeometry, Group, MathUtils, Mesh, MeshPhysicalMaterial, Vector2, Vector3, type ExtrudeGeometryOptions, type Shape, type Texture } from "three";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";
import { TessellateModifier } from "three/addons/modifiers/TessellateModifier.js";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { attenuationDistance, GLASS_THICKNESS } from "./glb";
import { getLook, updateLook, useLook, type Look } from "./look";
import type { IconGeometry } from "./svgIcon";

export type Toast = { id: number; message: string };

const LOADING_LIGHTING = "Loading lighting…";
const BUILDING_ICON = "Building icon…";
const DROP_OVERLAY = "Drop SVG to load";
const WEBGL_ERROR = "Icon Forge needs WebGL 2, which isn't available in this browser.";
const CAMERA_DISTANCE = 3;
export const CAMERA_FOV = 30;
const DEPTH_AT_100 = 0.2;
const MAX_BEVEL = 0.04;
const BEVEL_SEGMENTS = 6;
const BEVEL_STROKE_FRACTION = 0.4;
const BULGE_HEIGHT = 0.1;
const GLOW_TINT = 0.2;
const BULGE_EDGE = 0.012;
const OUTLINE_DIVISIONS = 12;
const OUTLINE_CELL = 0.025;
const SPIN_RADIANS_PER_SECOND = (2 * Math.PI) / 8;
const ORBIT_DEGREES = 15;
const MAX_ELEVATION = 89;
const ZOOM_KEY_STEP = 10;
const MIN_ZOOM = 50;
const MAX_ZOOM = 200;
const VIEWPORT_LABEL = "3D preview, use arrow keys to orbit";
export const HDRI = "/hdri/studio_small_09_1k.hdr";
export const TURNTABLE = "turntable";

export async function loadStudioEnvironment(): Promise<Texture> {
  const texture = await new HDRLoader().loadAsync(HDRI);
  texture.mapping = EquirectangularReflectionMapping;
  return texture;
}

extend({ Group, Mesh, MeshPhysicalMaterial });

export const hasWebGL2 = (() => {
  const gl = document.createElement("canvas").getContext("webgl2");
  gl?.getExtension("WEBGL_lose_context")?.loseContext();
  return gl !== null;
})();

const distanceFor = (zoom: number) => (CAMERA_DISTANCE * 100) / zoom;

export function cameraPosition({ azimuth, elevation, zoom }: Look["camera"]): [number, number, number] {
  const distance = distanceFor(zoom);
  const az = (azimuth * Math.PI) / 180;
  const el = (elevation * Math.PI) / 180;
  return [
    distance * Math.cos(el) * Math.sin(az),
    distance * Math.sin(el),
    distance * Math.cos(el) * Math.cos(az),
  ];
}

export function extrusionOptions(shape: Pick<Look["shape"], "depth" | "bevel">, thinnest: number): ExtrudeGeometryOptions {
  const size = Math.min((shape.bevel / 100) * MAX_BEVEL, BEVEL_STROKE_FRACTION * thinnest);
  return {
    depth: (shape.depth / 100) * DEPTH_AT_100,
    bevelEnabled: size > 0,
    bevelSize: size,
    bevelThickness: size,
    bevelSegments: BEVEL_SEGMENTS,
  };
}

function trianglesOf(geometry: BufferGeometry, materialIndex: number): BufferGeometry {
  const groups = geometry.groups.filter((group) => group.materialIndex === materialIndex);
  const vertices = groups.reduce((sum, group) => sum + group.count, 0);
  const part = new BufferGeometry();
  for (const name of ["position", "normal", "uv"]) {
    const source = geometry.getAttribute(name);
    const values = new Float32Array(vertices * source.itemSize);
    let offset = 0;
    for (const group of groups) {
      values.set(source.array.subarray(group.start * source.itemSize, (group.start + group.count) * source.itemSize), offset);
      offset += group.count * source.itemSize;
    }
    part.setAttribute(name, new BufferAttribute(values, source.itemSize));
  }
  return part;
}

function outlineSegments(shapes: Shape[]): [Vector2, Vector2][] {
  const segments: [Vector2, Vector2][] = [];
  for (const shape of shapes) {
    const { shape: outer, holes } = shape.extractPoints(OUTLINE_DIVISIONS);
    for (const ring of [outer, ...holes]) {
      ring.forEach((point, index) => segments.push([point, ring[(index + 1) % ring.length] ?? point]));
    }
  }
  return segments;
}

function segmentDistance(x: number, y: number, [a, b]: [Vector2, Vector2]): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : MathUtils.clamp(((x - a.x) * dx + (y - a.y) * dy) / lengthSq, 0, 1);
  return Math.hypot(x - a.x - t * dx, y - a.y - t * dy);
}

function outlineDistance(segments: [Vector2, Vector2][]): (x: number, y: number) => number {
  const cells = new Map<string, [Vector2, Vector2][]>();
  const cell = (value: number) => Math.floor(value / OUTLINE_CELL);
  for (const segment of segments) {
    const [a, b] = segment;
    for (let i = cell(Math.min(a.x, b.x)); i <= cell(Math.max(a.x, b.x)); i += 1) {
      for (let j = cell(Math.min(a.y, b.y)); j <= cell(Math.max(a.y, b.y)); j += 1) {
        const key = `${i},${j}`;
        cells.set(key, [...(cells.get(key) ?? []), segment]);
      }
    }
  }
  return (x, y) => {
    const ci = cell(x);
    const cj = cell(y);
    let best = Infinity;
    for (let ring = 0; ring * OUTLINE_CELL <= best + OUTLINE_CELL && ring < 1 / OUTLINE_CELL + 2; ring += 1) {
      for (let i = ci - ring; i <= ci + ring; i += 1) {
        for (let j = cj - ring; j <= cj + ring; j += 1) {
          if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== ring) continue;
          for (const segment of cells.get(`${i},${j}`) ?? []) best = Math.min(best, segmentDistance(x, y, segment));
        }
      }
    }
    return best;
  };
}

type Cushion = { caps: BufferGeometry; sides: BufferGeometry; lift: Float32Array };

export function flatGeometry(icon: IconGeometry, shape: Pick<Look["shape"], "depth" | "bevel">): BufferGeometry {
  return new ExtrudeGeometry(icon.shapes, extrusionOptions(shape, icon.thinnest)).center();
}

export function cushion(icon: IconGeometry, shape: Pick<Look["shape"], "depth" | "bevel">): Cushion {
  const extruded = new ExtrudeGeometry(icon.shapes, extrusionOptions(shape, icon.thinnest));
  extruded.computeBoundingBox();
  const centre = extruded.boundingBox?.getCenter(new Vector3()) ?? new Vector3();
  extruded.translate(-centre.x, -centre.y, -centre.z);
  const caps = mergeVertices(new TessellateModifier(BULGE_EDGE, 16).modify(trianglesOf(extruded, 0)));
  const sides = trianglesOf(extruded, 1);
  extruded.dispose();
  const position = caps.getAttribute("position");
  const distanceAt = outlineDistance(outlineSegments(icon.shapes));
  const distances = Array.from({ length: position.count }, (_, i) => distanceAt(position.getX(i) + centre.x, position.getY(i) + centre.y));
  const deepest = distances.reduce((max, distance) => Math.max(max, distance), 0);
  const lift = new Float32Array(distances.map((distance, i) => Math.sign(position.getZ(i)) * MathUtils.smoothstep(distance, 0, deepest)));
  return { caps, sides, lift };
}

export function bulgedGeometry({ caps, sides, lift }: Cushion, bulge: number): BufferGeometry {
  const height = (bulge / 100) * BULGE_HEIGHT;
  const swollen = caps.clone();
  const position = swollen.getAttribute("position");
  lift.forEach((factor, i) => position.setZ(i, position.getZ(i) + factor * height));
  swollen.computeVertexNormals();
  const merged = mergeGeometries([swollen.toNonIndexed(), sides], true);
  swollen.dispose();
  return merged;
}

export function iconGeometry(icon: IconGeometry, { depth, bevel, bulge }: Look["shape"]): BufferGeometry {
  if (bulge === 0) return flatGeometry(icon, { depth, bevel });
  const base = cushion(icon, { depth, bevel });
  const geometry = bulgedGeometry(base, bulge);
  base.caps.dispose();
  base.sides.dispose();
  return geometry;
}

function IconMaterial({ look }: { look: Look }) {
  const { material, accent } = look;
  const emissive = { emissive: accent, emissiveIntensity: look.camera.glow * GLOW_TINT };

  if (material.type === "clay") {
    return <meshPhysicalMaterial color={material.color} roughness={material.roughness} metalness={0} clearcoat={0} {...emissive} />;
  }
  return (
    <MeshTransmissionMaterial
      roughness={material.roughness}
      ior={material.ior}
      chromaticAberration={material.dispersion}
      attenuationColor={material.color}
      attenuationDistance={attenuationDistance(material.density)}
      thickness={GLASS_THICKNESS}
      {...emissive}
    />
  );
}

function Icon({ icon, look, spin }: { icon: IconGeometry; look: Look; spin: boolean }) {
  const { depth, bevel, bulge, scaleX, scaleY } = look.shape;
  const bulging = bulge > 0;
  const base = useMemo(() => (bulging ? cushion(icon, { depth, bevel }) : flatGeometry(icon, { depth, bevel })), [icon, depth, bevel, bulging]);
  const geometry = useMemo(() => (base instanceof BufferGeometry ? base : bulgedGeometry(base, bulge)), [base, bulge]);
  useEffect(
    () => () => {
      if (base instanceof BufferGeometry) return base.dispose();
      base.caps.dispose();
      base.sides.dispose();
    },
    [base],
  );
  useEffect(() => () => void (geometry !== base && geometry.dispose()), [base, geometry]);

  const turntable = useRef<Group>(null);
  useFrame((_, delta) => {
    if (spin && turntable.current) turntable.current.rotation.y += delta * SPIN_RADIANS_PER_SECOND;
  });

  return (
    <group ref={turntable} name={TURNTABLE}>
      <mesh geometry={geometry} scale={[scaleX / 100, scaleY / 100, 1]}>
        <IconMaterial look={look} />
      </mesh>
    </group>
  );
}

type LookSceneProps = { icon: IconGeometry; look: Look; spin: boolean; environment: Texture; children?: ReactNode };

export function LookScene({ icon, look, spin, environment, children }: LookSceneProps) {
  const { exposure, rotation } = look.lights;
  const { glow, dof, focus, zoom } = look.camera;
  const environmentRotation = useMemo(() => new Euler(0, MathUtils.degToRad(rotation), 0), [rotation]);
  useFrame(({ gl }) => {
    gl.toneMappingExposure = exposure;
  });

  return (
    <>
      <Environment map={environment} environmentRotation={environmentRotation} />
      <Icon icon={icon} look={look} spin={spin} />
      {children}
      <EffectComposer multisampling={4}>
        <Bloom intensity={glow * 4} luminanceThreshold={0.8} mipmapBlur />
        <DepthOfField worldFocusDistance={distanceFor(zoom) - 1 + 2 * focus} worldFocusRange={0.3} bokehScale={dof * 10} />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      </EffectComposer>
    </>
  );
}

export function StudioScene(props: Omit<LookSceneProps, "environment">) {
  const environment = useEnvironment({ files: HDRI });
  return <LookScene environment={environment} {...props} />;
}

function CameraRig({ onOrbitingChange }: { onOrbitingChange: (orbiting: boolean) => void }) {
  const controls = useRef<OrbitControlsImpl>(null);
  const camera = useThree((state) => state.camera);
  const zoom = useLook((look) => look.camera.zoom);
  const azimuth = useLook((look) => look.camera.azimuth);
  const elevation = useLook((look) => look.camera.elevation);

  const saveAngles = useCallback(() => {
    const offset = camera.position.clone().sub(controls.current?.target ?? new Vector3());
    const azimuth = MathUtils.radToDeg(Math.atan2(offset.x, offset.z));
    const elevation = MathUtils.radToDeg(Math.asin(MathUtils.clamp(offset.y / offset.length(), -1, 1)));
    updateLook("camera", { azimuth, elevation });
  }, [camera]);

  useEffect(() => {
    const target = controls.current?.target ?? new Vector3();
    const offset = camera.position.clone().sub(target);
    if (Math.abs(offset.length() - distanceFor(zoom)) < 1e-3) return;
    camera.position.copy(target).add(offset.setLength(distanceFor(zoom)));
    controls.current?.update();
  }, [camera, zoom]);

  useEffect(() => {
    const target = controls.current?.target ?? new Vector3();
    const wanted = new Vector3(...cameraPosition({ ...getLook().camera, azimuth, elevation })).add(target);
    if (camera.position.distanceTo(wanted) < 1e-3) return;
    camera.position.copy(wanted);
    controls.current?.update();
  }, [camera, azimuth, elevation]);

  const syncZoom = () => {
    const target = controls.current?.target ?? new Vector3();
    const next = MathUtils.clamp((CAMERA_DISTANCE * 100) / camera.position.distanceTo(target), MIN_ZOOM, MAX_ZOOM);
    if (Math.abs(next - getLook().camera.zoom) > 0.01) updateLook("camera", { zoom: next });
  };

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enablePan={false}
      minDistance={distanceFor(MAX_ZOOM)}
      maxDistance={distanceFor(MIN_ZOOM)}
      onStart={() => onOrbitingChange(true)}
      onEnd={() => {
        onOrbitingChange(false);
        saveAngles();
      }}
      onChange={syncZoom}
    />
  );
}

function Scene({ icon, spin }: { icon: IconGeometry; spin: boolean }) {
  const look = useLook((current) => current);
  const [orbiting, setOrbiting] = useState(false);

  return (
    <>
      <Suspense fallback={null}>
        <StudioScene icon={icon} look={look} spin={spin && !orbiting} />
      </Suspense>
      <CameraRig onOrbitingChange={setOrbiting} />
    </>
  );
}

type ViewportProps = {
  icon: IconGeometry;
  building: boolean;
  dragging: boolean;
  toast: Toast | null;
  spin: boolean;
  onSpinChange: (spin: boolean) => void;
};

const wrapDegrees = (degrees: number) => ((((degrees + 180) % 360) + 360) % 360) - 180;
const orbit = (dAzimuth: number, dElevation: number) => ({ azimuth, elevation }: Look["camera"]) => ({
  azimuth: wrapDegrees(azimuth + dAzimuth),
  elevation: MathUtils.clamp(elevation + dElevation, -MAX_ELEVATION, MAX_ELEVATION),
});
const zoomBy = (delta: number) => ({ zoom }: Look["camera"]) => ({ zoom: MathUtils.clamp(zoom + delta, MIN_ZOOM, MAX_ZOOM) });
const KEY_ACTIONS: Record<string, "spin" | ((camera: Look["camera"]) => Partial<Look["camera"]>)> = {
  ArrowLeft: orbit(-ORBIT_DEGREES, 0),
  ArrowRight: orbit(ORBIT_DEGREES, 0),
  ArrowUp: orbit(0, ORBIT_DEGREES),
  ArrowDown: orbit(0, -ORBIT_DEGREES),
  "+": zoomBy(ZOOM_KEY_STEP),
  "=": zoomBy(ZOOM_KEY_STEP),
  "-": zoomBy(-ZOOM_KEY_STEP),
  " ": "spin",
};

export function Viewport({ icon, building, dragging, toast, spin, onSpinChange }: ViewportProps) {
  const loading = useProgress((state) => state.active);
  const background = useLook((look) => look.camera.background);

  if (!hasWebGL2) {
    return (
      <div className="viewport viewport-error" role="alert">
        {WEBGL_ERROR}
      </div>
    );
  }
  return (
    <div
      className={background === "transparent" ? "viewport viewport-transparent" : "viewport"}
      style={background === "transparent" ? undefined : { background }}
    >
      <div
        className="viewport-stage"
        tabIndex={0}
        role="application"
        aria-label={VIEWPORT_LABEL}
        onKeyDown={(event) => {
          const action = KEY_ACTIONS[event.key];
          if (!action || event.target !== event.currentTarget) return;
          event.preventDefault();
          if (action === "spin") onSpinChange(!spin);
          else updateLook("camera", action(getLook().camera));
        }}
      >
        <Canvas camera={{ fov: CAMERA_FOV, position: cameraPosition(getLook().camera) }}>
          <Scene icon={icon} spin={spin} />
        </Canvas>
      </div>
      {building ? (
        <div className="viewport-status viewport-building">{BUILDING_ICON}</div>
      ) : (
        loading && <div className="viewport-status">{LOADING_LIGHTING}</div>
      )}
      {dragging && <div className="viewport-drop">{DROP_OVERLAY}</div>}
      {toast && (
        <div key={toast.id} className="toast" role="alert">
          {toast.message}
        </div>
      )}
    </div>
  );
}
