import axios from "axios";
import { readCookie, setupHttp, onUnauthorized, CSRF_HEADER } from "./http";

describe("readCookie", () => {
  test.each([
    ["gb_csrf=abc", "abc"],
    ["a=1; gb_csrf=abc; b=2", "abc"],
    ["gb_csrf=a%20b", "a b"],
    ["gb_csrf=a=b=c", "a=b=c"],
    ["other=1", ""],
    ["", ""],
    ["xgb_csrf=nope; gb_csrf=yes", "yes"],
    ["gb_csrf=%E0%A4%A", "%E0%A4%A"],
  ])("%p → %p", (cookies, expected) => {
    expect(readCookie("gb_csrf", cookies)).toBe(expected);
  });
});

// A real axios instance with a fake transport, so interceptors actually run.
const makeClient = (respond, cookie = "tok123") => {
  const seen = [];
  const instance = axios.create();
  instance.defaults.adapter = (config) => {
    seen.push(config);
    return respond(config);
  };
  setupHttp(instance, () => cookie);
  return { instance, seen };
};
const ok = (config) => Promise.resolve({ status: 200, data: {}, headers: {}, config });
const fail = (status) => (config) => {
  const err = new Error(`HTTP ${status}`);
  err.config = config;
  err.response = { status, data: {} };
  return Promise.reject(err);
};

describe("setupHttp", () => {
  test("sends requests to /api with credentials", async () => {
    const { instance, seen } = makeClient(ok);
    await instance.get("/posts/timeline");
    expect(seen[0].baseURL).toBe("/api");
    expect(seen[0].withCredentials).toBe(true);
  });

  test.each(["post", "put", "delete", "patch"])("adds the CSRF header to %s", async (method) => {
    const { instance, seen } = makeClient(ok);
    await instance[method]("/x");
    expect(seen[0].headers[CSRF_HEADER]).toBe("tok123");
  });

  test.each(["get", "head"])("doesn't add the CSRF header to %s", async (method) => {
    const { instance, seen } = makeClient(ok);
    await instance[method]("/x");
    expect(seen[0].headers[CSRF_HEADER]).toBeUndefined();
  });

  test("skips the header when there's no CSRF cookie yet", async () => {
    const { instance, seen } = makeClient(ok, "");
    await instance.post("/x");
    expect(seen[0].headers[CSRF_HEADER]).toBeUndefined();
  });

  test("a 401 from a normal route calls the unauthorized handler", async () => {
    const handler = jest.fn();
    const stop = onUnauthorized(handler);
    const { instance } = makeClient(fail(401));
    await expect(instance.get("/posts/timeline")).rejects.toThrow("HTTP 401");
    expect(handler).toHaveBeenCalledTimes(1);
    stop();
  });

  test.each(["/auth/me", "/auth/login", "/auth/register", "/auth/logout"])("a 401 from %s doesn't", async (url) => {
    const handler = jest.fn();
    const stop = onUnauthorized(handler);
    const { instance } = makeClient(fail(401));
    await expect(instance.post(url)).rejects.toThrow();
    expect(handler).not.toHaveBeenCalled();
    stop();
  });

  test("other errors don't sign you out", async () => {
    const handler = jest.fn();
    const stop = onUnauthorized(handler);
    const { instance } = makeClient(fail(403));
    await expect(instance.post("/posts")).rejects.toThrow();
    expect(handler).not.toHaveBeenCalled();
    stop();
  });

  test("unregistering stops the handler", async () => {
    const handler = jest.fn();
    onUnauthorized(handler)();
    const { instance } = makeClient(fail(401));
    await expect(instance.get("/posts/timeline")).rejects.toThrow();
    expect(handler).not.toHaveBeenCalled();
  });
});
