// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { DEFAULT_LOOK } from "./look";
import { buildIcon } from "./svgIcon";
import { extrusionOptions } from "./Viewport";

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
