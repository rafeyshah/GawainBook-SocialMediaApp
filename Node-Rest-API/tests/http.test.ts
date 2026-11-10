import express from "express";
import request from "supertest";
import { errorHandler, handle, HttpError, isId, uniqueMessage } from "../src/http";

const appThrowing = (err: unknown) => {
  const app = express();
  app.get(
    "/",
    handle(async () => {
      throw err;
    })
  );
  app.use(errorHandler);
  return app;
};

describe("isId", () => {
  test.each([
    ["64b000000000000000000000", true],
    ["64B000000000000000000000", true],
    ["00000000-0000-4000-8000-000000000000", true],
    ["64b00000000000000000000", false],
    ["not-an-id", false],
    ["", false],
    [undefined, false],
    [123, false],
    ["64b000000000000000000000' or 1=1", false],
  ])("%p → %p", (value, expected) => expect(isId(value)).toBe(expected));
});

describe("errorHandler", () => {
  test.each([
    ["HttpError", new HttpError(418, "Short and stout"), 418, "Short and stout"],
    ["unique email", { code: "23505", constraint: "users_email_unique" }, 409, "An account with this email already exists. Try signing in."],
    ["unique username", { code: "23505", constraint: "users_username_unique" }, 409, "That username is taken. Please choose another."],
    ["other unique", { code: "23505", constraint: "follows_pk" }, 409, "That already exists."],
    ["check violation", { code: "23514" }, 400, "Some of the details are invalid."],
    ["invalid text representation", { code: "22P02" }, 400, "Some of the details are invalid."],
    ["foreign key violation", { code: "23503" }, 404, "Not found."],
    ["unknown error", new Error("boom"), 500, "Something went wrong. Please try again."],
    [
      "Drizzle-wrapped unique violation",
      Object.assign(new Error("Failed query"), { cause: { code: "23505", constraint: "users_username_unique" } }),
      409,
      "That username is taken. Please choose another.",
    ],
    [
      "Drizzle-wrapped foreign key violation",
      Object.assign(new Error("Failed query"), { cause: { code: "23503" } }),
      404,
      "Not found.",
    ],
    ["body too large", { status: 413, expose: true, type: "entity.too.large" }, 413, "That request is too large."],
    ["invalid JSON", { status: 400, expose: true, type: "entity.parse.failed" }, 400, "The request body isn't valid JSON."],
    ["non-exposed 4xx is treated as a server error", { status: 400, expose: false }, 500, "Something went wrong. Please try again."],
  ])("maps %s", async (_name, err, status, message) => {
    const res = await request(appThrowing(err)).get("/");
    expect(res.status).toBe(status);
    expect(res.body).toEqual({ error: message });
  });

  test("never leaks internal error details", async () => {
    const res = await request(appThrowing(new Error("password=hunter2 at db.internal:5432"))).get("/");
    expect(res.text).not.toMatch(/hunter2|5432/);
  });
});

test("uniqueMessage falls back for unknown constraints", () => {
  expect(uniqueMessage(undefined)).toBe("That already exists.");
});
