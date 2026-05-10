// Billing mock data for the Settings → Billing section.
// Shape derived from BILLING_DATA in
// .worktrees/_design-bundle/project/screens-projects-settings.jsx,
// extended for the prompt requirements (5 cost categories, 4 keys,
// per-model usage with sparklines, recent invocation rows).

export interface BillingCycle {
  label: string;
  /** Spend so far this cycle, in USD. */
  mtd: number;
  /** Projected total spend for the cycle, in USD. */
  projected: number;
  /** Configured budget for the cycle, in USD. */
  budget: number;
  /** Human-readable date range. */
  range: string;
  /** Days remaining in the cycle. */
  daysRemaining: number;
  /** Next invoice date, e.g. "Apr 1, 2026". */
  nextInvoice: string;
}

export interface BillingPlan {
  name: string;
  description: string;
}

export type BillingCategoryKey =
  | "orchestrator"
  | "subagents"
  | "whisper"
  | "embeddings"
  | "storage";

export interface BillingCategory {
  key: BillingCategoryKey;
  label: string;
  cost: number;
  color: string;
}

export type ApiKeyStatus = "active" | "inactive";

export interface ApiKey {
  id: string;
  provider: "OpenAI" | "Anthropic";
  label: string;
  /** Already-masked key, e.g. "sk-ant-•••8d1". */
  mask: string;
  status: ApiKeyStatus;
  used: number;
  cap: number;
  /** Human-readable rotation timestamp. */
  rotated: string;
  /** Free-text scope, e.g. "Orchestrator + Subagents". */
  scope: string;
}

export type ModelKind = "LLM" | "STT" | "Embed";

export interface ModelUsage {
  name: string;
  provider: "Anthropic" | "OpenAI";
  kind: ModelKind;
  unit: string;
  inUnits: number;
  outUnits: number;
  /** Input rate in USD per `unit`. */
  inRate: number;
  /** Output rate in USD per `unit` (0 if N/A). */
  outRate: number;
  cost: number;
  calls: number;
  spark: number[];
}

export interface InvocationModel {
  name: string;
  cost: number;
}

export interface Invocation {
  id: string;
  /** Human-readable timestamp ("12 min ago", "Yesterday"). */
  when: string;
  meeting: string;
  models: InvocationModel[];
  total: number;
}

export interface BillingMock {
  cycle: BillingCycle;
  plan: BillingPlan;
  byCategory: BillingCategory[];
  apiKeys: ApiKey[];
  models: ModelUsage[];
  recent: Invocation[];
}

