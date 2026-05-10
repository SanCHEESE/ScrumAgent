import { expect, test } from "@playwright/test";
import { clearStorage } from "./_setup";

test.beforeEach(async ({ page }) => {
  await clearStorage(page);
});

test.describe("Updates screen", () => {
  test("filter chips and updates list visible", async ({ page }) => {
    await page.goto("/updates");

    const tabs = page.locator(".tabs .tab");
    // 5 chips: All / Pending / Approved / Rejected / Applied.
    await expect(tabs).toHaveCount(5);
    for (const label of ["All", "Pending", "Approved", "Rejected", "Applied"]) {
      await expect(page.getByRole("tab", { name: new RegExp(label) })).toBeVisible();
    }
    await expect(page.locator(".update-card").first()).toBeVisible();
  });

  test("Pending filter limits the list to pending items", async ({ page }) => {
    await page.goto("/updates");

    // The screen defaults to "Pending" already, but click anyway to be explicit.
    await page.getByRole("tab", { name: /Pending/ }).click();
    const cards = page.locator(".update-card");
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);

    // Two pending updates in mock data — verify the count badge matches.
    const pendingTab = page.getByRole("tab", { name: /Pending/ });
    const badgeText = await pendingTab.locator(".tab-count").innerText();
    expect(parseInt(badgeText, 10)).toBe(count);
  });

  test("clicking a card updates the detail pane", async ({ page }) => {
    await page.goto("/updates");
    const cards = page.locator(".update-card");
    if ((await cards.count()) > 1) {
      await cards.nth(1).click();
      await expect(cards.nth(1)).toHaveClass(/active/);
    }
    await expect(page.locator(".update-detail")).toBeVisible();
  });

  test("Edit proposal: editor toggles, save flips edited badge", async ({
    page,
  }) => {
    await page.goto("/updates");
    // Make sure we land on a pending item so the "Edit" / "Approve" affordances exist.
    await page.getByRole("tab", { name: /Pending/ }).click();
    await page.locator(".update-card").first().click();

    await page.getByRole("button", { name: /Edit proposal/ }).click();
    // After clicking, the After side has .is-editing.
    await expect(page.locator(".diff-after")).toHaveClass(/is-editing/);

    const editor = page.locator(".diff-editor");
    await expect(editor).toBeVisible();
    await editor.fill("Edited proposal text by test");

    await page.getByRole("button", { name: /Save changes/ }).click();
    // Saving exits editing mode.
    await expect(page.locator(".diff-after")).not.toHaveClass(/is-editing/);
    // Card has the "edited by you" badge in the active card on the left.
    await expect(
      page.locator(".update-card.active .update-card-edited"),
    ).toBeVisible();
  });

  test("Approve flips status pill and changes the action row", async ({
    page,
  }) => {
    await page.goto("/updates");
    await page.getByRole("tab", { name: /Pending/ }).click();
    await page.locator(".update-card").first().click();

    await page.getByRole("button", { name: /^Approve/ }).click();
    // Status pill (rendered as .badge) reads "Approved" after approval.
    await expect(
      page.locator(".update-detail .badge").filter({ hasText: /approved/i }).first(),
    ).toBeVisible();
    // The Approve primary action is gone — replaced by Undo.
    await expect(
      page.locator(".update-detail").getByRole("button", { name: /Approve/ }),
    ).toHaveCount(0);
  });
});
