// @vitest-environment jsdom
import { BufferSource, EncodedPacketSink, Input, Output, WEBM } from "mediabunny";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encodeSpin, findSpinCodec, type SpinCodec } from "./spin";

type Encoded = { timestamp: number; duration: number | null; keyFrame: boolean };

class FakeChunk {
  readonly byteLength = 4;
  constructor(
    readonly type: "key" | "delta",
    readonly timestamp: number,
    readonly duration: number | null,
  ) {}
  copyTo(target: Uint8Array) {
    target.set([1, 2, 3, 4]);
  }
}

class FakeFrame {
  readonly timestamp: number;
  readonly duration: number | null;
  closed = false;
  constructor(_source: unknown, init: { timestamp: number; duration?: number }) {
    this.timestamp = init.timestamp;
    this.duration = init.duration ?? null;
  }
  close() {
    this.closed = true;
  }
}

let supported: string[];
let encoders: FakeEncoder[];
let failOnFrame: number | null;

class FakeEncoder extends EventTarget {
  static isConfigSupported = async (config: VideoEncoderConfig) => ({ supported: supported.includes(config.codec), config });
  state: "unconfigured" | "configured" | "closed" = "unconfigured";
  config: VideoEncoderConfig | null = null;
  encoded: Encoded[] = [];
  frames: FakeFrame[] = [];
  deepestQueue = 0;
  private queued: FakeChunk[] = [];
  private held: FakeChunk[] = [];
  constructor(private readonly init: VideoEncoderInit) {
    super();
    encoders.push(this);
  }
  get encodeQueueSize() {
    return this.queued.length;
  }
  configure(config: VideoEncoderConfig) {
    this.config = config;
    this.state = "configured";
  }
  encode(frame: FakeFrame, options?: VideoEncoderEncodeOptions) {
    if (failOnFrame === this.encoded.length) {
      this.init.error(new DOMException("encoder crashed", "EncodingError"));
      return;
    }
    const keyFrame = options?.keyFrame ?? false;
    this.frames.push(frame);
    this.encoded.push({ timestamp: frame.timestamp, duration: frame.duration, keyFrame });
    this.queued.push(new FakeChunk(keyFrame ? "key" : "delta", frame.timestamp, frame.duration));
    this.deepestQueue = Math.max(this.deepestQueue, this.queued.length);
    setTimeout(() => this.encodeNext());
  }
  private encodeNext() {
    const chunk = this.queued.shift();
    if (!chunk || this.state === "closed") return;
    this.held.push(chunk);
    this.dispatchEvent(new Event("dequeue"));
  }
  async flush() {
    if (this.state !== "configured") throw new DOMException("not configured", "InvalidStateError");
    while (this.queued.length > 0) this.encodeNext();
    this.held.forEach((chunk, i) =>
      this.init.output(chunk as unknown as EncodedVideoChunk, i === 0 ? { decoderConfig: { codec: this.config?.codec ?? "", codedWidth: 1080, codedHeight: 1080 } } : undefined),
    );
    this.held = [];
  }
  close() {
    this.state = "closed";
  }
}

const VP9: SpinCodec = { codec: "vp9", config: { codec: "vp09.00.10.08", width: 1080, height: 1080, framerate: 30 } };

function stage() {
  const turns: number[] = [];
  return { turns, stage: { canvas: document.createElement("canvas"), renderFrame: (turn: number) => turns.push(turn) } };
}

async function packetsOf(video: Blob) {
  const bytes = await new Promise<ArrayBuffer>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.readAsArrayBuffer(video);
  });
  const input = new Input({ source: new BufferSource(bytes), formats: [WEBM] });
  const track = await input.getPrimaryVideoTrack();
  if (!track) throw new Error("No video track in the WebM");
  const packets = [];
  const sink = new EncodedPacketSink(track);
  for await (const packet of sink.packets()) packets.push(packet);
  return { codec: track.codec, packets, duration: await track.computeDuration() };
}

async function encoded(video: Promise<Blob | null>) {
  const blob = await video;
  if (!blob) throw new Error("No video was produced");
  return blob;
}

