// README screenshots, framed in a browser window (or phone) on a soft background.
// Start the throwaway server first (node Node-Rest-API/dist/scripts/e2eServer.js), then:
//   cd e2e && node scripts/readme-screenshots.js http://localhost:8899 ../docs/screenshots
// Set PW_CHANNEL=msedge on Windows to use the installed Edge.
const { chromium } = require("@playwright/test");
const fs = require("fs");
const path = require("path");
const [base, outDir] = process.argv.slice(2);
const SHOWN_HOST = "gawainbook.onrender.com";
const PASSWORD = "sample-password";
fs.mkdirSync(outDir, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function login(ctx, username) {
  const page = await ctx.newPage();
  await page.goto(base + "/login", { waitUntil: "networkidle" });
  await page.fill("#email", `${username}@sample.gawainbook.invalid`);
  await page.fill("#password", PASSWORD);
  await page.click("button[type=submit]");
  await page.waitForSelector("a[href^='/circles/']");
  return page;
}

// Calls the API from inside the page (cookies + CSRF header, like the app).
const api = (page, method, url, body) =>
  page.evaluate(
    async ({ method, url, body }) => {
      const csrf = decodeURIComponent((document.cookie.match(/(?:^|; )gb_csrf=([^;]+)/) || [])[1] || "");
      const r = await fetch("/api" + url, { method, credentials: "include", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf }, body: body ? JSON.stringify(body) : undefined });
      return r.json();
    },
    { method, url, body }
  );

async function settle(page) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; setTimeout(r, 8000); })))));
  await wait(700);
}

function frameHtml({ shot, url, theme, phone }) {
  const dark = theme === "dark";
  const bg = dark
    ? "radial-gradient(1200px 600px at 10% 0%, #1e3b2e 0%, transparent 60%), radial-gradient(900px 500px at 100% 100%, #2a2238 0%, transparent 55%), #0d0f10"
    : "radial-gradient(1200px 600px at 0% 0%, #dcebe1 0%, transparent 60%), radial-gradient(900px 500px at 100% 100%, #f1e4d6 0%, transparent 55%), #f5f3ee";
  if (phone) {
    return `<html><body style="margin:0;background:${bg};width:760px;height:1000px;display:grid;place-items:center">
      <div style="padding:14px;border-radius:52px;background:#111;box-shadow:0 30px 80px rgba(16,24,40,.35),0 0 0 2px #2b2b2b inset">
        <div style="position:relative;border-radius:40px;overflow:hidden;width:390px;height:844px">
          <img src="${shot}" style="width:390px;display:block">
          <div style="position:absolute;top:10px;left:50%;transform:translateX(-50%);width:110px;height:30px;border-radius:20px;background:#111"></div>
        </div></div></body></html>`;
  }
  const chrome = dark ? "#1c1d20" : "#ffffff", bar = dark ? "#2a2b2f" : "#f1f1ef", text = dark ? "#a1a1aa" : "#6b6b73", border = dark ? "#2e2f33" : "#e3e3df";
  return `<html><body style="margin:0;background:${bg};width:1600px;height:1060px;display:grid;place-items:center;font-family:Segoe UI,sans-serif">
    <div style="width:1440px;border-radius:14px;overflow:hidden;background:${chrome};box-shadow:0 30px 90px rgba(16,24,40,.28),0 0 0 1px ${border}">
      <div style="height:44px;display:flex;align-items:center;gap:8px;padding:0 16px;border-bottom:1px solid ${border}">
        <span style="width:12px;height:12px;border-radius:50%;background:#ff5f57"></span><span style="width:12px;height:12px;border-radius:50%;background:#febc2e"></span><span style="width:12px;height:12px;border-radius:50%;background:#28c840"></span>
        <div style="margin:0 auto;width:560px;height:28px;border-radius:8px;background:${bar};display:flex;align-items:center;justify-content:center;gap:8px;font-size:13px;color:${text}">
          <svg width="11" height="12" viewBox="0 0 11 12"><rect x="1" y="5" width="9" height="7" rx="1.5" fill="${text}"/><path d="M3 5V3.5a2.5 2.5 0 015 0V5" stroke="${text}" stroke-width="1.4" fill="none"/></svg>${url}</div>
        <span style="width:52px"></span></div>
      <img src="${shot}" style="width:1440px;display:block"></div></body></html>`;
}

