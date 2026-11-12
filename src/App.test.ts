// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { ERROR_NOT_SVG } from "./svgIcon";
import type { Toast } from "./Viewport";

vi.mock("./Viewport", () => ({
  Viewport: ({ toast }: { toast: Toast | null }) =>
    toast ? createElement("div", { key: toast.id, role: "alert" }, toast.message) : null,
}));

const INVALID_SVG = "<svg xmlns='http://www.w3.org/2000/svg'><path d='M0 0'";
const VALID_SVG = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10'><rect width='10' height='10'/></svg>";

let root: Root;
let container: HTMLDivElement;

function paste(text: string) {
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", { value: { getData: () => text } });
  act(() => document.body.dispatchEvent(event));
}

const alertText = () => container.querySelector("[role=alert]")?.textContent ?? null;
const iconSelect = () => container.querySelector<HTMLSelectElement>("#icon-select");

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root.render(createElement(App)));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe("App input errors", () => {
  it("keeps the previous icon when an import fails", () => {
    const select = iconSelect();
    if (!select) throw new Error("Icon dropdown is missing");
    act(() => {
      select.value = "zest/StarIcon";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    paste(INVALID_SVG);
    expect(alertText()).toBe(ERROR_NOT_SVG);
    expect(iconSelect()?.value).toBe("zest/StarIcon");
  });

  it("keeps a loaded custom SVG when a later import fails", () => {
    paste(VALID_SVG);
    expect(iconSelect()?.value).toBe("custom");
    paste(INVALID_SVG);
    expect(iconSelect()?.value).toBe("custom");
  });

  it("dismisses an error six seconds after it shows", () => {
    paste(INVALID_SVG);
    act(() => vi.advanceTimersByTime(5900));
    expect(alertText()).toBe(ERROR_NOT_SVG);
    act(() => vi.advanceTimersByTime(200));
    expect(alertText()).toBeNull();
  });

  it("gives a repeated identical error its own six seconds", () => {
    paste(INVALID_SVG);
    act(() => vi.advanceTimersByTime(4000));
    paste(INVALID_SVG);
    act(() => vi.advanceTimersByTime(5900));
    expect(alertText()).toBe(ERROR_NOT_SVG);
    act(() => vi.advanceTimersByTime(200));
    expect(alertText()).toBeNull();
  });

  it("dismisses an error on Escape", () => {
    paste(INVALID_SVG);
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(alertText()).toBeNull();
  });
});
