// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { DEFAULT_LOOK, getLook, setLook } from "./look";
import { ERROR_NOT_SVG } from "./svgIcon";
import type { Toast } from "./Viewport";

vi.mock("./Viewport", () => ({
  Viewport: ({ toast }: { toast: Toast | null }) =>
    toast ? createElement("div", { key: toast.id, role: "alert" }, toast.message) : null,
}));

let reducedMotion = false;

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

function mount() {
  container = document.createElement("div");
  document.body.append(container);
  // paper.js listens for keydown on document and throws in jsdom, where its view has no canvas.
  container.addEventListener("keydown", (event) => event.stopPropagation());
  root = createRoot(container);
  act(() => root.render(createElement(App)));
}

beforeEach(() => {
  reducedMotion = false;
  setLook(DEFAULT_LOOK);
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.open = false;
  };
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce") && reducedMotion }));
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  mount();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
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

const sliderByLabel = (label: string) => {
  const input = [...container.querySelectorAll<HTMLInputElement>("input[type=range]")].find(
    (element) => element.labels?.[0]?.firstChild?.textContent?.trim() === label,
  );
  return input ?? null;
};
const valueText = (label: string) => sliderByLabel(label)?.getAttribute("aria-valuetext") ?? null;
const radio = (name: string, label: string) =>
  [...container.querySelectorAll<HTMLInputElement>(`input[name=${name}]`)].find((input) => input.parentElement?.textContent === label) ?? null;
const press = (label: string, key: string, shiftKey = false) => {
  const input = sliderByLabel(label);
  if (!input) throw new Error(`No ${label} slider`);
  act(() => input.dispatchEvent(new KeyboardEvent("keydown", { key, shiftKey, bubbles: true })));
};

describe("Look controls", () => {
  it("shows every spec default on a fresh load", () => {
    expect(
      ["X width", "Y width", "Z width", "Bevel", "Bulge", "Roughness", "Colour density", "Refraction", "Dispersion", "Rotation", "Exposure", "Zoom", "Glow", "Depth of field", "Focus"].map(
        (label) => [label, valueText(label)],
      ),
    ).toEqual([
      ["X width", "100%"],
      ["Y width", "100%"],
      ["Z width", "100%"],
      ["Bevel", "30"],
      ["Bulge", "0"],
      ["Roughness", "0.05"],
      ["Colour density", "0.50"],
      ["Refraction", "1.50"],
      ["Dispersion", "0.20"],
      ["Rotation", "0°"],
      ["Exposure", "1.00"],
      ["Zoom", "100%"],
      ["Glow", "0.15"],
      ["Depth of field", "0.00"],
      ["Focus", "0.50"],
    ]);
    expect(radio("material", "Glass")?.checked).toBe(true);
    expect(radio("spin", "On")?.checked).toBe(true);
    expect(container.querySelector(".colour-trigger")?.getAttribute("aria-label")).toBe("Colour, --color-ink-900 #060605");
  });

  it("offers the six preset colours and four preset backgrounds plus Transparent", () => {
    const named = /^.+ — --[a-z0-9-]+ #[0-9a-f]{6}$/;
    const colours = [...container.querySelectorAll(".colour-popover .swatch")].map((swatch) => swatch.getAttribute("aria-label"));
    expect(colours).toHaveLength(6);
    expect(colours.every((name) => named.test(name ?? ""))).toBe(true);
    expect(colours).toContain("Zest light colour — --color-ink-900 #060605");
    expect(new Set(colours.map((name) => name?.slice(-7)))).toEqual(new Set(["#060605", "#ff4c1f", "#f8f6f4", "#ff815f", "#f0eee7", "#181818"]));
    const backgrounds = [...container.querySelectorAll<HTMLInputElement>("input[name=background]")].map((input) => input.getAttribute("aria-label"));
    expect(backgrounds.slice(0, 4).every((name) => named.test(name ?? ""))).toBe(true);
    expect(backgrounds.slice(0, 4).map((name) => name?.slice(-7))).toEqual(["#ffffff", "#151311", "#0d0b07", "#e7e7e7"]);
    expect(backgrounds.slice(4)).toEqual(["Transparent"]);
  });

  it("applies an accent swatch to Accent and a colour swatch to the material colour", () => {
    const pick = (name: string) => {
      const swatch = [...container.querySelectorAll<HTMLButtonElement>(".colour-popover .swatch")].find((button) =>
        button.getAttribute("aria-label")?.startsWith(name),
      );
      act(() => swatch?.click());
    };
    pick("Zest dark accent");
    expect(getLook().accent).toBe("#ff815f");
    expect(getLook().material.color).toBe("#060605");
    pick("Zest dark colour");
    expect(getLook().material.color).toBe("#f8f6f4");
    expect(getLook().accent).toBe("#ff815f");
    expect(container.querySelector(".colour-trigger")?.getAttribute("aria-label")).toBe("Colour, --color-ink-100 #f8f6f4");
  });

  it("closes the colour popover on a backdrop click but not on a click inside it", () => {
    const dialog = container.querySelector<HTMLDialogElement>(".colour-popover");
    if (!dialog) throw new Error("No colour popover");
    dialog.getBoundingClientRect = () => DOMRect.fromRect({ x: 100, y: 100, width: 200, height: 60 });
    const clickDialogAt = (clientX: number, clientY: number) =>
      act(() => dialog.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX, clientY })));
    act(() => container.querySelector<HTMLButtonElement>(".colour-trigger")?.click());
    clickDialogAt(150, 110);
    expect(dialog.open).toBe(true);
    clickDialogAt(20, 20);
    expect(dialog.open).toBe(false);
  });

  it("starts with Spin off under reduced motion", () => {
    act(() => root.unmount());
    container.remove();
    reducedMotion = true;
    mount();
    expect(radio("spin", "Off")?.checked).toBe(true);
  });

  it("hides the glass-only controls for Clay and brings them back for Glass", () => {
    const glassOnly = ["Colour density", "Refraction", "Dispersion"];
    act(() => radio("material", "Clay")?.click());
    expect(glassOnly.map(sliderByLabel)).toEqual([null, null, null]);
    expect(valueText("Roughness")).toBe("0.70");
    act(() => radio("material", "Glass")?.click());
    expect(glassOnly.map((label) => sliderByLabel(label) !== null)).toEqual([true, true, true]);
    expect(valueText("Roughness")).toBe("0.05");
  });

  it("steps a slider by 1% of its range, and 10% with Shift", () => {
    press("X width", "ArrowRight");
    expect(valueText("X width")).toBe("101%");
    press("Z width", "ArrowRight");
    expect(valueText("Z width")).toBe("103%");
    press("Z width", "ArrowLeft", true);
    expect(valueText("Z width")).toBe("74%");
    press("Refraction", "ArrowUp", true);
    expect(valueText("Refraction")).toBe("1.63");
  });

  it("stops stepping at the ends of the range", () => {
    press("Exposure", "ArrowLeft", true);
    press("Exposure", "ArrowLeft", true);
    expect(valueText("Exposure")).toBe("0.44");
    for (let i = 0; i < 10; i += 1) press("Exposure", "ArrowLeft");
    expect(valueText("Exposure")).toBe("0.20");
  });
});
