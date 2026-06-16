import { expect, test, type Page } from "@playwright/test";
import { clearStorage } from "./_setup";

const API = "http://localhost:8000";
const TOKEN_KEY = "kabanchik.production.token";

const PROJECT = {
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

function isoIn(hours: number): string {
  return new Date(Date.now() + hours * 3600_000).toISOString();
}

const MEETINGS = [
  {
    id: "evt-up",
    title: "Sprint Planning",
    start: isoIn(24),
    end: isoIn(25),
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
    meet_link: "https://meet.google.com/abc-defg-hij",
    html_link: "https://calendar.google.com/event?eid=evt-up",
    status: "confirmed",
  },
  {
    id: "evt-past",
    title: "Retro",
    start: isoIn(-48),
    end: isoIn(-47),
    all_day: false,
    organizer_email: "agent@municorn.com",
    attendees: [],
    meet_link: null,
    html_link: "https://calendar.google.com/event?eid=evt-past",
    status: "confirmed",
  },
];

/** Authenticated app with one project whose agent calendar has 2 events. */
async function mockCalendarApi(page: Page): Promise<void> {
  await page.context().route(`${API}/auth/me`, (route) =>
    route.fulfill({
      json: { id: 1, email: "alice@municorn.com", name: "Alice" },
    }),
  );
  await page.context().route(`${API}/projects`, (route) =>
    route.fulfill({ json: [PROJECT] }),
  );
  await page.context().route(`${API}/projects/p-1/meetings*`, (route) =>
    route.fulfill({ json: MEETINGS }),
  );
  await page.goto("/login");
  await page.evaluate(
    ([key, value]) => window.localStorage.setItem(key, value),
    [TOKEN_KEY, "e2e.token.value"],
  );
}

test.beforeEach(async ({ page }) => {
  await clearStorage(page);
});

test.describe("Meetings list (live calendar)", () => {
  test("renders real calendar events with Upcoming/Past split", async ({
    page,
  }) => {
    await mockCalendarApi(page);
    await page.goto("/meetings");

    await expect(
      page.getByRole("button", { name: "Upload recording" }),
    ).toBeDisabled();

    const rows = page.locator(".meetings-table-row");
    const titles = page.locator(".mtr-title");
    await expect(rows).toHaveCount(2);
    await expect(titles.filter({ hasText: "Sprint Planning" })).toBeVisible();
    await expect(titles.filter({ hasText: "Retro" })).toBeVisible();

    // Status pills reflect upcoming vs past.
    await expect(page.getByText("Scheduled", { exact: true })).toBeVisible();
    await expect(page.getByText("Past", { exact: true })).toBeVisible();

    // Upcoming tab filters down to the future event.
    await page.getByRole("tab", { name: /Upcoming/ }).click();
    await expect(rows).toHaveCount(1);
    await expect(titles.filter({ hasText: "Sprint Planning" })).toBeVisible();
  });

  test("rows link out to the Google Calendar event", async ({ page }) => {
    await mockCalendarApi(page);
    await page.goto("/meetings");
    const first = page.locator(".meetings-table-row").first();
    await expect(first).toHaveAttribute(
      "href",
      /calendar\.google\.com\/event/,
    );
    await expect(first).toHaveAttribute("target", "_blank");
  });

  test("shows the create-project hint when there are no projects", async ({
    page,
  }) => {
    await page.context().route(`${API}/auth/me`, (route) =>
      route.fulfill({
        json: { id: 1, email: "alice@municorn.com", name: "Alice" },
      }),
    );
    await page.context().route(`${API}/projects`, (route) =>
      route.fulfill({ json: [] }),
    );
    await page.goto("/login");
    await page.evaluate(
      ([key, value]) => window.localStorage.setItem(key, value),
      [TOKEN_KEY, "e2e.token.value"],
    );
    await page.goto("/meetings");
    await expect(page.getByText("No projects yet")).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Create a project" }),
    ).toBeVisible();
  });

  test("surfaces a per-project calendar failure as an alert", async ({
    page,
  }) => {
    await page.context().route(`${API}/auth/me`, (route) =>
      route.fulfill({
        json: { id: 1, email: "alice@municorn.com", name: "Alice" },
      }),
    );
    await page.context().route(`${API}/projects`, (route) =>
      route.fulfill({ json: [PROJECT] }),
    );
    await page.context().route(`${API}/projects/p-1/meetings*`, (route) =>
      route.fulfill({
        status: 409,
        json: {
          detail:
            "Google authorization expired or was revoked — reconnect the agent account",
        },
      }),
    );
    await page.goto("/login");
    await page.evaluate(
      ([key, value]) => window.localStorage.setItem(key, value),
      [TOKEN_KEY, "e2e.token.value"],
    );
    await page.goto("/meetings");
    await expect(page.locator(".project-error")).toContainText(
      /Telecom: .*reconnect/,
    );
  });
});

test.describe("Meeting detail (m1)", () => {
  test("renders title, status pill, and 5 tabs", async ({ page }) => {
    // m1 is "Daily Standup", status: done — guarantees tabs render.
    await page.goto("/meetings/m1");

    await expect(
      page.getByRole("heading", { name: "Daily Standup", level: 1 }),
    ).toBeVisible();
    // StatusPill renders as <span class="badge ...">.
    await expect(page.locator(".badge").first()).toBeVisible();

    const tabs = page.getByRole("tab");
    // Five tabs: Summary / Transcript / Action items / Decisions / Outputs.
    await expect(tabs).toHaveCount(5);
    for (const label of [
      "Summary",
      "Transcript",
      "Action items",
      "Decisions",
      "Outputs",
    ]) {
      await expect(page.getByRole("tab", { name: new RegExp(label) })).toBeVisible();
    }
  });

  test("each tab renders its own content area", async ({ page }) => {
    await page.goto("/meetings/m1");

    // Summary is the default — check the eyebrow text shows the "Overview:"
    // heading rendered from the markdown summary.
    await expect(page.locator(".meeting-summary")).toBeVisible();
    await expect(page.locator(".meeting-summary").getByText(/Overview/i)).toBeVisible();

    await page.getByRole("tab", { name: /Transcript/ }).click();
    await expect(page.locator(".transcript")).toBeVisible();
    await expect(page.locator(".transcript-row").first()).toBeVisible();

    await page.getByRole("tab", { name: /Action items/ }).click();
    await expect(page.locator(".action-row").first()).toBeVisible();

    await page.getByRole("tab", { name: /Decisions/ }).click();
    await expect(page.getByText(/Deploy auth fix/i)).toBeVisible();

    await page.getByRole("tab", { name: /Outputs/ }).click();
    await expect(page.locator(".output-row").first()).toBeVisible();
  });
});
