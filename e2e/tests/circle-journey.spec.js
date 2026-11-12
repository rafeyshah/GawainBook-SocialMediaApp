// The core promise, end to end (launch plan §4.3, week 4):
// sign up → join via invite → set chapter 4 → see the chapter 1–4 threads →
// chapter 9 thread locked → reply → the other reader sees the reply.
const { test, expect } = require("@playwright/test");

const stamp = Date.now().toString(36).slice(-6);
const organiser = { username: `e2eorg${stamp}`, email: `e2e-org-${stamp}@example.com`, password: "e2e-pass-123" };
const reader = { username: `e2erdr${stamp}`, email: `e2e-rdr-${stamp}@example.com`, password: "e2e-pass-123" };

async function signUp(page, who) {
  await page.goto("/register");
  await page.getByLabel("Username").fill(who.username);
  await page.getByLabel("Email").fill(who.email);
  await page.getByLabel("Password", { exact: true }).fill(who.password);
  const again = page.getByLabel("Confirm password");
  if (await again.count()) await again.fill(who.password);
  await page.getByLabel(/I accept the terms of use/).check();
  await page.getByLabel(/at least 16 years old/).check();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("link", { name: "Your profile" })).toBeVisible();
}

async function setChapter(page, n) {
  const select = page.getByLabel(/Chapter you've reached in Pride and Prejudice/).first();
  await select.selectOption(String(n));
  await expect(select).toBeEnabled();
  await expect(page.getByText(`Chapter ${n} of 61`).first()).toBeVisible();
}

async function startDiscussion(page, chapter, title) {
  await page.getByRole("button", { name: "New discussion" }).click();
  const form = page.getByRole("form", { name: "Start a discussion" });
  await form.getByLabel("About chapter").selectOption(String(chapter));
  await form.getByLabel("Title").fill(title);
  await form.getByLabel("Your thoughts").fill(`Thoughts on chapter ${chapter}: ${title}`);
  await form.getByRole("button", { name: "Start discussion" }).click();
  await expect(page.getByRole("link", { name: new RegExp(title) })).toBeVisible();
}

// Remove the test accounts afterwards (their circle and posts cascade).
// Through the real Settings page, like a reader would.
async function deleteAccount(page, who) {
  await page.goto("/settings");
  await page.getByRole("button", { name: "Delete my account…" }).click();
  const form = page.getByRole("form", { name: "Delete account" });
  await form.getByLabel(/Type your username/).fill(who.username);
  await form.getByLabel("Your password").fill(who.password);
  await form.getByRole("button", { name: "Delete forever" }).click();
  await expect(page).toHaveURL(/\/login/);
}

test("two readers at different chapters: invite, spoiler lock, reply, notification", async ({ browser }) => {
  const orgCtx = await browser.newContext();
  const rdrCtx = await browser.newContext();
  const org = await orgCtx.newPage();
  const rdr = await rdrCtx.newPage();

  try {
    // 1. The organiser starts a private circle and is at chapter 9.
    await signUp(org, organiser);
    await org.getByRole("button", { name: "Start a circle" }).click();
    const create = org.getByRole("form", { name: "Start a circle" });
    await create.getByLabel("Circle name").fill(`E2E Circle ${stamp}`);
    await create.getByLabel("Book").selectOption({ label: "Pride and Prejudice" });
    await create.getByLabel("Who can find it").selectOption("private");
    await create.getByRole("button", { name: "Create circle" }).click();
    await expect(org.getByRole("heading", { name: `E2E Circle ${stamp}` })).toBeVisible();

    await setChapter(org, 9);
    await startDiscussion(org, 1, "That opening line");
    await startDiscussion(org, 4, "Jane and Bingley");
    await startDiscussion(org, 9, "Pemberley secrets");

    // 2. An invite link (7 days, up to 5 people).
    const linkForm = org.getByRole("form", { name: "Create an invite link" });
    await linkForm.getByLabel("Can be used by").selectOption("5");
    await linkForm.getByRole("button", { name: "Create link" }).click();
    // The link is shown shortened (…/join/<code>); the full URL is in its title.
    const inviteUrl = await org.getByRole("list", { name: "Active invite links" }).locator(".inviteLink").first().getAttribute("title");
    const invitePath = new URL(inviteUrl).pathname;
    expect(invitePath).toMatch(/^\/join\/[\w-]{12}$/);

    // 3. A new reader follows the link: signs up first, comes back to it.
    await rdr.goto(invitePath);
    await expect(rdr).toHaveURL(/\/login\?next=/);
    await signUp(rdr, reader);
    await rdr.goto(invitePath);
    await expect(rdr.getByText("You're invited to join")).toBeVisible();
    await rdr.getByRole("button", { name: "Join the circle" }).click();
    await expect(rdr.getByRole("heading", { name: `E2E Circle ${stamp}` })).toBeVisible();

    // 4. Chapter 4: chapters 1–4 open, chapter 9 locked with no title.
    await setChapter(rdr, 4);
    await expect(rdr.getByRole("link", { name: /That opening line/ })).toBeVisible();
    await expect(rdr.getByRole("link", { name: /Jane and Bingley/ })).toBeVisible();
    await expect(rdr.getByLabel("Chapter 9 discussion, locked")).toBeVisible();
    await expect(rdr.getByText("Pemberley secrets")).toHaveCount(0);
    // Search doesn't find it either.
    await rdr.getByRole("searchbox", { name: "Search discussions" }).fill("Pemberley");
    await rdr.getByRole("button", { name: "Search" }).click();
    await expect(rdr.getByText("No matches for “Pemberley”")).toBeVisible();
    await rdr.getByRole("button", { name: "Clear" }).click();

    // The API agrees: the locked thread returns no title or body.
    const lockedId = await org.getByRole("link", { name: /Pemberley secrets/ }).getAttribute("href");
    await rdr.goto(lockedId);
    await expect(rdr.getByRole("heading", { name: "Chapter 9 discussion" })).toBeVisible();
    await expect(rdr.getByText("Pemberley secrets")).toHaveCount(0);
    const apiBody = await rdr.evaluate(async (url) => (await fetch(`/api${url}`, { credentials: "include" })).text(), lockedId);
    expect(apiBody).not.toContain("Pemberley");

    // 5. The reader replies in the chapter 4 discussion.
    await rdr.getByRole("link", { name: "Back to the circle" }).click();
    await rdr.getByRole("link", { name: /Jane and Bingley/ }).click();
    const replyForm = rdr.getByRole("form", { name: "Reply" });
    await replyForm.getByLabel("Your reply").fill("Jane deserves better than a letter from Caroline!");
    await replyForm.getByRole("button", { name: "Reply" }).click();
    await expect(rdr.getByText("Jane deserves better than a letter from Caroline!")).toBeVisible();

    // 6. The organiser is notified and sees the reply.
    await org.reload();
    const bell = org.getByRole("button", { name: /Notifications, 1 unread/ });
    await expect(bell).toBeVisible();
    await bell.click();
    await org.getByRole("link", { name: new RegExp(`${reader.username} replied to Jane and Bingley`) }).click();
    await expect(org.getByText("Jane deserves better than a letter from Caroline!")).toBeVisible();

    // 7. Moving back a chapter re-locks discussions straight away.
    await rdr.goto(invitePath.replace(/^\/join\/.*/, "/"));
    await rdr.getByRole("link", { name: new RegExp(`E2E Circle ${stamp}`) }).first().click();
    await setChapter(rdr, 3);
    await expect(rdr.getByLabel("Chapter 4 discussion, locked")).toBeVisible();
  } finally {
    if (!process.env.BASE_URL || process.env.E2E_CLEANUP) {
      await deleteAccount(rdr, reader).catch(() => {});
      await deleteAccount(org, organiser).catch(() => {});
    }
    await orgCtx.close();
    await rdrCtx.close();
  }
});
