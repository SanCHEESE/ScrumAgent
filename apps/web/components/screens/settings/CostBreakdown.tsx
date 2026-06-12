import type { JSX } from "react";
import type { Billing } from "@/lib/api";
import { categoryMeta, cycleLabel, fmtUSD } from "./billing-format";

/**
 * Stacked horizontal bar + legend grid over the cycle's spend categories.
 * Each segment's width is proportional to its cost via flex-grow.
 */
export function CostBreakdown({ billing }: { billing: Billing }): JSX.Element {
  const categories = billing.by_category;
  const total = categories.reduce((sum, c) => sum + c.cost_usd, 0);

  return (
    <div className="billing-section">
      <div className="billing-section-header">
        <div>
          <div className="billing-section-title">
            Cost breakdown · {cycleLabel(billing.cycle.start)}
          </div>
          <div className="muted" style={{ fontSize: 12 }}>
            By service category. Total this cycle: <strong>{fmtUSD(total)}</strong>.
          </div>
        </div>
      </div>

      {total === 0 ? (
        <div className="muted" style={{ fontSize: 13 }}>
          No usage recorded this cycle yet.
        </div>
      ) : (
        <>
          <div className="billing-stacked" role="img" aria-label="Cost breakdown bar">
            {categories.map((c) => {
              const meta = categoryMeta(c.category);
              return (
                <div
                  key={c.category}
                  className="billing-stacked-seg"
                  style={{ flexGrow: c.cost_usd, background: meta.color }}
                  title={`${meta.label}: ${fmtUSD(c.cost_usd)}`}
                />
              );
            })}
          </div>

          <div className="billing-legend">
            {categories.map((c) => {
              const meta = categoryMeta(c.category);
              const pct = ((c.cost_usd / total) * 100).toFixed(0);
              return (
                <div key={c.category} className="billing-legend-item">
                  <span className="dot" style={{ background: meta.color }} />
                  <span className="billing-legend-label">{meta.label}</span>
                  <span className="mono billing-legend-val">{fmtUSD(c.cost_usd)}</span>
                  <span className="mono muted" style={{ fontSize: 11 }}>
                    {pct}%
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
