import paper from "paper";
import { PaperOffset } from "paperjs-offset";
import type { Shape } from "three";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";

export const ERROR_NOT_SVG = "That file isn't a valid SVG.";
export const ERROR_NO_SHAPES = "No shapes found in that SVG.";
export const ERROR_TOO_LARGE = "That SVG is over 1 MB.";
export const WARNING_SKIPPED = "Some elements were skipped (text, images or external references).";

export const MAX_SVG_BYTES = 1024 * 1024;

export type IconResult = { ok: true; shapes: Shape[]; warning?: string } | { ok: false; error: string };

type SvgStyle = { fill?: string; fillRule?: string; stroke?: string; strokeWidth: number; strokeLineCap?: string; strokeLineJoin?: string };

const CURVE_DIVISIONS = 48;
const SKIPPED_SELECTOR = "text, image, use";
const CAPS = { round: "round", butt: "butt", square: "butt" } as const;
const JOINS = { round: "round", bevel: "bevel", miter: "miter", "miter-clip": "miter", arcs: "miter" } as const;

paper.setup(new paper.Size(1, 1));

function isExternalUse(element: Element): boolean {
  const href = element.getAttribute("href") ?? element.getAttribute("xlink:href") ?? "";
  return element.localName !== "use" || !href.startsWith("#");
}

function toPaperPaths(svg: string): paper.PathItem[] {
  const outlines: paper.PathItem[] = [];
  for (const shapePath of new SVGLoader().parse(svg).paths) {
    const style = shapePath.userData?.style as SvgStyle;
    const filled = style.fill !== "none" && style.fill !== "transparent";
    const stroked = style.stroke !== undefined && style.stroke !== "none" && style.strokeWidth > 0;
    const fill = new paper.CompoundPath({ insert: false, fillRule: style.fillRule === "evenodd" ? "evenodd" : "nonzero" });
    for (const subPath of shapePath.subPaths) {
      const points = subPath.getPoints(CURVE_DIVISIONS).map((p) => new paper.Point(p.x, p.y));
      const first = points[0];
      const last = points[points.length - 1];
      if (!first || !last || points.length < 2) continue;
      const closed = subPath.autoClose || first.getDistance(last) < 1e-6;
      const path = new paper.Path({ segments: points, closed, insert: false });
      if (filled) fill.addChild(new paper.Path({ segments: points, closed: true, insert: false }));
      if (stroked) {
        const cap = CAPS[(style.strokeLineCap ?? "butt") as keyof typeof CAPS] ?? "butt";
        const join = JOINS[(style.strokeLineJoin ?? "miter") as keyof typeof JOINS] ?? "miter";
        outlines.push(PaperOffset.offsetStroke(path, style.strokeWidth / 2, { cap, join, insert: false }));
      }
    }
    if (fill.children.length > 0) outlines.push(fill.unite(new paper.Path({ insert: false }), { insert: false }));
  }
  return outlines;
}

export function buildIcon(svgText: string): IconResult {
  if (new Blob([svgText]).size > MAX_SVG_BYTES) return { ok: false, error: ERROR_TOO_LARGE };

  const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  const root = doc.documentElement;
  if (doc.querySelector("parsererror") || root.localName !== "svg") return { ok: false, error: ERROR_NOT_SVG };

  const skipped = [...root.querySelectorAll(SKIPPED_SELECTOR)].filter(isExternalUse);
  for (const element of skipped) element.remove();

  const outlines = toPaperPaths(new XMLSerializer().serializeToString(root));
  const united = outlines.reduce<paper.PathItem | null>(
    (acc, item) => (acc ? acc.unite(item, { insert: false }) : item),
    null,
  ) as paper.Path | paper.CompoundPath | null;
  if (!united || Math.abs(united.area) < 1e-9 || united.bounds.width === 0 || united.bounds.height === 0) {
    return { ok: false, error: ERROR_NO_SHAPES };
  }

  const { center, width, height } = united.bounds;
  const scale = 1 / Math.max(width, height);
  united.translate(center.multiply(-1));
  united.scale(scale, -scale, new paper.Point(0, 0));

  const pathData = united.pathData;
  const shapes = new SVGLoader()
    .parse(`<svg xmlns="http://www.w3.org/2000/svg"><path d="${pathData}"/></svg>`)
    .paths.flatMap((shapePath) => SVGLoader.createShapes(shapePath));
  if (shapes.length === 0) return { ok: false, error: ERROR_NO_SHAPES };

  return skipped.length > 0 ? { ok: true, shapes, warning: WARNING_SKIPPED } : { ok: true, shapes };
}
