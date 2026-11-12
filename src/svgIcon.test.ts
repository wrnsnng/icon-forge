// @vitest-environment jsdom
import { Box2, ShapeUtils, type Shape } from "three";
import { describe, expect, it } from "vitest";
import { ERROR_NO_SHAPES, ERROR_NOT_SVG, ERROR_TOO_LARGE, WARNING_SKIPPED, buildIcon } from "./svgIcon";

const svg = (body: string, attrs = 'viewBox="0 0 24 24"') =>
  `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${body}</svg>`;

function build(text: string): Shape[] {
  const result = buildIcon(text);
  if (!result.ok) throw new Error(result.error);
  return result.shapes;
}

const bounds = (shapes: Shape[]) => new Box2().setFromPoints(shapes.flatMap((s) => s.getPoints()));
const area = (shapes: Shape[]) =>
  shapes.reduce(
    (sum, s) =>
      sum + Math.abs(ShapeUtils.area(s.getPoints())) - s.holes.reduce((h, hole) => h + Math.abs(ShapeUtils.area(hole.getPoints())), 0),
    0,
  );

describe("buildIcon rejects invalid input", () => {
  it.each([
    ["text that is not XML", "hello, this is a txt file", ERROR_NOT_SVG],
    ["XML without an svg root", "<html><body/></html>", ERROR_NOT_SVG],
    ["an svg with only text", svg("<text x='2' y='12'>Hi</text>"), ERROR_NO_SHAPES],
    ["an svg with no drawable paths", svg(""), ERROR_NO_SHAPES],
    ["an svg whose only shape has zero area", svg('<path d="M2 2 L10 2" fill="black"/>'), ERROR_NO_SHAPES],
  ])("%s", (_, text, error) => {
    expect(buildIcon(text)).toEqual({ ok: false, error });
  });

  it("rejects a file over 1 MB before parsing it", () => {
    const big = svg(`<rect width="10" height="10"/><!--${"x".repeat(2 * 1024 * 1024)}-->`);
    expect(buildIcon(big)).toEqual({ ok: false, error: ERROR_TOO_LARGE });
  });
});

describe("buildIcon builds shapes", () => {
  it("fits the larger side to one unit, centred on the origin", () => {
    const box = bounds(build(svg('<rect x="4" y="8" width="40" height="20"/>', 'viewBox="0 0 100 100"')));
    expect(box.max.x - box.min.x).toBeCloseTo(1, 5);
    expect(box.max.y - box.min.y).toBeCloseTo(0.5, 5);
    expect(box.min.x + box.max.x).toBeCloseTo(0, 5);
    expect(box.min.y + box.max.y).toBeCloseTo(0, 5);
  });

  it("falls back to width and height when there is no viewBox", () => {
    expect(build(svg('<rect width="10" height="10"/>', 'width="24" height="24"'))).toHaveLength(1);
  });

  it("unites two overlapping rects into one outline with no inner contour", () => {
    const shapes = build(svg('<rect x="0" y="0" width="4" height="4"/><rect x="2" y="2" width="4" height="4"/>'));
    expect(shapes).toHaveLength(1);
    expect(shapes[0]?.holes).toHaveLength(0);
    expect(area(shapes)).toBeCloseTo(28 / 36, 5);
  });

  it("makes the inner contour of an evenodd ring a hole", () => {
    const ring = 'M0 0H10V10H0Z M3 3H7V7H3Z';
    const shapes = build(svg(`<path fill-rule="evenodd" d="${ring}"/>`));
    expect(shapes).toHaveLength(1);
    expect(shapes[0]?.holes).toHaveLength(1);
    expect(area(shapes)).toBeCloseTo(0.84, 5);
  });

  it("fills a same-direction inner contour under nonzero", () => {
    const shapes = build(svg('<path d="M0 0H10V10H0Z M3 3H7V7H3Z"/>'));
    expect(shapes.every((s) => s.holes.length === 0)).toBe(true);
    expect(area(shapes)).toBeCloseTo(1, 5);
  });

  it("outlines a stroked circle into a ring with a hole", () => {
    const shapes = build(svg('<circle cx="12" cy="12" r="10" fill="none" stroke="black" stroke-width="2"/>'));
    expect(shapes).toHaveLength(1);
    expect(shapes[0]?.holes).toHaveLength(1);
  });

  it("outlines open strokes using stroke-width and round caps", () => {
    const box = bounds(build(svg('<line x1="2" y1="12" x2="22" y2="12" stroke="black" stroke-width="4" stroke-linecap="round"/>')));
    expect((box.max.y - box.min.y) / (box.max.x - box.min.x)).toBeCloseTo(4 / 24, 2);
  });

  const aspect = (shapes: Shape[]) => {
    const box = bounds(shapes);
    return (box.max.x - box.min.x) / (box.max.y - box.min.y);
  };
  const capped = (cap: string) =>
    aspect(build(svg(`<line x1="2" y1="12" x2="22" y2="12" stroke="black" stroke-width="4" stroke-linecap="${cap}"/>`)));

  it("extends square caps by half the stroke width at each end", () => {
    expect(capped("butt")).toBeCloseTo(20 / 4, 3);
    expect(capped("square")).toBeCloseTo(24 / 4, 3);
    expect(capped("square") - capped("butt")).toBeCloseTo(1, 3);
  });

  it("extends round caps by half the stroke width at each end", () => {
    expect(capped("round")).toBeCloseTo(24 / 4, 2);
  });

  it("keeps a square-capped closed stroke the same as butt", () => {
    const ring = (cap: string) =>
      aspect(build(svg(`<rect x="2" y="2" width="20" height="10" fill="none" stroke="black" stroke-width="2" stroke-linecap="${cap}"/>`)));
    expect(ring("square")).toBeCloseTo(ring("butt"), 5);
  });

  it("reaches furthest at a sharp corner with miter, then round, then bevel", () => {
    const tip = (join: string) =>
      1 / aspect(build(svg(`<polyline points="2,20 12,4 22,20" fill="none" stroke="black" stroke-width="2" stroke-linejoin="${join}"/>`)));
    expect(tip("miter")).toBeGreaterThan(tip("round"));
    expect(tip("round")).toBeGreaterThan(tip("bevel"));
  });

  it("drops text and external references with a warning and keeps the rest", () => {
    const result = buildIcon(svg('<rect width="10" height="10"/><text>Hi</text><use href="other.svg#a"/>'));
    expect(result).toMatchObject({ ok: true, warning: WARNING_SKIPPED });
  });
});
