import { useEffect, useEffectEvent, useRef, useState } from "react";
import { getLook, setLook, useLook, type Look } from "./look";
import { DEFAULT_ICON_ID, PRESET_ICONS, SELEKT_GROUP, ZEST_GROUP } from "./presetIcons";
import { buildIcon, type IconGeometry } from "./svgIcon";
import { Viewport, type Toast } from "./Viewport";

const SECTIONS_AFTER_ICON = ["Shape", "Material", "Lights", "Camera", "Export"];
const CUSTOM_ID = "custom";
const TOAST_MS = 6000;

type Icon = { id: string; geometry: IconGeometry };
type WidthKey = "scaleX" | "scaleY" | "depth";

const WIDTH_SLIDERS: { key: WidthKey; label: string; min: number; max: number; helper?: string }[] = [
  { key: "scaleX", label: "X width", min: 50, max: 150 },
  { key: "scaleY", label: "Y width", min: 50, max: 150 },
  { key: "depth", label: "Z width", min: 10, max: 300, helper: "Extrusion depth" },
];

function presetIcon(id: string): Icon {
  const preset = PRESET_ICONS.find((icon) => icon.id === id);
  const result = buildIcon(preset?.svg ?? "");
  if (!result.ok) throw new Error(`Preset icon ${id} failed to build: ${result.error}`);
  return { id, geometry: result };
}

const isTextField = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || target.matches("input, textarea, select"));

function WidthSlider({ slider }: { slider: (typeof WIDTH_SLIDERS)[number] }) {
  const value = useLook((look) => look.shape[slider.key]);
  const id = `slider-${slider.key}`;
  const update = (next: number) => {
    const look: Look = getLook();
    setLook({ ...look, shape: { ...look.shape, [slider.key]: next } });
  };
  return (
    <div className="field">
      <label htmlFor={id}>
        {slider.label} <output htmlFor={id}>{value}%</output>
      </label>
      <input
        id={id}
        type="range"
        min={slider.min}
        max={slider.max}
        value={value}
        aria-describedby={slider.helper ? `${id}-helper` : undefined}
        onChange={(event) => update(Number(event.target.value))}
      />
      {slider.helper && (
        <p id={`${id}-helper`} className="helper">
          {slider.helper}
        </p>
      )}
    </div>
  );
}

export function App() {
  const [icon, setIcon] = useState(() => presetIcon(DEFAULT_ICON_ID));
  const [customIcon, setCustomIcon] = useState<IconGeometry | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const toastCount = useRef(0);
  const [dragging, setDragging] = useState(false);
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
      <Viewport icon={icon.geometry} dragging={dragging} toast={toast} />
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
            <WidthSlider key={slider.key} slider={slider} />
          ))}
        </section>
        {SECTIONS_AFTER_ICON.map((title) => (
          <section key={title} className="panel-section">
            <h2>{title}</h2>
          </section>
        ))}
      </aside>
    </main>
  );
}
