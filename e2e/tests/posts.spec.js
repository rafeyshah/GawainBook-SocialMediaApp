// Posts end to end: spoiler cover, comments, notifications, edit, delete.
const { test, expect } = require("@playwright/test");

test.skip(Boolean(process.env.BASE_URL), "creates and deletes data; run against the local e2e server");

const stamp = Date.now().toString(36).slice(-6);
const writer = { username: `wrt${stamp}`, email: `wrt-${stamp}@example.com`, password: "writer-pass-1" };
const friend = { username: `frd${stamp}`, email: `frd-${stamp}@example.com`, password: "friend-pass-1" };

async function signUp(page, who) {
  await page.goto("/register");
  await page.getByLabel("Username").fill(who.username);
  await page.getByLabel("Email").fill(who.email);
  await page.getByLabel("Password", { exact: true }).fill(who.password);
  await page.getByLabel("Confirm password").fill(who.password);
  await page.getByLabel(/I accept the terms of use/).check();
  await page.getByLabel(/at least 16 years old/).check();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("link", { name: "Your profile" })).toBeVisible();
}

test("spoiler post → friend reveals and comments → writer notified → edit → delete", async ({ browser }) => {
  const wCtx = await browser.newContext();
  const fCtx = await browser.newContext();
  const w = await wCtx.newPage();
  const f = await fCtx.newPage();

  await signUp(w, writer);
  await w.goto("/feed");
  const composer = w.getByRole("form", { name: "Create a post" });
  await composer.getByLabel("What are you reading?").fill("Captain Wentworth's letter made me cry.");
  await composer.getByLabel("This post has spoilers").check();
  await composer.getByPlaceholder("For which book? (optional)").fill("Persuasion");
  await composer.getByRole("button", { name: "Post" }).click();
  const myPost = w.getByRole("article").filter({ hasText: "Captain Wentworth" });
  await expect(myPost.getByText("Spoiler for Persuasion")).toBeVisible();
  const postUrl = await myPost.locator("a.postDate").getAttribute("href");

  // The friend sees it covered until they choose to reveal.
  await signUp(f, friend);
  await f.goto(postUrl);
  const post = f.getByRole("article").first();
  await expect(post.getByRole("button", { name: "Show spoiler" })).toBeVisible();
  await expect(post.locator(".postBody")).toHaveClass(/isCovered/);
  await post.getByRole("button", { name: "Show spoiler" }).click();
  await expect(post.locator(".postBody")).not.toHaveClass(/isCovered/);

  // Comments are open on the post page.
  await post.getByLabel("Write a comment").fill("Same! 'You pierce my soul.'");
  await post.getByRole("button", { name: "Send" }).click();
  await expect(post.getByText("Same! 'You pierce my soul.'")).toBeVisible();
  await expect(post.getByRole("button", { name: "1 comment" })).toBeVisible();

  // The writer is notified, without a spoiler preview.
  await w.reload();
  await w.getByRole("button", { name: /Notifications, 1 unread/ }).click();
  const note = w.getByRole("link", { name: new RegExp(`${friend.username} commented on your post`) });
  await expect(note).toContainText("Hidden: the post has spoilers.");
  await note.click();
  await expect(w).toHaveURL(new RegExp(`${postUrl}$`));
  await expect(w.getByText("Same! 'You pierce my soul.'")).toBeVisible();

  // The writer edits the post, then deletes the friend's comment (it's on their post).
  await w.getByRole("button", { name: "Edit post" }).click();
  const editor = w.getByRole("form", { name: "Edit post" });
  await editor.getByLabel("Your post").fill("Wentworth's letter. That's it, that's the post.");
  await editor.getByRole("button", { name: "Save" }).click();
  await expect(w.getByText("That's it, that's the post.")).toBeVisible();
  await expect(w.getByText(/· edited/)).toBeVisible();

  w.on("dialog", (d) => d.accept());
  await w.getByRole("button", { name: `Delete comment by ${friend.username}` }).click();
  await expect(w.getByText(/No comments yet/)).toBeVisible();

  // Delete the post: back to the feed, and gone for the friend too.
  await w.getByRole("button", { name: "Delete post" }).click();
  await expect(w).toHaveURL(/\/feed$/);
  await f.goto(postUrl);
  await expect(f.getByRole("heading", { name: "Post not found" })).toBeVisible();

  await wCtx.close();
  await fCtx.close();
});
