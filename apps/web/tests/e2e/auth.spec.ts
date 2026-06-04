import { expect, test, type Page } from "@playwright/test";

/**
 * Auth identity + session-expiry behaviour (ScrumAgent-9pf).
 *
 * The sidebar footer chip reflects the *real* signed-in user (name + avatar)
 * and offers Sign out; when unauthenticated it offers Sign in. Any 401 from
 * the backend (e.g. an expired JWT left in localStorage from an earlier login)
 * clears the token and bounces to /login instead of surfacing a dead error.
 */

const API = "http://localhost:8000";
const TOKEN_KEY = "kabanchik.token";

/** Seed a bearer token into localStorage for the app origin. */
async function seedToken(page: Page, token = "e2e.token.value"): Promise<void> {
  await page.goto("/login");
  await page.evaluate(
    ([key, value]) => window.localStorage.setItem(key, value),
    [TOKEN_KEY, token],
  );
}

test.describe("Authenticated identity", () => {
  test("sidebar footer shows the real user name, not the mock", async ({
    page,
    context,
  }) => {
    await context.route(`${API}/auth/me`, (route) =>
      route.fulfill({ json: { id: 7, email: "dana@municorn.com", name: "Dana Scully" } }),
    );
    await seedToken(page);
    await page.goto("/");

    const footer = page.locator(".sidebar-footer");
    await expect(footer.getByText("Dana Scully")).toBeVisible();
    await expect(footer.getByText("Alice Kim")).toHaveCount(0);
  });

  test("Sign out clears the token and returns to /login", async ({
    page,
    context,
  }) => {
    await context.route(`${API}/auth/me`, (route) =>
      route.fulfill({ json: { id: 7, email: "dana@municorn.com", name: "Dana Scully" } }),
    );
    await seedToken(page);
    await page.goto("/");

    await page.locator(".sidebar-footer .user-chip").click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();

    await expect(page).toHaveURL(/\/login$/);
    const token = await page.evaluate(
      (key) => window.localStorage.getItem(key),
      TOKEN_KEY,
    );
    expect(token).toBeNull();
  });
});

test.describe("Unauthenticated identity", () => {
  test("footer offers Sign in and routes to /login", async ({ page }) => {
    await page.goto("/login");
    await page.evaluate(
      (key) => window.localStorage.removeItem(key),
      TOKEN_KEY,
    );
    await page.goto("/");

    const signIn = page.locator(".sidebar-footer").getByText("Sign in");
    await expect(signIn).toBeVisible();
    await signIn.click();
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe("Session expiry", () => {
  test("an expired token on Projects redirects to /login, no dead error", async ({
    page,
    context,
  }) => {
    // Footer validation succeeds; the Projects fetch is the one that 401s.
    await context.route(`${API}/auth/me`, (route) =>
      route.fulfill({ json: { id: 7, email: "dana@municorn.com", name: "Dana Scully" } }),
    );
    await context.route(`${API}/projects`, (route) =>
      route.fulfill({ status: 401, json: { detail: "Invalid or expired token" } }),
    );
    await seedToken(page);
    await page.goto("/projects");

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText("Invalid or expired token")).toHaveCount(0);
  });
});
