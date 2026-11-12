// @vitest-environment jsdom
import { Vector2, type Shape } from "three";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";
import { describe, expect, it } from "vitest";
import { DEFAULT_ICON_ID, PRESET_ICONS, SELEKT_GROUP, ZEST_GROUP } from "./presetIcons";
import { buildIcon } from "./svgIcon";

const FRAME_MIN = -100;
const FRAME_MAX = 124;
const MARKER = 0.01;

function inside(point: Vector2, polygon: Vector2[]): boolean {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if (!a || !b) continue;
    if (a.y > point.y !== b.y > point.y && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

const covered = (point: Vector2, shapes: Shape[]) =>
  shapes.some((shape) => inside(point, shape.getPoints()) && !shape.holes.some((hole) => inside(point, hole.getPoints())));

function framed(svg: string): string {
  const marker = (at: number) => `<rect x="${at}" y="${at}" width="${MARKER}" height="${MARKER}" fill="black" stroke="none"/>`;
  return svg.replace("</svg>", `${marker(FRAME_MIN)}${marker(FRAME_MAX)}</svg>`);
}

function uncoveredStrokePoints(svg: string): Vector2[] {
  const result = buildIcon(framed(svg));
  if (!result.ok) throw new Error(result.error);
  const center = (FRAME_MIN + FRAME_MAX + MARKER) / 2;
  const scale = 1 / (FRAME_MAX + MARKER - FRAME_MIN);
  const toFitted = (p: Vector2) => new Vector2((p.x - center) * scale, -(p.y - center) * scale);
  return new SVGLoader()
    .parse(svg)
    .paths.flatMap((path) => path.subPaths.flatMap((sub) => sub.getPoints(24)))
    .map(toFitted)
    .filter((point) => !covered(point, result.shapes));
}

describe("preset icons", () => {
  it("has twelve icons per design system and defaults to Zest Sparkles", () => {
    expect(PRESET_ICONS.filter((icon) => icon.group === ZEST_GROUP)).toHaveLength(12);
    expect(PRESET_ICONS.filter((icon) => icon.group === SELEKT_GROUP)).toHaveLength(12);
    expect(PRESET_ICONS.find((icon) => icon.id === DEFAULT_ICON_ID)?.name).toBe("Sparkles");
  });

  it("shows names without the Icon suffix", () => {
    expect(PRESET_ICONS.map((icon) => icon.name)).toContain("Circle Alert");
  });

  it.each(PRESET_ICONS.map((icon) => [icon.id, icon.svg]))("%s builds without a warning", (_, svg) => {
    expect(buildIcon(svg)).toEqual({ ok: true, shapes: expect.any(Array) });
  });

  it.each(PRESET_ICONS.map((icon) => [icon.id, icon.svg]))("%s covers every stroke of its source", (_, svg) => {
    expect(uncoveredStrokePoints(svg)).toEqual([]);
  });

  it("catches a stroke missing from the solid", () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2"><path d="M4 4h16"/><path d="M4 20h16" stroke="none"/></svg>';
    expect(uncoveredStrokePoints(svg).length).toBeGreaterThan(0);
  });

  it("builds Circle Alert as a ring with one hole plus a separate bar and dot", () => {
    const icon = PRESET_ICONS.find((preset) => preset.id === "zest/CircleAlertIcon");
    const result = buildIcon(icon?.svg ?? "");
    if (!result.ok) throw new Error(result.error);
    expect(result.shapes.map((shape) => shape.holes.length).sort()).toEqual([0, 0, 1]);
  });
});
