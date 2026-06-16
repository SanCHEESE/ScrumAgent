// Shared types for the Add Project wizard.

import type { ProjectRole } from "@/lib/api";

/** Suggested default for the agent's Google Workspace account. */
export const DEFAULT_AGENT_EMAIL = "telecom.scrum.agent@municorn.com";

export interface WizardFormData {
  // Step 1 — Details
  name: string;
  description: string;
  color: string;
  // Step 2 — Google Workspace (agent account, authorized via OAuth popup)
  agentEmail: string;
  /** Set once the agent account has been authorized (one-shot session handle). */
  googleAuthSessionId: string | null;
  /** The account that actually consented (returned by the popup). */
  googleAccountEmail: string | null;
  // Step 3 — Jira (optional)
  jiraSiteUrl: string;
  jiraUserEmail: string;
  jiraApiToken: string;
  jiraProjectKey: string;
  // Step 4 — Notion (optional)
  notionToken: string;
  notionSectionUrl: string;
  // Step 5 — Select team members
  selectedUserIds: number[];
  selectedMemberRoles: Record<number, ProjectRole>;
}

export const COLOR_SWATCHES: readonly string[] = [
  "#0077e6",
  "#10b981",
  "#f59e0b",
  "#8b5cf6",
];

export const INITIAL_FORM: WizardFormData = {
  name: "",
  description: "",
  color: COLOR_SWATCHES[0] ?? "#0077e6",
  agentEmail: DEFAULT_AGENT_EMAIL,
  googleAuthSessionId: null,
  googleAccountEmail: null,
  jiraSiteUrl: "",
  jiraUserEmail: "",
  jiraApiToken: "",
  jiraProjectKey: "PLAT",
  notionToken: "",
  notionSectionUrl: "",
  selectedUserIds: [],
  selectedMemberRoles: {},
};
