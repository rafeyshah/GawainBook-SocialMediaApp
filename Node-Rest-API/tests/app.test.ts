import fs from "fs";
import path from "path";
import { app, request, UPLOAD_DIR, signUp, makeApp, Client, CONSENT } from "./helpers";
import { createApp } from "../src/app";
import { S3Storage } from "../src/storage";
import { API_VERSION } from "../src/version";

// Smallest valid PNG (1×1 pixel).
const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d4948445200000001000000010806000000" +
    "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082",
  "hex"
);

describe("GET /api/health", () => {
  test("says only whether the database is up and which API version runs", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    // Nothing else is public: no storage or email setup, no database error text.
    expect(res.body).toEqual({ db: "connected", apiVersion: API_VERSION });
  });
});

describe("Content-Security-Policy", () => {
  const imgSrc = (csp: string) => csp.split(";").find((d) => d.trim().startsWith("img-src"))?.trim();

  test("with disk storage, images are only allowed from this app and Open Library covers (and the Internet Archive they redirect to)", async () => {
    const res = await request(app).get("/api/health");
    expect(imgSrc(res.headers["content-security-policy"])).toBe("img-src 'self' data: https://covers.openlibrary.org https://archive.org https://*.archive.org");
  });

  test("with Neon storage, the bucket's origin is allowed for images and nothing else", async () => {
    const neonApp = createApp({ storage: new S3Storage({ send: jest.fn() } as never, "assets", undefined, "https://br-x.storage.neon.tech") });
    const csp = (await request(neonApp).get("/api/health")).headers["content-security-policy"];
    expect(imgSrc(csp)).toBe("img-src 'self' data: https://covers.openlibrary.org https://archive.org https://*.archive.org https://br-x.storage.neon.tech");
    expect(csp).toMatch(/script-src 'self'/);
    expect(csp.match(/br-x\.storage\.neon\.tech/g)).toHaveLength(1);
  });
});

describe("malformed and unknown requests", () => {
  test("unknown API routes return JSON 404 instead of HTML", async () => {
    const res = await request(app).get("/api/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Not found." });
  });

  test("invalid JSON gets a 400 with a clear message", async () => {
    const client = await new Client().init();
    const res = await client.agent
      .post("/api/auth/login")
      .set("X-CSRF-Token", client.csrf)
      .set("Content-Type", "application/json")
      .send("{not json");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "The request body isn't valid JSON." });
  });
});

describe("POST /api/upload", () => {
  let client: Client;
  beforeEach(async () => {
    client = (await signUp()).client;
  });

  test("stores an image under a server-generated key and serves it back", async () => {
    const res = await client.upload(PNG, "cover.png", "image/png");
    expect(res.status).toBe(201);
    expect(res.body.filename).toMatch(/^uploads\/\d+-[0-9a-f]{12}\.png$/);
    expect(fs.existsSync(path.join(UPLOAD_DIR, res.body.filename))).toBe(true);
    const served = await request(app).get(`/images/${res.body.filename}`);
    expect(served.status).toBe(200);
    expect(Buffer.compare(served.body, PNG)).toBe(0);
  });

  // Minimal real files: each starts with its format's signature.
  const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)]);
  const GIF = Buffer.concat([Buffer.from("GIF89a", "latin1"), Buffer.alloc(32)]);
  const WEBP = Buffer.concat([Buffer.from("RIFF", "latin1"), Buffer.from([24, 0, 0, 0]), Buffer.from("WEBPVP8 ", "latin1"), Buffer.alloc(32)]);

  test.each([
    ["a JPEG", JPEG, "image/jpeg", ".jpg"],
    ["a GIF", GIF, "image/gif", ".gif"],
    ["a WebP", WEBP, "image/webp", ".webp"],
    ["a PNG the browser called a JPEG", PNG, "image/jpeg", ".png"], // the contents decide
  ])("stores %s with the right extension", async (_name, body, type, ext) => {
    const res = await client.upload(body, "x", type);
    expect(res.status).toBe(201);
    expect(res.body.filename.endsWith(ext)).toBe(true);
  });

  test("two uploads of the same file get different keys", async () => {
    const [a, b] = await Promise.all([client.upload(PNG, "a.png", "image/png"), client.upload(PNG, "a.png", "image/png")]);
    expect(a.body.filename).not.toBe(b.body.filename);
  });

  test("ignores a client-supplied path (no path traversal)", async () => {
    const res = await client.upload(PNG, "../../evil.png", "image/png", { name: "../../index.js" });
    expect(res.status).toBe(201);
    expect(res.body.filename).not.toMatch(/\.\./);
  });

  test.each([
    ["HTML", Buffer.from("<script>alert(1)</script>"), "x.html", "text/html"],
    ["SVG (can carry scripts)", Buffer.from("<svg/>"), "x.svg", "image/svg+xml"],
    ["HTML claiming to be a PNG", Buffer.from("<html><script>alert(1)</script></html>"), "x.png", "image/png"],
    ["a script claiming to be a JPEG", Buffer.from("#!/bin/sh echo hi"), "x.jpg", "image/jpeg"],
    ["an empty file", Buffer.alloc(0), "x.png", "image/png"],
  ])("rejects %s", async (_name, body, filename, type) => {
    const res = await client.upload(body, filename, type);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/PNG, JPG/);
  });

  test("rejects files over 5 MB and accepts exactly 5 MB", async () => {
    const pngOfSize = (n: number) => Buffer.concat([PNG, Buffer.alloc(n - PNG.length)]);
    const over = await client.upload(pngOfSize(5 * 1024 * 1024 + 1), "big.png", "image/png");
    expect(over.status).toBe(400);
    expect(over.body.error).toMatch(/5 MB/);
    expect((await client.upload(pngOfSize(5 * 1024 * 1024), "max.png", "image/png")).status).toBe(201);
  });

  test("rejects a request with no file", async () => {
    expect((await client.post("/api/upload")).status).toBe(400);
  });

  test("is rate limited", async () => {
    const limited = makeApp({ upload: { windowMs: 60_000, max: 2 } });
    const c = await new Client(limited).init();
    await c.post("/api/auth/register", { username: "uploader", email: "u@example.com", password: "secret123", ...CONSENT });
    const statuses = [];
    for (let i = 0; i < 3; i++) statuses.push((await c.upload(PNG, "a.png", "image/png")).status);
    expect(statuses).toEqual([201, 201, 429]);
  });
});

describe("GET /images/*", () => {
  test("serves bundled default images from the app", async () => {
    expect((await request(app).get("/images/person/noAvatar.png")).status).toBe(200);
  });

  test("returns 404 for an upload that doesn't exist", async () => {
    expect((await request(app).get("/images/uploads/123-missing.png")).status).toBe(404);
  });

  test.each(["/images/uploads/..%2F..%2Fpackage.json", "/images/../package.json", "/images/uploads/x.html", "/images/secret.txt"])(
    "refuses %s",
    async (url) => {
      const res = await request(app).get(url);
      expect(res.status).toBe(404);
      expect(res.text).not.toMatch(/"name":\s*"rest-api"/);
    }
  );
});
