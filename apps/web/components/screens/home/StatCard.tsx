import type { JSX, ReactNode } from "react";

export type StatCardColor = "brand";

export interface StatCardProps {
  label: ReactNode;
  value: ReactNode;
  /** Optional delta string, e.g. "+3". Renders the "vs last week" suffix. */
  trend?: string;
  /** Inverted style for the "Pending your review" emphasis card. */
  highlight?: boolean;
  /** "brand" applies the brand gradient (used for the leading meetings stat). */
  color?: StatCardColor;
}

/**
 * Single metric card used in the Home dashboard `.stat-row`.
 * Mirrors the prototype StatCard exactly — modifiers stack via class names.
 */
export function StatCard({
  label,
  value,
  trend,
  highlight = false,
  color,
}: StatCardProps): JSX.Element {
  const classes = [
    "stat-card",
    highlight ? "highlight" : "",
    color === "brand" ? "brand" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {trend ? <div className="stat-trend">{trend} vs last week</div> : null}
    </div>
  );
}
