// Account lifecycle and site safety, end to end in a real browser:
// sign-up consent → confirm email from the link → forgot password → reset →
// report a post → an admin deletes it and suspends the writer → export → delete.
// Needs the throwaway e2e server (its /__e2e hooks read emails, make admins),
// so it's skipped against a deployed site.
const { test, expect } = require("@playwright/test");

test.skip(Boolean(process.env.BASE_URL), "needs the local e2e server's test hooks");

const stamp = Date.now().toString(36).slice(-6);
const reader = { username: `acct${stamp}`, email: `acct-${stamp}@example.com`, password: "first-pass-1" };
const admin = { username: `adm${stamp}`, email: `adm-${stamp}@example.com`, password: "admin-pass-1" };
const troll = { username: `trl${stamp}`, email: `trl-${stamp}@example.com`, password: "troll-pass-1" };

async function signUp(page, who, { consent = true } = {}) {
  await page.goto("/register");
  await page.getByLabel("Username").fill(who.username);
  await page.getByLabel("Email").fill(who.email);
  await page.getByLabel("Password", { exact: true }).fill(who.password);
  await page.getByLabel("Confirm password").fill(who.password);
  if (consent) {
    await page.getByLabel(/I accept the terms of use/).check();
    await page.getByLabel(/at least 16 years old/).check();
  }
  await page.getByRole("button", { name: "Create account" }).click();
}

const lastEmail = async (request, to) => (await request.get(`/__e2e/last-email?to=${encodeURIComponent(to)}`)).json();

test("sign-up needs consent; email confirmation; forgotten password; export; delete", async ({ page, request }) => {
  // Without the boxes ticked, nothing happens.
  await signUp(page, reader, { consent: false });
  await expect(page.getByRole("alert")).toContainText("accept the terms");
  await expect(page).toHaveURL(/\/register/);

  await page.getByLabel(/I accept the terms of use/).check();
  await page.getByLabel(/at least 16 years old/).check();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("region", { name: "Confirm your email" })).toBeVisible();

  // Confirm from the emailed link.
  const verify = await lastEmail(request, reader.email);
  expect(verify.subject).toMatch(/Confirm your email/);
  await page.goto(verify.link);
  await expect(page.getByRole("heading", { name: /Email confirmed/ })).toBeVisible();
  await page.goto("/settings");
  await expect(page.getByText("Confirmed", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Confirm your email" })).toHaveCount(0);

  // Data export downloads a JSON file with the account in it.
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Download my data" }).click()]);
  expect(download.suggestedFilename()).toMatch(new RegExp(`^gawainbook-${reader.username}-\\d{4}-\\d{2}-\\d{2}\\.json$`));
  const data = JSON.parse(require("fs").readFileSync(await download.path(), "utf8"));
  expect(data.account).toMatchObject({ username: reader.username, email: reader.email });
  expect(JSON.stringify(data)).not.toMatch(/passwordHash/);

  // Sign out, forget the password, reset it from the email.
  await page.getByRole("button", { name: /Log out/ }).click();
  await page.goto("/login");
  await page.getByRole("link", { name: "Forgot your password?" }).click();
  await page.getByLabel("Email").fill(reader.email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("status")).toContainText("If an account uses that email");
  const reset = await lastEmail(request, reader.email);
  expect(reset.subject).toMatch(/Reset your GawainBook password/);
  await page.goto(reset.link);
  reader.password = "second-pass-2";
  await page.getByLabel("New password", { exact: true }).fill(reader.password);
  await page.getByLabel("Confirm new password").fill(reader.password);
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page.getByRole("status")).toContainText("signed in");
  // The link was single-use.
  await page.goto(reset.link);
  await page.getByLabel("New password", { exact: true }).fill("third-pass-33");
  await page.getByLabel("Confirm new password").fill("third-pass-33");
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page.getByRole("alert")).toContainText("already been used");

  // Delete the account from Settings; signing in no longer works.
  await page.goto("/settings");
  await page.getByRole("button", { name: "Delete my account…" }).click();
  const del = page.getByRole("form", { name: "Delete account" });
  await del.getByLabel(/Type your username/).fill(reader.username);
  await del.getByLabel("Your password").fill(reader.password);
  await del.getByRole("button", { name: "Delete forever" }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel("Email").fill(reader.email);
  await page.getByLabel("Password", { exact: true }).fill(reader.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toContainText("Incorrect email or password");
});

test("a reported post reaches the admin, who deletes it and suspends the writer", async ({ browser, request }) => {
  const trollCtx = await browser.newContext();
  const adminCtx = await browser.newContext();
  const t = await trollCtx.newPage();
  const a = await adminCtx.newPage();

  // The troll posts; the soon-to-be admin follows them so the post shows in the feed.
  await signUp(t, troll);
  await expect(t.getByRole("link", { name: "Your profile" })).toBeVisible();
  await t.goto("/feed");
  const composer = t.getByRole("form", { name: "Create a post" });
  await composer.getByRole("textbox").fill("Buy cheap followers at spam.example!");
  await composer.locator("button[type=submit]").click();
  await expect(t.getByText("Buy cheap followers at spam.example!")).toBeVisible();

  await signUp(a, admin);
  await expect(a.getByRole("link", { name: "Your profile" })).toBeVisible();
  await a.goto(`/profile/${troll.username}`);
  const post = a.getByRole("article", { name: `Post by ${troll.username}` });
  await post.getByRole("button", { name: `Report post by ${troll.username}` }).click();
  const form = a.getByRole("form", { name: "Report this post" });
  await form.getByLabel("Spam or advertising").check();
  await form.getByRole("button", { name: "Send report" }).click();
  await expect(post.getByRole("status")).toContainText("Reported");

  // Promote to admin (test hook), reload so the app knows.
  await request.post(`/__e2e/make-admin/${admin.username}`);
  await a.goto("/admin");
  await expect(a.getByRole("heading", { name: "Admin" })).toBeVisible();
  const item = a.getByRole("list", { name: "Reports to review" }).getByRole("listitem").first();
  await expect(item).toContainText("Buy cheap followers");
  a.on("dialog", (d) => d.accept());
  await item.getByRole("button", { name: "Delete post" }).click();
  await expect(a.getByText("All clear")).toBeVisible();

  // Suspending from a profile report.
  await a.goto(`/profile/${troll.username}`);
  await a.getByRole("button", { name: `Report ${troll.username}` }).click();
  const pf = a.getByRole("form", { name: "Report this profile" });
  await pf.getByLabel("Spam or advertising").check();
  await pf.getByRole("button", { name: "Send report" }).click();
  await a.goto("/admin");
  await a.getByRole("button", { name: `Suspend ${troll.username}` }).click();
  await expect(a.getByText("All clear")).toBeVisible();

  // The troll is signed out and can't come back.
  await t.reload();
  await expect(t).toHaveURL(/\/login/);
  await t.getByLabel("Email").fill(troll.email);
  await t.getByLabel("Password", { exact: true }).fill(troll.password);
  await t.getByRole("button", { name: "Sign in" }).click();
  await expect(t.getByRole("alert")).toContainText("suspended");

  await trollCtx.close();
  await adminCtx.close();
});
