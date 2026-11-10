import axios from "axios";
import { errorMessage, loginCall, registerCall, logoutCall } from "./apiCalls";
import { httpError, networkError } from "./testUtils";

jest.mock("axios");

describe("errorMessage", () => {
  test.each([
    ["JSON error from the API", httpError(409, { error: "Email taken." }), "Email taken."],
    ["short plain-text body", httpError(400, "user not found"), "user not found"],
    ["HTML error page is never shown", httpError(500, "<!DOCTYPE html><html>…"), "Something went wrong. Please try again."],
    ["very long text body", httpError(500, "x".repeat(300)), "Something went wrong. Please try again."],
    ["404 without a body", httpError(404, undefined), "We couldn't find that. Please try again later."],
    ["network failure", networkError(), "Can't reach the server. Please try again."],
    ["undefined error", undefined, "Can't reach the server. Please try again."],
  ])("%s", (_name, err, expected) => {
    expect(errorMessage(err)).toBe(expected);
  });
});

describe("loginCall / registerCall", () => {
  const user = { _id: "u1", username: "jane" };

  test.each([
    ["loginCall", loginCall, "/auth/login"],
    ["registerCall", registerCall, "/auth/register"],
  ])("%s dispatches START then SUCCESS", async (_name, call, url) => {
    axios.post.mockResolvedValueOnce({ data: user });
    const dispatch = jest.fn();
    await call({ email: "jane@example.com" }, dispatch);
    expect(axios.post).toHaveBeenCalledWith(url, { email: "jane@example.com" });
    expect(dispatch.mock.calls).toEqual([[{ type: "LOGIN_START" }], [{ type: "LOGIN_SUCCESS", payload: user }]]);
  });

  test.each([
    ["loginCall", loginCall],
    ["registerCall", registerCall],
  ])("%s dispatches FAILURE with a readable message", async (_name, call) => {
    axios.post.mockRejectedValueOnce(httpError(401, { error: "Incorrect email or password." }));
    const dispatch = jest.fn();
    await call({}, dispatch);
    expect(dispatch).toHaveBeenLastCalledWith({ type: "LOGIN_FAILURE", payload: "Incorrect email or password." });
  });

  test("logoutCall ends the server session, then dispatches LOGOUT", async () => {
    axios.post.mockResolvedValueOnce({ status: 204 });
    const dispatch = jest.fn();
    await logoutCall(dispatch);
    expect(axios.post).toHaveBeenCalledWith("/auth/logout");
    expect(dispatch).toHaveBeenCalledWith({ type: "LOGOUT" });
  });

  test("logoutCall still signs out locally if the server call fails", async () => {
    axios.post.mockRejectedValueOnce(networkError());
    const dispatch = jest.fn();
    await logoutCall(dispatch);
    expect(dispatch).toHaveBeenCalledWith({ type: "LOGOUT" });
  });

  test("loginCall and registerCall never send a userId", async () => {
    axios.post.mockResolvedValue({ data: user });
    await loginCall({ email: "a@b.co", password: "x" }, jest.fn());
    await registerCall({ username: "a", email: "a@b.co", password: "x" }, jest.fn());
    for (const [, body] of axios.post.mock.calls) expect(body).not.toHaveProperty("userId");
  });
});
