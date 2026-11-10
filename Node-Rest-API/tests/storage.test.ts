import fs from "fs";
import os from "os";
import path from "path";
import express from "express";
import request from "supertest";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { createStorage, DiskStorage, PRESIGNED_TTL_SECONDS, REDIRECT_CACHE_SECONDS, S3Storage, Storage } from "../src/storage";

// Mounts storage.respond on a tiny app so we can inspect the HTTP response.
const serve = (storage: Storage) => {
  const app = express();
  app.get("/img/*", (req, res, next) => {
    storage.respond((req.params as Record<string, string>)[0], res).catch(next);
  });
  return app;
};

describe("S3Storage (Neon object storage)", () => {
  const send = jest.fn().mockResolvedValue({});
  const presign = jest.fn<Promise<string>, [unknown, GetObjectCommand, { expiresIn: number }]>().mockResolvedValue("https://storage.example/assets/uploads/a.png?X-Amz-Signature=abc");
  const storage = new S3Storage({ send } as never, "assets", presign);

  beforeEach(() => {
    send.mockClear();
    presign.mockClear();
  });

  test("put sends PutObject with bucket, key, content type and immutable caching", async () => {
    await storage.put("uploads/a.png", Buffer.from("x"), "image/png");
    const cmd = send.mock.calls[0][0];
    expect(cmd).toBeInstanceOf(PutObjectCommand);
    expect(cmd.input).toMatchObject({
      Bucket: "assets",
      Key: "uploads/a.png",
      ContentType: "image/png",
      CacheControl: "private, max-age=31536000, immutable",
    });
  });

  test("remove sends DeleteObject", async () => {
    await storage.remove("uploads/a.png");
    const cmd = send.mock.calls[0][0];
    expect(cmd).toBeInstanceOf(DeleteObjectCommand);
    expect(cmd.input).toEqual({ Bucket: "assets", Key: "uploads/a.png" });
  });

  test("respond redirects to a short-lived signed URL with a short cache", async () => {
    const res = await request(serve(storage)).get("/img/uploads/a.png");
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("https://storage.example/assets/uploads/a.png?X-Amz-Signature=abc");
    expect(res.headers["cache-control"]).toBe(`private, max-age=${REDIRECT_CACHE_SECONDS}`);
    const [, command, options] = presign.mock.calls[0];
    expect(command).toBeInstanceOf(GetObjectCommand);
    expect(command.input).toEqual({ Bucket: "assets", Key: "uploads/a.png" });
    expect(options).toEqual({ expiresIn: PRESIGNED_TTL_SECONDS });
  });

  test("storage errors surface instead of being swallowed", async () => {
    send.mockRejectedValueOnce(new Error("Neon error: AccessDenied"));
    await expect(storage.put("uploads/b.png", Buffer.from("x"), "image/png")).rejects.toThrow("AccessDenied");
  });
});

describe("DiskStorage", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gawainbook-disk-"));
  const storage = new DiskStorage(dir);

  test("put writes the file (creating folders) and respond serves it", async () => {
    await storage.put("uploads/a.png", Buffer.from("hello"), "image/png");
    expect(fs.readFileSync(path.join(dir, "uploads/a.png"), "utf8")).toBe("hello");
    const res = await request(serve(storage)).get("/img/uploads/a.png");
    expect(res.status).toBe(200);
  });

  test("respond returns 404 for missing files", async () => {
    expect((await request(serve(storage)).get("/img/uploads/none.png")).status).toBe(404);
  });

  test("remove deletes the file and tolerates missing ones", async () => {
    await storage.put("uploads/c.png", Buffer.from("x"), "image/png");
    await storage.remove("uploads/c.png");
    expect(fs.existsSync(path.join(dir, "uploads/c.png"))).toBe(false);
    await expect(storage.remove("uploads/c.png")).resolves.toBeUndefined();
  });

  test.each(["../escape.png", "uploads/../../escape.png", "/abs.png"])("refuses keys outside its folder: %p", async (key) => {
    await expect(storage.put(key, Buffer.from("x"), "image/png")).rejects.toThrow("Invalid key");
  });
});

describe("createStorage", () => {
  test("uses Neon object storage when the Neon S3 variables are set", () => {
    const s = createStorage({
      AWS_ENDPOINT_URL_S3: "https://example",
      AWS_ACCESS_KEY_ID: "id",
      AWS_SECRET_ACCESS_KEY: "secret",
      AWS_REGION: "us-east-2",
    });
    expect(s.kind).toBe("neon");
    expect(s.imageOrigin).toBe("https://example");
  });

  test("image origin drops the path and keeps the port", () => {
    const s = createStorage({
      AWS_ENDPOINT_URL_S3: "https://br-x.storage.c-8.us-east-2.aws.neon.tech:443/some/path",
      AWS_ACCESS_KEY_ID: "id",
      AWS_SECRET_ACCESS_KEY: "secret",
    });
    expect(s.imageOrigin).toBe("https://br-x.storage.c-8.us-east-2.aws.neon.tech");
  });

  test("disk storage serves images from this app (no extra origin)", () => {
    expect(createStorage({}).imageOrigin).toBeUndefined();
  });

  test.each([
    ["no variables", {}],
    ["missing secret", { AWS_ENDPOINT_URL_S3: "https://example", AWS_ACCESS_KEY_ID: "id" }],
    ["missing endpoint", { AWS_ACCESS_KEY_ID: "id", AWS_SECRET_ACCESS_KEY: "s" }],
  ])("falls back to disk with %s", (_name, env) => {
    expect(createStorage(env as NodeJS.ProcessEnv).kind).toBe("disk");
  });
});
