import type { JSX } from "react";

export interface SparklineProps {
  data: number[];
  /** Stroke colour. Accepts CSS variables. */
  color?: string;
  width?: number;
  height?: number;
}

/**
 * Tiny inline SVG line chart.
 *
 * The viewBox is fixed at 100×100 with `preserveAspectRatio="none"` so the
 * polyline scales smoothly to the rendered `width`/`height`. Points are
 * normalised against the largest value so the trend line always fills the
 * vertical space.
 */
export function Sparkline({
  data,
  color = "var(--brand-500)",
  width = 60,
  height = 20,
}: SparklineProps): JSX.Element {
  if (data.length === 0) {
    return <svg width={width} height={height} className="sparkline" aria-hidden />;
  }

  const max = Math.max(...data, 1);
  const denominator = data.length > 1 ? data.length - 1 : 1;
  const points = data
    .map((v, i) => {
      const x = (i / denominator) * 100;
      const y = 100 - (v / max) * 100;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="sparkline"
      aria-hidden
    >
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
