// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { DEFAULT_ICON_ID, PRESET_ICONS, SELEKT_GROUP, ZEST_GROUP } from "./presetIcons";
import { buildIcon } from "./svgIcon";

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

  it("builds Circle Alert as one ring with a hole plus the mark", () => {
    const icon = PRESET_ICONS.find((preset) => preset.id === "zest/CircleAlertIcon");
    const result = buildIcon(icon?.svg ?? "");
    if (!result.ok) throw new Error(result.error);
    const rings = result.shapes.filter((shape) => shape.holes.length > 0);
    expect(rings).toHaveLength(1);
    expect(rings[0]?.holes.length).toBeGreaterThanOrEqual(1);
  });
});
