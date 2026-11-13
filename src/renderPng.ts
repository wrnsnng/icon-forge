import { ACESFilmicToneMapping, Mesh, MeshPhysicalMaterial, MathUtils, PerspectiveCamera, PMREMGenerator, Scene, WebGLRenderer } from "three";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";
import type { RenderPng } from "./exportPng";
import type { Look } from "./look";
import { CAMERA_FOV, cameraPosition, GLOW_TINT, HDRI, iconGeometry } from "./Viewport";

const SUPERSAMPLE = 4;

function materialFor(look: Look): MeshPhysicalMaterial {
  const { material, accent, camera } = look;
  const shared = { color: material.color, roughness: material.roughness, metalness: 0, emissive: accent, emissiveIntensity: camera.glow * GLOW_TINT };
  if (material.type === "clay") return new MeshPhysicalMaterial(shared);
  return new MeshPhysicalMaterial({
    ...shared,
    color: "#ffffff",
    transmission: 1,
    thickness: 0.2,
    ior: material.ior,
    dispersion: material.dispersion,
    attenuationColor: material.color,
    attenuationDistance: 1 / (1 + 50 * material.density),
  });
}

function canvas2d(size: number) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("2D canvas unavailable");
  return { canvas, context };
}

export async function createPngRenderer(look: Look): Promise<{ render: RenderPng; dispose: () => void }> {
  const renderer = new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = look.lights.exposure;
  renderer.setClearColor(0x000000, 0);

  const pmrem = new PMREMGenerator(renderer);
  const hdri = await new HDRLoader().loadAsync(HDRI);
  const environment = pmrem.fromEquirectangular(hdri).texture;
  hdri.dispose();
  pmrem.dispose();

  const scene = new Scene();
  scene.environment = environment;
  scene.environmentRotation.y = MathUtils.degToRad(look.lights.rotation);
  scene.backgroundRotation.y = scene.environmentRotation.y;
  const camera = new PerspectiveCamera(CAMERA_FOV, 1);
  camera.position.set(...cameraPosition(look.camera));
  camera.lookAt(0, 0, 0);
  const material = materialFor(look);
  const mesh = new Mesh(undefined, material);
  mesh.scale.set(look.shape.scaleX / 100, look.shape.scaleY / 100, 1);
  scene.add(mesh);

  const capture = (big: ReturnType<typeof canvas2d>, withBackdrop: boolean) => {
    scene.background = withBackdrop ? environment : null;
    renderer.render(scene, camera);
    big.context.clearRect(0, 0, big.canvas.width, big.canvas.height);
    big.context.drawImage(renderer.domElement, 0, 0);
    return big.context.getImageData(0, 0, big.canvas.width, big.canvas.height);
  };

  const render: RenderPng = async (icon, px) => {
    const geometry = iconGeometry(icon, look.shape);
    mesh.geometry = geometry;
    const bigSize = px * SUPERSAMPLE;
    renderer.setSize(bigSize, bigSize, false);
    const big = canvas2d(bigSize);
    const refracted = capture(big, true);
    const cutout = capture(big, false);
    geometry.dispose();
    for (let i = 3; i < refracted.data.length; i += 4) refracted.data[i] = cutout.data[i] ?? 0;
    big.context.putImageData(refracted, 0, 0);

    const small = canvas2d(px);
    if (look.camera.background !== "transparent") {
      small.context.fillStyle = look.camera.background;
      small.context.fillRect(0, 0, px, px);
    }
    small.context.imageSmoothingQuality = "high";
    small.context.drawImage(big.canvas, 0, 0, px, px);
    const blob = await new Promise<Blob | null>((resolve) => small.canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("PNG encoding failed");
    return new Uint8Array(await blob.arrayBuffer());
  };

  const dispose = () => {
    material.dispose();
    environment.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  };
  return { render, dispose };
}
