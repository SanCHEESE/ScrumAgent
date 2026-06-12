import { expect, test, type Page } from "@playwright/test";
import { clearStorage } from "./_setup";

const API = "http://localhost:8000";
const TOKEN_KEY = "kabanchik.token";

const PROJECT_A = {
  id: "p-1",
  name: "Telecom",
  description: null,
  color: "#0077e6",
  agent_email: "agent@municorn.com",
  google_connected: true,
  jira_site_url: null,
  jira_user_email: null,
  jira_project_key: null,
  notion_section_url: null,
  notion_page_id: null,
  members: [],
  created_at: "2026-06-01T00:00:00Z",
};

const PROJECT_B = { ...PROJECT_A, id: "p-2", name: "eSIM" };

const DEFAULT_SETTINGS = {
  auto_join_meetings: true,
  record_audio: true,
  capture_screenshots: false,
  confidence_threshold: 70,
  auto_apply_high_confidence: true,
  response_style: "balanced",
  context_window_meetings: 10,
};

/** Authenticated app with two projects; per-project agent settings are served
 *  from `store` and PUTs are written back to it. */
async function mockSettingsApi(
  page: Page,
  store: Record<string, typeof DEFAULT_SETTINGS>,
): Promise<void> {
  await page.context().route(`${API}/auth/me`, (route) =>
    route.fulfill({
      json: { id: 1, email: "alice@municorn.com", name: "Alice" },
    }),
  );
  await page.context().route(`${API}/projects`, (route) =>
    route.fulfill({ json: [PROJECT_A, PROJECT_B] }),
  );
  // Live tabs fetch on mount — give them safe defaults so navigating through
  // sections never leaks a request to a real backend (tests override these
  // with their own routes when they need specific payloads).
  await page.context().route(`${API}/projects/*/billing`, (route) =>
    route.fulfill({ json: EMPTY_BILLING }),
  );
  await page.context().route(`${API}/projects/*/integrations`, (route) =>
    route.fulfill({ json: INTEGRATIONS_STATUS }),
  );
  await page
    .context()
    .route(`${API}/projects/*/settings/agent`, async (route) => {
      const url = route.request().url();
      const id = url.match(/projects\/([^/]+)\/settings/)?.[1] ?? "";
      if (route.request().method() === "PUT") {
        store[id] = route.request().postDataJSON();
      }
      await route.fulfill({ json: store[id] ?? DEFAULT_SETTINGS });
    });
  await page.goto("/login");
  await page.evaluate(
    ([key, value]) => window.localStorage.setItem(key, value),
    [TOKEN_KEY, "e2e.token.value"],
  );
}

const EMPTY_BILLING = {
  cycle: {
    start: "2026-06-01",
    end: "2026-06-30",
    days_elapsed: 12,
    days_remaining: 18,
    mtd_usd: 0,
    projected_usd: 0,
  },
  by_category: [],
  by_model: [],
  recent: [],
  invocations_this_cycle: 0,
};

const BILLING = {
  ...EMPTY_BILLING,
  cycle: { ...EMPTY_BILLING.cycle, mtd_usd: 12.5, projected_usd: 31.25 },
  by_category: [
    { category: "orchestrator", cost_usd: 8.0 },
    { category: "whisper", cost_usd: 4.5 },
  ],
  by_model: [
    {
      model: "gpt-5.4-mini",
      provider: "openai",
      kind: "llm",
      calls: 42,
      input_units: 1.4,
      output_units: 0.3,
      cost_usd: 8.0,
      daily_usd: [0, 0, 0, 0, 0, 0, 0, 1, 3, 4],
    },
    {
      model: "whisper-1",
      provider: "openai",
      kind: "stt",
      calls: 3,
      input_units: 45,
      output_units: 0,
      cost_usd: 4.5,
      daily_usd: [0, 0, 0, 0, 0, 0, 0, 0, 2, 2.5],
    },
  ],
  recent: [
    {
      run_id: "run-standup-1",
      context: "Daily Standup",
      at: "2026-06-12T10:00:00Z",
      models: [
        { model: "gpt-5.4-mini", cost_usd: 1.0 },
        { model: "whisper-1", cost_usd: 0.5 },
      ],
      total_usd: 1.5,
    },
  ],
  invocations_this_cycle: 1,
};

test.beforeEach(async ({ page }) => {
  await clearStorage(page);
});

