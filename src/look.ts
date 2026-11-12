import { useSyncExternalStore } from "react";
import { z } from "zod";

const hex = z.string().regex(/^#[0-9a-f]{6}$/);
const range = (min: number, max: number) => z.number().min(min).max(max);

const LookSchema = z.object({
  iconForgeLook: z.literal(1),
  preset: z.enum(["zest-light", "zest-dark", "selekt-dark", "selekt-light", "custom"]),
  shape: z.object({
    scaleX: range(50, 150),
    scaleY: range(50, 150),
    depth: range(10, 300),
    bevel: range(0, 100),
    bulge: range(0, 100),
  }),
  material: z.object({
    type: z.enum(["glass", "clay"]),
    color: hex,
    roughness: range(0, 1),
    density: range(0, 1),
    ior: range(1, 2.33),
    dispersion: range(0, 1),
  }),
  accent: hex,
  lights: z.object({ rotation: range(0, 360), exposure: range(0.2, 3) }),
  camera: z.object({
    background: z.union([hex, z.literal("transparent")]),
    zoom: range(50, 200),
    glow: range(0, 1),
    dof: range(0, 1),
    focus: range(0, 1),
    azimuth: range(-180, 180),
    elevation: range(-90, 90),
  }),
  export: z.object({
    sizes: z.array(z.literal([16, 20, 24])),
    scales: z.array(z.literal([1, 2, 4])),
  }),
});

export type Look = z.infer<typeof LookSchema>;

export const DEFAULT_LOOK: Look = {
  iconForgeLook: 1,
  preset: "zest-light",
  shape: { scaleX: 100, scaleY: 100, depth: 100, bevel: 30, bulge: 0 },
  material: { type: "glass", color: "#060605", roughness: 0.05, density: 0.5, ior: 1.5, dispersion: 0.2 },
  accent: "#ff4c1f",
  lights: { rotation: 0, exposure: 1 },
  camera: { background: "#ffffff", zoom: 100, glow: 0.15, dof: 0, focus: 0.5, azimuth: 0, elevation: 15 },
  export: { sizes: [16, 20, 24], scales: [1, 2, 4] },
};

export function parseLook(text: string): Look | null {
  try {
    const result = LookSchema.safeParse(JSON.parse(text));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

let current = DEFAULT_LOOK;
const listeners = new Set<() => void>();

export function getLook(): Look {
  return current;
}

export function setLook(next: Look): void {
  current = next;
  for (const listener of listeners) listener();
}

export function subscribeLook(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useLook<T>(select: (look: Look) => T): T {
  return useSyncExternalStore(subscribeLook, () => select(current));
}
