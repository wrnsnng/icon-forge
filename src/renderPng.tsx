import { createRoot, useThree, type RootState } from "@react-three/fiber";
import { Component, useEffect, type ReactNode } from "react";
import type { RenderPng } from "./exportPng";
import type { Look } from "./look";
import type { IconGeometry } from "./svgIcon";
import { CAMERA_FOV, cameraPosition, loadStudioEnvironment, LookScene } from "./Viewport";

const SUPERSAMPLE = 4;

class FailOnError extends Component<{ onError: (error: unknown) => void; children: ReactNode }> {
  static getDerivedStateFromError() {
    return null;
  }
  componentDidCatch(error: unknown) {
    this.props.onError(error);
  }
  render() {
    return this.props.children;
  }
}

function Ready({ onReady }: { onReady: (state: RootState) => void }) {
  const get = useThree((state) => state.get);
  useEffect(() => onReady(get()), [get, onReady]);
  return null;
}

function canvas2d(size: number) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2D canvas unavailable");
  return { canvas, context };
}

export function createPngRenderer(look: Look): { render: RenderPng; dispose: () => void } {
  const root = createRoot(document.createElement("canvas"));
  const environment = loadStudioEnvironment();

  const draw = async (icon: IconGeometry, size: number) => {
    await root.configure({
      gl: { alpha: true, antialias: true, preserveDrawingBuffer: true },
      camera: { fov: CAMERA_FOV, position: cameraPosition(look.camera) },
      size: { width: size, height: size, top: 0, left: 0 },
      dpr: 1,
      frameloop: "never",
    });
    const texture = await environment;
    const state = await new Promise<RootState>((resolve, reject) =>
      root.render(
        <FailOnError onError={reject}>
          <LookScene icon={icon} look={look} spin={false} environment={texture}>
            <Ready onReady={resolve} />
          </LookScene>
        </FailOnError>,
      ),
    );
    state.advance(performance.now());
    return state.gl.domElement;
  };

  const render: RenderPng = async (icon, px) => {
    const big = await draw(icon, px * SUPERSAMPLE);
    const small = canvas2d(px);
    if (look.camera.background !== "transparent") {
      small.context.fillStyle = look.camera.background;
      small.context.fillRect(0, 0, px, px);
    }
    small.context.imageSmoothingQuality = "high";
    small.context.drawImage(big, 0, 0, px, px);
    const blob = await new Promise<Blob | null>((resolve) => small.canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("PNG encoding failed");
    return new Uint8Array(await blob.arrayBuffer());
  };

  const dispose = () => {
    root.unmount();
    environment.then((texture) => texture.dispose(), () => undefined);
  };
  return { render, dispose };
}
