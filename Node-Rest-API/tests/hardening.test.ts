// Fixes from the November 2026 security review.
import { LoginThrottle } from "../src/loginThrottle";
import { proxyHops, redactUrl, sniffImageType } from "../src/app";
import { Client, CONSENT, makeApp, mailer, request } from "./helpers";

const register = async (c: Client, name: string) =>
  c.post("/api/auth/register", { username: name, email: `${name}@example.com`, password: "secret123", ...CONSENT });
const login = (c: Client, email: string, password: string) => c.post("/api/auth/login", { email, password });

describe("failed sign-ins are limited per account, not per address", () => {
  test("LoginThrottle: locks after max failures, unlocks when the window passes or on clear", () => {
    let now = 0;
    const t = new LoginThrottle({ windowMs: 1000, max: 3, now: () => now });
    for (let i = 0; i < 2; i++) t.recordFailure("a@x");
    expect(t.isLocked("a@x")).toBe(false);
    t.recordFailure("a@x");
    expect(t.isLocked("a@x")).toBe(true);
    expect(t.isLocked("b@x")).toBe(false); // other accounts are untouched
    now = 1000;
    expect(t.isLocked("a@x")).toBe(false);
    for (let i = 0; i < 3; i++) t.recordFailure("a@x");
    t.clear("a@x");
    expect(t.isLocked("a@x")).toBe(false);
  });

  test("LoginThrottle: memory stays bounded under a flood of made-up emails", () => {
    const t = new LoginThrottle({ windowMs: 60_000, max: 3, maxEntries: 100 });
    for (let i = 0; i < 1000; i++) t.recordFailure(`fake${i}@x`);
    expect(t.size).toBeLessThanOrEqual(100);
  });

  test("after too many wrong passwords even the right one is refused, from any address; other accounts still work", async () => {
    // A per-IP limit generous enough that only the per-account one can trigger.
    const app = makeApp({ auth: { windowMs: 60_000, max: 1000 }, login: { windowMs: 60_000, max: 3 } });
    const victim = await new Client(app).init();
    await register(victim, "victim");
    const bystander = await new Client(app).init();
    await register(bystander, "bystander");

    const attacker = await new Client(app).init();
    for (let i = 0; i < 3; i++) expect((await login(attacker, "victim@example.com", `guess-${i}`)).status).toBe(401);
    const locked = await login(attacker, " VICTIM@example.com ", "secret123"); // email is normalised first
    expect(locked.status).toBe(429);
    expect(locked.body.error).toMatch(/reset your password/);
    expect((await login(await new Client(app).init(), "victim@example.com", "secret123")).status).toBe(429);
    expect((await login(await new Client(app).init(), "bystander@example.com", "secret123")).status).toBe(200);
  });

  test("unknown emails lock the same way (the limit doesn't reveal which accounts exist)", async () => {
    const app = makeApp({ auth: { windowMs: 60_000, max: 1000 }, login: { windowMs: 60_000, max: 2 } });
    const c = await new Client(app).init();
    const statuses = [];
    for (let i = 0; i < 3; i++) statuses.push((await login(c, "nobody@example.com", "x")).status);
    expect(statuses).toEqual([401, 401, 429]);
  });

  test("a successful sign-in resets the count", async () => {
    const app = makeApp({ auth: { windowMs: 60_000, max: 1000 }, login: { windowMs: 60_000, max: 3 } });
    const c = await new Client(app).init();
    await register(c, "forgetful");
    for (let round = 0; round < 3; round++) {
      for (let i = 0; i < 2; i++) await login(c, "forgetful@example.com", "wrong");
      expect((await login(c, "forgetful@example.com", "secret123")).status).toBe(200);
    }
  });

  test("resetting the password unlocks sign-in straight away", async () => {
    const app = makeApp({ auth: { windowMs: 60_000, max: 1000 }, login: { windowMs: 60_000, max: 2 } });
    const c = await new Client(app).init();
    await register(c, "lockedout");
    for (let i = 0; i < 2; i++) await login(c, "lockedout@example.com", "wrong");
    expect((await login(c, "lockedout@example.com", "secret123")).status).toBe(429);
    await c.post("/api/auth/forgot-password", { email: "lockedout@example.com" });
    const link = new URL(mailer.linkIn(mailer.last("lockedout@example.com"))!);
    const token = new URLSearchParams(link.hash.slice(1)).get("token");
    expect((await c.post("/api/auth/reset-password", { token, password: "newsecret123" })).status).toBe(200);
    expect((await login(await new Client(app).init(), "lockedout@example.com", "newsecret123")).status).toBe(200);
  });
});

