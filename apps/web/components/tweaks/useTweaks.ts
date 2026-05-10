"use client";

import { useCallback, useEffect, useState } from "react";
import {
  LAYOUT_VARIANT_LEGACY_KEY,
  TWEAK_DEFAULTS,
  TWEAKS_CHANGED_EVENT,
  TWEAKS_STORAGE_KEY,
  type TweakValues,
} from "./types";

type TweakKey = keyof TweakValues;

/**
 * Reads the persisted tweak values from localStorage, merging over defaults.
 * Safe to call during SSR — returns defaults if `window` is undefined or the
 * stored payload is malformed.
 */
function readStoredTweaks(): TweakValues {
  if (typeof window === "undefined") return TWEAK_DEFAULTS;
  try {
    const raw = window.localStorage.getItem(TWEAKS_STORAGE_KEY);
    if (!raw) return TWEAK_DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<TweakValues>;
    return { ...TWEAK_DEFAULTS, ...parsed };
  } catch {
    return TWEAK_DEFAULTS;
  }
}

/**
 * Persists the tweak values to localStorage and the legacy mirror, then
 * notifies same-tab listeners via a custom event. (Native `storage` events
 * only fire in *other* tabs.)
 */
function writeStoredTweaks(values: TweakValues): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TWEAKS_STORAGE_KEY, JSON.stringify(values));
    window.localStorage.setItem(LAYOUT_VARIANT_LEGACY_KEY, values.layoutVariant);
  } catch {
    // localStorage may be unavailable (private mode, quota); fail silently.
  }
  window.dispatchEvent(
    new CustomEvent(TWEAKS_CHANGED_EVENT, { detail: values }),
  );
}

/** Replaces theme/density classes on `<body>` while preserving any others. */
function applyBodyClasses(theme: TweakValues["theme"], density: TweakValues["density"]): void {
  if (typeof document === "undefined") return;
  const body = document.body;
  const preserved = Array.from(body.classList).filter(
    (c) => !c.startsWith("density-") && c !== "dark" && c !== "light",
  );
  const next = [...preserved, `density-${density}`];
  if (theme === "dark") next.push("dark");
  body.className = next.join(" ").trim();
}

/** Writes `--brand-*` CSS vars derived from the accent hue. */
function applyAccentHue(hue: number): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.style.setProperty("--brand-500", `oklch(0.58 0.17 ${hue})`);
  root.style.setProperty("--brand-600", `oklch(0.48 0.17 ${hue})`);
  root.style.setProperty("--brand-100", `oklch(0.92 0.05 ${hue})`);
}

/** Writes the `--font-display` and `--font-sans` CSS vars. */
function applyFonts(displayFont: string, bodyFont: string): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.style.setProperty("--font-display", `'${displayFont}', 'Inter', serif`);
  root.style.setProperty("--font-sans", `'${bodyFont}', -apple-system, sans-serif`);
}

/**
 * Applies all tweak side effects to the DOM. Idempotent — safe to call on
 * every change.
 */
export function applyTweaks(values: TweakValues): void {
  applyBodyClasses(values.theme, values.density);
  applyAccentHue(values.accentHue);
  applyFonts(values.displayFont, values.bodyFont);
}

export type SetTweak = <K extends TweakKey>(key: K, value: TweakValues[K]) => void;

/**
 * Single source of truth for tweak values.
 *
 * - On mount, hydrates from localStorage and applies all DOM side effects.
 * - On every change, persists to localStorage AND dispatches the same-tab
 *   `tweaks-changed` custom event. The legacy `tweaks.layoutVariant` plain
 *   string is kept in sync so older consumers keep working.
 * - Subscribes to `storage` (other tabs) and `tweaks-changed` (same tab) so
 *   multiple `useTweaks` callers stay in sync within a single page.
 */
export function useTweaks(): [TweakValues, SetTweak] {
  // Initial state always renders defaults on the server; the hydration effect
  // below replaces it with the stored values on the client.
  const [values, setValues] = useState<TweakValues>(TWEAK_DEFAULTS);

  // Hydrate from localStorage and apply DOM side effects on mount.
  useEffect(() => {
    const stored = readStoredTweaks();
    setValues(stored);
    applyTweaks(stored);
  }, []);

  // Cross-tab + same-tab sync: when something else writes to localStorage or
  // dispatches our custom event, refresh local state and reapply DOM effects.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== TWEAKS_STORAGE_KEY) return;
      const next = readStoredTweaks();
      setValues(next);
      applyTweaks(next);
    };
    const onTweakChange = (e: Event) => {
      const detail = (e as CustomEvent<TweakValues>).detail;
      if (!detail) return;
      setValues(detail);
      applyTweaks(detail);
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(TWEAKS_CHANGED_EVENT, onTweakChange);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(TWEAKS_CHANGED_EVENT, onTweakChange);
    };
  }, []);

  const set = useCallback<SetTweak>((key, value) => {
    setValues((prev) => {
      const next = { ...prev, [key]: value };
      writeStoredTweaks(next);
      applyTweaks(next);
      return next;
    });
  }, []);

  return [values, set];
}
