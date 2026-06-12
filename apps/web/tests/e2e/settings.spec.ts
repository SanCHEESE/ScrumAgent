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

  test("Billing surface: 3 summary cards, breakdown, keys, usage", async ({
    page,
  }) => {
    await mockSettingsApi(page, {});
    await page.goto("/settings");
    await page.locator(".settings-nav-item").filter({ hasText: "Billing" }).click();

    // 3 summary cards (cycle / plan / next invoice).
    await expect(page.locator(".billing-summary .billing-card")).toHaveCount(3);

    // Cost breakdown — has its own section panel + bar.
    await expect(
      page
        .locator(".billing-section")
        .filter({ has: page.getByText(/Cost breakdown/i) }),
    ).toBeVisible();

    // 4 API key rows (mock has 4).
    await expect(page.locator(".billing-key")).toHaveCount(4);

    // 4 model rows in the usage table.
    await expect(
      page
        .locator(".billing-section")
        .filter({ has: page.getByText(/Usage by model/i) }),
    ).toBeVisible();
  });

  test("Reveal toggles the API-key mask", async ({ page }) => {
    await mockSettingsApi(page, {});
    await page.goto("/settings");
    await page.locator(".settings-nav-item").filter({ hasText: "Billing" }).click();

    const firstKeyMask = page.locator(".billing-key").first().locator(".billing-key-mask span").first();
    const before = (await firstKeyMask.innerText()).trim();

    // The reveal/hide affordance is the first link-button labelled "Reveal".
    await page
      .locator(".billing-key")
      .first()
      .getByRole("button", { name: /Reveal/ })
      .click();

    const after = (await firstKeyMask.innerText()).trim();
    expect(after).not.toBe(before);
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
