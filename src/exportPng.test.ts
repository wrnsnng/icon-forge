// @vitest-environment jsdom
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { exportIcon, exportSet, iconSlug, type RenderPng } from "./exportPng";
import { DEFAULT_LOOK } from "./look";
import { buildIcon, ERROR_NOT_SVG } from "./svgIcon";

const SVG = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10'><rect width='10' height='10'/></svg>";
function geometryOf(svg: string) {
  const result = buildIcon(svg);
  if (!result.ok) throw new Error(result.error);
  return result;
}
const geometry = geometryOf(SVG);
const text = (zip: Record<string, Uint8Array>, name: string) => {
  const file = zip[name];
  if (!file) throw new Error(`${name} missing from zip`);
  return strFromU8(file);
};
const fakeRender: RenderPng = async (_icon, px) => new Uint8Array([px]);

describe("iconSlug", () => {
  it("turns display and file names into kebab-case slugs", () => {
    expect(iconSlug("Sparkles")).toBe("sparkles");
    expect(iconSlug("Circle Check")).toBe("circle-check");
    expect(iconSlug("Alert 02")).toBe("alert-02");
    expect(iconSlug("My Logo.svg")).toBe("my-logo");
  });
});

describe("exportIcon", () => {
  it("writes one PNG per checked size and scale, rendered at size × scale", async () => {
    const zip = unzipSync(await exportIcon("sparkles", geometry, DEFAULT_LOOK.export, fakeRender));
    const names = Object.keys(zip).sort();
    expect(names).toHaveLength(9);
    expect(names).toContain("sparkles-24@4x.png");
    expect(zip["sparkles-24@4x.png"]?.[0]).toBe(96);
    expect(zip["sparkles-16@1x.png"]?.[0]).toBe(16);
  });

  it("writes only the checked sizes and scales", async () => {
    const zip = unzipSync(await exportIcon("check", geometry, { sizes: [20], scales: [2] }, fakeRender));
    expect(Object.keys(zip)).toEqual(["check-20@2x.png"]);
  });
});

describe("exportSet", () => {
  const items = [
    { name: "one", svg: SVG },
    { name: "broken", svg: "<svg" },
    { name: "two", svg: SVG },
  ];

  it("writes a folder per icon, look.json and errors.txt for icons that fail to parse", async () => {
    const progress: number[] = [];
    const result = await exportSet(items, DEFAULT_LOOK, fakeRender, { onProgress: (n) => progress.push(n) });
    if (!result) throw new Error("expected a result");
    const zip = unzipSync(result.zip);
    expect(result).toMatchObject({ ok: 2, failed: 1 });
    expect(progress).toEqual([1, 2, 3]);
    expect(Object.keys(zip).filter((name) => name.startsWith("one/"))).toHaveLength(9);
    expect(Object.keys(zip).some((name) => name.startsWith("broken/"))).toBe(false);
    expect(JSON.parse(text(zip, "look.json"))).toEqual(DEFAULT_LOOK);
    expect(text(zip, "errors.txt")).toBe(`broken: ${ERROR_NOT_SVG}\n`);
  });

  it("leaves out errors.txt when every icon parses", async () => {
    const result = await exportSet([{ name: "one", svg: SVG }], DEFAULT_LOOK, fakeRender, {});
    expect(result && Object.keys(unzipSync(result.zip))).not.toContain("errors.txt");
  });

  it("gives icons whose names slug the same their own folders", async () => {
    const result = await exportSet([{ name: "a b.svg", svg: SVG }, { name: "a-b.svg", svg: SVG }], DEFAULT_LOOK, fakeRender, {});
    if (!result) throw new Error("expected a result");
    const folders = new Set(Object.keys(unzipSync(result.zip)).filter((name) => name.includes("/")).map((name) => name.split("/")[0]));
    expect(result.ok).toBe(2);
    expect(folders.size).toBe(2);
    expect(Object.keys(unzipSync(result.zip)).filter((name) => name.endsWith(".png"))).toHaveLength(18);
  });

  it("stops rendering an icon's sizes as soon as it is cancelled", async () => {
    const controller = new AbortController();
    let renders = 0;
    const render: RenderPng = async (icon, px) => {
      renders += 1;
      if (renders === 2) controller.abort();
      return fakeRender(icon, px);
    };
    expect(await exportSet([{ name: "one", svg: SVG }], DEFAULT_LOOK, render, { signal: controller.signal })).toBeNull();
    expect(renders).toBe(2);
  });

  it("returns nothing once cancelled", async () => {
    const controller = new AbortController();
    const result = await exportSet(items, DEFAULT_LOOK, fakeRender, {
      signal: controller.signal,
      onProgress: (n) => n === 1 && controller.abort(),
    });
    expect(result).toBeNull();
  });
});
