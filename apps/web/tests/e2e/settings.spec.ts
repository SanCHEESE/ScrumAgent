import { expect, test } from "@playwright/test";
import { clearStorage } from "./_setup";

test.beforeEach(async ({ page }) => {
  await clearStorage(page);
});

test.describe("Settings hub", () => {
  test("nav has 6 sections", async ({ page }) => {
    await page.goto("/settings");
    const items = page.locator(".settings-nav-item");
    await expect(items).toHaveCount(6);
  });

  test("clicking each nav item updates the heading", async ({ page }) => {
    await page.goto("/settings");

    const expectations: Array<{ label: string; title: string | RegExp }> = [
      { label: "Agent behavior", title: "Agent behavior" },
      { label: "Integrations", title: "Integrations" },
      { label: "Billing", title: "Billing" },
      { label: "Knowledge base", title: "Knowledge base" },
      { label: "Members", title: "Members" },
      { label: "Notifications", title: "Notifications" },
    ];

    for (const e of expectations) {
      await page.locator(".settings-nav-item").filter({ hasText: e.label }).click();
      await expect(page.locator(".page-title")).toHaveText(e.title);
    }
  });

  test("Billing surface: 3 summary cards, breakdown, keys, usage", async ({
    page,
  }) => {
    await page.goto("/settings");
    await page.locator(".settings-nav-item").filter({ hasText: "Billing" }).click();

    // 3 summary cards (cycle / plan / next invoice).
    await expect(page.locator(".billing-summary .billing-card")).toHaveCount(3);

    // Cost breakdown — has its own section panel + bar.
    await expect(
      page
        .locator(".billing-section")
        .filter({ has: page.getByText(/Cost breakdown/i) }),
    ).toBeVisible();

    // 4 API key rows (mock has 4).
    await expect(page.locator(".billing-key")).toHaveCount(4);

    // 4 model rows in the usage table.
    await expect(
      page
        .locator(".billing-section")
        .filter({ has: page.getByText(/Usage by model/i) }),
    ).toBeVisible();
  });

  test("Reveal toggles the API-key mask", async ({ page }) => {
    await page.goto("/settings");
    await page.locator(".settings-nav-item").filter({ hasText: "Billing" }).click();

    const firstKeyMask = page.locator(".billing-key").first().locator(".billing-key-mask span").first();
    const before = (await firstKeyMask.innerText()).trim();

    // The reveal/hide affordance is the first link-button labelled "Reveal".
    await page
      .locator(".billing-key")
      .first()
      .getByRole("button", { name: /Reveal/ })
      .click();

    const after = (await firstKeyMask.innerText()).trim();
    expect(after).not.toBe(before);
  });
});
