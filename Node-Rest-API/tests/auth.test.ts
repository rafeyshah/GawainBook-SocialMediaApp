import { app, request, newClient, signUp, setCookies, sessionTokenFrom, makeApp, Client } from "./helpers";
import { normalizeEmail } from "../src/routes/auth";

describe("normalizeEmail", () => {
  test.each([
    ["  Jane@Example.COM ", "jane@example.com"],
    [undefined, ""],
    [null, ""],
    [42, "42"],
  ])("%p → %p", (input, expected) => expect(normalizeEmail(input)).toBe(expected));
});

describe("password hashing compatibility", () => {
  // A real hash made by the native `bcrypt` package before the switch to
  // `bcryptjs` (the test account "claudetest", password "test123").
  const NATIVE_BCRYPT_HASH = "$2b$10$yXOrqu1WEhRaBJ4I.Nt8iucJ8rWRcU1AMVPw2i2prwX9hB8zPpfu6";

  test("existing $2b$ hashes still verify, so nobody is locked out", async () => {
    const bcrypt = (await import("bcryptjs")).default;
    expect(bcrypt.compareSync("test123", NATIVE_BCRYPT_HASH)).toBe(true);
    expect(bcrypt.compareSync("Test123", NATIVE_BCRYPT_HASH)).toBe(false);
  });

  test("a user with a migrated native hash can sign in", async () => {
    const { getDb } = await import("../src/db/client");
    const { users } = await import("../src/db/schema");
    await getDb().insert(users).values({ username: "legacy", email: "legacy@example.com", passwordHash: NATIVE_BCRYPT_HASH });
    const res = await (await newClient()).post("/api/auth/login", { email: "legacy@example.com", password: "test123" });
    expect(res.status).toBe(200);
  });
});

describe("POST /api/auth/register", () => {
  const valid = { username: "jane", email: "jane@example.com", password: "secret123" };
  const register = async (body: Record<string, unknown>) => (await newClient()).post("/api/auth/register", body);

  test("creates an account, signs in and never returns the password hash", async () => {
    const res = await register(valid);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ username: "jane", email: "jane@example.com", followers: [], followings: [], isAdmin: false });
    expect(res.body._id).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.body).not.toHaveProperty("passwordHash");
    expect(sessionTokenFrom(res)).toBeDefined();
  });

  test("normalises email to lowercase and trims the username", async () => {
    const res = await register({ ...valid, email: "  Jane@Example.COM ", username: "  jane  " });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ email: "jane@example.com", username: "jane" });
  });

  test.each([
    ["missing username", { username: undefined }, /Username/],
    ["username too short", { username: "ab" }, /Username/],
    ["username too long", { username: "a".repeat(21) }, /Username/],
    ["username with spaces", { username: "jane doe" }, /letters, numbers/],
    ["username with a slash", { username: "jane/doe" }, /letters, numbers/],
    ["missing email", { email: undefined }, /valid email/],
    ["invalid email", { email: "not-an-email" }, /valid email/],
    ["email over 254 characters", { email: `${"a".repeat(250)}@x.com` }, /valid email/],
    ["missing password", { password: undefined }, /at least 6/],
    ["password too short", { password: "12345" }, /at least 6/],
    ["password over 72 characters (bcrypt limit)", { password: "a".repeat(73) }, /at most 72/],
  ])("rejects %s with 400 and no session", async (_name, change, message) => {
    const res = await register({ ...valid, ...change });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(message);
    expect(sessionTokenFrom(res)).toBeUndefined();
  });

  test("accepts boundary lengths", async () => {
    expect((await register({ ...valid, username: "abc", password: "123456" })).status).toBe(201);
    expect((await register({ username: "a".repeat(20), email: "b@example.com", password: "a".repeat(72) })).status).toBe(201);
  });

  test("rejects a duplicate email (any case) or username with 409", async () => {
    await register(valid);
    const email = await register({ ...valid, username: "other", email: "JANE@example.com" });
    const name = await register({ ...valid, email: "other@example.com" });
    expect(email.status).toBe(409);
    expect(email.body.error).toMatch(/email already exists/);
    expect(name.status).toBe(409);
    expect(name.body.error).toMatch(/username is taken/);
  });

  test("two simultaneous sign-ups with the same email: exactly one wins", async () => {
    const [a, b] = await Promise.all([register(valid), register({ ...valid, username: "jane2" })]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
  });

  test("rejects a body over 100 KB", async () => {
    expect((await register({ ...valid, padding: "x".repeat(120_000) })).status).toBe(413);
  });
});

describe("session cookie", () => {
  test("is httpOnly, SameSite=Lax, scoped to / and lasts 30 days", async () => {
    const res = await (await newClient()).post("/api/auth/register", { username: "jane", email: "j@example.com", password: "secret123" });
    const cookie = setCookies(res).find((c) => c.startsWith("gb_session="))!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).toMatch(/Max-Age=2592000/);
  });

  test("is marked Secure in production", async () => {
    // Get the CSRF cookie first: a Secure cookie wouldn't be sent back over the test's plain HTTP.
    const client = await newClient();
    const before = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const res = await client.post("/api/auth/register", { username: "prod", email: "p@example.com", password: "secret123" });
      expect(res.status).toBe(201);
      const cookies = setCookies(res);
      expect(cookies.find((c) => c.startsWith("gb_session="))).toMatch(/; Secure/);
      expect(cookies.find((c) => c.startsWith("gb_csrf="))).toMatch(/; Secure/);
    } finally {
      process.env.NODE_ENV = before;
    }
  });

  test("the token is random and only its hash is stored", async () => {
    const a = await (await newClient()).post("/api/auth/register", { username: "aaa", email: "a@example.com", password: "secret123" });
    const b = await (await newClient()).post("/api/auth/register", { username: "bbb", email: "b@example.com", password: "secret123" });
    const ta = sessionTokenFrom(a)!;
    expect(ta).not.toBe(sessionTokenFrom(b));
    expect(ta.length).toBeGreaterThanOrEqual(40);
    const { getDb } = await import("../src/db/client");
    const { sessions } = await import("../src/db/schema");
    const rows = await getDb().select().from(sessions);
    expect(rows.map((r) => r.tokenHash)).not.toContain(ta);
    expect(rows.every((r) => /^[0-9a-f]{64}$/.test(r.tokenHash))).toBe(true);
  });
});

