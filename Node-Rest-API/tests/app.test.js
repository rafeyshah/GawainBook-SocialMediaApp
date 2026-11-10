const fs = require("fs");
const path = require("path");
const { app, request } = require("./helpers");

// Smallest valid PNG (1×1 pixel).
const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d4948445200000001000000010806000000" +
    "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082",
  "hex"
);

describe("GET /api/health", () => {
  test("reports a connected database", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ db: "connected", error: null });
  });
});

describe("unknown API routes", () => {
  test("return JSON 404 instead of HTML", async () => {
    const res = await request(app).get("/api/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Not found." });
  });
});

describe("POST /api/upload", () => {
  test("stores an image under a server-generated name and serves it", async () => {
    const res = await request(app).post("/api/upload").attach("file", PNG, { filename: "cover.png", contentType: "image/png" });
    expect(res.status).toBe(201);
    expect(res.body.filename).toMatch(/^\d+-[0-9a-f]{12}\.png$/);
    expect(fs.existsSync(path.join(process.env.UPLOAD_DIR, res.body.filename))).toBe(true);

    const served = await request(app).get(`/images/${res.body.filename}`);
    expect(served.status).toBe(200);
  });

  test("ignores a client-supplied path (no path traversal)", async () => {
    const res = await request(app)
      .post("/api/upload")
      .field("name", "../../index.js")
      .attach("file", PNG, { filename: "../../evil.png", contentType: "image/png" });
    expect(res.status).toBe(201);
    expect(res.body.filename).not.toMatch(/[\\/]|\.\./);
    expect(fs.readdirSync(process.env.UPLOAD_DIR)).toContain(res.body.filename);
  });

  test("rejects non-image files", async () => {
    const res = await request(app)
      .post("/api/upload")
      .attach("file", Buffer.from("<script>alert(1)</script>"), { filename: "x.html", contentType: "text/html" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/PNG, JPG/);
  });

  test("rejects files over 5 MB", async () => {
    const big = Buffer.alloc(5 * 1024 * 1024 + 1);
    const res = await request(app).post("/api/upload").attach("file", big, { filename: "big.png", contentType: "image/png" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/5 MB/);
  });

  test("rejects a request with no file", async () => {
    const res = await request(app).post("/api/upload");
    expect(res.status).toBe(400);
  });
});
