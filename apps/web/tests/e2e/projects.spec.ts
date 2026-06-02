import { expect, test, type BrowserContext } from "@playwright/test";
import { clearStorage } from "./_setup";

const AGENT_EMAIL = "telecom.scrum.agent@municorn.com";
const API = "http://localhost:8000";

const PROJECT_FIXTURE = {
  id: "p-e2e",
  name: "E2E Test Squad",
  description: null,
  color: "#0077e6",
  agent_email: AGENT_EMAIL,
  google_connected: true,
  jira_site_url: null,
  jira_user_email: null,
  jira_project_key: null,
  notion_section_url: null,
  notion_page_id: null,
  members: [],
  created_at: "2026-06-02T00:00:00Z",
};

/**
 * Stub the backend the rewired wizard now talks to. Routes are scoped to the
 * API origin (localhost:8000) so frontend navigations to /projects are untouched.
 * The OAuth popup is served a tiny page *from the API origin* so its
 * postMessage carries the origin the wizard verifies against.
 */
function mockBackend(
  context: BrowserContext,
  opts: { projects?: unknown[] } = {},
): { createBody: () => Record<string, unknown> | null } {
  let createBody: Record<string, unknown> | null = null;
  const projects = opts.projects ?? [];

  context.route(`${API}/projects/integrations/google/start`, (route) =>
    route.fulfill({
      json: {
        authorize_url: `${API}/__mock_oauth`,
        auth_session_id: "sess-e2e",
      },
    }),
  );
  context.route(`${API}/__mock_oauth`, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><script>
        if (window.opener) window.opener.postMessage(
          {source:'scrumagent-google-oauth',ok:true,authSessionId:'sess-e2e',email:'${AGENT_EMAIL}'},
          '*');
        window.close();
      </script>`,
    }),
  );
  context.route(`${API}/auth/me`, (route) =>
    route.fulfill({ json: { id: 1, email: "alice@municorn.com", name: "Alice" } }),
  );
  context.route(`${API}/users/directory`, (route) =>
    route.fulfill({
      json: [
        { id: 1, email: "alice@municorn.com", name: "Alice" },
        { id: 2, email: "bob@municorn.com", name: "Bob" },
      ],
    }),
  );
  context.route(`${API}/projects/integrations/jira/test`, (route) =>
    route.fulfill({ json: { ok: true, detail: { email: "agent@municorn.com" }, error: null } }),
  );
  context.route(`${API}/projects/integrations/notion/test`, (route) =>
    route.fulfill({ json: { ok: true, detail: { name: "bot" }, error: null } }),
  );
  context.route(`${API}/projects`, (route) => {
    if (route.request().method() === "POST") {
      createBody = route.request().postDataJSON();
      route.fulfill({ status: 201, json: PROJECT_FIXTURE });
    } else {
      route.fulfill({ json: projects });
    }
  });

  return { createBody: () => createBody };
}

test.beforeEach(async ({ page }) => {
  await clearStorage(page);
});

test.describe("Projects list", () => {
  test("renders real projects plus the Add project CTA", async ({ page, context }) => {
    mockBackend(context, { projects: [PROJECT_FIXTURE] });
    await page.goto("/projects");

    await expect(page.getByText("E2E Test Squad")).toBeVisible();
    await expect(page.locator(".project-tile-add")).toBeVisible();
  });

  test("Add project tile routes to wizard", async ({ page, context }) => {
    mockBackend(context);
    await page.goto("/projects");
    await page.locator(".project-tile-add").click();
    await expect(page).toHaveURL(/\/projects\/new$/);
  });
});

test.describe("Add Project wizard", () => {
  test("Google step suggests the default agent email and gates Continue", async ({
    page,
    context,
  }) => {
    mockBackend(context);
    await page.goto("/projects/new");

    await page.getByLabel("Project name").fill("E2E Test Squad");
    await page.getByRole("button", { name: /Continue/ }).click();

    // Step 2 — Google: editable default email + a hard gate until authorized.
    await expect(page.locator("#agent-email")).toHaveValue(AGENT_EMAIL);
    await expect(page.getByRole("button", { name: /Continue/ })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Authorize agent" })).toBeVisible();
  });

  test("authorizes the agent, selects a member, and creates the project", async ({
    page,
    context,
  }) => {
    const backend = mockBackend(context);
    await page.goto("/projects/new");

    // Step 1 — Details
    await page.getByLabel("Project name").fill("E2E Test Squad");
    await page.getByRole("button", { name: /Continue/ }).click();

    // Step 2 — Google: authorize via the (mocked) popup, then the gate opens.
    await page.getByRole("button", { name: "Authorize agent" }).click();
    await expect(page.getByText("Authorized", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: /Continue/ }).click();

    // Step 3 — Jira (skip), Step 4 — Notion (skip)
    await page.getByRole("button", { name: /Continue/ }).click();
    await page.getByRole("button", { name: /Continue/ }).click();

    // Step 5 — Select team members: Alice (self) is excluded; pick Bob.
    await expect(
      page.locator(".wizard-progress-step.active").filter({
        hasText: "Select team members",
      }),
    ).toBeVisible();
    await page.getByText("bob@municorn.com").click();

    await page.getByRole("button", { name: /Create project/ }).click();
    await expect(page).toHaveURL(/\/projects\?created=1/);

    const body = backend.createBody();
    expect(body?.google_auth_session_id).toBe("sess-e2e");
    expect(body?.member_user_ids).toEqual([2]);
  });

  test("Jira Test connection reports success", async ({ page, context }) => {
    mockBackend(context);
    await page.goto("/projects/new");
    await page.getByLabel("Project name").fill("E2E Test Squad");
    await page.getByRole("button", { name: /Continue/ }).click();
    await page.getByRole("button", { name: "Authorize agent" }).click();
    await expect(page.getByText("Authorized", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: /Continue/ }).click();

    // Step 3 — Jira: fill, test, expect success.
    await page.getByLabel("Atlassian site URL").fill("https://municorn.atlassian.net");
    await page.getByLabel("Atlassian account email").fill("agent@municorn.com");
    await page.getByLabel("API token").fill("tok");
    await page.getByRole("button", { name: "Test connection" }).click();
    await expect(page.getByText("Connected")).toBeVisible();
  });
});
