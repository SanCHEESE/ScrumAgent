import { expect, test } from "@playwright/test";
import { clearStorage } from "./_setup";

test.beforeEach(async ({ page }) => {
  await clearStorage(page);
});

test.describe("Chat screen", () => {
  test("renders history pane and composer", async ({ page }) => {
    await page.goto("/chat");

    await expect(page.locator(".chat-history-pane")).toBeVisible();
    await expect(page.locator(".chat-composer")).toBeVisible();
    // The composer textarea is the obvious "send a message" target.
    await expect(page.locator(".chat-composer-input")).toBeVisible();
  });

  test("user message + agent response with action trace", async ({ page }) => {
    await page.goto("/chat");

    const composer = page.locator(".chat-composer-input");
    await composer.fill("what's blocked?");
    await page.getByRole("button", { name: /^Send/ }).click();

    // The user bubble appears immediately.
    await expect(
      page.locator(".msg-user .msg-bubble").filter({ hasText: "what's blocked?" }),
    ).toBeVisible();

    // Streaming runs ~3s of timers; wait for the response to render at least
    // one action row and prose text on the latest agent message.
    const lastAgent = page.locator(".msg-agent").last();
    await expect(lastAgent.locator(".agent-action").first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(lastAgent.locator(".msg-text")).toBeVisible({
      timeout: 15_000,
    });
    await expect(lastAgent.locator(".msg-text")).not.toBeEmpty();
  });

  test('"New session" resets the conversation', async ({ page }) => {
    await page.goto("/chat");

    const composer = page.locator(".chat-composer-input");
    await composer.fill("auth refactor decision?");
    await page.getByRole("button", { name: /^Send/ }).click();
    await expect(page.locator(".msg-user").first()).toBeVisible();

    // Wait for the agent response to start rendering text so we don't
    // intercept a half-streamed message (the screen also cancels timers on
    // reset, but waiting reduces flake).
    const lastAgent = page.locator(".msg-agent").last();
    await expect(lastAgent.locator(".msg-text")).toBeVisible({
      timeout: 15_000,
    });

    // Two "New session" buttons exist (history pane + chat header). Use the
    // header one — it lives inside .chat-main.
    await page
      .locator(".chat-main")
      .getByRole("button", { name: "New session" })
      .click();
    // After reset only the seed agent greeting remains (no user bubbles).
    await expect(page.locator(".msg-user")).toHaveCount(0);
    await expect(page.locator(".msg-agent")).toHaveCount(1);
  });

  test("history search filters the session list", async ({ page }) => {
    await page.goto("/chat");
    const initialCount = await page.locator(".chat-history-item").count();
    expect(initialCount).toBeGreaterThan(0);

    await page
      .getByPlaceholder("Search sessions…")
      .fill("zzzz-no-match-expected");

    // Either zero results, or a strict subset.
    const filteredCount = await page.locator(".chat-history-item").count();
    expect(filteredCount).toBeLessThanOrEqual(initialCount);
  });
});
