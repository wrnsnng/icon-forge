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

let renderGate: Promise<void> = Promise.resolve();
vi.mock("./renderPng", () => ({
  createPngRenderer: () => ({
    render: async () => {
      await renderGate;
      return new Uint8Array([1]);
    },
    dispose: () => {},
  }),
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

  const presetSelect = () => container.querySelector<HTMLSelectElement>("#preset-select");
  const choosePreset = (label: string) => {
    const select = presetSelect();
    const option = [...(select?.options ?? [])].find((candidate) => candidate.text === label);
    if (!select || !option) throw new Error(`No preset ${label}`);
    act(() => {
      select.value = option.value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
  };
  const presetLabel = () => presetSelect()?.selectedOptions[0]?.text;

  it("offers the design systems in copy order and starts on Zest light", () => {
    expect(container.querySelector("label[for=preset-select]")?.textContent).toBe("Design system");
    expect([...(presetSelect()?.options ?? [])].map((option) => option.text)).toEqual([
      "Zest light",
      "Zest dark",
      "Selekt-2 light",
      "Selekt-2 dark",
      "Custom",
    ]);
    expect(presetLabel()).toBe("Zest light");
    expect(getLook().preset).toBe("zest-light");
  });

  it.each([
    ["Zest dark", "zest-dark", "#f8f6f4", "#151311", "#ff815f"],
    ["Selekt-2 light", "selekt-light", "#181818", "#e7e7e7", "#181818"],
    ["Selekt-2 dark", "selekt-dark", "#f0eee7", "#0d0b07", "#f0eee7"],
    ["Zest light", "zest-light", "#060605", "#ffffff", "#ff4c1f"],
  ])("applies %s colour, background and accent and nothing else", (label, id, colour, background, accent) => {
    choosePreset(label === "Zest light" ? "Selekt-2 dark" : "Zest light");
    act(() => setLook({ ...getLook(), shape: { ...getLook().shape, bevel: 77 }, lights: { rotation: 90, exposure: 2 }, camera: { ...getLook().camera, zoom: 150 } }));
    const before = getLook();
    choosePreset(label);
    const after = getLook();
    expect([after.preset, after.material.color, after.camera.background, after.accent]).toEqual([id, colour, background, accent]);
    expect([after.shape, after.lights, { ...after.camera, background: before.camera.background }, { ...after.material, color: before.material.color }]).toEqual([
      before.shape,
      before.lights,
      before.camera,
      before.material,
    ]);
    expect(presetLabel()).toBe(label);
  });

  it("keeps every look value when Custom is chosen directly", () => {
    choosePreset("Selekt-2 dark");
    const before = getLook();
    choosePreset("Custom");
    expect(presetLabel()).toBe("Custom");
    expect(getLook()).toEqual({ ...before, preset: "custom" });
  });

  it("shows Custom after a manual Colour change and after a manual Background change", () => {
    choosePreset("Selekt-2 dark");
    const swatch = [...container.querySelectorAll<HTMLButtonElement>(".colour-popover .swatch")].find((button) =>
      button.getAttribute("aria-label")?.startsWith("Zest light colour"),
    );
    act(() => swatch?.click());
    expect(presetLabel()).toBe("Custom");
    expect(getLook().preset).toBe("custom");

    choosePreset("Zest dark");
    act(() => container.querySelector<HTMLInputElement>("input[name=background][aria-label=Transparent]")?.click());
    expect(presetLabel()).toBe("Custom");
    expect(getLook().camera.background).toBe("transparent");
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

describe("Export", () => {
  const buttonNamed = (text: string | RegExp) =>
    [...container.querySelectorAll("button")].find((button) => (typeof text === "string" ? button.textContent === text : text.test(button.textContent ?? "")));
  const setButton = () => buttonNamed(/^Export (Zest |Selekt-2 )?set/);
  const flush = () => act(async () => vi.advanceTimersByTimeAsync(0));

  async function addSvgs(count: number) {
    const input = container.querySelector<HTMLInputElement>("input[type=file][multiple]");
    if (!input) throw new Error("Add SVGs input is missing");
    const files = Array.from({ length: count }, (_, i) => ({ name: `icon-${i}.svg`, text: async () => VALID_SVG }));
    Object.defineProperty(input, "files", { value: files, configurable: true });
    act(() => input.dispatchEvent(new Event("change", { bubbles: true })));
    await flush();
  }

  it("names the current preset group's set", () => {
    expect(setButton()?.textContent).toBe("Export Zest set");
    const select = iconSelect();
    if (!select) throw new Error("Icon dropdown is missing");
    act(() => {
      select.value = "selekt/Add01Icon";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(setButton()?.textContent).toBe("Export Selekt-2 set");
  });

  it("disables Export set for a custom icon until SVGs are added", async () => {
    paste(VALID_SVG);
    expect(setButton()?.disabled).toBe(true);
    await addSvgs(3);
    expect(setButton()?.textContent).toBe("Export set (3 SVGs)");
    expect(setButton()?.disabled).toBe(false);
  });

  it("shows progress, and cancelling downloads nothing and re-enables the buttons", async () => {
    const createObjectURL = vi.fn(() => "blob:zip");
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL, revokeObjectURL: () => {} }));
    let release = () => {};
    renderGate = new Promise((resolve) => (release = resolve));
    act(() => setButton()?.click());
    await flush();
    expect(container.querySelector("[aria-live=polite]")?.textContent).toBe("Rendering 1 of 12…");
    expect(setButton()?.disabled).toBe(true);
    expect(buttonNamed("Export PNG")?.disabled).toBe(true);
    act(() => buttonNamed("Cancel")?.click());
    release();
    await flush();
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(setButton()?.disabled).toBe(false);
    expect(buttonNamed("Export PNG")?.disabled).toBe(false);
    expect(buttonNamed("Cancel")).toBeUndefined();
  });

  it("reports the exported count when a set finishes", async () => {
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:zip", revokeObjectURL: () => {} }));
    renderGate = Promise.resolve();
    act(() => setButton()?.click());
    await flush();
    expect(container.querySelector("[aria-live=polite]")?.textContent).toBe("Exported 12 icons.");
  });
});
