import { expect, test } from "@playwright/test";
import { clearStorage } from "./_setup";

test.beforeEach(async ({ page }) => {
  await clearStorage(page);
});

test.describe("Tweaks panel", () => {
  test("toggle button opens the panel", async ({ page }) => {
    await page.goto("/");

    const toggle = page.locator(".__tweaks-toggle");
    await expect(toggle).toBeVisible();
    await toggle.click();
    await expect(page.locator(".__tweaks-panel")).toBeVisible();
  });

  test("Dark theme adds the dark body class", async ({ page }) => {
    await page.goto("/");
    await page.locator(".__tweaks-toggle").click();

    // The Theme radio group exposes a "Dark" button.
    await page.getByRole("radio", { name: "Dark" }).click();

    await expect(page.locator("body")).toHaveClass(/dark/);
  });

  test("Compact density adds the density-compact body class", async ({ page }) => {
    await page.goto("/");
    await page.locator(".__tweaks-toggle").click();

    await page.getByRole("radio", { name: "Compact" }).click();
    await expect(page.locator("body")).toHaveClass(/density-compact/);
  });

  test("layout change propagates to /home in the same tab", async ({ page }) => {
    await page.goto("/");
    await page.locator(".__tweaks-toggle").click();
    await page.getByRole("radio", { name: "Focused" }).click();

    // Close the panel and re-navigate (still same tab).
    await page.locator(".twk-x").click();
    await page.goto("/");
    await expect(page.locator(".focused-hero")).toBeVisible();
  });

  test("Dark theme persists across reload", async ({ page }) => {
    await page.goto("/");
    await page.locator(".__tweaks-toggle").click();
    await page.getByRole("radio", { name: "Dark" }).click();
    await expect(page.locator("body")).toHaveClass(/dark/);

    await page.reload();
    await expect(page.locator("body")).toHaveClass(/dark/);
  });
});
