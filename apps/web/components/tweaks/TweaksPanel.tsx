"use client";

import { useState, type ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";
import { useTweaks } from "./useTweaks";
import type {
  BodyFont,
  Density,
  DisplayFont,
  LayoutVariant,
  Theme,
} from "./types";

// ── Layout helpers ──────────────────────────────────────────────────────────

interface TweakSectionProps {
  title: string;
  children: ReactNode;
}

function TweakSection({ title, children }: TweakSectionProps): JSX.Element {
  return (
    <>
      <div className="twk-sect">{title}</div>
      {children}
    </>
  );
}

interface TweakRowProps {
  label: string;
  value?: string | number;
  inline?: boolean;
  children: ReactNode;
}

function TweakRow({ label, value, inline = false, children }: TweakRowProps): JSX.Element {
  return (
    <div className={inline ? "twk-row twk-row-h" : "twk-row"}>
      <div className="twk-lbl">
        <span>{label}</span>
        {value != null && <span className="twk-val">{value}</span>}
      </div>
      {children}
    </div>
  );
}

// ── Controls ────────────────────────────────────────────────────────────────

interface TweakSliderProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  onChange: (next: number) => void;
}

function TweakSlider({
  label,
  value,
  min = 0,
  max = 100,
  step = 1,
  unit = "",
  onChange,
}: TweakSliderProps): JSX.Element {
  return (
    <TweakRow label={label} value={`${value}${unit}`}>
      <input
        type="range"
        className="twk-slider"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </TweakRow>
  );
}

interface TweakRadioOption<T extends string> {
  value: T;
  label: string;
}

interface TweakRadioProps<T extends string> {
  label: string;
  value: T;
  options: ReadonlyArray<TweakRadioOption<T>>;
  onChange: (next: T) => void;
}

function TweakRadio<T extends string>({
  label,
  value,
  options,
  onChange,
}: TweakRadioProps<T>): JSX.Element {
  const idx = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const n = options.length;
  return (
    <TweakRow label={label}>
      <div className="twk-seg" role="radiogroup" aria-label={label}>
        <div
          className="twk-seg-thumb"
          style={{
            left: `calc(2px + ${idx} * (100% - 4px) / ${n})`,
            width: `calc((100% - 4px) / ${n})`,
          }}
        />
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </TweakRow>
  );
}

interface TweakSelectOption<T extends string> {
  value: T;
  label: string;
}

interface TweakSelectProps<T extends string> {
  label: string;
  value: T;
  options: ReadonlyArray<TweakSelectOption<T>>;
  onChange: (next: T) => void;
}

function TweakSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: TweakSelectProps<T>): JSX.Element {
  return (
    <TweakRow label={label}>
      <select
        className="twk-field"
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </TweakRow>
  );
}

// ── Option lists (typed against the discriminated unions in types.ts) ──────

const THEME_OPTIONS: ReadonlyArray<TweakRadioOption<Theme>> = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

const LAYOUT_OPTIONS: ReadonlyArray<TweakRadioOption<LayoutVariant>> = [
  { value: "split", label: "Split" },
  { value: "focused", label: "Focused" },
  { value: "classic", label: "Classic" },
];

const DENSITY_OPTIONS: ReadonlyArray<TweakRadioOption<Density>> = [
  { value: "compact", label: "Compact" },
  { value: "cozy", label: "Cozy" },
  { value: "comfortable", label: "Comfortable" },
];

const DISPLAY_FONT_OPTIONS: ReadonlyArray<TweakSelectOption<DisplayFont>> = [
  { value: "Fraunces", label: "Fraunces (serif)" },
  { value: "Instrument Serif", label: "Instrument Serif" },
  { value: "Space Grotesk", label: "Space Grotesk" },
  { value: "Inter", label: "Inter" },
];

const BODY_FONT_OPTIONS: ReadonlyArray<TweakSelectOption<BodyFont>> = [
  { value: "Inter", label: "Inter" },
  { value: "Manrope", label: "Manrope" },
  { value: "IBM Plex Sans", label: "IBM Plex Sans" },
];

// ── Panel ───────────────────────────────────────────────────────────────────

/**
 * Floating bottom-right toggle button + slide-out panel for runtime
 * customization. Rendered once at the AppShell level. Persists changes via
 * `useTweaks`, which owns DOM side-effects (body classes, CSS vars).
 */
export function TweaksPanel(): JSX.Element {
  const [open, setOpen] = useState(false);
  const [values, set] = useTweaks();

  if (!open) {
    return (
      <button
        type="button"
        className="twk-toggle-btn __tweaks-toggle"
        aria-label="Open tweaks panel"
        onClick={() => setOpen(true)}
      >
        <Icon name="settings" size={18} />
      </button>
    );
  }

  return (
    <div className="twk-panel __tweaks-panel" role="dialog" aria-label="Tweaks">
      <div className="twk-hd">
        <b>Tweaks</b>
        <button
          type="button"
          className="twk-x"
          aria-label="Close tweaks"
          onClick={() => setOpen(false)}
        >
          ✕
        </button>
      </div>
      <div className="twk-body">
        <TweakSection title="Theme">
          <TweakRadio
            label="Mode"
            value={values.theme}
            options={THEME_OPTIONS}
            onChange={(v) => set("theme", v)}
          />
          <TweakSlider
            label="Accent hue"
            value={values.accentHue}
            min={0}
            max={360}
            step={1}
            onChange={(v) => set("accentHue", v)}
          />
        </TweakSection>
        <TweakSection title="Layout">
          <TweakRadio
            label="Home layout"
            value={values.layoutVariant}
            options={LAYOUT_OPTIONS}
            onChange={(v) => set("layoutVariant", v)}
          />
          <TweakRadio
            label="Density"
            value={values.density}
            options={DENSITY_OPTIONS}
            onChange={(v) => set("density", v)}
          />
        </TweakSection>
        <TweakSection title="Typography">
          <TweakSelect
            label="Display font"
            value={values.displayFont}
            options={DISPLAY_FONT_OPTIONS}
            onChange={(v) => set("displayFont", v)}
          />
          <TweakSelect
            label="Body font"
            value={values.bodyFont}
            options={BODY_FONT_OPTIONS}
            onChange={(v) => set("bodyFont", v)}
          />
        </TweakSection>
      </div>
    </div>
  );
}
