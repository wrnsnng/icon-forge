// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { DEFAULT_LOOK } from "./look";
import { buildIcon } from "./svgIcon";
import { bulgedGeometry, cushion, extrusionOptions, flatGeometry } from "./Viewport";

const svg = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${body}</svg>`;

function optionsFor(markup: string, bevel = DEFAULT_LOOK.shape.bevel) {
  const result = buildIcon(markup);
  if (!result.ok) throw new Error(result.error);
  return extrusionOptions({ ...DEFAULT_LOOK.shape, bevel }, result.thinnest);
}

describe("extrusionOptions", () => {
  it("clamps the bevel to 40% of a thin imported stroke", () => {
    const thinStroke = 0.2 / 20;
    const options = optionsFor(svg('<line x1="2" y1="12" x2="22" y2="12" stroke="black" stroke-width="0.2"/>'));
    expect(options.bevelSize).toBeGreaterThan(0);
    expect(options.bevelSize).toBeLessThanOrEqual(0.4 * thinStroke);
    expect(options.bevelThickness).toBe(options.bevelSize);
  });

  it("clamps against the thinnest of several strokes", () => {
    const options = optionsFor(
      svg('<rect x="2" y="2" width="20" height="20" fill="none" stroke="black" stroke-width="2"/><line x1="6" y1="12" x2="18" y2="12" stroke="black" stroke-width="0.2"/>'),
    );
    expect(options.bevelSize).toBeLessThanOrEqual(0.4 * (0.2 / 22));
  });

  it("leaves the default bevel alone on a normal stroke icon", () => {
    const options = optionsFor(svg('<circle cx="12" cy="12" r="10" fill="none" stroke="black" stroke-width="2"/>'));
    expect(options.bevelSize).toBeCloseTo(0.3 * 0.04, 6);
  });

  it("maps the full bevel slider to 0.04 units before the clamp", () => {
    const options = optionsFor(svg('<rect x="0" y="0" width="24" height="24"/>'), 100);
    expect(options.bevelSize).toBeCloseTo(0.04, 6);
    expect(options.bevelSegments).toBe(6);
  });

  it("maps Z width to depth with 100% at 0.2 units", () => {
    const options = optionsFor(svg('<rect x="0" y="0" width="24" height="24"/>'));
    expect(options.depth).toBeCloseTo(0.2, 6);
  });
});

describe("bulge geometry", () => {
  const square = () => {
    const result = buildIcon(svg('<rect x="0" y="0" width="24" height="24"/>'));
    if (!result.ok) throw new Error(result.error);
    return result;
  };
  const shape = { depth: 100, bevel: 0 };
  const thickness = (bulge: number) => {
    const geometry = bulge === 0 ? flatGeometry(square(), shape) : bulgedGeometry(cushion(square(), shape), bulge);
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    if (!box) throw new Error("No bounding box");
    const position = geometry.getAttribute("position");
    let edge = 0;
    for (let i = 0; i < position.count; i += 1) {
      if (Math.abs(Math.abs(position.getX(i)) - 0.5) < 1e-6) edge = Math.max(edge, Math.abs(position.getZ(i)));
    }
    return { total: box.max.z - box.min.z, edge: 2 * edge };
  };

  it("leaves a flat solid at bulge 0", () => {
    expect(thickness(0).total).toBeCloseTo(0.2, 6);
  });

  it("swells each cap by 0.1 units at bulge 100 and keeps the outline in place", () => {
    const { total, edge } = thickness(100);
    expect(total).toBeCloseTo(0.2 + 2 * 0.1, 2);
    expect(edge).toBeCloseTo(0.2, 6);
  });

  it("scales the swell with the slider", () => {
    expect(thickness(50).total).toBeCloseTo(0.2 + 2 * 0.05, 2);
  });
});
