import { expect, test } from "@playwright/test";
import { clearStorage } from "./_setup";

test.beforeEach(async ({ page }) => {
  await clearStorage(page);
});

test.describe("Meetings list", () => {
  test("renders at least 5 meetings", async ({ page }) => {
    await page.goto("/meetings");
    const rows = page.locator(".meetings-table-row");
    const count = await rows.count();
    expect(count).toBeGreaterThanOrEqual(5);
  });

  test("clicking a row routes to the detail page", async ({ page }) => {
    await page.goto("/meetings");
    await page.locator(".meetings-table-row").first().click();
    await expect(page).toHaveURL(/\/meetings\/m\d+/);
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
