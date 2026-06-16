import { expect, test } from "@playwright/test";
import { clearStorage } from "./_setup";

const LEGACY_TOKEN_KEY = "kabanchik.token";
const PRODUCTION_TOKEN_KEY = "kabanchik.production.token";

test.beforeEach(async ({ page }) => {
  await clearStorage(page);
});

test.describe("Login screen", () => {
  test("renders branding, tagline, and sign-in CTA", async ({ page }) => {
    await page.goto("/login");

    // Mascot emoji and product wordmark.
    await expect(page.getByRole("img", { name: "Kabanchik" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Kabanchik", level: 1 }),
    ).toBeVisible();

    // Primary auth button.
    await expect(
      page.getByRole("button", { name: "Continue with Google Workspace" }),
    ).toBeVisible();

    // Domain restriction note.
    await expect(page.getByText("@municorn.com")).toBeVisible();
  });

  test("clicking sign-in hands off to the backend OAuth start", async ({
    page,
    context,
  }) => {
    // The button delegates the OAuth dance to the backend, which then
    // redirects to Google. Stub the backend entry point so the assertion
    // doesn't depend on a live server / real Google.
    await context.route("http://localhost:8000/auth/google/start", (route) =>
      route.fulfill({ contentType: "text/html", body: "<!doctype html><title>oauth</title>" }),
    );

    await page.goto("/login");
    await page
      .getByRole("button", { name: "Continue with Google Workspace" })
      .click();
    await expect(page).toHaveURL("http://localhost:8000/auth/google/start");
  });

  test("shows a friendly message when the OAuth round-trip failed", async ({
    page,
  }) => {
    // The backend callback bounces consent-cancel / wrong-domain back as
    // /login?error=<code> — rendered as an alert, then stripped from the URL.
    await page.goto("/login?error=domain_not_allowed");
    await expect(page.locator(".login-error")).toContainText(
      "Only @municorn.com accounts",
    );
    await expect(page).toHaveURL(/\/login$/);
  });

  test("stores callback tokens in the production environment namespace", async ({
    page,
  }) => {
    await page.goto("/");
    await page.goto("/login#token=jwt.from.callback");
    await expect
      .poll(() => page.evaluate((key) => window.localStorage.getItem(key), PRODUCTION_TOKEN_KEY))
      .toBe("jwt.from.callback");
    const tokens = await page.evaluate((legacyKey) => ({
      legacy: window.localStorage.getItem(legacyKey),
    }), LEGACY_TOKEN_KEY);
    expect(tokens).toEqual({
      legacy: null,
    });
  });

  test("does not render the AppShell (no live bar)", async ({ page }) => {
    await page.goto("/login");
    // /login uses a sibling layout that skips AppShell entirely.
    await expect(page.locator(".live-bar")).toHaveCount(0);
    await expect(page.locator(".sidebar")).toHaveCount(0);
  });
});
