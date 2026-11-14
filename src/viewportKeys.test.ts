// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_LOOK, getLook, setLook } from "./look";

vi.hoisted(() => {
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
    return type === "webgl2" ? { getExtension: () => null } : getContext.call(this, type as "2d", ...(rest as []));
  } as HTMLCanvasElement["getContext"];
});
vi.mock("@react-three/fiber", async (original) => ({ ...(await original<typeof import("@react-three/fiber")>()), Canvas: () => null }));

const { App } = await import("./App");

const VALID_SVG = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10'><rect width='10' height='10'/></svg>";

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  setLook(DEFAULT_LOOK);
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  container = document.createElement("div");
  document.body.append(container);
  container.addEventListener("keydown", (event) => event.stopPropagation());
  root = createRoot(container);
  act(() => root.render(createElement(App)));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const preview = () => {
  const element = container.querySelector<HTMLElement>('[aria-label="3D preview, use arrow keys to orbit"]');
  if (!element) throw new Error("Viewport is missing");
  return element;
};
const press = (key: string) => act(() => preview().dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })));
const spinOn = () => container.querySelector<HTMLInputElement>("input[name=spin][value=on]")?.checked;

describe("Viewport keyboard", () => {
  it("is focusable", () => {
    expect(preview().tabIndex).toBe(0);
  });

  it("orbits 15° per arrow key", () => {
    press("ArrowRight");
    press("ArrowRight");
    press("ArrowUp");
    expect(getLook().camera).toMatchObject({ azimuth: 30, elevation: 30 });
    press("ArrowLeft");
    press("ArrowDown");
    press("ArrowDown");
    expect(getLook().camera).toMatchObject({ azimuth: 15, elevation: 0 });
  });

  it("wraps the azimuth and stops the elevation short of the poles", () => {
    for (let i = 0; i < 13; i += 1) press("ArrowRight");
    for (let i = 0; i < 7; i += 1) press("ArrowUp");
    const { azimuth, elevation } = getLook().camera;
    expect(azimuth).toBe(-165);
    expect(elevation).toBeGreaterThan(80);
    expect(elevation).toBeLessThan(90);
  });

  it("zooms with + and −", () => {
    press("+");
    expect(getLook().camera.zoom).toBe(110);
    press("-");
    press("-");
    expect(getLook().camera.zoom).toBe(90);
  });

  it("toggles Spin with Space", () => {
    expect(spinOn()).toBe(true);
    press(" ");
    expect(spinOn()).toBe(false);
    press(" ");
    expect(spinOn()).toBe(true);
  });
});

describe("Loading", () => {
  it("shows Building icon… in the viewport while a pasted SVG builds", () => {
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: { getData: () => VALID_SVG } });
    act(() => document.body.dispatchEvent(event));
    expect(container.querySelector(".viewport")?.textContent).toContain("Building icon…");
    act(() => vi.advanceTimersByTime(50));
    expect(container.querySelector(".viewport")?.textContent).not.toContain("Building icon…");
    expect(container.querySelector<HTMLSelectElement>("#icon-select")?.value).toBe("custom");
  });
});
