import type { Page } from "@playwright/test";

/**
 * Shared helpers for the e2e suite.
 *
 * Tests use `localStorage` heavily (Tweaks panel, layout variants), so we need
 * a reliable way to clear state between specs. `clearStorage` runs an in-page
 * script after navigating to a same-origin URL — Chromium will not execute
 * `localStorage.clear()` on the `about:blank` start page.
 */

/** Clears localStorage / sessionStorage for the current origin. */
export async function clearStorage(page: Page): Promise<void> {
  await page.goto("/login");
  await page.evaluate(() => {
    try {
      window.localStorage.clear();
      window.sessionStorage.clear();
    } catch {
      // private mode / restricted storage — ignore
    }
  });
}

/**
 * Reset persisted state, then navigate to `path`. Preferred over `page.goto`
 * for any test that depends on a clean Tweaks / layout state.
 */
export async function gotoFresh(page: Page, path: string): Promise<void> {
  await clearStorage(page);
  await page.goto(path);
}
