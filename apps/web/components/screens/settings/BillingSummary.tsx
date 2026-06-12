import type { JSX } from "react";
import type { Billing } from "@/lib/api";
import { cycleLabel, cycleRange, fmtUSD } from "./billing-format";

/**
 * 3-card summary row: cycle spend (with projection bar), plan, activity.
 */
export function BillingSummary({ billing }: { billing: Billing }): JSX.Element {
  const { cycle } = billing;
  // Spent as a share of the projected cycle total (the only real ceiling we
  // have — no budget is configured anywhere yet).
  const spentPct =
    cycle.projected_usd > 0
      ? Math.min(100, (cycle.mtd_usd / cycle.projected_usd) * 100)
      : 0;

  return (
    <div className="billing-summary">
      <div className="billing-card billing-card-hero">
        <div className="billing-card-label">
          This cycle · {cycleLabel(cycle.start)}
        </div>
        <div className="billing-card-value">{fmtUSD(cycle.mtd_usd)}</div>
        <div className="billing-card-sub muted">
          <span className="mono">{cycleRange(cycle.start, cycle.end)}</span> ·
          projected <strong>{fmtUSD(cycle.projected_usd)}</strong>
        </div>
        <div className="billing-budget-bar" aria-hidden>
          <div className="billing-budget-projected" style={{ width: "100%" }} />
          <div className="billing-budget-mtd" style={{ width: `${spentPct}%` }} />
        </div>
        <div className="billing-budget-legend mono muted">
          <span>
            <span className="dot dot-mtd" /> Spent {spentPct.toFixed(0)}% of
            projected
          </span>
          <span className="spacer" />
          <span>{cycle.days_remaining} days remaining</span>
        </div>
      </div>

      <div className="billing-card">
        <div className="billing-card-label">Plan</div>
        <div className="billing-card-value-sm">Bring-your-own-key</div>
        <div className="billing-card-sub muted">
          The platform calls OpenAI with its own key — you pay the provider
          directly, with no markup.
        </div>
      </div>

      <div className="billing-card">
        <div className="billing-card-label">Activity this cycle</div>
        <div className="billing-card-value-sm">
          {billing.invocations_this_cycle} invocation
          {billing.invocations_this_cycle === 1 ? "" : "s"}
        </div>
        <div className="billing-card-sub muted">
          Across {billing.by_model.length} model
          {billing.by_model.length === 1 ? "" : "s"} · costs attributed per
          agent run.
        </div>
      </div>
    </div>
  );
}