beforeEach(() => {
  supported = ["vp09.00.10.08", "vp8"];
  encoders = [];
  failOnFrame = null;
  vi.stubGlobal("VideoEncoder", FakeEncoder);
  vi.stubGlobal("VideoFrame", FakeFrame);
  vi.stubGlobal("EncodedVideoChunk", FakeChunk);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("findSpinCodec", () => {
  it("prefers VP9 at 1080 x 1080", async () => {
    expect(await findSpinCodec()).toMatchObject({ codec: "vp9", config: { width: 1080, height: 1080 } });
  });

  it("falls back to VP8 when VP9 isn't supported", async () => {
    supported = ["vp8"];
    expect(await findSpinCodec()).toMatchObject({ codec: "vp8", config: { codec: "vp8", width: 1080, height: 1080 } });
  });

  it("finds nothing when neither codec is supported", async () => {
    supported = [];
    expect(await findSpinCodec()).toBeNull();
  });

  it("finds nothing when the browser has no VideoEncoder", async () => {
    vi.stubGlobal("VideoEncoder", undefined);
    expect(await findSpinCodec()).toBeNull();
  });
});

describe("encodeSpin", () => {
  it("renders exactly 240 orientations, one per 1/240 of a turn, with no 241st", async () => {
    const { turns, stage: s } = stage();
    await encodeSpin(s, VP9, () => {}, new AbortController().signal);
    expect(turns).toEqual(Array.from({ length: 240 }, (_, i) => i / 240));
  });

  it("timestamps frame i at i/30 s from the frame index, keyframes only frame 0, and closes every frame", async () => {
    await encodeSpin(stage().stage, VP9, () => {}, new AbortController().signal);
    const [encoder] = encoders;
    expect(encoder?.config).toMatchObject({ codec: "vp09.00.10.08", width: 1080, height: 1080 });
    expect(encoder?.encoded).toEqual(Array.from({ length: 240 }, (_, i) => ({ timestamp: (i * 1e6) / 30, duration: 1e6 / 30, keyFrame: i === 0 })));
    expect(encoder?.frames.every((frame) => frame.closed)).toBe(true);
    expect(encoder?.state).toBe("closed");
  });

  it("writes a VP9 WebM of exactly 240 packets and 8.000 s, starting on a keyframe", async () => {
    const { codec, packets, duration } = await packetsOf(await encoded(encodeSpin(stage().stage, VP9, () => {}, new AbortController().signal)));
    expect(codec).toBe("vp9");
    expect(packets).toHaveLength(240);
    expect(packets[0]?.type).toBe("key");
    expect(packets.slice(1).every((packet) => packet.type === "delta")).toBe(true);
    expect(packets.map((packet) => Math.round(packet.timestamp * 30))).toEqual(Array.from({ length: 240 }, (_, i) => i));
    expect(duration).toBeCloseTo(8, 3);
  });

  it("writes VP8 when that is the chosen codec", async () => {
    supported = ["vp8"];
    const codec = await findSpinCodec();
    if (!codec) throw new Error("VP8 should be chosen");
    expect((await packetsOf(await encoded(encodeSpin(stage().stage, codec, () => {}, new AbortController().signal)))).codec).toBe("vp8");
  });

  it("reports whole seconds of video encoded, up to 8", async () => {
    const seconds: number[] = [];
    await encodeSpin(stage().stage, VP9, (s) => seconds.push(s), new AbortController().signal);
    expect(seconds.at(-1)).toBe(8);
    expect([...new Set(seconds)]).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("closes the encoder and cancels the output when encoding fails", async () => {
    failOnFrame = 100;
    const cancel = vi.spyOn(Output.prototype, "cancel");
    await expect(encodeSpin(stage().stage, VP9, () => {}, new AbortController().signal)).rejects.toThrow("encoder crashed");
    expect(encoders[0]?.state).toBe("closed");
    expect(cancel).toHaveBeenCalled();
  });

  it("closes the encoder and cancels the output when a frame fails to render", async () => {
    const cancel = vi.spyOn(Output.prototype, "cancel");
    const failing = { ...stage().stage, renderFrame: (turn: number) => {
      if (turn > 0.5) throw new Error("context lost");
    } };
    await expect(encodeSpin(failing, VP9, () => {}, new AbortController().signal)).rejects.toThrow("context lost");
    expect(encoders[0]?.state).toBe("closed");
    expect(cancel).toHaveBeenCalled();
  });

  it("keeps exactly four frames queued in the encoder at most", async () => {
    await encodeSpin(stage().stage, VP9, () => {}, new AbortController().signal);
    expect(encoders[0]?.deepestQueue).toBe(4);
    expect(encoders[0]?.encoded).toHaveLength(240);
  });

  it("stops rendering and encoding when aborted mid-run, closes the encoder and output, and produces no video", async () => {
    const controller = new AbortController();
    const cancel = vi.spyOn(Output.prototype, "cancel");
    const turns: number[] = [];
    const aborting = {
      canvas: document.createElement("canvas"),
      renderFrame: (turn: number) => {
        turns.push(turn);
        if (turns.length === 100) controller.abort();
      },
    };
    const video = await encodeSpin(aborting, VP9, () => {}, controller.signal);
    expect(video).toBeNull();
    expect(turns).toHaveLength(100);
    expect(encoders[0]?.encoded.length).toBeLessThanOrEqual(100);
    expect(encoders[0]?.state).toBe("closed");
    expect(cancel).toHaveBeenCalled();
  });

  it("stops while waiting on a full encoder queue when aborted", async () => {
    const controller = new AbortController();
    const { turns, stage: s } = stage();
    const video = encodeSpin(s, VP9, () => {}, controller.signal);
    await vi.waitFor(() => expect(encoders[0]?.encodeQueueSize).toBe(4));
    controller.abort();
    expect(await video).toBeNull();
    const rendered = turns.length;
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(turns).toHaveLength(rendered);
    expect(rendered).toBeLessThan(240);
    expect(encoders[0]?.state).toBe("closed");
  });

  it("renders nothing when already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const { turns, stage: s } = stage();
    expect(await encodeSpin(s, VP9, () => {}, controller.signal)).toBeNull();
    expect(turns).toEqual([]);
  });
});
