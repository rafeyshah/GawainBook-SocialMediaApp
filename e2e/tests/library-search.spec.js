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
  await expect(page.getByText("No chapter list yet", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("radio", { name: "Reading" })).toHaveAttribute("aria-checked", "true");

  // Searching again shows it as one of ours, already on the Reading shelf.
  await page.goto("/library");
  await page.getByRole("searchbox", { name: "Title or author" }).fill("Northanger Abbey");
  await page.getByRole("button", { name: "Search" }).click();
  const ours = page.getByRole("list", { name: "Books on GawainBook" });
  await expect(ours.getByRole("listitem").filter({ hasText: title }).getByRole("status")).toContainText("Reading");
  await page.screenshot({ path: "test-results/library-search.png", fullPage: true });
});
