import { strToU8, zipSync, type Zippable } from "fflate";
import type { Look } from "./look";
import { buildIcon, type IconGeometry } from "./svgIcon";

export type RenderPng = (icon: IconGeometry, px: number) => Promise<Uint8Array>;
export type SetItem = { name: string; svg: string };
export type SetResult = { zip: Uint8Array; ok: number; failed: number };

export const iconSlug = (name: string) =>
  name
    .replace(/\.svg$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "icon";

async function renderPngs(slug: string, icon: IconGeometry, { sizes, scales }: Look["export"], render: RenderPng, prefix = ""): Promise<Zippable> {
  const files: Zippable = {};
  for (const size of sizes) {
    for (const scale of scales) files[`${prefix}${slug}-${size}@${scale}x.png`] = await render(icon, size * scale);
  }
  return files;
}

export async function exportIcon(slug: string, icon: IconGeometry, sizes: Look["export"], render: RenderPng): Promise<Uint8Array> {
  return zipSync(await renderPngs(slug, icon, sizes, render), { level: 0 });
}

export async function exportSet(
  items: SetItem[],
  look: Look,
  render: RenderPng,
  { signal, onProgress }: { signal?: AbortSignal; onProgress?: (n: number) => void },
): Promise<SetResult | null> {
  const files: Zippable = { "look.json": strToU8(JSON.stringify(look, null, 2)) };
  const errors: string[] = [];
  for (const [index, item] of items.entries()) {
    if (signal?.aborted) return null;
    onProgress?.(index + 1);
    const slug = iconSlug(item.name);
    const icon = buildIcon(item.svg);
    if (icon.ok) Object.assign(files, await renderPngs(slug, icon, look.export, render, `${slug}/`));
    else errors.push(`${item.name}: ${icon.error}\n`);
  }
  if (signal?.aborted) return null;
  if (errors.length > 0) files["errors.txt"] = strToU8(errors.join(""));
  return { zip: zipSync(files, { level: 0 }), ok: items.length - errors.length, failed: errors.length };
}
