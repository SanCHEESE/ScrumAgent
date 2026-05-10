import { expect, test } from "@playwright/test";
import { clearStorage } from "./_setup";

test.beforeEach(async ({ page }) => {
  await clearStorage(page);
});

test.describe("Projects list", () => {
  test("renders project tiles plus the Add project CTA", async ({ page }) => {
    await page.goto("/projects");

    // 3 mock projects + 1 add tile.
    const tiles = page.locator(".project-tile");
    expect(await tiles.count()).toBeGreaterThanOrEqual(4);
    await expect(page.locator(".project-tile-add")).toBeVisible();
  });

  test("Add project tile routes to wizard", async ({ page }) => {
    await page.goto("/projects");
    await page.locator(".project-tile-add").click();
    await expect(page).toHaveURL(/\/projects\/new$/);
  });
});

test.describe("Add Project wizard", () => {
  test("walks through all 5 steps and creates a project", async ({ page }) => {
    await page.goto("/projects/new");

    // Step 1: Details
    await expect(
      page.locator(".wizard-progress-step.active").filter({ hasText: "Details" }),
    ).toBeVisible();
    await page.getByLabel("Project name").fill("E2E Test Squad");
    await page.getByRole("button", { name: /Continue/ }).click();

    // Step 2: Google Workspace
    await expect(
      page.locator(".wizard-progress-step.active").filter({
        hasText: "Google Workspace",
      }),
    ).toBeVisible();
    await page.getByRole("button", { name: /Continue/ }).click();

    // Step 3: Jira
    await expect(
      page.locator(".wizard-progress-step.active").filter({ hasText: "Jira" }),
    ).toBeVisible();
    await page.getByRole("button", { name: /Continue/ }).click();

    // Step 4: Notion
    await expect(
      page.locator(".wizard-progress-step.active").filter({ hasText: "Notion" }),
    ).toBeVisible();
    await page.getByRole("button", { name: /Continue/ }).click();

    // Step 5: Invite team
    await expect(
      page.locator(".wizard-progress-step.active").filter({
        hasText: "Invite team",
      }),
    ).toBeVisible();

    await page.getByRole("button", { name: /Create project/ }).click();
    await expect(page).toHaveURL(/\/projects\?created=1/);
  });
});
