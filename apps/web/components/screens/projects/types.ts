// Shared types for the Add Project wizard.

export type InviteRole = "Member" | "Admin";

export interface Invite {
  email: string;
  role: InviteRole;
}

export interface WizardFormData {
  // Step 1
  name: string;
  description: string;
  color: string;
  // Step 2
  googleConnected: boolean;
  // Step 3
  jiraUrl: string;
  jiraProjectKey: string;
  jiraConnected: boolean;
  // Step 4
  notionWorkspaceUrl: string;
  notionDb: string;
  notionConnected: boolean;
  // Step 5
  invites: Invite[];
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
  googleConnected: false,
  jiraUrl: "",
  jiraProjectKey: "PLAT",
  jiraConnected: false,
  notionWorkspaceUrl: "",
  notionDb: "",
  notionConnected: false,
  invites: [{ email: "", role: "Member" }],
};

/** Slugify a project name into a Google account handle. */
export function slugify(name: string): string {
  const trimmed = name.trim().toLowerCase();
  if (!trimmed) return "team";
  return (
    trimmed
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "team"
  );
}
