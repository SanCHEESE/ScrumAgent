import { expect, test, type BrowserContext } from "@playwright/test";
import { clearStorage } from "./_setup";

const API = "http://localhost:8000";
const TOKEN_KEY = "kabanchik.production.token";

const projectA = {
  id: "p-a",
  name: "Project A",
  description: null,
  color: "#0077e6",
  agent_email: "a.scrum.agent@municorn.com",
  google_connected: true,
  jira_site_url: null,
  jira_user_email: null,
  jira_project_key: null,
  notion_section_url: null,
  notion_page_id: null,
  members: [],
  pending_members: [],
  created_at: "2026-06-18T00:00:00Z",
};

const projectB = {
  ...projectA,
  id: "p-b",
  name: "Project B",
  agent_email: "b.scrum.agent@municorn.com",
};

function sseBody(conversationId: string, messageId: number): string {
  return [
    `data: ${JSON.stringify({ type: "meta", conversation_id: conversationId, run_id: `run-${conversationId}` })}`,
    `data: ${JSON.stringify({ type: "token", delta: "ok" })}`,
    `data: ${JSON.stringify({ type: "citations", items: [] })}`,
    `data: ${JSON.stringify({ type: "done", message_id: messageId })}`,
    "",
  ].join("\n\n");
}

function mockChatBackend(
  context: BrowserContext,
  opts: {
    projects?: unknown[];
    conversations?: unknown[];
    delayProjectsMs?: number;
    chatStatus?: number;
  } = {},
): { posts: () => Record<string, unknown>[] } {
  const posts: Record<string, unknown>[] = [];
  const projects = opts.projects ?? [projectA];
  const conversations = opts.conversations ?? [];

  context.route(`${API}/auth/me`, (route) =>
    route.fulfill({ json: { id: 1, email: "alice@municorn.com", name: "Alice" } }),
  );
  context.route(`${API}/projects`, async (route) => {
    if (opts.delayProjectsMs) {
      await new Promise((resolve) => setTimeout(resolve, opts.delayProjectsMs));
    }
    route.fulfill({ json: projects });
  });
  context.route(`${API}/projects/*/meetings*`, (route) => route.fulfill({ json: [] }));
  context.route(`${API}/projects/*/conversations`, (route) =>
    route.fulfill({ json: conversations }),
  );
  context.route(`${API}/projects/*/chat`, (route) => {
    posts.push(route.request().postDataJSON() as Record<string, unknown>);
    if (opts.chatStatus) {
      route.fulfill({ status: opts.chatStatus, json: { detail: "expired" } });
      return;
    }
    const projectId = new URL(route.request().url()).pathname.split("/")[2] ?? "p";
    const messageId = posts.length;
    route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: sseBody(`conv-${projectId}`, messageId),
    });
  });

  return { posts: () => posts };
}

test.beforeEach(async ({ page }) => {
  await clearStorage(page);
});

test.describe("Chat screen", () => {
  test("renders history pane and composer", async ({ page, context }) => {
    mockChatBackend(context);
    await page.goto("/chat");

    await expect(page.locator(".chat-history-pane")).toBeVisible();
    await expect(page.locator(".chat-composer")).toBeVisible();
    // The composer textarea is the obvious "send a message" target.
    await expect(page.locator(".chat-composer-input")).toBeVisible();
  });

  test("user message + streamed agent response", async ({ page, context }) => {
    mockChatBackend(context);
    await page.goto("/chat");

    const composer = page.locator(".chat-composer-input");
    await composer.fill("what's blocked?");
    await page.getByRole("button", { name: /^Send/ }).click();

    // The user bubble appears immediately.
    await expect(
      page.locator(".msg-user .msg-bubble").filter({ hasText: "what's blocked?" }),
    ).toBeVisible();

    // The live chat path renders streamed SSE token text; action rows belong
    // only to the old mock response fixture.
    const lastAgent = page.locator(".msg-agent").last();
    await expect(lastAgent.locator(".msg-text")).toContainText("ok");
  });

  test('"New session" resets the conversation', async ({ page, context }) => {
    mockChatBackend(context);
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

  test("history search filters the session list", async ({ page, context }) => {
    mockChatBackend(context, {
      conversations: [
        {
          id: "c-auth",
          title: "Auth rollout",
          updated_at: "2026-06-18T08:00:00Z",
        },
        {
          id: "c-rag",
          title: "RAG ingestion",
          updated_at: "2026-06-18T09:00:00Z",
        },
      ],
    });
    await page.goto("/chat");
    await expect(page.locator(".chat-history-item")).toHaveCount(2);

    await page
      .getByPlaceholder("Search sessions…")
      .fill("Auth");

    await expect(page.locator(".chat-history-item")).toHaveCount(1);
    await expect(page.locator(".chat-history-item")).toContainText("Auth rollout");
  });

  test("seed query sends after the active project finishes loading", async ({
    page,
    context,
  }) => {
    const backend = mockChatBackend(context, {
      projects: [projectA],
      delayProjectsMs: 200,
    });

    await page.goto("/chat?seed=what%20changed");

    await expect.poll(() => backend.posts()[0]?.message).toBe("what changed");
  });

  test("switching projects starts a fresh conversation", async ({
    page,
    context,
  }) => {
    const backend = mockChatBackend(context, { projects: [projectA, projectB] });
    await page.goto("/chat");

    const composer = page.locator(".chat-composer-input");
    await composer.fill("first project message");
    await page.getByRole("button", { name: /^Send/ }).click();
    await expect.poll(() => backend.posts().length).toBe(1);
    expect(backend.posts()[0]?.conversation_id).toBeUndefined();

    await page.locator(".project-switcher").click();
    await page.getByRole("dialog").getByRole("button", { name: /Project B/ }).click();

    await composer.fill("second project message");
    await page.getByRole("button", { name: /^Send/ }).click();

    await expect.poll(() => backend.posts().length).toBe(2);
    expect(backend.posts()[1]?.message).toBe("second project message");
    expect(backend.posts()[1]?.conversation_id).toBeUndefined();
  });

  test("streaming chat 401 clears the token and redirects to login", async ({
    page,
    context,
  }) => {
    mockChatBackend(context, { projects: [projectA], chatStatus: 401 });
    await page.goto("/login");
    await page.evaluate(
      ([key, value]) => window.localStorage.setItem(key, value),
      [TOKEN_KEY, "expired-token"],
    );

    await page.goto("/chat");
    await page.locator(".chat-composer-input").fill("hello");
    await page.getByRole("button", { name: /^Send/ }).click();

    await expect(page).toHaveURL(/\/login$/);
    await expect
      .poll(() => page.evaluate((key) => window.localStorage.getItem(key), TOKEN_KEY))
      .toBeNull();
  });
});