export const BILLING_MOCK: BillingMock = {
  cycle: {
    label: "March 2026",
    mtd: 847.42,
    projected: 1284.1,
    budget: 1500.0,
    range: "Mar 1 - Mar 26",
    daysRemaining: 6,
    nextInvoice: "Apr 1, 2026",
  },
  plan: {
    name: "Bring-your-own-keys",
    description: "Pay providers directly. We charge a flat platform fee.",
  },
  byCategory: [
    { key: "orchestrator", label: "Orchestrator LLM", cost: 322.0, color: "#0077e6" },
    { key: "subagents", label: "Subagents LLM", cost: 203.0, color: "#5aa7ff" },
    { key: "whisper", label: "Whisper STT", cost: 187.0, color: "#f59e0b" },
    { key: "embeddings", label: "Embeddings", cost: 93.0, color: "#10b981" },
    { key: "storage", label: "Storage & retrieval", cost: 42.0, color: "#8b5cf6" },
  ],
  apiKeys: [
    {
      id: "k1",
      provider: "OpenAI",
      label: "OpenAI · Orchestrator + Subagents",
      mask: "sk-...•••3f2",
      status: "active",
      used: 525,
      cap: 1000,
      rotated: "2 days ago",
      scope: "Orchestrator + Subagents",
    },
    {
      id: "k2",
      provider: "Anthropic",
      label: "Anthropic · Standby (failover)",
      mask: "sk-ant-•••8d1",
      status: "active",
      used: 0,
      cap: 500,
      rotated: "1 month ago",
      scope: "Standby (failover)",
    },
    {
      id: "k3",
      provider: "OpenAI",
      label: "OpenAI · Whisper-only",
      mask: "sk-...•••e8a",
      status: "active",
      used: 187,
      cap: 400,
      rotated: "12 days ago",
      scope: "Whisper large-v3",
    },
    {
      id: "k4",
      provider: "OpenAI",
      label: "OpenAI · Embeddings-only",
      mask: "sk-...•••9c4",
      status: "active",
      used: 93,
      cap: 200,
      rotated: "12 days ago",
      scope: "text-embedding-3-large",
    },
  ],
  models: [
    {
      name: "claude-sonnet-4-6",
      provider: "Anthropic",
      kind: "LLM",
      unit: "1M tok",
      inUnits: 4.2,
      outUnits: 0.83,
      inRate: 3.0,
      outRate: 15.0,
      cost: 324.5,
      calls: 1284,
      spark: [4, 6, 5, 7, 9, 8, 11, 10, 12, 11],
    },
    {
      name: "claude-haiku-4-5",
      provider: "Anthropic",
      kind: "LLM",
      unit: "1M tok",
      inUnits: 12.1,
      outUnits: 1.2,
      inRate: 0.8,
      outRate: 4.0,
      cost: 114.2,
      calls: 8432,
      spark: [12, 14, 11, 18, 15, 19, 22, 24, 21, 26],
    },
    {
      name: "whisper-large-v3",
      provider: "OpenAI",
      kind: "STT",
      unit: "min",
      inUnits: 1847,
      outUnits: 0,
      inRate: 0.1,
      outRate: 0,
      cost: 184.7,
      calls: 142,
      spark: [3, 4, 3, 5, 7, 6, 8, 7, 9, 8],
    },
    {
      name: "text-embedding-3-large",
      provider: "OpenAI",
      kind: "Embed",
      unit: "1M tok",
      inUnits: 18.4,
      outUnits: 0,
      inRate: 0.13,
      outRate: 0,
      cost: 93.4,
      calls: 24832,
      spark: [8, 9, 7, 10, 12, 11, 13, 12, 14, 12],
    },
  ],
  recent: [
    {
      id: "inv-8742",
      when: "12 min ago",
      meeting: "Daily Standup · 2026-03-26",
      models: [
        { name: "sonnet", cost: 0.42 },
        { name: "whisper", cost: 0.08 },
      ],
      total: 0.5,
    },
    {
      id: "inv-8741",
      when: "1h 04m ago",
      meeting: "PR review sync",
      models: [
        { name: "sonnet", cost: 0.31 },
        { name: "haiku", cost: 0.08 },
        { name: "whisper", cost: 0.93 },
      ],
      total: 1.32,
    },
    {
      id: "inv-8740",
      when: "3h 12m ago",
      meeting: "Architecture Review",
      models: [
        { name: "sonnet", cost: 1.14 },
        { name: "haiku", cost: 0.21 },
        { name: "whisper", cost: 3.6 },
        { name: "embed", cost: 0.42 },
      ],
      total: 5.37,
    },
    {
      id: "inv-8739",
      when: "Yesterday",
      meeting: "Sprint Planning",
      models: [
        { name: "sonnet", cost: 0.87 },
        { name: "haiku", cost: 0.14 },
        { name: "whisper", cost: 2.4 },
      ],
      total: 3.41,
    },
    {
      id: "inv-8738",
      when: "Yesterday",
      meeting: "Backlog Grooming",
      models: [
        { name: "sonnet", cost: 0.42 },
        { name: "whisper", cost: 1.2 },
      ],
      total: 1.62,
    },
    {
      id: "inv-8737",
      when: "2 days ago",
      meeting: "Retrospective",
      models: [
        { name: "sonnet", cost: 0.71 },
        { name: "haiku", cost: 0.18 },
        { name: "whisper", cost: 1.85 },
        { name: "embed", cost: 0.21 },
      ],
      total: 2.95,
    },
  ],
};

/** Format a USD amount with two decimals. */
export function fmtUSD(n: number): string {
  return (
    "$" +
    n.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}