describe("the real client address behind proxies", () => {
  test.each([
    [undefined, 1],
    ["2", 2],
    ["0", 0],
    ["-1", 1],
    ["9", 1],
    ["two", 1],
  ])("TRUST_PROXY_HOPS=%p → %p", (value, hops) => {
    expect(proxyHops(value === undefined ? {} : { TRUST_PROXY_HOPS: value })).toBe(hops);
  });

  test("with 2 hops (Cloudflare + Render), limits follow the client, and a forged X-Forwarded-For changes nothing", async () => {
    const before = process.env.TRUST_PROXY_HOPS;
    process.env.TRUST_PROXY_HOPS = "2";
    try {
      const app = makeApp({ waitlist: { windowMs: 60_000, max: 2 } });
      // What arrives at the app: "<anything the client wrote>, <client>, <Cloudflare edge>".
      const csrf = (await request(app).get("/api/health")).headers["set-cookie"][0].match(/gb_csrf=([^;]+)/)![1];
      const send = (xff: string) =>
        request(app).post("/api/waitlist").set("X-Forwarded-For", xff).set("Cookie", `gb_csrf=${csrf}`).set("X-CSRF-Token", csrf).send({});
      const a1 = await send("1.1.1.1, 203.0.113.10, 172.64.0.1");
      const a2 = await send("9.9.9.9, 203.0.113.10, 172.64.0.2"); // forged first entry, another edge: still client A
      const a3 = await send("203.0.113.10, 172.64.0.3");
      expect([a1, a2, a3].map((r) => r.headers["ratelimit"])).toEqual([
        expect.stringMatching(/remaining=1/),
        expect.stringMatching(/remaining=0/),
        expect.stringMatching(/remaining=0/),
      ]);
      expect(a3.status).toBe(429);
      // A different client behind the same edge has its own count.
      expect((await send("198.51.100.7, 172.64.0.1")).headers["ratelimit"]).toMatch(/remaining=1/);
    } finally {
      if (before === undefined) delete process.env.TRUST_PROXY_HOPS;
      else process.env.TRUST_PROXY_HOPS = before;
    }
  });
});

describe("email-link tokens never reach logs", () => {
  test.each([
    ["/reset-password?token=abc123", "/reset-password?token=[redacted]"],
    ["/verify-email?x=1&token=abc-_123&y=2", "/verify-email?x=1&token=[redacted]&y=2"],
    ["/x?TOKEN=abc", "/x?TOKEN=[redacted]"],
    ["/feed?page=2", "/feed?page=2"],
    ["/api/books/token=not-a-query", "/api/books/token=not-a-query"],
  ])("redactUrl(%p) = %p", (url, logged) => expect(redactUrl(url)).toBe(logged));

  test("links put the token after #, which browsers never send to a server", async () => {
    const c = await new Client().init();
    await register(c, "linkcheck");
    const link = new URL(mailer.linkIn(mailer.last("linkcheck@example.com"))!);
    expect(link.search).toBe("");
    expect(link.hash).toMatch(/^#token=[\w-]{43}$/);
  });
});

describe("uploads are judged by their contents", () => {
  test.each([
    ["PNG", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]), "image/png"],
    ["JPEG", Buffer.from([0xff, 0xd8, 0xff, 0xdb]), "image/jpeg"],
    ["GIF87a", Buffer.from("GIF87a....", "latin1"), "image/gif"],
    ["GIF89a", Buffer.from("GIF89a....", "latin1"), "image/gif"],
    ["WebP", Buffer.concat([Buffer.from("RIFF", "latin1"), Buffer.alloc(4), Buffer.from("WEBP", "latin1")]), "image/webp"],
    ["a RIFF that isn't WebP (WAV)", Buffer.concat([Buffer.from("RIFF", "latin1"), Buffer.alloc(4), Buffer.from("WAVE", "latin1")]), null],
    ["HTML", Buffer.from("<!doctype html>"), null],
    ["SVG", Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"), null],
    ["a truncated PNG signature", Buffer.from([0x89, 0x50, 0x4e]), null],
    ["nothing", Buffer.alloc(0), null],
  ])("%s → %p", (_name, buf, type) => expect(sniffImageType(buf)).toBe(type));
});

describe("security headers", () => {
  test("HSTS for a year; powerful browser features switched off; cross-origin isolation on", async () => {
    const res = await request(makeApp()).get("/api/health");
    expect(res.headers["strict-transport-security"]).toMatch(/max-age=31536000; includeSubDomains/);
    expect(res.headers["permissions-policy"]).toMatch(/camera=\(\), microphone=\(\), geolocation=\(\)/);
    expect(res.headers["cross-origin-opener-policy"]).toBe("same-origin");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });
});
