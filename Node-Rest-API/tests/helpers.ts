import fs from "fs";
import os from "os";
import path from "path";
import request from "supertest";
import { createApp } from "../src/app";
import { DiskStorage } from "../src/storage";

export const UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "gawainbook-uploads-"));
export const app = createApp(new DiskStorage(UPLOAD_DIR));
export { request };

let counter = 0;

export interface TestUser {
  _id: string;
  username: string;
  email: string;
  followers: string[];
  followings: string[];
}

// Registers a user through the real API.
export async function createUser(overrides: Record<string, unknown> = {}): Promise<TestUser> {
  counter += 1;
  const body = { username: `reader${counter}`, email: `reader${counter}@example.com`, password: "secret123", ...overrides };
  const res = await request(app).post("/api/auth/register").send(body);
  if (res.status !== 201) throw new Error(`createUser failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

export async function createPost(userId: string, overrides: Record<string, unknown> = {}) {
  const res = await request(app).post("/api/posts").send({ userId, desc: "A great read", ...overrides });
  if (res.status !== 201) throw new Error(`createPost failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

// Valid-looking ids that don't exist, in both supported formats.
export const NONEXISTENT_ID = "64b000000000000000000000";
export const NONEXISTENT_UUID = "00000000-0000-4000-8000-000000000000";
