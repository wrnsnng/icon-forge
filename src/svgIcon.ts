import paper from "paper";
import { PaperOffset } from "paperjs-offset";
import type { Shape } from "three";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";

export const ERROR_NOT_SVG = "That file isn't a valid SVG.";
export const ERROR_NO_SHAPES = "No shapes found in that SVG.";
export const ERROR_TOO_LARGE = "That SVG is over 1 MB.";
export const WARNING_SKIPPED = "Some elements were skipped (text, images or external references).";

export const MAX_SVG_BYTES = 1024 * 1024;

export type IconGeometry = { shapes: Shape[]; thinnest: number };
export type IconResult = ({ ok: true; warning?: string } & IconGeometry) | { ok: false; error: string };

type SvgStyle = { fill?: string; fillRule?: string; stroke?: string; strokeWidth: number; strokeLineCap?: string; strokeLineJoin?: string };

const CURVE_DIVISIONS = 48;
const SKIPPED_SELECTOR = "text, image, use";
const JOINS = { round: "round", bevel: "bevel", miter: "miter", "miter-clip": "miter", arcs: "miter" } as const;

paper.setup(new paper.Size(1, 1));

function isExternalUse(element: Element): boolean {
  const href = element.getAttribute("href") ?? element.getAttribute("xlink:href") ?? "";
  return element.localName !== "use" || !href.startsWith("#");
}

function extendEnds(points: paper.Point[], distance: number): paper.Point[] {
  const [first, second] = points;
  const [last, beforeLast] = points.slice(-2).reverse();
  if (!first || !second || !last || !beforeLast) return points;
  return [
    first.add(first.subtract(second).normalize(distance)),
    ...points.slice(1, -1),
    last.add(last.subtract(beforeLast).normalize(distance)),
  ];
}

function outlineStroke(points: paper.Point[], closed: boolean, style: SvgStyle): paper.PathItem {
  const half = style.strokeWidth / 2;
  const square = !closed && style.strokeLineCap === "square";
  const segments = square ? extendEnds(points, half) : points;
  const cap = style.strokeLineCap === "round" ? "round" : "butt";
  const join = JOINS[(style.strokeLineJoin ?? "miter") as keyof typeof JOINS] ?? "miter";
  const path = new paper.Path({ segments, closed, insert: false });
  return PaperOffset.offsetStroke(path, half, { cap, join, insert: false });
}

function strokeWidthOf(outline: paper.PathItem): number {
  const parts = outline instanceof paper.CompoundPath ? (outline.children as paper.Path[]) : [outline as paper.Path];
  const perimeter = parts.reduce((sum, part) => sum + part.length, 0);
  return perimeter > 0 ? (2 * Math.abs((outline as paper.Path).area)) / perimeter : Infinity;
}

function* toPaperPaths(svg: string): Generator<void, paper.PathItem[]> {
  const outlines: paper.PathItem[] = [];
  for (const shapePath of new SVGLoader().parse(svg).paths) {
    yield;
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
      if (filled) fill.addChild(new paper.Path({ segments: points, closed: true, insert: false }));
      if (stroked) outlines.push(outlineStroke(points, closed, style));
    }
    if (fill.children.length > 0) outlines.push(fill.unite(new paper.Path({ insert: false }), { insert: false }));
  }
  return outlines;
}

function* buildSteps(svgText: string): Generator<void, IconResult> {
  if (new Blob([svgText]).size > MAX_SVG_BYTES) return { ok: false, error: ERROR_TOO_LARGE };

  const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  const root = doc.documentElement;
  if (doc.querySelector("parsererror") || root.localName !== "svg") return { ok: false, error: ERROR_NOT_SVG };

  const skipped = [...root.querySelectorAll(SKIPPED_SELECTOR)].filter(isExternalUse);
  for (const element of skipped) element.remove();

  const outlines = yield* toPaperPaths(new XMLSerializer().serializeToString(root));
  let united: paper.Path | paper.CompoundPath | null = null;
  for (const item of outlines) {
    yield;
    united = (united ? united.unite(item, { insert: false }) : item) as paper.Path | paper.CompoundPath;
  }
  if (!united || Math.abs(united.area) < 1e-9 || united.bounds.width === 0 || united.bounds.height === 0) {
    return { ok: false, error: ERROR_NO_SHAPES };
  }

  const { center, width, height } = united.bounds;
  const scale = 1 / Math.max(width, height);
  const thinnest = Math.min(...outlines.map(strokeWidthOf)) * scale;
  united.translate(center.multiply(-1));
  united.scale(scale, -scale, new paper.Point(0, 0));

  const pathData = united.pathData;
  const shapes = new SVGLoader()
    .parse(`<svg xmlns="http://www.w3.org/2000/svg"><path d="${pathData}"/></svg>`)
    .paths.flatMap((shapePath) => SVGLoader.createShapes(shapePath));
  if (shapes.length === 0) return { ok: false, error: ERROR_NO_SHAPES };

  return skipped.length > 0 ? { ok: true, shapes, thinnest, warning: WARNING_SKIPPED } : { ok: true, shapes, thinnest };
}

export function buildIcon(svgText: string): IconResult {
  const steps = buildSteps(svgText);
  for (let step = steps.next(); ; step = steps.next()) if (step.done) return step.value;
}

const FRAME_BUDGET_MS = 12;

export async function buildIconYielding(svgText: string, signal: AbortSignal): Promise<IconResult | null> {
  const steps = buildSteps(svgText);
  let sliceStart = performance.now();
  for (let step = steps.next(); ; step = steps.next()) {
    if (signal.aborted) return null;
    if (step.done) return step.value;
    if (performance.now() - sliceStart < FRAME_BUDGET_MS) continue;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve);
      signal.addEventListener("abort", () => (clearTimeout(timer), resolve()), { once: true });
    });
    sliceStart = performance.now();
  }
}
