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
};

export { API_BASE };
