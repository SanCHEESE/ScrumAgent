import type { JSX } from "react";
import { Button } from "@/components/ui/Button";
import { BILLING_MOCK, fmtUSD } from "./billing-mock";

/**
 * 3-card summary row: cycle spend (with budget bar), plan, next invoice.
 */
export function BillingSummary(): JSX.Element {
  const { cycle, plan } = BILLING_MOCK;
  const budgetPct = Math.min(100, (cycle.mtd / cycle.budget) * 100);
  const projectedPct = Math.min(100, (cycle.projected / cycle.budget) * 100);

  return (
    <div className="billing-summary">
      <div className="billing-card billing-card-hero">
        <div className="billing-card-label">This cycle · {cycle.label}</div>
        <div className="billing-card-value">{fmtUSD(cycle.mtd)}</div>
        <div className="billing-card-sub muted">
          <span className="mono">{cycle.range}</span> · projected{" "}
          <strong>{fmtUSD(cycle.projected)}</strong> · budget {fmtUSD(cycle.budget)}
        </div>
        <div className="billing-budget-bar" aria-hidden>
          <div
            className="billing-budget-projected"
            style={{ width: `${projectedPct}%` }}
          />
          <div className="billing-budget-mtd" style={{ width: `${budgetPct}%` }} />
        </div>
        <div className="billing-budget-legend mono muted">
          <span>
            <span className="dot dot-mtd" /> Spent {budgetPct.toFixed(0)}%
          </span>
          <span>
            <span className="dot dot-projected" /> Projected {projectedPct.toFixed(0)}%
          </span>
          <span className="spacer" />
          <span>{cycle.daysRemaining} days remaining</span>
        </div>
      </div>

      <div className="billing-card">
        <div className="billing-card-label">Plan</div>
        <div className="billing-card-value-sm">{plan.name}</div>
        <div className="billing-card-sub muted">{plan.description}</div>
        <div className="hstack" style={{ marginTop: 10 }}>
          <Button variant="ghost" size="sm">
            Manage
          </Button>
          <Button variant="ghost" size="sm">
            Compare plans
          </Button>
        </div>
      </div>

      <div className="billing-card">
        <div className="billing-card-label">Next invoice</div>
        <div className="billing-card-value-sm">{cycle.nextInvoice}</div>
        <div className="billing-card-sub muted">Auto-pay enabled · **** 4242</div>
        <div className="hstack" style={{ marginTop: 10 }}>
          <Button variant="ghost" size="sm">
            View history
          </Button>
        </div>
      </div>
    </div>
  );
}
