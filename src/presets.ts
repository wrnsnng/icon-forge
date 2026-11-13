import type { Look } from "./look";

export type Token = { token: string; hex: string; source: string };
export type Preset = { id: Exclude<Look["preset"], "custom">; name: string; colour: Token; background: Token; accent: Token };
export type Swatch = { name: string; token: string; hex: string };
export type ColourRole = "colour" | "accent";
export type ColourSwatch = Swatch & { roles: ColourRole[] };

const ZEST = "zest/packages/ui/src/styles/globals.css";
const SELEKT = "selekt-2/apps/desktop/src/styles/tokens.css";

export const PRESETS: Preset[] = [
  {
    id: "zest-light",
    name: "Zest light",
    colour: { token: "--color-ink-900", hex: "#060605", source: `${ZEST}:38-56` },
    background: { token: "--color-ink-0", hex: "#ffffff", source: `${ZEST}:38-56` },
    accent: { token: "--color-tangerine-500", hex: "#ff4c1f", source: `${ZEST}:38-56` },
  },
  {
    id: "zest-dark",
    name: "Zest dark",
    colour: { token: "--color-ink-100", hex: "#f8f6f4", source: `${ZEST}:38-56` },
    background: { token: "--surface-0", hex: "#151311", source: `${ZEST}:932` },
    accent: { token: "--color-tangerine-400", hex: "#ff815f", source: `${ZEST}:38-56` },
  },
  {
    id: "selekt-dark",
    name: "Selekt-2 dark",
    colour: { token: "--sel-color-accent", hex: "#f0eee7", source: `${SELEKT}:23` },
    background: { token: "--sel-color-canvas", hex: "#0d0b07", source: `${SELEKT}:10` },
    accent: { token: "--sel-color-accent", hex: "#f0eee7", source: `${SELEKT}:23` },
  },
  {
    id: "selekt-light",
    name: "Selekt-2 light",
    colour: { token: "--sel-color-accent", hex: "#181818", source: `${SELEKT}:69` },
    background: { token: "--sel-color-canvas", hex: "#e7e7e7", source: `${SELEKT}:56` },
    accent: { token: "--sel-color-accent", hex: "#181818", source: `${SELEKT}:69` },
  },
];

const swatch = (preset: Preset, role: "colour" | "background" | "accent"): Swatch => ({
  name: `${preset.name} ${role}`,
  token: preset[role].token,
  hex: preset[role].hex,
});

export const COLOUR_SWATCHES: ColourSwatch[] = PRESETS.flatMap((preset) =>
  preset.accent.hex === preset.colour.hex
    ? [{ ...swatch(preset, "colour"), roles: ["colour", "accent"] }]
    : [
        { ...swatch(preset, "colour"), roles: ["colour"] },
        { ...swatch(preset, "accent"), roles: ["accent"] },
      ],
);

export const BACKGROUND_SWATCHES: Swatch[] = PRESETS.map((preset) => swatch(preset, "background"));
