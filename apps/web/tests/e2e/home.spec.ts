import { expect, test } from "@playwright/test";
import { clearStorage } from "./_setup";

test.beforeEach(async ({ page }) => {
  await clearStorage(page);
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
