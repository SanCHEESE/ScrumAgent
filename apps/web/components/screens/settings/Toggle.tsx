"use client";

import type { JSX } from "react";

export interface ToggleProps {
  on: boolean;
  onChange: (next: boolean) => void;
  ariaLabel?: string;
}

/**
 * Pill-shaped toggle, matching `.toggle / .toggle.on / .toggle-knob`
 * from the kabanchik prototype CSS.
 */
export function Toggle({ on, onChange, ariaLabel }: ToggleProps): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel}
      className={`toggle ${on ? "on" : ""}`.trim()}
      onClick={() => onChange(!on)}
    >
      <span className="toggle-knob" />
    </button>
  );
}
