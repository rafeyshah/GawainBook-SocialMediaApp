import { eq } from "drizzle-orm";
import { getDb } from "../src/db/client";
import { emailTokens, users } from "../src/db/schema";
import { LogMailer, MemoryMailer, ResendMailer, createMailer, renderEmail } from "../src/mailer";
import { appUrl, checkNewPassword, RESEND_COOLDOWN_MS } from "../src/routes/account";
import { TERMS_VERSION } from "../src/legal";
import { Client, CONSENT, mailer, makeApp, newClient, signUp, createPost } from "./helpers";
import { makeBook, makeCircle, makeThread, setProgress } from "./reading.helpers";

beforeEach(() => {
  mailer.sent = [];
  mailer.fail = false;
});

const tokenFrom = (link?: string) => new URL(link!).searchParams.get("token")!;
const pathOf = (link?: string) => new URL(link!).pathname;
// Pretend the last email of a kind was sent long enough ago to send another.
const ageTokens = (userId: string) =>
  getDb().update(emailTokens).set({ createdAt: new Date(Date.now() - RESEND_COOLDOWN_MS - 1000) }).where(eq(emailTokens.userId, userId));

describe("mailer", () => {
  test("renderEmail escapes HTML and includes the link in text and HTML", () => {
    const { text, html } = renderEmail({ greeting: "Hi <b>x</b>,", lines: ["a & b"], button: "Go", url: "https://x.test/a?t=1&u=2", footer: "f" });
    expect(text).toContain("Go: https://x.test/a?t=1&u=2");
    expect(html).toContain("Hi &lt;b&gt;x&lt;/b&gt;,");
    expect(html).toContain("a &amp; b");
    expect(html).toContain('href="https://x.test/a?t=1&amp;u=2"');
    expect(html).not.toContain("<b>x</b>");
  });

  test("createMailer picks Resend only when an API key is set", () => {
    expect(createMailer({}).kind).toBe("log");
    expect(createMailer({ RESEND_API_KEY: "re_x" }).kind).toBe("resend");
  });

  test("ResendMailer posts the message with the key and sender", async () => {
    const fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "" });
    await new ResendMailer("re_key", "GawainBook <hi@x.test>", fetch).send({ to: "a@x.test", subject: "S", text: "T", html: "H" });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers.Authorization).toBe("Bearer re_key");
    expect(JSON.parse(init.body)).toEqual({ from: "GawainBook <hi@x.test>", to: ["a@x.test"], subject: "S", text: "T", html: "H" });
  });

  test("ResendMailer throws on an error response", async () => {
    const fetch = jest.fn().mockResolvedValue({ ok: false, status: 422, text: async () => "invalid from" });
    await expect(new ResendMailer("k", "f", fetch).send({ to: "a", subject: "s", text: "t", html: "h" })).rejects.toThrow(/422.*invalid from/);
  });

  test("LogMailer writes the email to the log", async () => {
    const log = jest.spyOn(console, "log").mockImplementation(() => {});
    await new LogMailer().send({ to: "a@x.test", subject: "Hi", text: "link https://x", html: "" });
    expect(log.mock.calls[0][0]).toMatch(/to=a@x.test.*Hi[\s\S]*https:\/\/x/);
    log.mockRestore();
  });
});

describe("helpers", () => {
  test.each([["", /at least 8/], ["1234567", /at least 8/], ["a".repeat(73), /at most 72/]])("checkNewPassword rejects %p", (pw, msg) => {
    expect(() => checkNewPassword(pw)).toThrow(msg);
  });
  test("checkNewPassword accepts 8 and 72 characters", () => {
    expect(checkNewPassword("12345678")).toBe("12345678");
    expect(checkNewPassword("a".repeat(72))).toHaveLength(72);
  });
  test("appUrl prefers APP_URL (no trailing slash) over the request's host", () => {
    const req = { protocol: "http", get: () => "evil.example" } as never;
    process.env.APP_URL = "https://gawainbook.example/";
    expect(appUrl(req)).toBe("https://gawainbook.example");
    delete process.env.APP_URL;
    expect(appUrl(req)).toBe("http://evil.example");
  });
});

