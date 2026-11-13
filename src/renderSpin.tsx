import { createRoot, type RootState } from "@react-three/fiber";
import { Color } from "three";
import type { Look } from "./look";
import { FailOnError, Ready } from "./renderPng";
import { abortable, encodeSpin, SPIN_SECONDS, SPIN_SIZE, type SpinCodec } from "./spin";
import type { IconGeometry } from "./svgIcon";
import { CAMERA_FOV, cameraPosition, loadStudioEnvironment, LookScene, TURNTABLE } from "./Viewport";

export async function renderSpin(
  icon: IconGeometry,
  look: Look,
  background: string,
  codec: SpinCodec,
  onSecond: (seconds: number) => void,
  signal: AbortSignal,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  const root = createRoot(canvas);
  const environment = loadStudioEnvironment();
  try {
    await abortable(root.configure({
      gl: { antialias: true, preserveDrawingBuffer: true },
      camera: { fov: CAMERA_FOV, position: cameraPosition(look.camera) },
      size: { width: SPIN_SIZE, height: SPIN_SIZE, top: 0, left: 0 },
      dpr: 1,
      frameloop: "never",
    }), signal);
    const texture = await abortable(environment, signal);
    const state = await abortable(new Promise<RootState>((resolve, reject) =>
      root.render(
        <FailOnError onError={reject}>
          <LookScene icon={icon} look={look} spin={false} environment={texture}>
            <Ready onReady={resolve} />
          </LookScene>
        </FailOnError>,
      ),
    ), signal);
    const turntable = state.scene.getObjectByName(TURNTABLE);
    if (!turntable) throw new Error("The offscreen icon didn't mount");
    state.scene.background = new Color(background);
    state.advance(0);
    return await encodeSpin(
      {
        canvas,
        renderFrame: (turn) => {
          turntable.rotation.y = turn * 2 * Math.PI;
          state.advance(turn * SPIN_SECONDS);
        },
      },
      codec,
      onSecond,
      signal,
    );
  } finally {
    root.unmount();
    environment.then((texture) => texture.dispose(), () => undefined);
  }
}