test.describe("Settings hub", () => {
  test("nav has 6 sections", async ({ page }) => {
    await mockSettingsApi(page, {});
    await page.goto("/settings");
    const items = page.locator(".settings-nav-item");
    await expect(items).toHaveCount(6);
  });

  test("clicking each nav item updates the heading", async ({ page }) => {
    await mockSettingsApi(page, {});
    await page.goto("/settings");

    const expectations: Array<{ label: string; title: string | RegExp }> = [
      { label: "Agent behavior", title: "Agent behavior" },
      { label: "Integrations", title: "Integrations" },
      { label: "Billing", title: "Billing" },
      { label: "Knowledge base", title: "Knowledge base" },
      { label: "Members", title: "Members" },
      { label: "Notifications", title: "Notifications" },
    ];

    for (const e of expectations) {
      await page.locator(".settings-nav-item").filter({ hasText: e.label }).click();
      await expect(page.locator(".page-title")).toHaveText(e.title);
    }
  });

  test("Billing renders the live per-project usage", async ({ page }) => {
    await mockSettingsApi(page, {});
    await page.context().route(`${API}/projects/*/billing`, (route) =>
      route.fulfill({ json: BILLING }),
    );
    await page.goto("/settings");
    await page.locator(".settings-nav-item").filter({ hasText: "Billing" }).click();

    // 3 summary cards (cycle spend / plan / activity).
    await expect(page.locator(".billing-summary .billing-card")).toHaveCount(3);
    await expect(page.locator(".billing-card-hero")).toContainText("$12.50");
    await expect(page.locator(".billing-card-hero")).toContainText("$31.25");

    // Cost breakdown — legend shows mapped category labels.
    const breakdown = page
      .locator(".billing-section")
      .filter({ has: page.getByText(/Cost breakdown/i) });
    await expect(breakdown).toContainText("Orchestrator LLM");
    await expect(breakdown).toContainText("Whisper STT");

    // Usage table lists the models from the API.
    const usage = page
      .locator(".billing-section")
      .filter({ has: page.getByText(/Usage by model/i) });
    await expect(usage.locator("tbody tr")).toHaveCount(2);
    await expect(usage).toContainText("gpt-5.4-mini");

    // Recent invocations show context, run cost, and grouped models.
    const recent = page
      .locator(".billing-section")
      .filter({ has: page.getByText(/Recent agent invocations/i) });
    await expect(recent.locator(".billing-invocation")).toHaveCount(1);
    await expect(recent).toContainText("Daily Standup");
    await expect(recent).toContainText("$1.50");
  });

  test("Billing shows empty states when no usage exists", async ({ page }) => {
    await mockSettingsApi(page, {});
    await page.context().route(`${API}/projects/*/billing`, (route) =>
      route.fulfill({ json: EMPTY_BILLING }),
    );
    await page.goto("/settings");
    await page.locator(".settings-nav-item").filter({ hasText: "Billing" }).click();

    await expect(page.locator(".billing-card-hero")).toContainText("$0.00");
    await expect(
      page.getByText("No usage recorded this cycle yet."),
    ).toBeVisible();
    await expect(
      page.getByText("No model calls recorded this cycle yet."),
    ).toBeVisible();
    await expect(
      page.getByText("No agent invocations recorded this cycle yet."),
    ).toBeVisible();
  });
});

const INTEGRATIONS_STATUS = {
  google: { connected: true, agent_email: "agent@municorn.com" },
  jira: {
    configured: true,
    site_url: "https://municorn.atlassian.net",
    user_email: "agent@municorn.com",
    project_key: "PLAT",
  },
  notion: { configured: false, section_url: null, page_id: null },
};

