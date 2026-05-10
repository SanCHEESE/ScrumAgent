import { expect, test } from "@playwright/test";
import { clearStorage } from "./_setup";

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

  test("clicking sign-in routes to home", async ({ page }) => {
    await page.goto("/login");
    await page
      .getByRole("button", { name: "Continue with Google Workspace" })
      .click();
    await expect(page).toHaveURL(/\/$/);
  });

  test("does not render the AppShell (no live bar)", async ({ page }) => {
    await page.goto("/login");
    // /login uses a sibling layout that skips AppShell entirely.
    await expect(page.locator(".live-bar")).toHaveCount(0);
    await expect(page.locator(".sidebar")).toHaveCount(0);
  });
});
