import type { JSX } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { BILLING_MOCK, fmtUSD } from "./billing-mock";

/**
 * Stacked horizontal bar with 5 segments + legend grid. Each segment's
 * width is proportional to its cost via flex-grow (like the prototype).
 */
export function CostBreakdown(): JSX.Element {
  const { byCategory, cycle } = BILLING_MOCK;
  const total = byCategory.reduce((sum, c) => sum + c.cost, 0);

  return (
    <div className="billing-section">
      <div className="billing-section-header">
        <div>
          <div className="billing-section-title">Cost breakdown · {cycle.label}</div>
          <div className="muted" style={{ fontSize: 12 }}>
            By service category. Total this cycle: <strong>{fmtUSD(total)}</strong>.
          </div>
        </div>
        <Button variant="ghost" size="sm">
          <Icon name="history" size={14} />
          Last 6 cycles
        </Button>
      </div>

      <div className="billing-stacked" role="img" aria-label="Cost breakdown bar">
        {byCategory.map((c) => (
          <div
            key={c.key}
            className="billing-stacked-seg"
            style={{ flexGrow: c.cost, background: c.color }}
            title={`${c.label}: ${fmtUSD(c.cost)}`}
          />
        ))}
      </div>

      <div className="billing-legend">
        {byCategory.map((c) => {
          const pct = ((c.cost / total) * 100).toFixed(0);
          return (
            <div key={c.key} className="billing-legend-item">
              <span className="dot" style={{ background: c.color }} />
              <span className="billing-legend-label">{c.label}</span>
              <span className="mono billing-legend-val">{fmtUSD(c.cost)}</span>
              <span className="mono muted" style={{ fontSize: 11 }}>
                {pct}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
