// @vitest-environment jsdom
import { BoxGeometry } from "three";
import { describe, expect, it } from "vitest";
import { exportGlb } from "./glb";
import { DEFAULT_LOOK, type Look } from "./look";

type Gltf = {
  meshes: { primitives: { attributes: Record<string, number> }[] }[];
  nodes: { mesh?: number; matrix?: number[] }[];
  materials: {
    pbrMetallicRoughness: { baseColorFactor: number[]; roughnessFactor: number; metallicFactor: number };
    extensions?: Record<string, Record<string, number | number[]>>;
  }[];
  extensionsUsed?: string[];
};

function readGlb(buffer: ArrayBuffer): Gltf {
  const view = new DataView(buffer);
  expect(view.getUint32(0, true)).toBe(0x46546c67);
  expect(view.getUint32(4, true)).toBe(2);
  const jsonLength = view.getUint32(12, true);
  expect(view.getUint32(16, true)).toBe(0x4e4f534a);
  return JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, jsonLength))) as Gltf;
}

const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const linear = (hex: string) => [1, 3, 5].map((i) => srgbToLinear(parseInt(hex.slice(i, i + 2), 16) / 255));

async function exported(material: Look["material"]) {
  return readGlb(await exportGlb(new BoxGeometry(1, 1, 0.2), [1.2, 0.8, 1], material));
}

describe("exportGlb", () => {
  it("writes one scaled mesh with positions and normals", async () => {
    const gltf = await exported(DEFAULT_LOOK.material);
    expect(gltf.meshes).toHaveLength(1);
    expect(Object.keys(gltf.meshes[0]?.primitives[0]?.attributes ?? {})).toEqual(expect.arrayContaining(["POSITION", "NORMAL"]));
    const matrix = gltf.nodes.find((node) => node.mesh === 0)?.matrix ?? [];
    expect([matrix[0], matrix[5], matrix[10]].map((value) => value?.toFixed(3))).toEqual(["1.200", "0.800", "1.000"]);
  });

  it("carries a clay colour and roughness with no glass extensions", async () => {
    const gltf = await exported({ ...DEFAULT_LOOK.material, type: "clay", color: "#ff4c1f", roughness: 0.7 });
    const [material] = gltf.materials;
    material?.pbrMetallicRoughness.baseColorFactor.slice(0, 3).forEach((value, i) => expect(value).toBeCloseTo(linear("#ff4c1f")[i] ?? -1, 4));
    expect(material?.pbrMetallicRoughness.roughnessFactor).toBeCloseTo(0.7);
    expect(material?.pbrMetallicRoughness.metallicFactor).toBe(0);
    expect(gltf.extensionsUsed ?? []).toEqual([]);
  });

  it("carries glass transmission, thickness and ior, and leaves dispersion out", async () => {
    const gltf = await exported({ ...DEFAULT_LOOK.material, color: "#123456", roughness: 0.1, ior: 1.8, dispersion: 0.9 });
    const extensions = gltf.materials[0]?.extensions ?? {};
    expect(gltf.materials[0]?.pbrMetallicRoughness.roughnessFactor).toBeCloseTo(0.1);
    expect(extensions.KHR_materials_transmission?.transmissionFactor).toBe(1);
    expect(extensions.KHR_materials_volume?.thicknessFactor).toBeGreaterThan(0);
    expect(extensions.KHR_materials_volume?.attenuationColor).toHaveLength(3);
    expect(extensions.KHR_materials_ior?.ior).toBeCloseTo(1.8);
    expect(gltf.extensionsUsed).not.toContain("KHR_materials_dispersion");
    expect(extensions.KHR_materials_dispersion).toBeUndefined();
  });
});
