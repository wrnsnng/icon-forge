import { describe, expect, it, vi } from "vitest";
import { DEFAULT_LOOK, getLook, parseLook, setLook, subscribeLook } from "./look";

const SPEC_EXAMPLE = {
  iconForgeLook: 1,
  preset: "zest-light",
  shape: { scaleX: 100, scaleY: 100, depth: 100, bevel: 30, bulge: 0 },
  material: { type: "glass", color: "#060605", roughness: 0.05, density: 0.5, ior: 1.5, dispersion: 0.2 },
  accent: "#ff4c1f",
  lights: { rotation: 0, exposure: 1.0 },
  camera: { background: "#ffffff", zoom: 100, glow: 0.15, dof: 0, focus: 0.5, azimuth: 0, elevation: 15 },
  export: { sizes: [16, 20, 24], scales: [1, 2, 4] },
};

const withPatch = (patch: (look: typeof SPEC_EXAMPLE) => void) => {
  const look = structuredClone(SPEC_EXAMPLE);
  patch(look);
  return JSON.stringify(look);
};

describe("parseLook", () => {
  it("accepts the spec's example look and it equals the default", () => {
    expect(parseLook(JSON.stringify(SPEC_EXAMPLE))).toEqual(DEFAULT_LOOK);
  });

  it("round-trips the default look through JSON", () => {
    expect(parseLook(JSON.stringify(DEFAULT_LOOK))).toEqual(DEFAULT_LOOK);
  });

  it("ignores unknown keys", () => {
    const parsed = parseLook(JSON.stringify({ ...SPEC_EXAMPLE, extra: true }));
    expect(parsed).toEqual(DEFAULT_LOOK);
  });

  it("accepts a transparent background", () => {
    expect(parseLook(withPatch((l) => (l.camera.background = "transparent")))?.camera.background).toBe("transparent");
  });

  it.each([
    ["a wrong type", withPatch((l) => Object.assign(l.material, { ior: "high" }))],
    ["an out-of-range value", withPatch((l) => (l.lights.exposure = 3.5))],
    ["a missing key", withPatch((l) => Reflect.deleteProperty(l.shape, "bevel"))],
    ["an uppercase hex", withPatch((l) => (l.accent = "#FF4C1F"))],
    ["an unknown preset", withPatch((l) => (l.preset = "brand"))],
    ["an unsupported export size", withPatch((l) => (l.export.sizes = [12]))],
    ["a future schema version", withPatch((l) => (l.iconForgeLook = 2))],
    ["text that is not JSON", "{not json"],
  ])("rejects %s", (_, text) => {
    expect(parseLook(text)).toBeNull();
  });
});

describe("look store", () => {
  it("starts at the default look", () => {
    expect(getLook()).toEqual(DEFAULT_LOOK);
  });

  it("replaces the look and notifies subscribers until they unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeLook(listener);
    const next = { ...DEFAULT_LOOK, accent: "#ff815f" };

    setLook(next);
    expect(getLook()).toBe(next);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    setLook(DEFAULT_LOOK);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
