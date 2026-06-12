// Authenticated API client (ScrumAgent-lb9.5).
//
// Thin wrapper over `fetch` that attaches the bearer JWT stashed by the login
// flow (see lib/auth.ts) and surfaces backend errors as `ApiError` so callers
// can show `detail`. Used by the Add Project wizard and the projects list; the
// rest of the app still reads mock data until ScrumAgent-r0k migrates it.

import { API_BASE, clearToken, getToken, redirectToLogin } from "./auth";

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers);
  if (options.body) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const resp = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const text = await resp.text();
  const body: unknown = text ? JSON.parse(text) : null;

  if (!resp.ok) {
    // A 401 means our bearer token is missing/expired/invalid — there's no
    // recovery short of re-authenticating, so drop it and bounce to login
    // rather than letting callers render a dead "Invalid or expired token".
    if (resp.status === 401) {
      clearToken();
      redirectToLogin();
    }
    const detail =
      body && typeof body === "object" && "detail" in body
        ? String((body as Record<string, unknown>).detail)
        : `Request failed (${resp.status})`;
    throw new ApiError(resp.status, detail, body);
  }
  return body as T;
}

// ---- response / payload shapes (mirror backend Pydantic models) ----

export interface DirectoryUser {
  id: number;
  email: string;
  name: string | null;
}

export interface MeResponse {
  id: number;
  email: string;
  name: string | null;
}

export interface GoogleStartResponse {
  authorize_url: string;
  auth_session_id: string;
}

export interface TestResult {
  ok: boolean;
  detail: Record<string, unknown> | null;
  error: string | null;
}

export interface JiraConfigPayload {
  site_url: string;
  user_email: string;
  api_token: string;
  project_key?: string | null;
}

export interface NotionConfigPayload {
  token: string;
  section_url: string;
}

export interface CreateProjectPayload {
  name: string;
  description?: string | null;
  color?: string;
  google_auth_session_id: string;
  jira?: JiraConfigPayload;
  notion?: NotionConfigPayload;
  member_user_ids?: number[];
}

export interface ProjectMemberOut {
  user_id: number;
  email: string;
  name: string | null;
  role: string;
}

export interface CalendarAttendee {
  email: string | null;
  display_name: string | null;
  response_status: string | null;
  organizer: boolean;
}

export interface CalendarMeeting {
  id: string;
  title: string | null;
  /** RFC 3339 dateTime, or YYYY-MM-DD for all-day events. */
  start: string | null;
  end: string | null;
  all_day: boolean;
  organizer_email: string | null;
  attendees: CalendarAttendee[];
  meet_link: string | null;
  html_link: string | null;
  status: string | null;
}

export interface ProjectOut {
  id: string;
  name: string;
  description: string | null;
  color: string;
  agent_email: string;
  google_connected: boolean;
  jira_site_url: string | null;
  jira_user_email: string | null;
  jira_project_key: string | null;
  notion_section_url: string | null;
  notion_page_id: string | null;
  members: ProjectMemberOut[];
  created_at: string;
}

export type ResponseStyle = "concise" | "balanced" | "detailed";

export interface AgentSettings {
  auto_join_meetings: boolean;
  record_audio: boolean;
  capture_screenshots: boolean;
  confidence_threshold: number;
  auto_apply_high_confidence: boolean;
  response_style: ResponseStyle;
  context_window_meetings: number;
}

export interface GoogleIntegrationStatus {
  connected: boolean;
  agent_email: string;
}

export interface JiraIntegrationStatus {
  configured: boolean;
  site_url: string | null;
  user_email: string | null;
  project_key: string | null;
}

export interface NotionIntegrationStatus {
  configured: boolean;
  section_url: string | null;
  page_id: string | null;
}

export interface IntegrationsStatus {
  google: GoogleIntegrationStatus;
  jira: JiraIntegrationStatus;
  notion: NotionIntegrationStatus;
}

export type IntegrationProvider = "google" | "jira" | "notion";

export type UsageKind = "llm" | "stt" | "embed";

