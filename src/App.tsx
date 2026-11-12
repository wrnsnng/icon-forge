import { useEffect, useEffectEvent, useRef, useState } from "react";
import { BackgroundPicker, ColourPicker, Slider, Toggle, type SliderSpec, type Swatch } from "./Controls";
import { updateLook, useLook, type Look } from "./look";
import { DEFAULT_ICON_ID, PRESET_ICONS, SELEKT_GROUP, ZEST_GROUP } from "./presetIcons";
import { buildIcon, type IconGeometry } from "./svgIcon";
import { Viewport, type Toast } from "./Viewport";

const CUSTOM_ID = "custom";
const TOAST_MS = 6000;
const ROUGHNESS: Record<Look["material"]["type"], number> = { glass: 0.05, clay: 0.7 };

type Icon = { id: string; geometry: IconGeometry };

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
const COLOUR_SWATCHES: Swatch[] = [
  { name: "Zest light colour", token: "--color-ink-900", hex: "#060605" },
  { name: "Zest light accent", token: "--color-tangerine-500", hex: "#ff4c1f" },
];
const BACKGROUND_SWATCHES: Swatch[] = [{ name: "Zest light background", token: "--color-ink-0", hex: "#ffffff" }];

function presetIcon(id: string): Icon {
  const preset = PRESET_ICONS.find((icon) => icon.id === id);
  const result = buildIcon(preset?.svg ?? "");
  if (!result.ok) throw new Error(`Preset icon ${id} failed to build: ${result.error}`);
  return { id, geometry: result };
}

const isTextField = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || target.matches("input, textarea, select"));

export function App() {
  const [icon, setIcon] = useState(() => presetIcon(DEFAULT_ICON_ID));
  const [customIcon, setCustomIcon] = useState<IconGeometry | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const toastCount = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [spin, setSpin] = useState(() => !window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const material = useLook((look) => look.material.type);
  const fileInput = useRef<HTMLInputElement>(null);

  const showToast = (message: string | undefined) => {
    toastCount.current += 1;
    setToast(message ? { id: toastCount.current, message } : null);
  };
  const loadSvg = (text: string) => {
    const result = buildIcon(text);
    if (!result.ok) {
      showToast(result.error);
      return;
    }
    setCustomIcon(result);
    setIcon({ id: CUSTOM_ID, geometry: result });
    showToast(result.warning);
  };
  const loadFile = (file: File | undefined) => {
    if (file) void file.text().then(loadSvg);
  };
  const onFileDropped = useEffectEvent(loadFile);
  const onSvgPasted = useEffectEvent(loadSvg);

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
    if (id === CUSTOM_ID && customIcon) setIcon({ id, geometry: customIcon });
    else if (id !== CUSTOM_ID) setIcon(presetIcon(id));
  };

  return (
    <main className="app">
      <h1 className="visually-hidden">Icon Forge</h1>
      <Viewport icon={icon.geometry} dragging={dragging} toast={toast} spin={spin} onSpinChange={setSpin} />
      <aside className="panel">
        <section className="panel-section">
          <h2>Preset</h2>
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
        </section>
      </aside>
    </main>
  );
}
