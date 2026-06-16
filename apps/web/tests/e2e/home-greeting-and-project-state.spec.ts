import { expect, test, type Page } from "@playwright/test";
import { clearStorage } from "./_setup";

// Mirrors the constants in home.spec.ts so this spec stays self-contained.
const API = "http://localhost:8000";
const TOKEN_KEY = "kabanchik.production.token";
const E2E_TOKEN =
  "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJlbWFpbCI6Im1vcmdhbkBtdW5pY29ybi5jb20ifQ.sig";

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

/** Always answer /auth/me so the greeting resolves to the real user name. */
async function mockMe(page: Page): Promise<void> {
  await page.context().route(`${API}/auth/me`, (route) =>
    route.fulfill({
      json: { id: 1, email: "morgan@municorn.com", name: "Morgan Lee" },
    }),
  );
}

/** Seed the bearer token the API client expects, via the /login origin. */
async function seedToken(page: Page): Promise<void> {
  await page.goto("/login");
  await page.evaluate(
    ([key, value]) => window.localStorage.setItem(key, value),
    [TOKEN_KEY, E2E_TOKEN],
  );
}

test.beforeEach(async ({ page }) => {
  await clearStorage(page);
  await mockMe(page);
});

test.describe("Home greeting + active-project state", () => {
  test("GET /projects 500 shows an error affordance, not 'No project selected'", async ({
    page,
  }) => {
    // Non-401 failure: ActiveProjectProvider must surface status="error" rather
    // than silently falling back to the NO_PROJECT sentinel.
    await page.context().route(`${API}/projects`, (route) =>
      route.fulfill({ status: 500, json: { detail: "boom" } }),
    );
    await seedToken(page);
    await page.goto("/");

    const subtitle = page.locator(".page-subtitle");
    await expect(subtitle).toContainText(/couldn[’']t load your projects/i);
    // Clear retry affordance for the user.
    await expect(
      subtitle.getByRole("button", { name: /try again/i }),
    ).toBeVisible();
    // The error must NOT be indistinguishable from a genuinely empty account.
    await expect(page.getByText("No project selected")).toHaveCount(0);
    await expect(subtitle).not.toContainText("No project selected");
  });

  test("GET /projects success renders the active project name (ready)", async ({
    page,
  }) => {
    await page.context().route(`${API}/projects`, (route) =>
      route.fulfill({ json: [PROJECT] }),
    );
    await seedToken(page);
    await page.goto("/");

    const subtitle = page.locator(".page-subtitle");
    await expect(subtitle).toContainText("Home Project");
    await expect(subtitle).not.toContainText(/couldn[’']t load your projects/i);
    await expect(page.getByText("No project selected")).toHaveCount(0);
  });

  test("greeting resolves correctly post-mount under a fixed clock (no hydration flip)", async ({
    page,
  }) => {
    // Capture any hydration warning React would emit if the server-rendered
    // greeting disagreed with the first client render.
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await page.context().route(`${API}/projects`, (route) =>
      route.fulfill({ json: [PROJECT] }),
    );
    // Local 09:00 on 2026-06-16 falls in the "Good morning" bucket. Whatever the
    // host UTC offset, the post-mount greeting is computed from the browser
    // clock, so it must resolve to morning — the bug would otherwise produce a
    // server/client mismatch and a visible flip.
    await page.clock.setFixedTime(new Date(2026, 5, 16, 9, 0, 0));
    await seedToken(page);
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: "Good morning, Morgan Lee" }),
    ).toBeVisible();

    // Hydration warnings are best-effort (their text can vary across React
    // builds); if any surfaced, none should mention hydration.
    const hydrationErrors = consoleErrors.filter((t) => /hydrat/i.test(t));
    expect(hydrationErrors).toEqual([]);
  });
});