describe("sign-up records consent and sends a verification email", () => {
  test("terms version and time are stored; the account starts unverified", async () => {
    const { user } = await signUp({ email: "new@example.com" });
    const [row] = await getDb().select().from(users).where(eq(users.id, user._id));
    expect(row.termsVersion).toBe(TERMS_VERSION);
    expect(row.termsAcceptedAt).toBeInstanceOf(Date);
    expect(row.emailVerifiedAt).toBeNull();
    expect((user as unknown as { emailVerified: boolean }).emailVerified).toBe(false);
    const email = mailer.last("new@example.com");
    expect(email?.subject).toMatch(/Confirm your email/);
    expect(pathOf(mailer.linkIn(email))).toBe("/verify-email");
  });

  test("a mail outage doesn't stop sign-up", async () => {
    mailer.fail = true;
    const { user } = await signUp();
    expect(user._id).toBeTruthy();
  });
});

describe("email verification", () => {
  test("the link verifies the account, even when opened signed out", async () => {
    const a = await signUp({ email: "v@example.com" });
    const token = tokenFrom(mailer.linkIn(mailer.last("v@example.com")));
    const anon = await newClient();
    expect((await anon.post("/api/auth/verify-email", { token })).body).toEqual({ verified: true });
    expect((await a.client.get("/api/auth/me")).body.emailVerified).toBe(true);
  });

  test("links are single-use", async () => {
    await signUp({ email: "v2@example.com" });
    const token = tokenFrom(mailer.linkIn(mailer.last("v2@example.com")));
    const c = await newClient();
    await c.post("/api/auth/verify-email", { token });
    const again = await c.post("/api/auth/verify-email", { token });
    expect(again.status).toBe(400);
    expect(again.body.error).toMatch(/already been used/);
  });

  test("expired links fail", async () => {
    const { user } = await signUp({ email: "v3@example.com" });
    const token = tokenFrom(mailer.linkIn(mailer.last("v3@example.com")));
    await getDb().update(emailTokens).set({ expiresAt: new Date(Date.now() - 1) }).where(eq(emailTokens.userId, user._id));
    const res = await (await newClient()).post("/api/auth/verify-email", { token });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/expired/);
  });

  test.each([["missing", undefined], ["short", "abc"], ["odd characters", "x".repeat(30) + "!"], ["unknown", "a".repeat(43)]])(
    "%s tokens fail with 400",
    async (_n, token) => {
      expect((await (await newClient()).post("/api/auth/verify-email", { token })).status).toBe(400);
    }
  );

  test("a reset link can't be used to verify, and vice versa", async () => {
    await signUp({ email: "mix@example.com" });
    const verifyToken = tokenFrom(mailer.linkIn(mailer.last("mix@example.com")));
    const c = await newClient();
    expect((await c.post("/api/auth/reset-password", { token: verifyToken, password: "newpassword1" })).status).toBe(400);
  });

  test("resend: sends a fresh link, invalidates the old one, has a cooldown, and stops once verified", async () => {
    const a = await signUp({ email: "r@example.com" });
    const first = tokenFrom(mailer.linkIn(mailer.last("r@example.com")));
    const tooSoon = await a.client.post("/api/auth/resend-verification");
    expect(tooSoon.status).toBe(429);
    await ageTokens(a.user._id);
    expect((await a.client.post("/api/auth/resend-verification")).body).toEqual({ sent: true });
    const second = tokenFrom(mailer.linkIn(mailer.last("r@example.com")));
    expect(second).not.toBe(first);
    const c = await newClient();
    expect((await c.post("/api/auth/verify-email", { token: first })).status).toBe(400);
    expect((await c.post("/api/auth/verify-email", { token: second })).status).toBe(200);
    await ageTokens(a.user._id);
    expect((await a.client.post("/api/auth/resend-verification")).status).toBe(409);
  });

  test("resend reports a mail outage", async () => {
    const a = await signUp();
    await ageTokens(a.user._id);
    mailer.fail = true;
    expect((await a.client.post("/api/auth/resend-verification")).status).toBe(502);
  });

  test("links use APP_URL when it's set", async () => {
    process.env.APP_URL = "https://gawainbook.example";
    try {
      await signUp({ email: "url@example.com" });
      expect(mailer.linkIn(mailer.last("url@example.com"))).toMatch(/^https:\/\/gawainbook\.example\/verify-email\?token=/);
    } finally {
      delete process.env.APP_URL;
    }
  });
});

