import fs from "fs";
import os from "os";
import path from "path";
import request from "supertest";
import type { Response } from "supertest";
import { createApp, Limit } from "../src/app";
import { DiskStorage } from "../src/storage";
import { LegalConfig } from "../src/legal";

export const UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "gawainbook-uploads-"));

// Tests can open/close the waitlist by changing this object.
export const legal: LegalConfig = { operator: null, privacyVersion: "test-v1", waitlistOpen: false };

const unlimited: Limit = { windowMs: 60_000, max: 1_000_000 };
export const makeApp = (limits: Partial<Record<"auth" | "upload" | "waitlist", Limit>> = {}) =>
  createApp({
    storage: new DiskStorage(UPLOAD_DIR),
    legal: () => legal,
    limits: { auth: unlimited, upload: unlimited, waitlist: unlimited, ...limits },
  });

export const app = makeApp();
export { request };

const cookieValue = (res: Response, name: string): string | undefined => {
  const header = res.headers["set-cookie"] as unknown as string[] | undefined;
  for (const c of header || []) {
    const m = c.match(new RegExp(`^${name}=([^;]*)`));
    if (m) return decodeURIComponent(m[1]);
  }
  return undefined;
};

// A browser-like client: keeps its own cookies (session + CSRF) and sends
// the CSRF header on state-changing requests, like the React app does.
export class Client {
  readonly agent;
  csrf = "";

  constructor(readonly server = app) {
    this.agent = request.agent(server);
  }

  private track(res: Response): Response {
    const token = cookieValue(res, "gb_csrf");
    if (token) this.csrf = token;
    return res;
  }

  async init(): Promise<this> {
    this.track(await this.agent.get("/api/health"));
    return this;
  }

  async get(url: string, query?: object) {
    const req = this.agent.get(url);
    return this.track(await (query ? req.query(query) : req));
  }

  async post(url: string, body?: object) {
    return this.track(await this.agent.post(url).set("X-CSRF-Token", this.csrf).send(body ?? {}));
  }

  async put(url: string, body?: object) {
    return this.track(await this.agent.put(url).set("X-CSRF-Token", this.csrf).send(body ?? {}));
  }

  async delete(url: string, body?: object) {
    return this.track(await this.agent.delete(url).set("X-CSRF-Token", this.csrf).send(body ?? {}));
  }

  async upload(body: Buffer, filename: string, contentType: string, fields: Record<string, string> = {}) {
    let req = this.agent.post("/api/upload").set("X-CSRF-Token", this.csrf);
    for (const [k, v] of Object.entries(fields)) req = req.field(k, v);
    return this.track(await req.attach("file", body, { filename, contentType }));
  }
}

// Raw Set-Cookie lines from a response, e.g. to check cookie attributes.
export const setCookies = (res: Response): string[] => (res.headers["set-cookie"] as unknown as string[]) || [];
export const sessionTokenFrom = (res: Response): string | undefined =>
  setCookies(res)
    .map((c) => c.match(/^gb_session=([^;]+)/))
    .find(Boolean)?.[1];

export const newClient = () => new Client().init();

let counter = 0;

export interface TestUser {
  _id: string;
  username: string;
  email: string;
  followers: string[];
  followings: string[];
  isAdmin: boolean;
}

// Registers a user through the real API; the returned client is signed in.
export async function signUp(overrides: Record<string, unknown> = {}): Promise<{ user: TestUser; client: Client }> {
  counter += 1;
  const client = await newClient();
  const body = { username: `reader${counter}`, email: `reader${counter}@example.com`, password: "secret123", ...overrides };
  const res = await client.post("/api/auth/register", body);
  if (res.status !== 201) throw new Error(`signUp failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { user: res.body, client };
}

export async function createPost(client: Client, overrides: Record<string, unknown> = {}) {
  const res = await client.post("/api/posts", { desc: "A great read", ...overrides });
  if (res.status !== 201) throw new Error(`createPost failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

// Valid-looking ids that don't exist, in both supported formats.
export const NONEXISTENT_ID = "64b000000000000000000000";
export const NONEXISTENT_UUID = "00000000-0000-4000-8000-000000000000";
