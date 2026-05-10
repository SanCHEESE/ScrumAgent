import type { JSX } from "react";
import { ApiKeysTable } from "./ApiKeysTable";
import { BillingSummary } from "./BillingSummary";
import { CostBreakdown } from "./CostBreakdown";
import { RecentInvocations } from "./RecentInvocations";
import { UsageByModel } from "./UsageByModel";

/**
 * Billing — full page composed of:
 *   1. Summary cards (cycle / plan / next invoice)
 *   2. Cost breakdown stacked bar
 *   3. API keys
 *   4. Usage by model
 *   5. Recent invocations
 */
export function BillingSection(): JSX.Element {
  return (
    <div className="vstack" style={{ gap: 20, paddingBlock: 20 }}>
      <BillingSummary />
      <CostBreakdown />
      <ApiKeysTable />
      <UsageByModel />
      <RecentInvocations />
    </div>
  );
}
