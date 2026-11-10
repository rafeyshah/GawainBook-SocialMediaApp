import fs from "fs";
import path from "path";
import { app, request, UPLOAD_DIR } from "./helpers";
import { createApp } from "../src/app";
import { S3Storage } from "../src/storage";

// Smallest valid PNG (1×1 pixel).
const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d4948445200000001000000010806000000" +
    "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082",
  "hex"
);

const upload = (body: Buffer, filename: string, contentType: string) =>
  request(app).post("/api/upload").attach("file", body, { filename, contentType });

describe("GET /api/health", () => {
  test("reports a connected database and the storage in use", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ db: "connected", error: null, storage: "disk" });
  });
});

describe("Content-Security-Policy", () => {
  const imgSrc = (csp: string) => csp.split(";").find((d) => d.trim().startsWith("img-src"))?.trim();

  test("with disk storage, images are only allowed from this app", async () => {
    const res = await request(app).get("/api/health");
    expect(imgSrc(res.headers["content-security-policy"])).toBe("img-src 'self' data:");
  });

  test("with Neon storage, the bucket's origin is allowed for images and nothing else", async () => {
    const neonApp = createApp(new S3Storage({ send: jest.fn() } as never, "assets", undefined, "https://br-x.storage.neon.tech"));
    const csp = (await request(neonApp).get("/api/health")).headers["content-security-policy"];
    expect(imgSrc(csp)).toBe("img-src 'self' data: https://br-x.storage.neon.tech");
    expect(csp).toMatch(/script-src 'self'/);
    expect(csp.match(/br-x\.storage\.neon\.tech/g)).toHaveLength(1);
  });
});

describe("unknown API routes", () => {
  test("return JSON 404 instead of HTML", async () => {
    const res = await request(app).get("/api/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Not found." });
  });
});

describe("malformed requests", () => {
  test("invalid JSON gets a 400 with a clear message", async () => {
    const res = await request(app).post("/api/auth/login").set("Content-Type", "application/json").send("{not json");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "The request body isn't valid JSON." });
  });
});

describe("POST /api/upload", () => {
  test("stores an image under a server-generated key and serves it back", async () => {
    const res = await upload(PNG, "cover.png", "image/png");
    expect(res.status).toBe(201);
    expect(res.body.filename).toMatch(/^uploads\/\d+-[0-9a-f]{12}\.png$/);
    expect(fs.existsSync(path.join(UPLOAD_DIR, res.body.filename))).toBe(true);

    const served = await request(app).get(`/images/${res.body.filename}`);
    expect(served.status).toBe(200);
    expect(Buffer.compare(served.body, PNG)).toBe(0);
  });

  test.each([
    ["image/jpeg", ".jpg"],
    ["image/gif", ".gif"],
    ["image/webp", ".webp"],
  ])("uses the right extension for %s", async (type, ext) => {
    const res = await upload(PNG, "x", type);
    expect(res.status).toBe(201);
    expect(res.body.filename.endsWith(ext)).toBe(true);
  });

  test("two uploads of the same file get different keys", async () => {
    const [a, b] = await Promise.all([upload(PNG, "a.png", "image/png"), upload(PNG, "a.png", "image/png")]);
    expect(a.body.filename).not.toBe(b.body.filename);
  });

  test("ignores a client-supplied path (no path traversal)", async () => {
    const res = await request(app)
      .post("/api/upload")
      .field("name", "../../index.js")
      .attach("file", PNG, { filename: "../../evil.png", contentType: "image/png" });
    expect(res.status).toBe(201);
    expect(res.body.filename).not.toMatch(/\.\./);
  });

  test("rejects non-image files", async () => {
    const res = await upload(Buffer.from("<script>alert(1)</script>"), "x.html", "text/html");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/PNG, JPG/);
  });

  test("rejects SVG (can carry scripts)", async () => {
    expect((await upload(Buffer.from("<svg/>"), "x.svg", "image/svg+xml")).status).toBe(400);
  });

  test("rejects files over 5 MB", async () => {
    const res = await upload(Buffer.alloc(5 * 1024 * 1024 + 1), "big.png", "image/png");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/5 MB/);
  });

  test("accepts a file of exactly 5 MB", async () => {
    expect((await upload(Buffer.alloc(5 * 1024 * 1024), "max.png", "image/png")).status).toBe(201);
  });

  test("rejects a request with no file", async () => {
    expect((await request(app).post("/api/upload")).status).toBe(400);
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
