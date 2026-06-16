import { expect, test, type Page } from "@playwright/test";
import { clearStorage } from "./_setup";

const API = "http://localhost:8000";
const TOKEN_KEY = "kabanchik.production.token";
const E2E_TOKEN =
  "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJlbWFpbCI6Im1vcmdhbkBtdW5pY29ybi5jb20ifQ.sig";

const FIXED_NOW = new Date("2026-06-16T12:00:00.000Z");

function isoIn(hours: number): string {
  return new Date(FIXED_NOW.getTime() + hours * 3600_000).toISOString();
}

function project(id: string, name: string) {
  return {
    id,
    name,
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
}

function event(overrides: Record<string, unknown>) {
  return {
    id: "evt-default",
    title: "Calendar Event",
    start: isoIn(1),
    end: isoIn(2),
    all_day: false,
    organizer_email: "agent@municorn.com",
    attendees: [],
    meet_link: null,
    html_link: "https://calendar.google.com/event?eid=evt-default",
    status: "confirmed",
    ...overrides,
  };
}

/** Common /auth/me mock + login + token, shared by every scenario. */
async function authenticate(page: Page): Promise<void> {
  await page.context().route(`${API}/auth/me`, (route) =>
    route.fulfill({
      json: { id: 1, email: "morgan@municorn.com", name: "Morgan Lee" },
    }),
  );
  await page.goto("/login");
  await page.evaluate(
    ([key, value]) => window.localStorage.setItem(key, value),
    [TOKEN_KEY, E2E_TOKEN],
  );
}

function recentCard(page: Page) {
  return page
    .locator(".card")
    .filter({ has: page.getByRole("heading", { name: "Recent meetings" }) })
    .first();
}

test.beforeEach(async ({ page }) => {
  await clearStorage(page);
  await page.clock.setFixedTime(FIXED_NOW);
});

test.describe("Recent meetings end states", () => {
  test("project with calendar 409 and no upcoming events shows the needs-connection empty state, not an error", async ({
    page,
  }) => {
    await authenticate(page);
    await page.context().route(`${API}/projects`, (route) =>
      route.fulfill({ json: [project("p-409", "No Calendar Project")] }),
    );
    await page.context().route(`${API}/projects/p-409/meetings*`, (route) =>
      route.fulfill({
        status: 409,
        json: { detail: "No Google calendar connected" },
      }),
    );
    await page.goto("/");

    const recent = recentCard(page);
    await expect(
      recent.getByText("Connect Google Calendar"),
    ).toBeVisible();
    await expect(recent.locator(".project-error")).toHaveCount(0);
    await expect(recent.getByText("No calendar meetings found")).toHaveCount(0);
  });

  test("project with calendar 500 and no events shows the error alert", async ({
    page,
  }) => {
    await authenticate(page);
    await page.context().route(`${API}/projects`, (route) =>
      route.fulfill({ json: [project("p-500", "Broken Project")] }),
    );
    await page.context().route(`${API}/projects/p-500/meetings*`, (route) =>
      route.fulfill({
        status: 500,
        json: { detail: "Internal Server Error" },
      }),
    );
    await page.goto("/");

    const recent = recentCard(page);
    await expect(recent.locator(".project-error")).toBeVisible();
    await expect(
      recent.getByText("Could not load Google Calendar meetings."),
    ).toBeVisible();
    await expect(recent.getByText("Connect Google Calendar")).toHaveCount(0);
  });

  test("two projects returning the same future event id render exactly one row", async ({
    page,
  }) => {
    await authenticate(page);
    await page.context().route(`${API}/projects`, (route) =>
      route.fulfill({
        json: [project("p-a", "Project A"), project("p-b", "Project B")],
      }),
    );
    const shared = event({
      id: "evt-shared",
      title: "Shared Sync",
      start: isoIn(2),
      end: isoIn(3),
    });
    await page.context().route(`${API}/projects/p-a/meetings*`, (route) =>
      route.fulfill({ json: [shared] }),
    );
    await page.context().route(`${API}/projects/p-b/meetings*`, (route) =>
      route.fulfill({ json: [shared] }),
    );
    await page.goto("/");

    const recent = recentCard(page);
    await expect(recent.locator(".meeting-compact-title")).toHaveText([
      "Shared Sync",
    ]);
  });

  test("future event with status cancelled is not rendered", async ({
    page,
  }) => {
    await authenticate(page);
    await page.context().route(`${API}/projects`, (route) =>
      route.fulfill({ json: [project("p-cancel", "Cancel Project")] }),
    );
    await page.context().route(
      `${API}/projects/p-cancel/meetings*`,
      (route) =>
        route.fulfill({
          json: [
            event({
              id: "evt-cancelled",
              title: "Cancelled Sync",
              start: isoIn(1),
              end: isoIn(2),
              status: "cancelled",
            }),
            event({
              id: "evt-live",
              title: "Live Sync",
              start: isoIn(3),
              end: isoIn(4),
              status: "confirmed",
            }),
          ],
        }),
    );
    await page.goto("/");

    const recent = recentCard(page);
    await expect(recent.locator(".meeting-compact-title")).toHaveText([
      "Live Sync",
    ]);
    await expect(recent.getByText("Cancelled Sync")).toHaveCount(0);
  });
});
