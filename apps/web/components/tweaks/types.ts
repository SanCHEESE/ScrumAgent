// Tweak value types
//
// The Tweaks panel persists a single JSON object under
// localStorage["kabanchik.tweaks"]. The Home screen also reads
// `tweaks.layoutVariant` as a separate plain-string mirror — both keys are
// kept in sync by `useTweaks` so consumers don't need to coordinate.

export type Theme = "light" | "dark";
export type Density = "compact" | "cozy" | "comfortable";
export type LayoutVariant = "split" | "focused" | "classic";
export type DisplayFont = "Inter" | "Fraunces" | "Instrument Serif" | "Space Grotesk";
export type BodyFont = "Inter" | "Manrope" | "IBM Plex Sans";

export interface TweakValues {
  theme: Theme;
  density: Density;
  layoutVariant: LayoutVariant;
  /** 0–360, default 215 (royal blue). */
  accentHue: number;
  displayFont: DisplayFont;
  bodyFont: BodyFont;
}

export const TWEAK_DEFAULTS: TweakValues = {
  theme: "light",
  density: "cozy",
  layoutVariant: "split",
  accentHue: 215,
  displayFont: "Inter",
  bodyFont: "Inter",
};

/** localStorage key for the JSON-serialized TweakValues object. */
export const TWEAKS_STORAGE_KEY = "kabanchik.tweaks";

/**
 * Plain-string mirror of `layoutVariant` for backward compatibility with the
 * Home screen, which reads `localStorage.getItem("tweaks.layoutVariant")`.
 */
export const LAYOUT_VARIANT_LEGACY_KEY = "tweaks.layoutVariant";

/**
 * Custom event dispatched on `window` when tweaks change in the same tab,
 * since native `storage` events only fire across tabs.
 */
export const TWEAKS_CHANGED_EVENT = "tweaks-changed";