test.describe("Integrations (per-project, live)", () => {
  test("shows the real per-project integration state", async ({ page }) => {
    await mockSettingsApi(page, {});
    await page.context().route(`${API}/projects/*/integrations`, (route) =>
      route.fulfill({ json: INTEGRATIONS_STATUS }),
    );
    await page.goto("/settings");
    await page
      .locator(".settings-nav-item")
      .filter({ hasText: "Integrations" })
      .click();

    const google = page
      .locator(".integration-card-block")
      .filter({ hasText: "Google Workspace" });
    await expect(google).toContainText("Connected");
    await expect(google).toContainText("agent@municorn.com");

    const jira = page
      .locator(".integration-card-block")
      .filter({ hasText: "Jira" });
    await expect(jira).toContainText("Connected");
    await expect(jira).toContainText("municorn.atlassian.net");
    await expect(jira).toContainText("Project · PLAT");

    const notion = page
      .locator(".integration-card-block")
      .filter({ hasText: "Notion" });
    await expect(notion).toContainText("Not connected");
    await expect(notion.getByRole("button", { name: "Connect" })).toBeVisible();
  });

  test("Test probes the stored credentials and shows the verdict", async ({
    page,
  }) => {
    await mockSettingsApi(page, {});
    await page.context().route(`${API}/projects/*/integrations`, (route) =>
      route.fulfill({ json: INTEGRATIONS_STATUS }),
    );
    await page
      .context()
      .route(`${API}/projects/*/integrations/jira/test`, (route) =>
        route.fulfill({ json: { ok: false, detail: null, error: "HTTP 401" } }),
      );
    await page.goto("/settings");
    await page
      .locator(".settings-nav-item")
      .filter({ hasText: "Integrations" })
      .click();

    const jira = page
      .locator(".integration-card-block")
      .filter({ hasText: "Jira" });
    await jira.getByRole("button", { name: "Test" }).click();
    await expect(jira.getByRole("alert")).toContainText("HTTP 401");
  });

  test("connecting Notion validates and saves via PUT", async ({ page }) => {
    await mockSettingsApi(page, {});
    await page.context().route(`${API}/projects/*/integrations`, (route) =>
      route.fulfill({ json: INTEGRATIONS_STATUS }),
    );
    let putBody: Record<string, unknown> | null = null;
    await page
      .context()
      .route(`${API}/projects/*/integrations/notion`, async (route) => {
        putBody = route.request().postDataJSON();
        await route.fulfill({
          json: {
            ...INTEGRATIONS_STATUS,
            notion: {
              configured: true,
              section_url: "https://www.notion.so/m/Docs-abc",
              page_id: "abc",
            },
          },
        });
      });
    await page.goto("/settings");
    await page
      .locator(".settings-nav-item")
      .filter({ hasText: "Integrations" })
      .click();

    const notion = page
      .locator(".integration-card-block")
      .filter({ hasText: "Notion" });
    await notion.getByRole("button", { name: "Connect" }).click();
    await page.getByLabel("Internal integration token").fill("ntn_secret");
    await page.getByLabel("Section URL").fill("https://www.notion.so/m/Docs-abc");
    await page.getByRole("button", { name: "Validate & save" }).click();

    await expect(notion).toContainText("Connected");
    await expect(notion).toContainText("notion.so/m/Docs-abc");
    expect(putBody).toEqual({
      token: "ntn_secret",
      section_url: "https://www.notion.so/m/Docs-abc",
    });
  });

  test("invalid Jira credentials surface the backend error", async ({
    page,
  }) => {
    await mockSettingsApi(page, {});
    await page.context().route(`${API}/projects/*/integrations`, (route) =>
      route.fulfill({ json: INTEGRATIONS_STATUS }),
    );
    await page
      .context()
      .route(`${API}/projects/*/integrations/jira`, (route) =>
        route.fulfill({
          status: 422,
          json: { detail: "Jira credentials did not validate: HTTP 401" },
        }),
      );
    await page.goto("/settings");
    await page
      .locator(".settings-nav-item")
      .filter({ hasText: "Integrations" })
      .click();

    const jira = page
      .locator(".integration-card-block")
      .filter({ hasText: "Jira" });
    await jira.getByRole("button", { name: "Configure" }).click();
    // Site + email are prefilled from the live status; only the token is new.
    await expect(page.getByLabel("Atlassian site URL")).toHaveValue(
      "https://municorn.atlassian.net",
    );
    await page.getByLabel("API token").fill("bad-token");
    await page.getByRole("button", { name: "Validate & save" }).click();

    await expect(
      page.locator(".integration-form").getByRole("alert"),
    ).toContainText("Jira credentials did not validate");
  });
});

test.describe("Agent behavior (per-project, synced)", () => {
  test("loads the selected project's settings from the API", async ({
    page,
  }) => {
    await mockSettingsApi(page, {
      "p-1": {
        ...DEFAULT_SETTINGS,
        capture_screenshots: true,
        response_style: "detailed",
        confidence_threshold: 42,
      },
    });
    await page.goto("/settings");

    await expect(page.getByLabel("Project")).toHaveValue("p-1");
    await expect(page.getByLabel("Capture screenshots")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(page.getByLabel("Voice of the agent")).toHaveValue("detailed");
    await expect(page.getByLabel("Confidence threshold")).toHaveValue("42");
  });

  test("changes autosave via PUT and show Saved", async ({ page }) => {
    const store: Record<string, typeof DEFAULT_SETTINGS> = {};
    await mockSettingsApi(page, store);
    await page.goto("/settings");

    await expect(page.getByLabel("Auto-join meetings")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await page.getByLabel("Auto-join meetings").click();
    await page.getByLabel("Voice of the agent").selectOption("concise");

    await expect(page.getByRole("status")).toHaveText("Saved");
    expect(store["p-1"]).toMatchObject({
      auto_join_meetings: false,
      response_style: "concise",
    });
  });

  test("switching project loads that project's settings", async ({ page }) => {
    await mockSettingsApi(page, {
      "p-1": { ...DEFAULT_SETTINGS, capture_screenshots: false },
      "p-2": { ...DEFAULT_SETTINGS, capture_screenshots: true },
    });
    await page.goto("/settings");

    await expect(page.getByLabel("Capture screenshots")).toHaveAttribute(
      "aria-checked",
      "false",
    );
    await page.getByLabel("Project").selectOption("p-2");
    await expect(page.getByLabel("Capture screenshots")).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });
});
