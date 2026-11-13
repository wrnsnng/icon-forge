import { useRef, type KeyboardEvent } from "react";
import { getLook, setLook, updateLook, useLook, type Look } from "./look";
import { PRESETS, type ColourSwatch, type Preset, type Swatch } from "./presets";

type Section = "shape" | "material" | "lights" | "camera";
type NumberKey<S extends Section> = { [K in keyof Look[S]]: Look[S][K] extends number ? K : never }[keyof Look[S]];

export type SliderSpec = {
  [S in Section]: {
    section: S;
    key: NumberKey<S>;
    label: string;
    min: number;
    max: number;
    digits: number;
    unit?: string;
    helper?: string;
    ends?: [string, string];
  };
}[Section];

const STEP_DIRECTION: Record<string, number> = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 };

function steppedValue(spec: Pick<SliderSpec, "min" | "max">, value: number, direction: number, large: boolean): number {
  const step = (spec.max - spec.min) / (large ? 10 : 100);
  const next = Math.min(spec.max, Math.max(spec.min, value + direction * step));
  return Math.round(next * 1e6) / 1e6;
}

export function Slider({ spec }: { spec: SliderSpec }) {
  const value = useLook((look) => look[spec.section][spec.key as keyof Look[typeof spec.section]] as number);
  const id = `slider-${spec.section}-${spec.key}`;
  const text = `${value.toFixed(spec.digits)}${spec.unit ?? ""}`;
  const set = (next: number) => updateLook(spec.section, { [spec.key]: next });
  const onKeyDown = (event: KeyboardEvent) => {
    const direction = STEP_DIRECTION[event.key];
    if (!direction) return;
    event.preventDefault();
    set(steppedValue(spec, value, direction, event.shiftKey));
  };
  const described = [spec.helper && `${id}-helper`, spec.ends && `${id}-ends`].filter(Boolean).join(" ");
  return (
    <div className="field">
      <label htmlFor={id}>
        {spec.label} <output htmlFor={id}>{text}</output>
      </label>
      <input
        id={id}
        type="range"
        min={spec.min}
        max={spec.max}
        step="any"
        value={value}
        aria-valuetext={text}
        aria-describedby={described || undefined}
        onKeyDown={onKeyDown}
        onChange={(event) => set(Number(event.target.value))}
      />
      {spec.ends && (
        <p id={`${id}-ends`} className="helper slider-ends">
          <span>{spec.ends[0]}</span>
          <span>{spec.ends[1]}</span>
        </p>
      )}
      {spec.helper && (
        <p id={`${id}-helper`} className="helper">
          {spec.helper}
        </p>
      )}
    </div>
  );
}

export function Toggle<T extends string>({
  label,
  name,
  options,
  value,
  onChange,
}: {
  label: string;
  name: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="field toggle">
      <legend>{label}</legend>
      {options.map((option) => (
        <label key={option.value}>
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
          />
          {option.label}
        </label>
      ))}
    </fieldset>
  );
}

const swatchName = (swatch: Swatch) => `${swatch.name} — ${swatch.token} ${swatch.hex}`;

const applySwatch = ({ hex, roles }: ColourSwatch) => {
  const look = getLook();
  setLook({
    ...look,
    preset: "custom",
    material: roles.includes("colour") ? { ...look.material, color: hex } : look.material,
    accent: roles.includes("accent") ? hex : look.accent,
  });
};

export function ColourPicker({ swatches }: { swatches: ColourSwatch[] }) {
  const color = useLook((look) => look.material.color);
  const accent = useLook((look) => look.accent);
  const dialog = useRef<HTMLDialogElement>(null);
  const current = swatches.find((swatch) => swatch.roles.includes("colour") && swatch.hex === color);
  const applied = (swatch: ColourSwatch) => swatch.roles.every((role) => (role === "colour" ? color : accent) === swatch.hex);
  const name = current ? `Colour, ${current.token} ${current.hex}` : `Colour, ${color}`;
  return (
    <div className="field">
      <span id="colour-label">Colour</span>
      <button type="button" className="colour-trigger" aria-label={name} onClick={() => dialog.current?.showModal()}>
        <span className="swatch-chip" style={{ background: color }} />
        {current?.token ?? color}
      </button>
      <dialog ref={dialog} className="colour-popover" aria-labelledby="colour-label" onClick={(event) => {
          const element = dialog.current;
          if (!element || event.target !== element) return;
          const rect = element.getBoundingClientRect();
          const inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
          if (!inside) element.close();
        }}>
        {swatches.map((swatch) => (
          <button
            key={swatch.hex}
            type="button"
            className="swatch"
            aria-label={swatchName(swatch)}
            aria-pressed={applied(swatch)}
            title={swatchName(swatch)}
            style={{ background: swatch.hex }}
            onClick={() => {
              applySwatch(swatch);
              dialog.current?.close();
            }}
          />
        ))}
      </dialog>
    </div>
  );
}

export function BackgroundPicker({ swatches }: { swatches: Swatch[] }) {
  const background = useLook((look) => look.camera.background);
  const options = [...swatches.map((swatch) => ({ value: swatch.hex, label: swatchName(swatch) })), { value: "transparent", label: "Transparent" }];
  return (
    <fieldset className="field swatches">
      <legend>Background colour</legend>
      {options.map((option) => (
        <label key={option.value} title={option.label} className="swatch" data-color={option.value} style={option.value === "transparent" ? undefined : { background: option.value }}>
          <input
            type="radio"
            name="background"
            className="visually-hidden"
            aria-label={option.label}
            checked={background === option.value}
            onChange={() => {
              const look = getLook();
              setLook({ ...look, preset: "custom", camera: { ...look.camera, background: option.value } });
            }}
          />
        </label>
      ))}
    </fieldset>
  );
}

const PRESET_OPTIONS: Preset["id"][] = ["zest-light", "zest-dark", "selekt-light", "selekt-dark"];

const applyPreset = (id: Look["preset"]) => {
  const preset = PRESETS.find((candidate) => candidate.id === id);
  const look = getLook();
  if (!preset) return setLook({ ...look, preset: id });
  setLook({
    ...look,
    preset: preset.id,
    material: { ...look.material, color: preset.colour.hex },
    accent: preset.accent.hex,
    camera: { ...look.camera, background: preset.background.hex },
  });
};

export function PresetPicker() {
  const preset = useLook((look) => look.preset);
  return (
    <div className="field">
      <label htmlFor="preset-select">Design system</label>
      <select id="preset-select" value={preset} onChange={(event) => applyPreset(event.target.value as Look["preset"])}>
        {PRESET_OPTIONS.map((id) => (
          <option key={id} value={id}>
            {PRESETS.find((candidate) => candidate.id === id)?.name}
          </option>
        ))}
        <option value="custom">Custom</option>
      </select>
    </div>
  );
}

export function CheckboxGroup<F extends keyof Look["export"]>({
  legend,
  field,
  options,
  format,
}: {
  legend: string;
  field: F;
  options: readonly Look["export"][F][number][];
  format: (value: Look["export"][F][number]) => string;
}) {
  const checked = useLook((look) => look.export[field]) as Look["export"][F][number][];
  const toggle = (value: Look["export"][F][number]) => {
    const next = options.filter((option) => (option === value ? !checked.includes(value) : checked.includes(option)));
    updateLook("export", { [field]: next });
  };
  return (
    <fieldset className="field checkboxes">
      <legend>{legend}</legend>
      {options.map((option) => (
        <label key={option}>
          <input type="checkbox" checked={checked.includes(option)} onChange={() => toggle(option)} />
          {format(option)}
        </label>
      ))}
    </fieldset>
  );
}
