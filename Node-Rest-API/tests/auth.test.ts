import { app, request, createUser } from "./helpers";
import { normalizeEmail } from "../src/routes/auth";

const register = (body: Record<string, unknown>) => request(app).post("/api/auth/register").send(body);
const login = (body: Record<string, unknown>) => request(app).post("/api/auth/login").send(body);

describe("normalizeEmail", () => {
  test.each([
    ["  Jane@Example.COM ", "jane@example.com"],
    [undefined, ""],
    [null, ""],
    [42, "42"],
  ])("%p → %p", (input, expected) => expect(normalizeEmail(input)).toBe(expected));
});

describe("POST /api/auth/register", () => {
  const valid = { username: "jane", email: "jane@example.com", password: "secret123" };

  test("creates an account and never returns the password hash", async () => {
    const res = await register(valid);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ username: "jane", email: "jane@example.com", followers: [], followings: [], isAdmin: false });
    expect(res.body._id).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.body).not.toHaveProperty("password");
    expect(res.body).not.toHaveProperty("passwordHash");
  });

  test("normalises email to lowercase and trims the username", async () => {
    const res = await register({ ...valid, email: "  Jane@Example.COM ", username: "  jane  " });
    expect(res.status).toBe(201);
    expect(res.body.email).toBe("jane@example.com");
    expect(res.body.username).toBe("jane");
  });

  test.each([
    ["missing username", { username: undefined }, /Username/],
    ["username too short", { username: "ab" }, /Username/],
    ["username too long", { username: "a".repeat(21) }, /Username/],
    ["missing email", { email: undefined }, /valid email/],
    ["invalid email", { email: "not-an-email" }, /valid email/],
    ["missing password", { password: undefined }, /at least 6/],
    ["password too short", { password: "12345" }, /at least 6/],
  ])("rejects %s with 400", async (_name, change, message) => {
    const res = await register({ ...valid, ...change });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(message);
  });

  test("accepts boundary lengths (3 and 20 character usernames, 6 character password)", async () => {
    expect((await register({ ...valid, username: "abc", password: "123456" })).status).toBe(201);
    expect((await register({ username: "a".repeat(20), email: "b@example.com", password: "123456" })).status).toBe(201);
  });

  test("rejects a duplicate email (any case) with 409", async () => {
    await register(valid);
    const res = await register({ ...valid, username: "other", email: "JANE@example.com" });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/email already exists/);
  });

  test("rejects a duplicate username with 409", async () => {
    await register(valid);
    const res = await register({ ...valid, email: "other@example.com" });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/username is taken/);
  });

  test("two simultaneous sign-ups with the same email: exactly one wins", async () => {
    const [a, b] = await Promise.all([register(valid), register({ ...valid, username: "jane2" })]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
  });

  test("handles an empty body without crashing", async () => {
    expect((await register({})).status).toBe(400);
  });

  test("rejects a body over 100 KB", async () => {
    const res = await register({ ...valid, padding: "x".repeat(120_000) });
    expect(res.status).toBe(413);
  });
});

describe("POST /api/auth/login", () => {
  beforeEach(() => createUser({ username: "sam", email: "sam@example.com", password: "secret123" }));

  test("signs in with correct credentials and omits the password hash", async () => {
    const res = await login({ email: "sam@example.com", password: "secret123" });
    expect(res.status).toBe(200);
    expect(res.body.username).toBe("sam");
    expect(res.body).not.toHaveProperty("passwordHash");
  });

  test("ignores email case and surrounding spaces", async () => {
    expect((await login({ email: "  SAM@Example.com ", password: "secret123" })).status).toBe(200);
  });

  test("password is case-sensitive", async () => {
    expect((await login({ email: "sam@example.com", password: "SECRET123" })).status).toBe(401);
  });

  test("wrong password and unknown email give the same message (no account enumeration)", async () => {
    const wrongPw = await login({ email: "sam@example.com", password: "nope123" });
    const unknown = await login({ email: "nobody@example.com", password: "secret123" });
    expect(wrongPw.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrongPw.body.error).toBe(unknown.body.error);
  });

  test.each([
    ["empty body", {}],
    ["missing password", { email: "sam@example.com" }],
    ["missing email", { password: "secret123" }],
    ["an operator object instead of an email", { email: { $gt: "" }, password: "secret123" }],
    ["SQL in the email", { email: "' or 1=1 --", password: "secret123" }],
  ])("rejects %s with 401 and keeps running", async (_name, body) => {
    expect((await login(body)).status).toBe(401);
    expect((await request(app).get("/api/health")).status).toBe(200);
  });
});
