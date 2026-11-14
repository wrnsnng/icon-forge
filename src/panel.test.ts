// @vitest-environment jsdom
import axe from "axe-core";
import { readFileSync } from "node:fs";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { DEFAULT_LOOK, setLook } from "./look";
import { PRESET_ICONS } from "./presetIcons";

const CSS = readFileSync("src/app.css", "utf8");

const COPY_TABLE = [
  "Preset · Icon · Shape · Material · Lights · Camera · Export",
  "Design system",
  "Zest light · Zest dark · Selekt-2 light · Selekt-2 dark · Custom",
  "Icon",
  "Zest (Lucide) · Selekt-2 (Hugeicons) · Your SVG",
  "Replace SVG",
  "Or drop an SVG anywhere, or paste one.",
  "X width · Y width · Z width",
  "Extrusion depth",
  "Bevel · Bulge",
  "Material · Glass · Clay",
  "Colour · Roughness · Colour density · Refraction · Dispersion",
  "Rotation · Exposure",
  "Background colour · Zoom · Glow · Depth of field · Focus · Spin",
  "Near · Far",
  "Spin · On · Off",
  "Transparent",
  "Sizes (px)",
  "Scales",
  "Export PNG · Export set · Add SVGs… · Export spin · Export GLB · Save look · Load look",
  "8-second loop, WebM. Uses the background colour.",
  "This browser can't record video. Try Chrome or Firefox.",
  "Mesh and material only. Lighting isn't included.",
  "Mesh and material only. Lighting and dispersion aren't included.",
  "Export Zest set · Export Selekt-2 set",
  "Icon Forge needs WebGL 2, which isn't available in this browser.",
].flatMap((cell) => cell.split(" · "));
const ICON_NAMES = new Set(PRESET_ICONS.map((icon) => icon.name));
const SLIDER_VALUE = /^\d+(\.\d+)?(%|°)?$/;
const CHECKBOX_VALUE = /^(16|20|24|[124]x)$/;
const TOKEN = /^--[a-z0-9-]+$/;

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  setLook(DEFAULT_LOOK);
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.append(style);
  container = document.createElement("div");
  document.body.append(container);
  container.addEventListener("keydown", (event) => event.stopPropagation());
  root = createRoot(container);
  act(() => root.render(createElement(App)));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.head.querySelector("style")?.remove();
  vi.unstubAllGlobals();
});

const visibleStrings = () =>
  [...container.querySelectorAll("*")]
    .filter((element) => !element.closest(".visually-hidden, [hidden], dialog:not([open])"))
    .flatMap((element) => [...element.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent?.trim() ?? ""))
    .filter(Boolean);

const offCopy = () =>
  visibleStrings().filter(
    (text) => !COPY_TABLE.includes(text) && !ICON_NAMES.has(text) && !SLIDER_VALUE.test(text) && !CHECKBOX_VALUE.test(text) && !TOKEN.test(text),
  );

const button = (text: RegExp) => [...container.querySelectorAll("button")].find((element) => text.test(element.textContent ?? ""));

describe("Copy", () => {
  it("shows only strings from the copy table", () => {
    expect(offCopy()).toEqual([]);
  });

  it("adds no string outside the copy table when every size is unchecked", () => {
    const sizes = [...container.querySelectorAll("fieldset")].find((fieldset) => fieldset.querySelector("legend")?.textContent === "Sizes (px)");
    for (const box of sizes?.querySelectorAll<HTMLInputElement>("input[type=checkbox]") ?? []) act(() => box.click());
    expect(button(/^Export PNG$/)?.disabled).toBe(true);
    expect(offCopy()).toEqual([]);
  });
});

describe("Without WebGL 2", () => {
  it("replaces the viewport with the WebGL error and draws no canvas", () => {
    expect(container.querySelector(".viewport")?.textContent).toBe("Icon Forge needs WebGL 2, which isn't available in this browser.");
    expect(container.querySelector("canvas")).toBeNull();
  });

  it("disables every export button", () => {
    const exports = [/^Export PNG$/, /^Export (Zest |Selekt-2 )?set/, /^Export spin$/, /^Export GLB$/].map((text) => [String(text), button(text)?.disabled]);
    expect(exports).toEqual(exports.map(([text]) => [text, true]));
  });
});

describe("Keyboard", () => {
  const SECTIONS = ["Preset", "Icon", "Shape", "Material", "Lights", "Camera", "Export"];
  const tabbable = () =>
    [...container.querySelectorAll<HTMLElement>(".panel :is(button, select, input, [tabindex])")].filter(
      (element) => !element.hasAttribute("hidden") && !(element as HTMLButtonElement).disabled && element.tabIndex >= 0,
    );

  it("reaches every section's controls with Tab, top to bottom", () => {
    expect([...container.querySelectorAll("[tabindex]")].filter((element) => Number(element.getAttribute("tabindex")) > 0)).toEqual([]);
    const sections = tabbable().map((element) => element.closest("section")?.querySelector("h2")?.textContent);
    expect([...new Set(sections)]).toEqual(SECTIONS);
  });

  it("draws a 2 px focus ring offset by 2 px, and never removes it", () => {
    expect(CSS).toMatch(/:focus-visible\s*\{\s*outline: 2px solid var\(--ring\);\s*outline-offset: 2px;/);
    expect(CSS).toMatch(/\.swatch:has\(:focus-visible\)\s*\{\s*outline: 2px solid var\(--ring\)/);
    expect(CSS).not.toMatch(/outline:\s*(none|0)\b/);
  });
});

describe("Sliders", () => {
  it("gives every range input a 32px tall hit area", () => {
    const ranges = [...container.querySelectorAll<HTMLInputElement>(".panel input[type=range]")];
    expect(ranges.length).toBeGreaterThan(0);
    expect(new Set(ranges.map((range) => getComputedStyle(range).height))).toEqual(new Set(["32px"]));
  });
});

describe("Contrast", () => {
  const token = (name: string) => CSS.match(new RegExp(`${name}: (#[0-9a-f]{6})`))?.[1] ?? "";
  const luminance = (hex: string) => {
    const [r = 0, g = 0, b = 0] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a: string, b: string) => {
    const [high, low] = [luminance(token(a)), luminance(token(b))].sort((x, y) => y - x);
    return ((high ?? 0) + 0.05) / ((low ?? 0) + 0.05);
  };

  it("meets AA for text and 3:1 for control edges and the focus ring on the panel", () => {
    expect(ratio("--color-ink-900", "--color-ink-0")).toBeGreaterThan(19);
    expect(ratio("--color-ink-600", "--color-ink-0")).toBeGreaterThan(8.5);
    expect(ratio("--color-tangerine-500", "--color-ink-0")).toBeGreaterThan(3);
  });

  it("keeps the 1.2:1 divider colour off every control edge", () => {
    const rules = [...CSS.matchAll(/([^{}]+)\{([^}]*)\}/g)].filter(([, , body]) => /border[^:]*:[^;]*--color-ink-200/.test(body ?? ""));
    expect(rules.map(([, selector]) => selector?.trim())).toEqual([".panel", ".panel-section", ".panel"]);
  });
});

describe("axe", () => {
  it("finds no violations in the panel", async () => {
    const panel = container.querySelector(".panel");
    if (!panel) throw new Error("Panel is missing");
    const results = await axe.run(panel, { resultTypes: ["violations"] });
    expect(results.violations.map(({ id, nodes }) => `${id}: ${nodes.map((node) => node.target.join(" ")).join(", ")}`)).toEqual([]);
  });
});
