import { expect, test, type Page } from "@playwright/test";
import { clearStorage } from "./_setup";

const API = "http://localhost:8000";
const TOKEN_KEY = "kabanchik.production.token";
const E2E_TOKEN =
  "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJlbWFpbCI6ImFsaWNlQG11bmljb3JuLmNvbSJ9.sig";

const PROJECT = {
  id: "p-home",
  name: "Home Project",
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

function isoIn(hours: number): string {
  return new Date(Date.now() + hours * 3600_000).toISOString();
}

const LIVE_MEETINGS = [
  {
    id: "evt-home-new",
    title: "Calendar Design Review",
    start: isoIn(2),
    end: isoIn(3),
    all_day: false,
    organizer_email: "agent@municorn.com",
    attendees: [
      {
        email: "alice@municorn.com",
        display_name: "Alice Kim",
        response_status: "accepted",
        organizer: false,
      },
    ],
    meet_link: "https://meet.google.com/new-home",
    html_link: "https://calendar.google.com/event?eid=evt-home-new",
    status: "confirmed",
  },
  {
    id: "evt-home-old",
    title: "Calendar Retro",
    start: isoIn(-24),
    end: isoIn(-23),
    all_day: false,
    organizer_email: "agent@municorn.com",
    attendees: [],
    meet_link: null,
    html_link: "https://calendar.google.com/event?eid=evt-home-old",
    status: "confirmed",
  },
];

async function mockCalendarApi(page: Page): Promise<void> {
  await page.context().route(`${API}/auth/me`, (route) =>
    route.fulfill({
      json: { id: 1, email: "alice@municorn.com", name: "Alice" },
    }),
  );
  await page.context().route(`${API}/projects`, (route) =>
    route.fulfill({ json: [PROJECT] }),
  );
  await page.context().route(`${API}/projects/p-home/meetings*`, (route) =>
    route.fulfill({ json: LIVE_MEETINGS }),
  );
  await page.goto("/login");
  await page.evaluate(
    ([key, value]) => window.localStorage.setItem(key, value),
    [TOKEN_KEY, E2E_TOKEN],
  );
}

async function mockDefaultApi(page: Page): Promise<void> {
  await page.context().route(`${API}/auth/me`, (route) =>
    route.fulfill({
      json: { id: 1, email: "alice@municorn.com", name: "Alice" },
    }),
  );
  await page.context().route(`${API}/projects`, (route) =>
    route.fulfill({ json: [] }),
  );
}

test.beforeEach(async ({ page }) => {
  await clearStorage(page);
  await mockDefaultApi(page);
});

/** Sets the home layout variant (legacy mirror key) and reloads the page. */
async function setLayoutAndReload(
  page: import("@playwright/test").Page,
  variant: "split" | "focused" | "classic",
): Promise<void> {
  await page.goto("/");
  await page.evaluate((v) => {
    window.localStorage.setItem("tweaks.layoutVariant", v);
  }, variant);
  await page.reload();
}

test.describe("Home dashboard", () => {
  test("greets the user and renders the app shell", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: "Good morning, Alice" }),
    ).toBeVisible();
    // AppShell pieces.
    await expect(page.locator(".live-bar")).toBeVisible();
    await expect(page.locator(".sidebar")).toBeVisible();
  });

  test("split layout: 4 stat cards + ask card", async ({ page }) => {
    await setLayoutAndReload(page, "split");

    await expect(page.locator(".stat-row")).toBeVisible();
    await expect(page.locator(".stat-row .stat-card")).toHaveCount(4);
    await expect(page.locator(".ask-card")).toBeVisible();
  });

  test("focused layout: hero + non-zero pending count", async ({ page }) => {
    await setLayoutAndReload(page, "focused");

    const hero = page.locator(".focused-hero");
    await expect(hero).toBeVisible();
    const number = await hero.locator(".focused-hero-number").innerText();
    expect(parseInt(number, 10)).toBeGreaterThan(0);
  });

  test("classic layout: 2-column grid", async ({ page }) => {
    await setLayoutAndReload(page, "classic");

    await expect(page.locator(".card-grid-2")).toBeVisible();
  });

  test("Recent meetings renders live calendar events", async ({ page }) => {
    await mockCalendarApi(page);
    await page.goto("/");

    const recent = page
      .locator(".card")
      .filter({ has: page.getByRole("heading", { name: "Recent meetings" }) })
      .first();
    await expect(recent.getByText("Calendar Design Review")).toBeVisible();
    await expect(recent.getByText("Calendar Retro")).toBeVisible();
    await expect(recent.getByText("Daily Standup")).toHaveCount(0);
  });

  test("Ask agent header button navigates to /chat", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Ask agent/i }).click();
    await expect(page).toHaveURL(/\/chat$/);
  });

  test("AskAgentCard send routes to /chat?seed=...", async ({ page }) => {
    // The split / classic layouts both render the AskAgentCard; default split.
    await setLayoutAndReload(page, "split");
    const textarea = page.locator(".ask-input");
    await textarea.fill("what did we decide?");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page).toHaveURL(/\/chat\?seed=/);
  });
});
