import { useEffect, useEffectEvent, useRef, useState } from "react";
import { BackgroundPicker, CheckboxGroup, ColourPicker, PresetPicker, Slider, Toggle, type SliderSpec } from "./Controls";
import { exportIcon, exportSet, iconSlug, type RenderPng, type SetItem } from "./exportPng";
import { BACKGROUND_SWATCHES, COLOUR_SWATCHES } from "./presets";
import { getLook, updateLook, useLook, type Look } from "./look";
import { DEFAULT_ICON_ID, PRESET_ICONS, SELEKT_GROUP, ZEST_GROUP } from "./presetIcons";
import { buildIcon, type IconGeometry } from "./svgIcon";
import { createPngRenderer } from "./renderPng";
import { Viewport, type Toast } from "./Viewport";

const CUSTOM_ID = "custom";
const TOAST_MS = 6000;
const ROUGHNESS: Record<Look["material"]["type"], number> = { glass: 0.05, clay: 0.7 };

type Icon = { id: string; name: string; geometry: IconGeometry };
type Exporting = { kind: "png" | "set"; controller: AbortController; progress?: { n: number; total: number } };
type Job = { signal: AbortSignal; look: Look; render: RenderPng; progress: (n: number, total: number) => void };

const EXPORT_FAILED = "Export failed. Try again.";
const NOTHING_SELECTED = "Select at least one size and scale.";
const SET_LABELS: Record<string, string> = { [ZEST_GROUP]: "Export Zest set", [SELEKT_GROUP]: "Export Selekt-2 set" };
const SIZES: Look["export"]["sizes"] = [16, 20, 24];
const SCALES: Look["export"]["scales"] = [1, 2, 4];

function download(data: Uint8Array, filename: string) {
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type: "application/zip" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url));
}

const doneMessage = (ok: number, failed: number) => (failed > 0 ? `Exported ${ok} icons. ${failed} skipped.` : `Exported ${ok} icons.`);

const WIDTH_SLIDERS: SliderSpec[] = [
  { section: "shape", key: "scaleX", label: "X width", min: 50, max: 150, digits: 0, unit: "%" },
  { section: "shape", key: "scaleY", label: "Y width", min: 50, max: 150, digits: 0, unit: "%" },
  { section: "shape", key: "depth", label: "Z width", min: 10, max: 300, digits: 0, unit: "%", helper: "Extrusion depth" },
];
const SHAPE_SLIDERS: SliderSpec[] = [
  { section: "shape", key: "bevel", label: "Bevel", min: 0, max: 100, digits: 0 },
  { section: "shape", key: "bulge", label: "Bulge", min: 0, max: 100, digits: 0 },
];
const ROUGHNESS_SLIDER: SliderSpec = { section: "material", key: "roughness", label: "Roughness", min: 0, max: 1, digits: 2 };
const GLASS_SLIDERS: SliderSpec[] = [
  { section: "material", key: "density", label: "Colour density", min: 0, max: 1, digits: 2 },
  { section: "material", key: "ior", label: "Refraction", min: 1, max: 2.33, digits: 2 },
  { section: "material", key: "dispersion", label: "Dispersion", min: 0, max: 1, digits: 2 },
];
const LIGHT_SLIDERS: SliderSpec[] = [
  { section: "lights", key: "rotation", label: "Rotation", min: 0, max: 360, digits: 0, unit: "°" },
  { section: "lights", key: "exposure", label: "Exposure", min: 0.2, max: 3, digits: 2 },
];
const CAMERA_SLIDERS: SliderSpec[] = [
  { section: "camera", key: "zoom", label: "Zoom", min: 50, max: 200, digits: 0, unit: "%" },
  { section: "camera", key: "glow", label: "Glow", min: 0, max: 1, digits: 2 },
  { section: "camera", key: "dof", label: "Depth of field", min: 0, max: 1, digits: 2 },
  { section: "camera", key: "focus", label: "Focus", min: 0, max: 1, digits: 2, ends: ["Near", "Far"] },
];

function presetIcon(id: string): Icon {
  const preset = PRESET_ICONS.find((icon) => icon.id === id);
  const result = buildIcon(preset?.svg ?? "");
  if (!result.ok) throw new Error(`Preset icon ${id} failed to build: ${result.error}`);
  return { id, name: preset?.name ?? id, geometry: result };
}

const isTextField = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || target.matches("input, textarea, select"));

