import { dbStatus, withVerifiedSsl } from "../src/db/client";

describe("withVerifiedSsl", () => {
  test.each([
    ["postgresql://u:p@h/db?sslmode=require", "postgresql://u:p@h/db?sslmode=verify-full"],
    ["postgresql://u:p@h/db?channel_binding=require&sslmode=require", "postgresql://u:p@h/db?channel_binding=require&sslmode=verify-full"],
    ["postgresql://u:p@h/db?sslmode=prefer", "postgresql://u:p@h/db?sslmode=verify-full"],
    ["postgresql://u:p@h/db?sslmode=verify-full", "postgresql://u:p@h/db?sslmode=verify-full"],
    ["postgresql://u:p@localhost/db", "postgresql://u:p@localhost/db"],
    ["postgresql://u:p@h/db?sslmode=disable", "postgresql://u:p@h/db?sslmode=disable"],
  ])("%s", (input, expected) => expect(withVerifiedSsl(input)).toBe(expected));

  test("doesn't touch channel_binding=require", () => {
    expect(withVerifiedSsl("postgresql://h/db?channel_binding=require")).toBe("postgresql://h/db?channel_binding=require");
  });
});

test("dbStatus reports a live connection", async () => {
  expect(await dbStatus()).toEqual({ db: "connected", error: null });
});
