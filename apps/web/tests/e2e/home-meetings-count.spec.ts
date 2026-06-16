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
    agent_email: `agent-${id}@municorn.com`,
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

/** A single confirmed event in the current week (one hour from "now"). */
function meeting(id: string, title: string, hours = 1) {
  return {
    id,
    title,
    start: isoIn(hours),
    end: isoIn(hours + 1),
    all_day: false,
    organizer_email: "agent@municorn.com",
    attendees: [],
    meet_link: null,
    html_link: `https://calendar.google.com/event?eid=${id}`,
    status: "confirmed",
  };
}

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

test.beforeEach(async ({ page }) => {
  await clearStorage(page);
  await page.clock.setFixedTime(FIXED_NOW);
});

test.describe("Home: live meetings-this-week count", () => {
  test("dedupes a shared event id across two projects (counted once)", async ({
    page,
  }) => {
    // Both projects' calendars return the SAME event (an event invited to two
    // agent accounts shares one event id). It must count once, not twice.
    const shared = meeting("evt-shared", "All-hands");
    await page.context().route(`${API}/projects`, (route) =>
      route.fulfill({ json: [project("p-a", "Alpha"), project("p-b", "Beta")] }),
    );
    await page.context().route(`${API}/projects/p-a/meetings*`, (route) =>
      route.fulfill({ json: [shared] }),
    );
    await page.context().route(`${API}/projects/p-b/meetings*`, (route) =>
      route.fulfill({ json: [shared] }),
    );
    await authenticate(page);
    await page.goto("/");

    const stat = page
      .locator(".stat-card")
      .filter({ hasText: "Meetings this week" });
    await expect(stat.locator(".stat-value")).toHaveText("1");
    await expect(stat.locator(".stat-trend")).toHaveText("+1 vs last week");

    const meetingsNav = page
      .locator(".nav-item")
      .filter({ has: page.locator(".nav-label", { hasText: "Meetings" }) });
    await expect(meetingsNav.locator(".nav-badge")).toHaveText("1");

    // Happy path: no failures, so no partial-failure marker is rendered.
    await expect(stat.locator(".stat-partial-marker")).toHaveCount(0);
  });

  test("surfaces partial failure when one project's calendar 500s", async ({
    page,
  }) => {
    // Two projects: one succeeds with two current-week events, the other 500s.
    // The count reflects only the succeeding project, and a partial-failure
    // signal flags that the number is incomplete.
    await page.context().route(`${API}/projects`, (route) =>
      route.fulfill({ json: [project("p-ok", "Ok"), project("p-bad", "Bad")] }),
    );
    await page.context().route(`${API}/projects/p-ok/meetings*`, (route) =>
      route.fulfill({
        json: [meeting("evt-ok-1", "Standup", 1), meeting("evt-ok-2", "Review", 2)],
      }),
    );
    await page.context().route(`${API}/projects/p-bad/meetings*`, (route) =>
      route.fulfill({
        status: 500,
        json: { detail: "calendar sync failed" },
      }),
    );
    await authenticate(page);
    await page.goto("/");

    const stat = page
      .locator(".stat-card")
      .filter({ hasText: "Meetings this week" });
    // Count comes from the project that succeeded.
    await expect(stat.locator(".stat-value")).toHaveText("2");

    // Partial-failure signal: a marker with an accessible description that the
    // count may be incomplete.
    const marker = stat.locator(".stat-partial-marker");
    await expect(marker).toHaveCount(1);
    await expect(marker).toHaveAttribute("title", /incomplete/i);
    await expect(marker).toHaveAttribute("aria-label", /incomplete/i);

    // The nav badge still shows the partial count, flagged as possibly stale.
    const meetingsNav = page
      .locator(".nav-item")
      .filter({ has: page.locator(".nav-label", { hasText: "Meetings" }) });
    const badge = meetingsNav.locator(".nav-badge");
    await expect(badge).toHaveText("2");
    await expect(badge).toHaveAttribute("title", /incomplete/i);
  });
});
