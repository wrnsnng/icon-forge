// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderSpin } from "./renderSpin";
import type { SpinCodec } from "./spin";
import { buildIcon } from "./svgIcon";
import { DEFAULT_LOOK } from "./look";

const root = { configure: vi.fn(async () => {}), render: vi.fn(), unmount: vi.fn() };
let environment: Promise<{ dispose: () => void }>;
const encodeSpin = vi.fn();

vi.mock("@react-three/fiber", () => ({ createRoot: () => root }));
vi.mock("./Viewport", () => ({
  CAMERA_FOV: 30,
  TURNTABLE: "turntable",
  LookScene: () => null,
  cameraPosition: () => [0, 0, 3],
  loadStudioEnvironment: () => environment,
}));
vi.mock("./spin", async (original) => ({ ...(await original<object>()), encodeSpin: (...args: unknown[]) => encodeSpin(...args) }));

const VP9: SpinCodec = { codec: "vp9", config: { codec: "vp09.00.10.08", width: 1080, height: 1080 } };
const icon = (() => {
  const built = buildIcon("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10'><rect width='10' height='10'/></svg>");
  if (!built.ok) throw new Error("test icon failed to build");
  return built;
})();
const start = (signal: AbortSignal) => renderSpin(icon, DEFAULT_LOOK, "#ffffff", VP9, () => {}, signal);

beforeEach(() => {
  root.configure.mockClear();
  root.render.mockClear();
  root.unmount.mockClear();
  encodeSpin.mockReset();
});

afterEach(() => vi.restoreAllMocks());

describe("renderSpin teardown", () => {
  it("settles and unmounts the offscreen root when aborted while the HDRI loads", async () => {
    environment = new Promise(() => {});
    const controller = new AbortController();
    const video = start(controller.signal);
    await vi.waitFor(() => expect(root.configure).toHaveBeenCalled());
    controller.abort();
    await expect(video).rejects.toThrow(/abort/i);
    expect(root.unmount).toHaveBeenCalled();
    expect(encodeSpin).not.toHaveBeenCalled();
  });

  it("settles, unmounts the root and disposes the HDRI when aborted before the scene is ready", async () => {
    const texture = { dispose: vi.fn() };
    environment = Promise.resolve(texture);
    const controller = new AbortController();
    const video = start(controller.signal);
    await vi.waitFor(() => expect(root.render).toHaveBeenCalled());
    controller.abort();
    await expect(video).rejects.toThrow(/abort/i);
    expect(root.unmount).toHaveBeenCalled();
    await vi.waitFor(() => expect(texture.dispose).toHaveBeenCalled());
    expect(encodeSpin).not.toHaveBeenCalled();
  });
});