export function App() {
  const [icon, setIcon] = useState(() => presetIcon(DEFAULT_ICON_ID));
  const [customIcon, setCustomIcon] = useState<Omit<Icon, "id"> | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const toastCount = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [spin, setSpin] = useState(() => !window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const material = useLook((look) => look.material.type);
  const fileInput = useRef<HTMLInputElement>(null);
  const setInput = useRef<HTMLInputElement>(null);
  const [setFiles, setSetFiles] = useState<SetItem[]>([]);
  const [exporting, setExporting] = useState<Exporting | null>(null);
  const [status, setStatus] = useState<{ text: string; icon: Icon; files: SetItem[] } | null>(null);
  const nothingSelected = useLook(({ export: { sizes, scales } }) => sizes.length === 0 || scales.length === 0);

  const showToast = (message: string | undefined) => {
    toastCount.current += 1;
    setToast(message ? { id: toastCount.current, message } : null);
  };
  const loadSvg = (text: string, name = "icon") => {
    const result = buildIcon(text);
    if (!result.ok) {
      showToast(result.error);
      return;
    }
    setCustomIcon({ name, geometry: result });
    setIcon({ id: CUSTOM_ID, name, geometry: result });
    showToast(result.warning);
  };
  const loadFile = (file: File | undefined) => {
    if (file) void file.text().then((text) => loadSvg(text, file.name));
  };
  const onFileDropped = useEffectEvent(loadFile);
  const onSvgPasted = useEffectEvent((text: string) => loadSvg(text));

  useEffect(() => {
    let depth = 0;
    const hasFiles = (event: DragEvent) => event.dataTransfer?.types.includes("Files") ?? false;
    const onDragEnter = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      depth += 1;
      setDragging(true);
    };
    const onDragOver = (event: DragEvent) => {
      if (hasFiles(event)) event.preventDefault();
    };
    const onDragLeave = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const onDrop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth = 0;
      setDragging(false);
      onFileDropped(event.dataTransfer?.files[0]);
    };
    const onPaste = (event: ClipboardEvent) => {
      if (isTextField(event.target)) return;
      const text = event.clipboardData?.getData("text/plain") ?? "";
      if (!text.includes("<svg")) return;
      event.preventDefault();
      onSvgPasted(text);
    };
    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
      window.removeEventListener("paste", onPaste);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setToast(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [toast]);

  const selectIcon = (id: string) => {
    if (id === CUSTOM_ID && customIcon) setIcon({ id, ...customIcon });
    else if (id !== CUSTOM_ID) setIcon(presetIcon(id));
  };

  const group = PRESET_ICONS.find((preset) => preset.id === icon.id)?.group;
  const setItems: SetItem[] =
    setFiles.length > 0 ? setFiles : PRESET_ICONS.filter((preset) => preset.group === group).map(({ name, svg }) => ({ name, svg }));
  const setLabel = setFiles.length > 0 ? `Export set (${setFiles.length} SVGs)` : (group && SET_LABELS[group]) ?? "Export set";

  const runExport = async (kind: Exporting["kind"], work: (job: Job) => Promise<void>) => {
    if (nothingSelected) return;
    const controller = new AbortController();
    setExporting({ kind, controller });
    setStatus(null);
    const look = getLook();
    const renderer = createPngRenderer(look);
    try {
      const progress = (n: number, total: number) => setExporting({ kind, controller, progress: { n, total } });
      await work({ signal: controller.signal, look, render: renderer.render, progress });
    } catch {
      showToast(EXPORT_FAILED);
    } finally {
      renderer.dispose();
      setExporting(null);
    }
  };

  const exportPng = () =>
    runExport("png", async ({ look, render }) => {
      const slug = iconSlug(icon.name);
      download(await exportIcon(slug, icon.geometry, look.export, render), `${slug}.zip`);
    });

  const exportSetZip = () => {
    const items = setItems;
    const filename = `${iconSlug(setLabel.replace(/^Export | \(.*$/g, ""))}.zip`;
    return runExport("set", async ({ signal, look, render, progress }) => {
      const result = await exportSet(items, look, render, { signal, onProgress: (n) => progress(n, items.length) });
      if (!result) return;
      download(result.zip, filename);
      setStatus({ text: doneMessage(result.ok, result.failed), icon, files: setFiles });
    });
  };

  const loadSetFiles = async (files: FileList | null) => {
    const list = [...(files ?? [])];
    if (list.length > 0) setSetFiles(await Promise.all(list.map(async (file) => ({ name: file.name, svg: await file.text() }))));
  };

  return (
    <main className="app">
      <h1 className="visually-hidden">Icon Forge</h1>
      <Viewport icon={icon.geometry} dragging={dragging} toast={toast} spin={spin} onSpinChange={setSpin} />
      <aside className="panel">
        <section className="panel-section">
          <h2>Preset</h2>
          <PresetPicker />
        </section>
        <section className="panel-section">
          <h2>Icon</h2>
          <div className="field">
            <label htmlFor="icon-select">Icon</label>
            <select id="icon-select" value={icon.id} onChange={(event) => selectIcon(event.target.value)}>
              {[ZEST_GROUP, SELEKT_GROUP].map((group) => (
                <optgroup key={group} label={group}>
                  {PRESET_ICONS.filter((preset) => preset.group === group).map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.name}
                    </option>
                  ))}
                </optgroup>
              ))}
              {customIcon && (
                <optgroup label="Your SVG">
                  <option value={CUSTOM_ID}>Your SVG</option>
                </optgroup>
              )}
            </select>
          </div>
          <button type="button" onClick={() => fileInput.current?.click()}>
            Replace SVG
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".svg,image/svg+xml"
            hidden
            onChange={(event) => {
              loadFile(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          <p className="helper">Or drop an SVG anywhere, or paste one.</p>
          {WIDTH_SLIDERS.map((slider) => (
            <Slider key={slider.key} spec={slider} />
          ))}
        </section>
        <section className="panel-section">
          <h2>Shape</h2>
          {SHAPE_SLIDERS.map((slider) => (
            <Slider key={slider.key} spec={slider} />
          ))}
        </section>
        <section className="panel-section">
          <h2>Material</h2>
          <Toggle
            label="Material"
            name="material"
            options={[
              { value: "glass", label: "Glass" },
              { value: "clay", label: "Clay" },
            ]}
            value={material}
            onChange={(type) => updateLook("material", { type, roughness: ROUGHNESS[type] })}
          />
          <ColourPicker swatches={COLOUR_SWATCHES} />
          <Slider spec={ROUGHNESS_SLIDER} />
          {material === "glass" && GLASS_SLIDERS.map((slider) => <Slider key={slider.key} spec={slider} />)}
        </section>
        <section className="panel-section">
          <h2>Lights</h2>
          {LIGHT_SLIDERS.map((slider) => (
            <Slider key={slider.key} spec={slider} />
          ))}
        </section>
        <section className="panel-section">
          <h2>Camera</h2>
          <BackgroundPicker swatches={BACKGROUND_SWATCHES} />
          {CAMERA_SLIDERS.map((slider) => (
            <Slider key={slider.key} spec={slider} />
          ))}
          <Toggle
            label="Spin"
            name="spin"
            options={[
              { value: "on", label: "On" },
              { value: "off", label: "Off" },
            ]}
            value={spin ? "on" : "off"}
            onChange={(value) => setSpin(value === "on")}
          />
        </section>
        <section className="panel-section">
          <h2>Export</h2>
          <CheckboxGroup legend="Sizes (px)" field="sizes" options={SIZES} format={(size) => String(size)} />
          <CheckboxGroup legend="Scales" field="scales" options={SCALES} format={(scale) => `${scale}x`} />
          {nothingSelected && <p className="helper">{NOTHING_SELECTED}</p>}
          <div className="export-actions">
            <button type="button" disabled={exporting !== null || nothingSelected} aria-busy={exporting?.kind === "png"} onClick={() => void exportPng()}>
              {exporting?.kind === "png" && <span className="spinner" aria-hidden="true" />}
              Export PNG
            </button>
            <button type="button" disabled={exporting !== null || nothingSelected || setItems.length === 0} aria-busy={exporting?.kind === "set"} onClick={() => void exportSetZip()}>
              {exporting?.kind === "set" && <span className="spinner" aria-hidden="true" />}
              {setLabel}
            </button>
          </div>
          <button type="button" onClick={() => setInput.current?.click()}>
            Add SVGs…
          </button>
          <input
            ref={setInput}
            type="file"
            accept=".svg,image/svg+xml"
            multiple
            hidden
            onChange={(event) => {
              void loadSetFiles(event.target.files);
              event.target.value = "";
            }}
          />
          <div className="export-status" aria-live="polite">
            {exporting?.progress ? `Rendering ${exporting.progress.n} of ${exporting.progress.total}…` : status?.icon === icon && status.files === setFiles ? status.text : ""}
          </div>
          {exporting?.kind === "set" && (
            <button type="button" onClick={() => exporting.controller.abort()}>
              Cancel
            </button>
          )}
        </section>
      </aside>
    </main>
  );
}