describe("forgotten password", () => {
  const forgot = async (email: string) => (await newClient()).post("/api/auth/forgot-password", { email });

  test("same answer whether or not the account exists; only real accounts get an email", async () => {
    await signUp({ email: "f@example.com" });
    mailer.sent = [];
    const real = await forgot("  F@Example.com ");
    const fake = await forgot("nobody@example.com");
    expect(real.status).toBe(200);
    expect(fake.status).toBe(200);
    expect(real.body).toEqual(fake.body);
    expect(mailer.sent.map((e) => e.to)).toEqual(["f@example.com"]);
    expect(mailer.sent[0].subject).toMatch(/Reset your GawainBook password/);
  });

  test.each([["empty", ""], ["not an email", "nope"]])("rejects an %s address", async (_n, email) => {
    expect((await forgot(email)).status).toBe(400);
  });

  test("a mail outage still answers the same way", async () => {
    await signUp({ email: "down@example.com" });
    mailer.fail = true;
    expect((await forgot("down@example.com")).status).toBe(200);
  });

  test("repeated requests within a minute send one email", async () => {
    await signUp({ email: "spam@example.com" });
    mailer.sent = [];
    await forgot("spam@example.com");
    await forgot("spam@example.com");
    expect(mailer.sent).toHaveLength(1);
  });

  test("the link resets the password, signs out other sessions, signs you in and verifies the email", async () => {
    const a = await signUp({ email: "reset@example.com" });
    await forgot("reset@example.com");
    const token = tokenFrom(mailer.linkIn(mailer.last("reset@example.com")));
    const c = await newClient();
    const res = await c.post("/api/auth/reset-password", { token, password: "brand-new-pass" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ username: a.user.username, emailVerified: true });
    expect((await c.get("/api/auth/me")).status).toBe(200);
    expect((await a.client.get("/api/auth/me")).status).toBe(401);
    const login = await newClient();
    expect((await login.post("/api/auth/login", { email: "reset@example.com", password: "secret123" })).status).toBe(401);
    expect((await login.post("/api/auth/login", { email: "reset@example.com", password: "brand-new-pass" })).status).toBe(200);
    // Single use.
    expect((await (await newClient()).post("/api/auth/reset-password", { token, password: "another-pass" })).status).toBe(400);
  });

  test("only the newest reset link works", async () => {
    const a = await signUp({ email: "two@example.com" });
    await forgot("two@example.com");
    const first = tokenFrom(mailer.linkIn(mailer.last("two@example.com")));
    await ageTokens(a.user._id);
    await forgot("two@example.com");
    const second = tokenFrom(mailer.linkIn(mailer.last("two@example.com")));
    expect((await (await newClient()).post("/api/auth/reset-password", { token: first, password: "newpass-123" })).status).toBe(400);
    expect((await (await newClient()).post("/api/auth/reset-password", { token: second, password: "newpass-123" })).status).toBe(200);
  });

  test("a weak new password is refused and the link stays usable", async () => {
    await signUp({ email: "weak@example.com" });
    await forgot("weak@example.com");
    const token = tokenFrom(mailer.linkIn(mailer.last("weak@example.com")));
    expect((await (await newClient()).post("/api/auth/reset-password", { token, password: "short" })).status).toBe(400);
    expect((await (await newClient()).post("/api/auth/reset-password", { token, password: "long-enough" })).status).toBe(200);
  });

  test("two parallel uses of one link: only one succeeds", async () => {
    await signUp({ email: "race@example.com" });
    await forgot("race@example.com");
    const token = tokenFrom(mailer.linkIn(mailer.last("race@example.com")));
    const [c1, c2] = await Promise.all([newClient(), newClient()]);
    const results = await Promise.all([
      c1.post("/api/auth/reset-password", { token, password: "first-pass1" }),
      c2.post("/api/auth/reset-password", { token, password: "second-pass" }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
  });

  test("expired reset links fail", async () => {
    const a = await signUp({ email: "old@example.com" });
    await forgot("old@example.com");
    const token = tokenFrom(mailer.linkIn(mailer.last("old@example.com")));
    await getDb().update(emailTokens).set({ expiresAt: new Date(Date.now() - 1) }).where(eq(emailTokens.userId, a.user._id));
    const res = await (await newClient()).post("/api/auth/reset-password", { token, password: "whatever-1" });
    expect(res.body.error).toMatch(/expired/);
  });

  test("suspended accounts get no reset email", async () => {
    const a = await signUp({ email: "sus@example.com" });
    await getDb().update(users).set({ suspendedAt: new Date() }).where(eq(users.id, a.user._id));
    mailer.sent = [];
    await forgot("sus@example.com");
    expect(mailer.sent).toEqual([]);
  });

  test("forgot-password is rate limited", async () => {
    const limited = makeApp({ auth: { windowMs: 60_000, max: 2 } });
    const c = await new Client(limited).init();
    await c.post("/api/auth/forgot-password", { email: "a@example.com" });
    await c.post("/api/auth/forgot-password", { email: "a@example.com" });
    expect((await c.post("/api/auth/forgot-password", { email: "a@example.com" })).status).toBe(429);
  });
});

describe("changing your password", () => {
  test("needs the current password; keeps you signed in here, signs out elsewhere", async () => {
    const a = await signUp({ email: "chg@example.com" });
    const other = await newClient();
    await other.post("/api/auth/login", { email: "chg@example.com", password: "secret123" });
    const wrong = await a.client.put("/api/account/password", { currentPassword: "nope", newPassword: "newpassword1" });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error).toMatch(/current password/);
    expect((await a.client.put("/api/account/password", { currentPassword: "secret123", newPassword: "newpassword1" })).status).toBe(200);
    expect((await a.client.get("/api/auth/me")).status).toBe(200);
    expect((await other.get("/api/auth/me")).status).toBe(401);
  });

  test.each([["too short", "1234567"], ["too long", "a".repeat(73)], ["missing", undefined]])("rejects a %s new password", async (_n, newPassword) => {
    const a = await signUp();
    expect((await a.client.put("/api/account/password", { currentPassword: "secret123", newPassword })).status).toBe(400);
  });
});

describe("downloading your data", () => {
  test("includes your account, writing, reading and relationships, but no password hash or others' private data", async () => {
    const a = await signUp({ email: "me@example.com", username: "exporter" });
    const b = await signUp();
    await a.client.put(`/api/users/${a.user._id}`, { city: "Bath", favoriteGenres: ["Romance"] });
    await createPost(a.client, { desc: "My first post" });
    await a.client.put(`/api/users/${b.user._id}/follow`);
    const book = await makeBook(5);
    const circle = await makeCircle(a, book.id);
    await setProgress(a, book.id, 3);
    const t = await makeThread(a, circle._id, 2, "Exported thread");
    await a.client.post(`/api/threads/${t._id}/comments`, { body: "Exported reply" });
    await a.client.put(`/api/blocks/${b.user._id}`);

    const res = await a.client.get("/api/account/export");
    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toMatch(/^attachment; filename="gawainbook-exporter-\d{4}-\d{2}-\d{2}\.json"$/);
    expect(res.headers["cache-control"]).toBe("no-store");
    const d = res.body;
    expect(d.account).toMatchObject({ username: "exporter", email: "me@example.com", city: "Bath", favoriteGenres: ["Romance"], termsVersion: TERMS_VERSION });
    expect(d.posts.map((p: { text: string }) => p.text)).toEqual(["My first post"]);
    expect(d.shelves).toEqual([expect.objectContaining({ book: book.title, chapter: 3 })]);
    expect(d.circles).toEqual([expect.objectContaining({ circle: "Test Circle", role: "owner" })]);
    expect(d.discussions[0]).toMatchObject({ title: "Exported thread" });
    expect(d.replies[0]).toMatchObject({ body: "Exported reply" });
    expect(d.blocked).toEqual([expect.objectContaining({ username: b.user.username })]);
    const raw = JSON.stringify(d);
    expect(raw).not.toMatch(/passwordHash|\$2[aby]\$/);
    expect(raw).not.toContain(b.user.email);
  });
});

describe("deleting your account", () => {
  test("needs your password", async () => {
    const a = await signUp();
    const res = await a.client.delete("/api/account", { password: "wrong" });
    expect(res.status).toBe(400);
    expect((await a.client.get("/api/auth/me")).status).toBe(200);
  });

  test("removes the account and signs you out", async () => {
    const a = await signUp({ email: "bye@example.com" });
    expect((await a.client.delete("/api/account", { password: "secret123" })).body).toEqual({ deleted: true });
    expect((await a.client.get("/api/auth/me")).status).toBe(401);
    expect((await (await newClient()).post("/api/auth/login", { email: "bye@example.com", password: "secret123" })).status).toBe(401);
  });

  test("circles you own pass to a moderator (or else the longest-standing member); empty ones go", async () => {
    const owner = await signUp();
    const [member, mod] = await Promise.all([signUp(), signUp()]);
    const book = await makeBook(5);
    const shared = await makeCircle(owner, book.id);
    const lonely = await makeCircle(owner, book.id, { name: "Just me" });
    await member.client.post(`/api/circles/${shared._id}/join`);
    await mod.client.post(`/api/circles/${shared._id}/join`);
    await owner.client.put(`/api/circles/${shared._id}/members/${mod.user._id}`, { role: "moderator" });

    await owner.client.delete("/api/account", { password: "secret123" });
    const after = (await member.client.get(`/api/circles/${shared._id}`)).body;
    expect(after.ownerId).toBe(mod.user._id);
    expect(after.members.find((m: { _id: string }) => m._id === mod.user._id).role).toBe("owner");
    expect((await member.client.get(`/api/circles/${lonely._id}`)).status).toBe(404);
  });

  test("with no moderator, the longest-standing member inherits", async () => {
    const owner = await signUp();
    const [first, second] = [await signUp(), await signUp()];
    const book = await makeBook(5);
    const c = await makeCircle(owner, book.id);
    await first.client.post(`/api/circles/${c._id}/join`);
    await second.client.post(`/api/circles/${c._id}/join`);
    await owner.client.delete("/api/account", { password: "secret123" });
    expect((await second.client.get(`/api/circles/${c._id}`)).body.ownerId).toBe(first.user._id);
  });
});

describe("suspended accounts", () => {
  test("can't sign in, and an existing session stops working", async () => {
    const a = await signUp({ email: "s@example.com" });
    await getDb().update(users).set({ suspendedAt: new Date() }).where(eq(users.id, a.user._id));
    expect((await a.client.get("/api/auth/me")).status).toBe(403);
    const login = await (await newClient()).post("/api/auth/login", { email: "s@example.com", password: "secret123" });
    expect(login.status).toBe(403);
    expect(login.body.error).toMatch(/suspended/);
  });

  test("wrong password for a suspended account still says 'incorrect' (no hint)", async () => {
    const a = await signUp({ email: "s2@example.com" });
    await getDb().update(users).set({ suspendedAt: new Date() }).where(eq(users.id, a.user._id));
    expect((await (await newClient()).post("/api/auth/login", { email: "s2@example.com", password: "wrong" })).status).toBe(401);
  });

  test("disappear from profiles, feeds and friend lists for other readers", async () => {
    const a = await signUp();
    const b = await signUp();
    await createPost(a.client, { desc: "Before suspension" });
    await b.client.put(`/api/users/${a.user._id}/follow`);
    await getDb().update(users).set({ suspendedAt: new Date() }).where(eq(users.id, a.user._id));
    expect((await b.client.get("/api/users", { username: a.user.username })).status).toBe(404);
    expect((await b.client.get(`/api/posts/profile/${a.user.username}`)).status).toBe(404);
    expect((await b.client.get("/api/posts/timeline")).body).toEqual([]);
    expect((await b.client.get(`/api/users/friends/${b.user._id}`)).body).toEqual([]);
  });
});

test("the in-memory mailer finds links", () => {
  const m = new MemoryMailer();
  expect(m.linkIn({ to: "", subject: "", html: "", text: "go https://x.test/a?token=abc now" })).toBe("https://x.test/a?token=abc");
  expect(m.linkIn(undefined)).toBeUndefined();
});

test("CONSENT is what sign-up needs", () => {
  expect(CONSENT).toEqual({ acceptTerms: true, confirmAge: true });
});
