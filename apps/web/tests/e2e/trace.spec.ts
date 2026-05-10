import { expect, test } from "@playwright/test";
import { clearStorage } from "./_setup";

test.beforeEach(async ({ page }) => {
  await clearStorage(page);
});

test.describe("Agent trace screen", () => {
  test("run list visible with first run pre-selected", async ({ page }) => {
    await page.goto("/trace");
    const rows = page.locator(".trace-row");
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
    await expect(rows.first()).toHaveClass(/active/);
  });

  test("clicking another run swaps the detail pane", async ({ page }) => {
    await page.goto("/trace");
    const rows = page.locator(".trace-row");
    if ((await rows.count()) < 2) test.skip();

    const firstTitle = (await rows.nth(0).innerText()).trim();
    const secondTitle = (await rows.nth(1).innerText()).trim();
    if (firstTitle === secondTitle) test.skip();

    await rows.nth(1).click();
    await expect(rows.nth(1)).toHaveClass(/active/);
    await expect(page.locator(".trace-detail-title")).not.toHaveText(
      firstTitle.split("\n")[0] ?? "",
    );
  });

  test("vertical timeline renders", async ({ page }) => {
    await page.goto("/trace");
    await expect(page.locator(".trace-line").first()).toBeVisible();
    // At least one step row in the active timeline.
    await expect(page.locator(".trace-line .trace-step").first()).toBeVisible();
  });

  test("expandable JSON block toggles", async ({ page }) => {
    await page.goto("/trace");

    // Some step has a payload long enough to be collapsible (>200 chars). The
    // collapsed state shows a "trace-json-toggle" button labelled "Expand".
    const toggle = page.locator(".trace-json-toggle").first();

    // If no payload is long enough to need expanding, that's still a valid
    // state for this mock-data — fall back to asserting the JsonBlock pre is
    // there. Otherwise click + verify the toggle flips.
    const hasToggle = (await toggle.count()) > 0;
    if (hasToggle) {
      await expect(toggle).toContainText(/Expand/);
      await toggle.click();
      await expect(page.locator(".trace-json-toggle").first()).toContainText(
        /Collapse/,
      );
    } else {
      await expect(page.locator(".trace-input").first()).toBeVisible();
    }
  });
});
