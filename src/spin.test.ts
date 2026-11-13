import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { recordSpin } from "./spin";

let log: string[];
let recordedAt: { start: number; stop: number };
let track: { stop: ReturnType<typeof vi.fn>; requestFrame: ReturnType<typeof vi.fn> };

class FakeRecorder {
  static failToConstruct = false;
  state: "inactive" | "recording" = "inactive";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor() {
    if (FakeRecorder.failToConstruct) throw new Error("NotSupportedError");
  }
  static isTypeSupported = (type: string) => type.startsWith("video/webm");
  start() {
    this.state = "recording";
    recordedAt.start = performance.now();
    log.push("start");
  }
  stop() {
    this.state = "inactive";
    recordedAt.stop = performance.now();
    log.push("stop");
    this.ondataavailable?.({ data: new Blob(["webm"]) });
    this.onstop?.();
  }
}

function stage() {
  const canvas = {
    captureStream: () => ({ getTracks: () => [track], getVideoTracks: () => [track] }),
  } as unknown as HTMLCanvasElement;
  return { canvas, renderFrame: (turn: number) => log.push(`render ${turn}`) };
}

beforeEach(() => {
  log = [];
  recordedAt = { start: NaN, stop: NaN };
  track = { stop: vi.fn(() => log.push("track stopped")), requestFrame: vi.fn(() => log.push("capture")) };
  FakeRecorder.failToConstruct = false;
  vi.stubGlobal("MediaRecorder", FakeRecorder);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("recordSpin", () => {
  const recordedTurns = () =>
    log
      .slice(log.indexOf("start") + 1, log.indexOf("stop"))
      .filter((entry) => entry.startsWith("render"))
      .map((entry) => Number(entry.split(" ")[1]));

  async function recordWith(renderMs: (frame: number) => number) {
    let frame = 0;
    const slow = {
      ...stage(),
      renderFrame: (turn: number) => {
        log.push(`render ${turn}`);
        vi.advanceTimersByTime(renderMs(frame++));
      },
    };
    const recording = recordSpin(slow, () => {});
    await vi.runAllTimersAsync();
    await recording;
    return { seconds: (recordedAt.stop - recordedAt.start) / 1000, turns: recordedTurns() };
  }

  it.each([
    ["fast renders", () => 1],
    ["slow renders of 100 ms", () => 100],
    ["uneven renders between 1 ms and 250 ms", (frame: number) => (frame % 7 === 0 ? 250 : 1)],
  ])("records one full turn in 8 s ± 0.2 s with %s", async (_, renderMs) => {
    const { seconds, turns } = await recordWith(renderMs);
    expect(seconds).toBeGreaterThanOrEqual(7.8);
    expect(seconds).toBeLessThanOrEqual(8.2);
    expect(turns[0]).toBe(0);
    expect(turns.at(-1)).toBe(1);
    turns.slice(1).forEach((turn, i) => expect(turn).toBeGreaterThan(turns[i] ?? 1));
  });

  it("ends on the full turn even when a slow render overshoots 8 s", async () => {
    const { turns } = await recordWith((frame) => (frame === 3 ? 7990 : 1));
    expect(turns.at(-1)).toBe(1);
    expect(turns.filter((turn) => turn > 1)).toEqual([]);
  });

  it("stops the capture stream when the recorder can't be constructed", async () => {
    FakeRecorder.failToConstruct = true;
    await expect(recordSpin(stage(), () => {})).rejects.toThrow("NotSupportedError");
    expect(track.stop).toHaveBeenCalled();
  });

  it("stops the capture stream when rendering a frame fails", async () => {
    const failing = { ...stage(), renderFrame: () => {
      throw new Error("context lost");
    } };
    await expect(recordSpin(failing, () => {})).rejects.toThrow("context lost");
    expect(track.stop).toHaveBeenCalled();
  });
});
