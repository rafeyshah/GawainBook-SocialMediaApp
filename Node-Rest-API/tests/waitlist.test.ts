import { getDb } from "../src/db/client";
import { waitlistEntries } from "../src/db/schema";
import { legalConfig } from "../src/legal";
import { GENRES, JOINED_MESSAGE } from "../src/routes/waitlist";
import { legal, newClient, makeApp, Client, request, app } from "./helpers";

const OPERATOR = { name: "Jane Reader", address: ["Bookstraße 1", "10115 Berlin", "Germany"], email: "hello@example.com" };
const valid = { email: "reader@example.com", favouriteGenre: "romantasy", organizesBookClub: true, consent: true };
const join = async (body: object, client?: Client) => (client ?? (await newClient())).post("/api/waitlist", body);
const rows = () => getDb().select().from(waitlistEntries);

const open = () => Object.assign(legal, { operator: OPERATOR, waitlistOpen: true, privacyVersion: "test-v1" });
const close = () => Object.assign(legal, { operator: null, waitlistOpen: false });
afterEach(close);

describe("legalConfig", () => {
  const full = { LEGAL_NAME: "Jane Reader", LEGAL_ADDRESS: "Bookstraße 1|10115 Berlin|Germany", LEGAL_EMAIL: "hello@example.com" };

  test("reads the operator from env, splitting the address on | or newlines", () => {
    expect(legalConfig({ ...full, WAITLIST_OPEN: "true" })).toEqual({ operator: OPERATOR, privacyVersion: "2026-11-10", waitlistOpen: true });
    expect(legalConfig({ ...full, LEGAL_ADDRESS: "Bookstraße 1\\n10115 Berlin\\nGermany" }).operator?.address).toEqual(OPERATOR.address);
  });

  test.each([
    ["no name", { LEGAL_NAME: "" }],
    ["no email", { LEGAL_EMAIL: "" }],
    ["an invalid email", { LEGAL_EMAIL: "nope" }],
    ["a one-line address", { LEGAL_ADDRESS: "Berlin" }],
  ])("has no operator (and keeps the waitlist closed) with %s", (_name, change) => {
    const config = legalConfig({ ...full, ...change, WAITLIST_OPEN: "true" });
    expect(config.operator).toBeNull();
    expect(config.waitlistOpen).toBe(false);
  });

  test.each([undefined, "false", "1", "TRUE"])("stays closed unless WAITLIST_OPEN is exactly 'true' (%p)", (flag) => {
    expect(legalConfig({ ...full, WAITLIST_OPEN: flag }).waitlistOpen).toBe(false);
  });

  test("uses PRIVACY_VERSION when set", () => {
    expect(legalConfig({ PRIVACY_VERSION: "2027-01-01" }).privacyVersion).toBe("2027-01-01");
  });
});

describe("GET /api/legal", () => {
  test("is public and reports a closed waitlist with no operator by default", async () => {
    const res = await request(app).get("/api/legal");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ operator: null, privacyVersion: "test-v1", waitlistOpen: false });
  });

  test("shows the operator once configured", async () => {
    open();
    expect((await request(app).get("/api/legal")).body).toEqual({ operator: OPERATOR, privacyVersion: "test-v1", waitlistOpen: true });
  });
});

describe("POST /api/waitlist", () => {
  test("refuses sign-ups while the waitlist is closed (no data collected)", async () => {
    const res = await join(valid);
    expect(res.status).toBe(503);
    expect(await rows()).toEqual([]);
  });

  test("stores a sign-up with the consent version, without needing an account", async () => {
    open();
    const res = await join({ ...valid, email: "  Reader@Example.COM " });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ message: JOINED_MESSAGE });
    const [row] = await rows();
    expect(row).toMatchObject({ email: "reader@example.com", favouriteGenre: "romantasy", organizesBookClub: true, privacyVersion: "test-v1" });
    expect(row.consentedAt).toBeInstanceOf(Date);
  });

  test.each(GENRES.map((g) => [g]))("accepts the genre %p", async (genre) => {
    open();
    expect((await join({ ...valid, favouriteGenre: genre })).status).toBe(201);
  });

  test.each([
    ["no consent", { consent: undefined }, /privacy notice/],
    ["consent as a string", { consent: "true" }, /privacy notice/],
    ["consent false", { consent: false }, /privacy notice/],
    ["an invalid email", { email: "nope" }, /valid email/],
    ["an email over 254 characters", { email: `${"a".repeat(250)}@x.com` }, /valid email/],
    ["an unknown genre", { favouriteGenre: "cookbooks" }, /genre/],
    ["no genre", { favouriteGenre: undefined }, /genre/],
    ["organiser as a string", { organizesBookClub: "yes" }, /book club/],
  ])("rejects %s", async (_name, change, message) => {
    open();
    const res = await join({ ...valid, ...change });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(message);
    expect(await rows()).toEqual([]);
  });

  test("joining twice gives the same answer and keeps one row (no enumeration)", async () => {
    open();
    const first = await join(valid);
    const second = await join({ ...valid, email: "READER@example.com", favouriteGenre: "fantasy" });
    expect(second.status).toBe(first.status);
    expect(second.body).toEqual(first.body);
    const all = await rows();
    expect(all).toHaveLength(1);
    expect(all[0].favouriteGenre).toBe("romantasy");
  });

  test("bots that fill the hidden honeypot field get a fake success and nothing is stored", async () => {
    open();
    const res = await join({ ...valid, website: "http://spam.example" });
    expect(res.status).toBe(201);
    expect(await rows()).toEqual([]);
  });

  test("requires the CSRF header like every other write", async () => {
    open();
    expect((await request(app).post("/api/waitlist").send(valid)).status).toBe(403);
  });

  test("is rate limited per network", async () => {
    open();
    const limited = makeApp({ waitlist: { windowMs: 60_000, max: 2 } });
    const client = await new Client(limited).init();
    const statuses = [];
    for (let i = 0; i < 3; i++) statuses.push((await join({ ...valid, email: `r${i}@example.com` }, client)).status);
    expect(statuses).toEqual([201, 201, 429]);
  });
});
