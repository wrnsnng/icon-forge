import { BufferTarget, EncodedPacket, EncodedVideoPacketSource, Output, WebMOutputFormat } from "mediabunny";
import { PRESETS } from "./presets";
import type { Look } from "./look";

export const SPIN_SECONDS = 8;
export const SPIN_FPS = 30;
export const SPIN_SIZE = 1080;
const SPIN_FRAMES = SPIN_SECONDS * SPIN_FPS;
const MAX_QUEUED_FRAMES = 4;

export type SpinCodec = { codec: "vp9" | "vp8"; config: VideoEncoderConfig };

const CANDIDATES: SpinCodec[] = [
  { codec: "vp9", config: { codec: "vp09.00.10.08", width: SPIN_SIZE, height: SPIN_SIZE, framerate: SPIN_FPS, bitrate: 12_000_000 } },
  { codec: "vp8", config: { codec: "vp8", width: SPIN_SIZE, height: SPIN_SIZE, framerate: SPIN_FPS, bitrate: 12_000_000 } },
];

export async function findSpinCodec(): Promise<SpinCodec | null> {
  if (typeof VideoEncoder === "undefined") return null;
  for (const candidate of CANDIDATES) {
    const { supported } = await VideoEncoder.isConfigSupported(candidate.config).catch(() => ({ supported: false }));
    if (supported) return candidate;
  }
  return null;
}

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

function dequeuedOrAborted(encoder: VideoEncoder, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      encoder.removeEventListener("dequeue", done);
      signal.removeEventListener("abort", done);
      resolve();
    };
    encoder.addEventListener("dequeue", done);
    signal.addEventListener("abort", done);
  });
}

export async function encodeSpin(
  { canvas, renderFrame }: SpinStage,
  { codec, config }: SpinCodec,
  onSecond: (seconds: number) => void,
  signal: AbortSignal,
): Promise<Blob | null> {
  const target = new BufferTarget();
  const output = new Output({ format: new WebMOutputFormat(), target });
  const source = new EncodedVideoPacketSource(codec);
  output.addVideoTrack(source, { frameRate: SPIN_FPS });
  let failure: unknown = null;
  let written = Promise.resolve();
  let packets = 0;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      const packet = EncodedPacket.fromEncodedChunk(chunk);
      const first = packets === 0;
      packets += 1;
      onSecond(Math.floor(packets / SPIN_FPS));
      written = written.then(() => source.add(packet, first ? meta : undefined));
      written.catch((error: unknown) => (failure ??= error));
    },
    error: (error) => (failure ??= error),
  });
  const check = () => {
    if (failure) throw failure;
  };
  try {
    await output.start();
    encoder.configure(config);
    for (let frame = 0; frame < SPIN_FRAMES; frame += 1) {
      while (encoder.encodeQueueSize >= MAX_QUEUED_FRAMES && !signal.aborted) await dequeuedOrAborted(encoder, signal);
      if (signal.aborted) return null;
      check();
      renderFrame(frame / SPIN_FRAMES);
      const videoFrame = new VideoFrame(canvas, { timestamp: (frame * 1e6) / SPIN_FPS, duration: 1e6 / SPIN_FPS });
      try {
        encoder.encode(videoFrame, { keyFrame: frame === 0 });
      } finally {
        videoFrame.close();
      }
    }
    check();
    await encoder.flush();
    await written;
    if (signal.aborted) return null;
    check();
    await output.finalize();
    if (!target.buffer) throw new Error("The WebM muxer produced no data");
    return new Blob([target.buffer], { type: "video/webm" });
  } finally {
    if (encoder.state !== "closed") encoder.close();
    if (output.state !== "finalized" && output.state !== "canceled") await output.cancel();
  }
}
