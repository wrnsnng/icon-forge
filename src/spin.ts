import { PRESETS } from "./presets";
import type { Look } from "./look";

export const SPIN_SECONDS = 8;
export const SPIN_FPS = 30;
export const SPIN_SIZE = 1080;
const MIME_TYPES = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];

export const canRecordVideo = () => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("video/webm");

export function spinBackground(look: Look): { hex: string; fallback: string | null } {
  if (look.camera.background !== "transparent") return { hex: look.camera.background, fallback: null };
  const preset = PRESETS.find((candidate) => candidate.id === look.preset) ?? PRESETS[0];
  if (!preset) throw new Error("No presets defined");
  return { hex: preset.background.hex, fallback: preset.name };
}

export type SpinStage = {
  canvas: HTMLCanvasElement;
  renderFrame: (turn: number) => void;
};

const sleepUntil = (time: number) => new Promise((resolve) => setTimeout(resolve, Math.max(0, time - performance.now())));

export async function recordSpin({ canvas, renderFrame }: SpinStage, onSecond: (seconds: number) => void): Promise<Blob> {
  const stream = canvas.captureStream(SPIN_FPS);
  try {
    const [track] = stream.getVideoTracks() as CanvasCaptureMediaStreamTrack[];
    if (!track) throw new Error("The canvas gave no video track");
    const mimeType = MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 12_000_000 });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => chunks.push(event.data);
    const stopped = new Promise((resolve) => (recorder.onstop = resolve));
    const durationMs = SPIN_SECONDS * 1000;
    const frameMs = 1000 / SPIN_FPS;
    recorder.start();
    const start = performance.now();
    try {
      let renderMs = 0;
      const show = (turn: number) => {
        const before = performance.now();
        renderFrame(turn);
        track.requestFrame();
        renderMs = performance.now() - before;
      };
      for (let elapsed = 0; elapsed + renderMs < durationMs; elapsed = performance.now() - start) {
        onSecond(Math.floor(elapsed / 1000));
        show(elapsed / durationMs);
        await sleepUntil(start + Math.min((Math.floor(elapsed / frameMs) + 1) * frameMs, durationMs - renderMs));
      }
      await sleepUntil(start + durationMs - renderMs);
      show(1);
      await sleepUntil(performance.now() + frameMs);
    } finally {
      recorder.stop();
    }
    await stopped;
    return new Blob(chunks, { type: "video/webm" });
  } finally {
    stream.getTracks().forEach((track) => track.stop());
  }
}
