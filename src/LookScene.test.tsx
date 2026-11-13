// @vitest-environment jsdom
import { useEnvironment } from "@react-three/drei";
import { createRoot, type ReconcilerRoot, type Renderer } from "@react-three/fiber";
import { readFileSync } from "node:fs";
import { act, Suspense, useEffect, type ReactNode } from "react";
import type { Texture } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_LOOK } from "./look";
import { buildIcon } from "./svgIcon";
import { HDRI, loadStudioEnvironment, LookScene, StudioScene } from "./Viewport";

vi.mock("@react-three/postprocessing", () => ({ EffectComposer: () => null, Bloom: () => null, DepthOfField: () => null, ToneMapping: () => null }));
vi.mock("@react-three/drei", async (original) => ({ ...(await original<object>()), MeshTransmissionMaterial: () => null }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const HDRI_BYTES = readFileSync("public/hdri/studio_small_09_1k.hdr");
vi.stubGlobal("Request", class extends Request {
  constructor(url: string, init?: RequestInit) {
    super(new URL(url, "http://localhost"), init);
  }
});
vi.stubGlobal("fetch", async () => new Response(HDRI_BYTES));

function stubRenderer(): Renderer {
  const renderer = {
    render() {},
    setPixelRatio() {},
    setSize() {},
    dispose() {},
    forceContextLoss() {},
    renderLists: { dispose() {} },
    xr: { enabled: false, isPresenting: false, addEventListener() {}, removeEventListener() {}, setAnimationLoop() {} },
    domElement: document.createElement("canvas"),
    shadowMap: {},
    info: {},
  };
  return renderer;
}

const geometry = buildIcon("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10'><rect width='10' height='10'/></svg>");
if (!geometry.ok) throw new Error(geometry.error);
const icon = geometry;
const roots: ReconcilerRoot<HTMLCanvasElement>[] = [];

async function mount(scene: ReactNode): Promise<ReconcilerRoot<HTMLCanvasElement>> {
  const root = createRoot(document.createElement("canvas"));
  roots.push(root);
  await root.configure({ gl: stubRenderer, size: { width: 1, height: 1, top: 0, left: 0 }, frameloop: "never" });
  await act(async () => root.render(<Suspense fallback={null}>{scene}</Suspense>));
  return root;
}

function ViewportEnvironment({ onLoad }: { onLoad: (texture: Texture) => void }) {
  const texture = useEnvironment({ files: HDRI });
  useEffect(() => onLoad(texture), [texture, onLoad]);
  return null;
}

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
});

describe("environment ownership", () => {
  it("keeps the viewport's environment texture alive when an export root unmounts", async () => {
    let viewportEnvironment: Texture | undefined;
    const viewportLoaded = new Promise<void>((resolve) => {
      const onLoad = (texture: Texture) => {
        viewportEnvironment = texture;
        resolve();
      };
      void mount(
        <>
          <StudioScene icon={icon} look={DEFAULT_LOOK} spin={false} />
          <ViewportEnvironment onLoad={onLoad} />
        </>,
      );
    });
    await viewportLoaded;
    const disposed = vi.fn();
    viewportEnvironment?.addEventListener("dispose", disposed);

    const exportEnvironment = await loadStudioEnvironment();
    const exporter = await mount(<LookScene icon={icon} look={DEFAULT_LOOK} spin={false} environment={exportEnvironment} />);
    act(() => exporter.unmount());

    expect(viewportEnvironment).toBeDefined();
    expect(disposed).not.toHaveBeenCalled();
  });
});