describe("POST /api/auth/login", () => {
  beforeEach(() => signUp({ username: "sam", email: "sam@example.com", password: "secret123" }));
  const login = async (body: Record<string, unknown>) => (await newClient()).post("/api/auth/login", body);

  test("signs in, sets a session cookie and omits the password hash", async () => {
    const res = await login({ email: "sam@example.com", password: "secret123" });
    expect(res.status).toBe(200);
    expect(res.body.username).toBe("sam");
    expect(res.body).not.toHaveProperty("passwordHash");
    expect(sessionTokenFrom(res)).toBeDefined();
  });

  test("ignores email case and surrounding spaces; password is case-sensitive", async () => {
    expect((await login({ email: "  SAM@Example.com ", password: "secret123" })).status).toBe(200);
    expect((await login({ email: "sam@example.com", password: "SECRET123" })).status).toBe(401);
  });

  test("wrong password and unknown email look identical", async () => {
    const wrongPw = await login({ email: "sam@example.com", password: "nope123" });
    const unknown = await login({ email: "nobody@example.com", password: "secret123" });
    expect([wrongPw.status, unknown.status]).toEqual([401, 401]);
    expect(wrongPw.body.error).toBe(unknown.body.error);
    expect(sessionTokenFrom(wrongPw)).toBeUndefined();
  });

  test.each([
    ["empty body", {}],
    ["an operator object instead of an email", { email: { $gt: "" }, password: "secret123" }],
    ["SQL in the email", { email: "' or 1=1 --", password: "secret123" }],
  ])("rejects %s with 401 and keeps running", async (_name, body) => {
    expect((await login(body)).status).toBe(401);
    expect((await request(app).get("/api/health")).status).toBe(200);
  });

  test("signing in twice gives two independent sessions", async () => {
    const a = await newClient();
    const b = await newClient();
    await a.post("/api/auth/login", { email: "sam@example.com", password: "secret123" });
    await b.post("/api/auth/login", { email: "sam@example.com", password: "secret123" });
    await a.post("/api/auth/logout");
    expect((await a.get("/api/auth/me")).status).toBe(401);
    expect((await b.get("/api/auth/me")).status).toBe(200);
  });
});

describe("GET /api/auth/me and POST /api/auth/logout", () => {
  test("me returns the signed-in account, including email", async () => {
    const { client, user } = await signUp({ email: "me@example.com" });
    const res = await client.get("/api/auth/me");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ _id: user._id, email: "me@example.com" });
  });

  test("me is 401 without a session", async () => {
    const res = await (await newClient()).get("/api/auth/me");
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/sign in/);
  });

  test("logout ends the session on the server, so the old token stops working", async () => {
    const client = await newClient();
    const reg = await client.post("/api/auth/register", { username: "leaver", email: "l@example.com", password: "secret123" });
    const token = sessionTokenFrom(reg)!;
    const out = await client.post("/api/auth/logout");
    expect(out.status).toBe(204);
    expect(setCookies(out).find((c) => c.startsWith("gb_session="))).toMatch(/Expires=Thu, 01 Jan 1970/);
    // Replaying the stolen token directly must fail.
    expect((await request(app).get("/api/auth/me").set("Cookie", `gb_session=${token}`)).status).toBe(401);
  });

  test("logout without a session is harmless", async () => {
    expect((await (await newClient()).post("/api/auth/logout")).status).toBe(204);
  });
});

describe("rate limiting", () => {
  test("login gets 429 after too many attempts, with a clear message", async () => {
    const limited = makeApp({ auth: { windowMs: 60_000, max: 3 } });
    const client = await new Client(limited).init();
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) {
      statuses.push((await client.post("/api/auth/login", { email: "x@example.com", password: "wrong12" })).status);
    }
    expect(statuses).toEqual([401, 401, 401, 429, 429]);
    const res = await client.post("/api/auth/login", { email: "x@example.com", password: "wrong12" });
    expect(res.body.error).toMatch(/Too many attempts/);
    expect(res.headers).toHaveProperty("ratelimit");
  });

  test("register shares the same limit", async () => {
    const limited = makeApp({ auth: { windowMs: 60_000, max: 1 } });
    const client = await new Client(limited).init();
    await client.post("/api/auth/register", { username: "one", email: "1@example.com", password: "secret123" });
    expect((await client.post("/api/auth/register", { username: "two", email: "2@example.com", password: "secret123" })).status).toBe(429);
  });

  test("other routes aren't limited by the auth limiter", async () => {
    const limited = makeApp({ auth: { windowMs: 60_000, max: 1 } });
    const client = await new Client(limited).init();
    await client.post("/api/auth/login", {});
    await client.post("/api/auth/login", {});
    expect((await client.get("/api/health")).status).toBe(200);
  });
});
