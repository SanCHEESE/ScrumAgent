"use client";

import type { ChangeEvent, JSX, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Icon, type IconName } from "@/components/ui/Icon";
import {
  API_BASE,
  ApiError,
  api,
  type IntegrationProvider,
  type IntegrationsStatus,
  type ProjectOut,
} from "@/lib/api";

const POPUP_SOURCE = "scrumagent-google-oauth";

// Error codes the backend popup can report back (see routers/projects.py).
const POPUP_ERRORS: Record<string, string> = {
  access_denied: "Authorization was cancelled. Please try again.",
  missing_code: "Authorization was cancelled. Please try again.",
  wrong_domain: "The agent account must be a @municorn.com Google account.",
  no_refresh_token:
    "Google didn't grant offline access. Remove Kabanchik under myaccount.google.com → Security → Third-party access, then retry.",
  exchange_failed: "Google sign-in failed. Please try again.",
};

type TestState =
  | { kind: "idle" }
  | { kind: "testing" }
  | { kind: "ok"; label: string }
  | { kind: "fail"; label: string };

function TestVerdict({ test }: { test: TestState }): JSX.Element | null {
  if (test.kind === "ok") {
    return (
      <span
        className="hstack"
        style={{ color: "var(--ok)", fontSize: 12, fontWeight: 500 }}
        role="status"
      >
        <Icon name="check" size={14} />
        {test.label}
      </span>
    );
  }
  if (test.kind === "fail") {
    return (
      <span
        className="hstack"
        style={{ color: "var(--danger)", fontSize: 12 }}
        role="alert"
      >
        <Icon name="alert" size={14} />
        {test.label}
      </span>
    );
  }
  return null;
}

interface IntegrationCardProps {
  name: string;
  desc: string;
  icon: IconName;
  iconClass: string;
  connected: boolean;
  /** Pills under the description (e.g. site or page ids). */
  pills?: string[];
  /** Mono-spaced detail line (e.g. agent account email). */
  detail?: string;
  test: TestState;
  actions?: ReactNode;
  /** Expanded configure form, rendered under the row. */
  form?: ReactNode;
}

function IntegrationCard({
  name,
  desc,
  icon,
  iconClass,
  connected,
  pills,
  detail,
  test,
  actions,
  form,
}: IntegrationCardProps): JSX.Element {
  return (
    <div className="integration-card-block">
      <div className="integration-row">
        <div className={`settings-integration-icon ${iconClass}`}>
          <Icon name={icon} size={18} />
        </div>
        <div className="integration-meta">
          <div className="integration-name">{name}</div>
          <div className="integration-desc">{desc}</div>
          {detail !== undefined && (
            <div className="integration-detail">
              <span className="mono">{detail}</span>
            </div>
          )}
          {pills !== undefined && pills.length > 0 && (
            <div className="integration-detail">
              {pills.map((p) => (
                <span key={p} className="pill">
                  {p}
                </span>
              ))}
            </div>
          )}
          <TestVerdict test={test} />
        </div>
        <div className="integration-actions">
          {connected ? (
            <Badge variant="paid">
              <Icon name="check" size={10} />
              Connected
            </Badge>
          ) : (
            <Badge variant="neutral">Not connected</Badge>
          )}
          {actions}
        </div>
      </div>
      {form}
    </div>
  );
}

interface JiraFormState {
  site_url: string;
  user_email: string;
  api_token: string;
  project_key: string;
}

interface NotionFormState {
  token: string;
  section_url: string;
}