async function frame(browser, buf, opts, file) {
  const raw = path.join(outDir, "_raw-" + file);
  fs.writeFileSync(raw, buf);
  const html = path.join(outDir, "_frame.html");
  fs.writeFileSync(html, frameHtml({ shot: "file:///" + raw.replace(/\\/g, "/"), ...opts }));
  const ctx = await browser.newContext({ viewport: { width: opts.phone ? 760 : 1600, height: opts.phone ? 1000 : 1060 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  await p.goto("file:///" + html.replace(/\\/g, "/"));
  await p.evaluate(() => Promise.all([...document.images].map((i) => i.decode().catch(() => {}))));
  await p.screenshot({ path: path.join(outDir, file) });
  await ctx.close();
  fs.unlinkSync(raw);
  console.log("framed", file);
}

(async () => {
  const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined, args: ["--allow-file-access-from-files"] });

  // Stage the data: darcy replies to elinor's discussion (a notification),
  // elinor fills in her reading profile.
  const dctx = await browser.newContext();
  const darcy = await login(dctx, "darcy_fan");
  const elCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const el = await login(elCtx, "elinor_reads");
  const circle = await el.$$eval("a[href^='/circles/']", (as) => as.find((a) => a.textContent.includes("Netherfield")).getAttribute("href"));
  await el.goto(base + circle, { waitUntil: "networkidle" });
  const thread = await el.$$eval("a[href^='/threads/']", (as) => as.find((a) => a.textContent.includes("Charlotte")).getAttribute("href"));
  await api(darcy, "POST", `${thread}/comments`, { body: "Practical, yes, but she knew exactly what she was choosing. I respect her more on a reread." });
  const me = await api(el, "GET", "/auth/me");
  await api(el, "PUT", `/users/${me._id}`, { favoriteGenres: ["Classics", "Romance", "Historical fiction"], readingLanguage: "en", pace: 5 });
  await api(el, "POST", `${circle}/invitations`, { expiresInDays: 7, maxUses: 10 });

  const capture = async (page, url, { theme = "light", ready, action } = {}) => {
    await page.goto(base + url, { waitUntil: "networkidle" });
    await page.evaluate((t) => localStorage.setItem("theme", t), theme);
    await page.reload({ waitUntil: "networkidle" });
    if (ready) await page.waitForSelector(ready);
    if (action) await action(page);
    await settle(page);
    return page.screenshot();
  };

  const shots = [
    ["circles-home.png", "/", { ready: ".circleGrid" }],
    ["circle.png", circle, { ready: ".memberList" }],
    ["circle-dark.png", circle, { ready: ".memberList", theme: "dark" }],
    ["discussion.png", thread, { ready: ".threadTitle" }],
    ["notifications.png", "/", { ready: ".circleGrid", action: async (p) => { await p.click("button[aria-label^='Notifications']"); await p.waitForSelector(".notifPanel"); } }],
    ["book.png", "/books/pride-and-prejudice", { ready: ".chapterMap" }],
    ["library.png", "/library", { ready: ".libraryGrid" }],
    ["profile.png", "/profile/elinor_reads", { ready: ".factList" }],
    ["settings.png", "/settings", { ready: "form[aria-label='Change password']" }],
  ];
  for (const [file, url, opts] of shots) {
    const buf = await capture(el, url, opts);
    const shown = url === "/" ? "" : url;
    await frame(browser, buf, { url: SHOWN_HOST + shown, theme: opts.theme || "light" }, file);
  }

  // Phone
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, storageState: await elCtx.storageState() });
  const m = await mctx.newPage();
  await frame(browser, await capture(m, circle, { ready: ".circleHero" }), { phone: true }, "mobile-circle.png");
  await frame(browser, await capture(m, thread, { ready: ".replyList" }), { phone: true }, "mobile-discussion.png");

  // Signed out: create-account page
  const gctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const g = await gctx.newPage();
  await frame(browser, await capture(g, "/register", { ready: "#username" }), { url: SHOWN_HOST + "/register" }, "sign-up.png");

  fs.rmSync(path.join(outDir, "_frame.html"), { force: true });
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
