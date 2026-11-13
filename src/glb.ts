import { Mesh, MeshPhysicalMaterial, type BufferGeometry, type Vector3Tuple } from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import type { Look } from "./look";

export const GLASS_THICKNESS = 0.2;

export const attenuationDistance = (density: number) => 1 / (1 + 50 * density);

function physicalMaterial(material: Look["material"]): MeshPhysicalMaterial {
  const physical = new MeshPhysicalMaterial({ color: material.color, roughness: material.roughness, metalness: 0 });
  if (material.type === "glass") {
    physical.transmission = 1;
    physical.thickness = GLASS_THICKNESS;
    physical.ior = material.ior;
    physical.attenuationColor.set(material.color);
    physical.attenuationDistance = attenuationDistance(material.density);
  }
  return physical;
}

export async function exportGlb(geometry: BufferGeometry, scale: Vector3Tuple, material: Look["material"]): Promise<ArrayBuffer> {
  const mesh = new Mesh(geometry, physicalMaterial(material));
  mesh.name = "Icon";
  mesh.scale.set(...scale);
  try {
    return (await new GLTFExporter().parseAsync(mesh, { binary: true })) as ArrayBuffer;
  } finally {
    mesh.material.dispose();
  }
}