export function IntegrationsSection(): JSX.Element {
  const [projects, setProjects] = useState<ProjectOut[] | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [status, setStatus] = useState<IntegrationsStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [tests, setTests] = useState<Record<IntegrationProvider, TestState>>({
    google: { kind: "idle" },
    jira: { kind: "idle" },
    notion: { kind: "idle" },
  });

  const [openForm, setOpenForm] = useState<"jira" | "notion" | null>(null);
  const [jiraForm, setJiraForm] = useState<JiraFormState>({
    site_url: "",
    user_email: "",
    api_token: "",
    project_key: "",
  });
  const [notionForm, setNotionForm] = useState<NotionFormState>({
    token: "",
    section_url: "",
  });
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [googleBusy, setGoogleBusy] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);
  // Active reconnect-attempt teardown (message listener + popup poller).
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => () => cleanupRef.current?.(), []);

  // Load the caller's projects once; default to the first one.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const rows = await api.listProjects();
        if (!active) return;
        setProjects(rows);
        setProjectId(rows[0]?.id ?? null);
      } catch (e) {
        if (!active) return;
        if (e instanceof ApiError && e.status === 401) return;
        setError(e instanceof ApiError ? e.message : "Could not load projects.");
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // (Re)load integration status whenever the selected project changes.
  useEffect(() => {
    if (!projectId) return;
    let active = true;
    setStatus(null);
    setError(null);
    setOpenForm(null);
    setFormError(null);
    setGoogleError(null);
    setTests({
      google: { kind: "idle" },
      jira: { kind: "idle" },
      notion: { kind: "idle" },
    });
    (async () => {
      try {
        const loaded = await api.getIntegrations(projectId);
        if (active) setStatus(loaded);
      } catch (e) {
        if (!active) return;
        if (e instanceof ApiError && e.status === 401) return;
        setError(e instanceof ApiError ? e.message : "Could not load integrations.");
      }
    })();
    return () => {
      active = false;
    };
  }, [projectId]);

  const setTest = useCallback(
    (provider: IntegrationProvider, state: TestState) => {
      setTests((prev) => ({ ...prev, [provider]: state }));
    },
    [],
  );

  // Probe the credentials stored on the backend (not the form values).
  const runStoredTest = useCallback(
    async (provider: IntegrationProvider) => {
      if (!projectId) return;
      setTest(provider, { kind: "testing" });
      try {
        const result = await api.testStoredIntegration(projectId, provider);
        setTest(
          provider,
          result.ok
            ? { kind: "ok", label: "Connection works" }
            : { kind: "fail", label: result.error ?? "Connection failed" },
        );
        // A google probe can flip connected (revoked ↔ restored) — refresh.
        if (provider === "google") {
          setStatus(await api.getIntegrations(projectId));
        }
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return;
        setTest(provider, {
          kind: "fail",
          label: e instanceof ApiError ? e.message : "Request failed",
        });
      }
    },
    [projectId, setTest],
  );

  const openConfigure = (target: "jira" | "notion") => {
    setFormError(null);
    if (target === "jira" && status) {
      setJiraForm({
        site_url: status.jira.site_url ?? "",
        user_email: status.jira.user_email ?? "",
        api_token: "",
        project_key: status.jira.project_key ?? "",
      });
    }
    if (target === "notion" && status) {
      setNotionForm({ token: "", section_url: status.notion.section_url ?? "" });
    }
    setOpenForm((prev) => (prev === target ? null : target));
  };

  const saveJira = async () => {
    if (!projectId) return;
    setFormBusy(true);
    setFormError(null);
    try {
      const next = await api.putJiraIntegration(projectId, {
        site_url: jiraForm.site_url,
        user_email: jiraForm.user_email,
        api_token: jiraForm.api_token,
        project_key: jiraForm.project_key || null,
      });
      setStatus(next);
      setOpenForm(null);
      setTest("jira", { kind: "ok", label: "Saved and validated" });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return;
      setFormError(e instanceof ApiError ? e.message : "Could not save.");
    } finally {
      setFormBusy(false);
    }
  };

  const saveNotion = async () => {
    if (!projectId) return;
    setFormBusy(true);
    setFormError(null);
    try {
      const next = await api.putNotionIntegration(projectId, {
        token: notionForm.token,
        section_url: notionForm.section_url,
      });
      setStatus(next);
      setOpenForm(null);
      setTest("notion", { kind: "ok", label: "Saved and validated" });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return;
      setFormError(e instanceof ApiError ? e.message : "Could not save.");
    } finally {
      setFormBusy(false);
    }
  };

  // Same popup handshake as the Add Project wizard (StepGoogle), but the
  // captured grant is immediately attached to the selected project.
  const reconnectGoogle = async () => {
    if (!projectId) return;
    setGoogleBusy(true);
    setGoogleError(null);
    cleanupRef.current?.();
    try {
      const { authorize_url, auth_session_id } = await api.startGoogleAuth();
      const popup = window.open(authorize_url, POPUP_SOURCE, "width=520,height=680");
      const backendOrigin = new URL(API_BASE).origin;
      let settled = false;

      const cleanup = () => {
        window.removeEventListener("message", handler);
        window.clearInterval(poll);
        cleanupRef.current = null;
      };

      const handler = (event: MessageEvent) => {
        if (event.origin !== backendOrigin) return;
        const msg = event.data as {
          source?: string;
          ok?: boolean;
          authSessionId?: string;
          error?: string;
        };
        if (!msg || msg.source !== POPUP_SOURCE) return;
        settled = true;
        cleanup();
        if (msg.ok && msg.authSessionId === auth_session_id) {
          api
            .reconnectGoogle(projectId, auth_session_id)
            .then((next) => {
              setStatus(next);
              setTest("google", { kind: "ok", label: "Reconnected" });
            })
            .catch((e: unknown) => {
              if (e instanceof ApiError && e.status === 401) return;
              setGoogleError(
                e instanceof ApiError ? e.message : "Could not save the grant.",
              );
            })
            .finally(() => setGoogleBusy(false));
        } else {
          setGoogleBusy(false);
          setGoogleError(
            (msg.error && POPUP_ERRORS[msg.error]) ??
              "Authorization was cancelled. Please try again.",
          );
        }
      };
      window.addEventListener("message", handler);

      const poll = window.setInterval(() => {
        if (!popup || !popup.closed) return;
        // Give a just-posted result message a beat to arrive before failing.
        window.setTimeout(() => {
          if (settled) return;
          cleanup();
          setGoogleBusy(false);
          setGoogleError("The popup was closed before authorization completed.");
        }, 400);
        window.clearInterval(poll);
      }, 500);
      cleanupRef.current = cleanup;

      if (!popup) {
        cleanup();
        setGoogleBusy(false);
        setGoogleError("Popup was blocked — allow popups for this site and retry.");
      }
    } catch (e) {
      setGoogleBusy(false);
      setGoogleError(
        e instanceof ApiError ? e.message : "Could not start authorization.",
      );
    }
  };

  if (error) {
    return (
      <div className="project-error" role="alert">
        <Icon name="alert" size={12} />
        {error}
      </div>
    );
  }
  if (projects === null) {
    return <div className="muted">Loading projects…</div>;
  }
  if (projects.length === 0) {
    return (
      <div className="muted">
        No projects yet — create a project to connect its integrations.
      </div>
    );
  }

  const canTestJiraForm =
    jiraForm.site_url.trim() !== "" &&
    jiraForm.user_email.trim() !== "" &&
    jiraForm.api_token.trim() !== "";
  const canSaveNotion =
    notionForm.token.trim() !== "" && notionForm.section_url.trim() !== "";

  const jiraFormNode = openForm === "jira" && (
    <div className="vstack integration-form">
      <div>
        <label className="label" htmlFor="int-jira-url">
          Atlassian site URL
        </label>
        <input
          id="int-jira-url"
          className="input"
          placeholder="https://municorn.atlassian.net"
          value={jiraForm.site_url}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            setJiraForm({ ...jiraForm, site_url: e.target.value })
          }
        />
      </div>
      <div>
        <label className="label" htmlFor="int-jira-email">
          Atlassian account email
        </label>
        <input
          id="int-jira-email"
          className="input"
          type="email"
          placeholder="agent@municorn.com"
          value={jiraForm.user_email}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            setJiraForm({ ...jiraForm, user_email: e.target.value })
          }
        />
      </div>
      <div>
        <label className="label" htmlFor="int-jira-token">
          API token
        </label>
        <input
          id="int-jira-token"
          className="input"
          type="password"
          placeholder="Paste a working Atlassian API token"
          value={jiraForm.api_token}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            setJiraForm({ ...jiraForm, api_token: e.target.value })
          }
        />
      </div>
      <div>
        <label className="label" htmlFor="int-jira-key">
          Default project key
        </label>
        <input
          id="int-jira-key"
          className="input"
          placeholder="PLAT"
          value={jiraForm.project_key}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            setJiraForm({ ...jiraForm, project_key: e.target.value.toUpperCase() })
          }
        />
      </div>
      {formError && (
        <div className="project-error" role="alert">
          <Icon name="alert" size={12} />
          {formError}
        </div>
      )}
      <div className="hstack" style={{ gap: 12 }}>
        <Button
          variant="primary"
          size="sm"
          onClick={saveJira}
          disabled={!canTestJiraForm || formBusy}
        >
          {formBusy ? "Validating…" : "Validate & save"}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setOpenForm(null)}>
          Cancel
        </Button>
      </div>
    </div>
  );

  const notionFormNode = openForm === "notion" && (
    <div className="vstack integration-form">
      <div>
        <label className="label" htmlFor="int-notion-token">
          Internal integration token
        </label>
        <input
          id="int-notion-token"
          className="input"
          type="password"
          placeholder="ntn_…"
          value={notionForm.token}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            setNotionForm({ ...notionForm, token: e.target.value })
          }
        />
      </div>
      <div>
        <label className="label" htmlFor="int-notion-url">
          Section URL
        </label>
        <input
          id="int-notion-url"
          className="input"
          placeholder="https://www.notion.so/municorn/Sprint-Notes-…"
          value={notionForm.section_url}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            setNotionForm({ ...notionForm, section_url: e.target.value })
          }
        />
      </div>
      {formError && (
        <div className="project-error" role="alert">
          <Icon name="alert" size={12} />
          {formError}
        </div>
      )}
      <div className="hstack" style={{ gap: 12 }}>
        <Button
          variant="primary"
          size="sm"
          onClick={saveNotion}
          disabled={!canSaveNotion || formBusy}
        >
          {formBusy ? "Validating…" : "Validate & save"}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setOpenForm(null)}>
          Cancel
        </Button>
      </div>
    </div>
  );

  return (
    <div className="vstack" style={{ gap: 0 }}>
      <div className="setting-group">
        <h2 className="setting-group-title">Connected services</h2>
        <p className="setting-group-sub">
          The agent reads from and writes to these on your behalf. Tokens are stored
          encrypted and scoped to the project.
        </p>

        <div className="integration-row">
          <div className="integration-meta">
            <div className="integration-name">Project</div>
            <div className="integration-desc">
              Integrations are connected per project.
            </div>
          </div>
          <select
            className="select"
            style={{ width: 220 }}
            value={projectId ?? ""}
            onChange={(e: ChangeEvent<HTMLSelectElement>) =>
              setProjectId(e.target.value)
            }
            aria-label="Project"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {status === null ? (
          <div className="muted" style={{ padding: "16px 0" }}>
            Loading integrations…
          </div>
        ) : (
          <>
            <IntegrationCard
              name="Google Workspace"
              desc="Provides the dedicated agent account that joins Google Meet calls."
              icon="google"
              iconClass="google"
              connected={status.google.connected}
              detail={status.google.agent_email}
              test={tests.google}
              actions={
                <>
                  {status.google.connected && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => runStoredTest("google")}
                      disabled={tests.google.kind === "testing"}
                    >
                      {tests.google.kind === "testing" ? "Testing…" : "Test"}
                    </Button>
                  )}
                  <Button
                    variant={status.google.connected ? "ghost" : "primary"}
                    size="sm"
                    onClick={reconnectGoogle}
                    disabled={googleBusy}
                  >
                    {googleBusy
                      ? "Waiting…"
                      : status.google.connected
                        ? "Reconnect"
                        : "Connect"}
                  </Button>
                </>
              }
              form={
                googleError ? (
                  <div className="project-error" role="alert">
                    <Icon name="alert" size={12} />
                    {googleError}
                  </div>
                ) : undefined
              }
            />

            <IntegrationCard
              name="Jira (Atlassian)"
              desc="Read and update issues, manage sprints."
              icon="jira"
              iconClass="jira"
              connected={status.jira.configured}
              pills={
                status.jira.configured
                  ? [
                      status.jira.site_url ?? "",
                      ...(status.jira.project_key
                        ? [`Project · ${status.jira.project_key}`]
                        : []),
                    ].filter(Boolean)
                  : undefined
              }
              test={tests.jira}
              actions={
                <>
                  {status.jira.configured && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => runStoredTest("jira")}
                      disabled={tests.jira.kind === "testing"}
                    >
                      {tests.jira.kind === "testing" ? "Testing…" : "Test"}
                    </Button>
                  )}
                  <Button
                    variant={status.jira.configured ? "ghost" : "primary"}
                    size="sm"
                    onClick={() => openConfigure("jira")}
                  >
                    {status.jira.configured ? "Configure" : "Connect"}
                  </Button>
                </>
              }
              form={jiraFormNode || undefined}
            />

            <IntegrationCard
              name="Notion"
              desc="Create and update documentation pages."
              icon="notion"
              iconClass="notion"
              connected={status.notion.configured}
              pills={
                status.notion.configured && status.notion.section_url
                  ? [status.notion.section_url]
                  : undefined
              }
              test={tests.notion}
              actions={
                <>
                  {status.notion.configured && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => runStoredTest("notion")}
                      disabled={tests.notion.kind === "testing"}
                    >
                      {tests.notion.kind === "testing" ? "Testing…" : "Test"}
                    </Button>
                  )}
                  <Button
                    variant={status.notion.configured ? "ghost" : "primary"}
                    size="sm"
                    onClick={() => openConfigure("notion")}
                  >
                    {status.notion.configured ? "Configure" : "Connect"}
                  </Button>
                </>
              }
              form={notionFormNode || undefined}
            />
          </>
        )}
      </div>

      <div className="setting-group">
        <p className="setting-group-sub">
          Slack and other integrations are not available yet. The OpenAI key that
          powers the agent is managed server-side by your administrator.
        </p>
      </div>
    </div>
  );
}