export interface BillingCycle {
  /** ISO dates bounding the current calendar-month cycle. */
  start: string;
  end: string;
  days_elapsed: number;
  days_remaining: number;
  mtd_usd: number;
  projected_usd: number;
}

export interface BillingCategoryCost {
  category: string;
  cost_usd: number;
}

export interface BillingModelUsage {
  model: string;
  provider: string;
  kind: UsageKind;
  calls: number;
  /** Millions of tokens for llm/embed, minutes for stt. */
  input_units: number;
  output_units: number;
  cost_usd: number;
  /** Cost per day, oldest first (sparkline). */
  daily_usd: number[];
}

export interface BillingInvocationModel {
  model: string;
  cost_usd: number;
}

export interface BillingInvocation {
  run_id: string;
  context: string | null;
  at: string;
  models: BillingInvocationModel[];
  total_usd: number;
}

export interface Billing {
  cycle: BillingCycle;
  by_category: BillingCategoryCost[];
  by_model: BillingModelUsage[];
  recent: BillingInvocation[];
  invocations_this_cycle: number;
}

export const api = {
  me: () => apiFetch<MeResponse>("/auth/me"),
  listUsers: () => apiFetch<DirectoryUser[]>("/users/directory"),
  startGoogleAuth: () =>
    apiFetch<GoogleStartResponse>("/projects/integrations/google/start", {
      method: "POST",
    }),
  testJira: (p: JiraConfigPayload) =>
    apiFetch<TestResult>("/projects/integrations/jira/test", {
      method: "POST",
      body: JSON.stringify({
        site_url: p.site_url,
        user_email: p.user_email,
        api_token: p.api_token,
      }),
    }),
  testNotion: (token: string) =>
    apiFetch<TestResult>("/projects/integrations/notion/test", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),
  createProject: (p: CreateProjectPayload) =>
    apiFetch<ProjectOut>("/projects", {
      method: "POST",
      body: JSON.stringify(p),
    }),
  listProjects: () => apiFetch<ProjectOut[]>("/projects"),
  listProjectMeetings: (projectId: string) =>
    apiFetch<CalendarMeeting[]>(
      `/projects/${encodeURIComponent(projectId)}/meetings`,
    ),
  getAgentSettings: (projectId: string) =>
    apiFetch<AgentSettings>(
      `/projects/${encodeURIComponent(projectId)}/settings/agent`,
    ),
  putAgentSettings: (projectId: string, settings: AgentSettings) =>
    apiFetch<AgentSettings>(
      `/projects/${encodeURIComponent(projectId)}/settings/agent`,
      { method: "PUT", body: JSON.stringify(settings) },
    ),
  getIntegrations: (projectId: string) =>
    apiFetch<IntegrationsStatus>(
      `/projects/${encodeURIComponent(projectId)}/integrations`,
    ),
  putJiraIntegration: (projectId: string, p: JiraConfigPayload) =>
    apiFetch<IntegrationsStatus>(
      `/projects/${encodeURIComponent(projectId)}/integrations/jira`,
      { method: "PUT", body: JSON.stringify(p) },
    ),
  putNotionIntegration: (projectId: string, p: NotionConfigPayload) =>
    apiFetch<IntegrationsStatus>(
      `/projects/${encodeURIComponent(projectId)}/integrations/notion`,
      { method: "PUT", body: JSON.stringify(p) },
    ),
  reconnectGoogle: (projectId: string, authSessionId: string) =>
    apiFetch<IntegrationsStatus>(
      `/projects/${encodeURIComponent(projectId)}/integrations/google`,
      {
        method: "PUT",
        body: JSON.stringify({ google_auth_session_id: authSessionId }),
      },
    ),
  getBilling: (projectId: string) =>
    apiFetch<Billing>(`/projects/${encodeURIComponent(projectId)}/billing`),
  testStoredIntegration: (projectId: string, provider: IntegrationProvider) =>
    apiFetch<TestResult>(
      `/projects/${encodeURIComponent(projectId)}/integrations/${provider}/test`,
      { method: "POST" },
    ),
};

export { API_BASE };
