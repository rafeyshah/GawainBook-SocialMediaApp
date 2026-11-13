// Search Open Library from the Library page and put a result on a shelf.
// Uses the real Open Library, so it's skipped when OFFLINE is set.
const { test, expect } = require("@playwright/test");

test.skip(Boolean(process.env.BASE_URL), "creates data; run against the local e2e server");
test.skip(Boolean(process.env.OFFLINE), "needs the real Open Library");

const stamp = Date.now().toString(36).slice(-6);
const who = { username: `lib${stamp}`, email: `lib-${stamp}@example.com`, password: "library-pass-1" };

test("find a book on Open Library, add it to Want to read, then move it to Reading", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel("Username").fill(who.username);
  await page.getByLabel("Email").fill(who.email);
  await page.getByLabel("Password", { exact: true }).fill(who.password);
  await page.getByLabel("Confirm password").fill(who.password);
  await page.getByLabel(/I accept the terms of use/).check();
  await page.getByLabel(/at least 16 years old/).check();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("link", { name: "Your profile" })).toBeVisible();

  await page.goto("/library");
  await page.getByRole("searchbox", { name: "Title or author" }).fill("Northanger Abbey");
  await page.getByRole("button", { name: "Search" }).click();
  const results = page.getByRole("list", { name: "Open Library results" });
  await expect(results).toBeVisible({ timeout: 30_000 });
  const first = results.getByRole("listitem").first();
  const title = (await first.locator(".olTitle").innerText()).trim();

  await first.getByRole("button", { name: `Add ${title} to Want to read` }).click();
  await expect(first.getByRole("status")).toContainText("Want to read");
  // The Library's shelf tab switched and lists it.
  await expect(page.getByRole("tabpanel", { name: "Want to read" })).toContainText(title);

  await first.getByRole("button", { name: `Move ${title} to Reading` }).click();
  await expect(first.getByRole("status")).toContainText("Reading");
  await expect(page.getByRole("tabpanel", { name: "Reading" })).toContainText(title);

  // Its own page: shelves work, and it explains there's no chapter list yet.
  await first.getByRole("link", { name: "Open" }).click();
  await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Reading" })).toHaveAttribute("aria-checked", "true");
  // Details from Open Library: a description and subjects.
  await expect(page.locator(".bookHeroText")).not.toBeEmpty();
  await expect(page.getByRole("list", { name: "Subjects" })).toBeVisible();

  // Public-domain book: its real chapter list came from Project Gutenberg.
  await expect(page.getByRole("list", { name: "31 chapters" })).toBeVisible();
  await expect(page.getByText(/Project Gutenberg eBook #/)).toBeVisible();
  await expect(page.getByRole("form", { name: "Set up chapters" })).toHaveCount(0);
  await page.getByLabel(/Chapter you've reached/).selectOption("5");
  await expect(page.getByText("Chapter 5 of 31").first()).toBeVisible();
  const bookUrl = page.url();

  // Searching again shows it as one of ours, already on the Reading shelf.
  await page.goto("/library");
  await page.getByRole("searchbox", { name: "Title or author" }).fill("Northanger Abbey");
  await page.getByRole("button", { name: "Search" }).click();
  const ours = page.getByRole("list", { name: "Books on GawainBook" });
  await expect(ours.getByRole("listitem").filter({ hasText: title }).getByRole("status")).toContainText("Reading");
  await page.screenshot({ path: "test-results/library-search.png", fullPage: true });
});

test("remove a book from your shelves on its page and in the Library", async ({ page }) => {
  const u = { username: `rm${stamp}`, email: `rm-${stamp}@example.com`, password: "remove-pass-1" };
  await page.goto("/register");
  await page.getByLabel("Username").fill(u.username);
  await page.getByLabel("Email").fill(u.email);
  await page.getByLabel("Password", { exact: true }).fill(u.password);
  await page.getByLabel("Confirm password").fill(u.password);
  await page.getByLabel(/I accept the terms of use/).check();
  await page.getByLabel(/at least 16 years old/).check();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("link", { name: "Your profile" })).toBeVisible();

  // Add two demo books from the Library.
  await page.goto("/library");
  await page.locator(".rowCard").filter({ hasText: "Persuasion" }).getByRole("button", { name: "Want to read" }).click();
  await page.locator(".rowCard").filter({ hasText: "Pride and Prejudice" }).getByRole("button", { name: "Reading" }).click();
  const reading = page.getByRole("tabpanel", { name: "Reading" });
  await expect(reading).toContainText("Pride and Prejudice");

  // Remove from a Library tile.
  await reading.getByRole("button", { name: "Remove Pride and Prejudice from your shelves" }).click();
  await expect(page.getByRole("tab", { name: /^Reading\s*0$/ })).toBeVisible();

  // Remove on the book page.
  await page.goto("/books/persuasion");
  await page.getByRole("button", { name: "Remove from my shelves" }).click();
  await expect(page.getByRole("button", { name: "Remove from my shelves" })).toHaveCount(0);
  await page.goto("/library");
  await expect(page.getByRole("tab", { name: /^Want to read\s*0$/ })).toBeVisible();
});
