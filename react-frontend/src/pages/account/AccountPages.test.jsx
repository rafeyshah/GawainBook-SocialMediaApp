import { act, render, screen, waitFor, within } from "@testing-library/react";
import { Router } from "react-router-dom";
import { createMemoryHistory } from "history";
import { AuthContext } from "../../context/AuthContext";
import userEvent from "@testing-library/user-event";
import axios from "axios";
import { ForgotPassword, ResetPassword, VerifyEmail, tokenFromLocation } from "./AccountPages";
import { renderWithAuth, httpError, networkError, ME } from "../../testUtils";

jest.mock("axios");

// Public pages fetch /legal for the footer; answer it harmlessly.
beforeEach(() => axios.get.mockResolvedValue({ data: { operator: null, waitlistOpen: false } }));

describe("email-link tokens", () => {
  test.each([
    [{ hash: "#token=abc", search: "" }, "abc"],
    [{ hash: "", search: "?token=old" }, "old"], // links sent before the switch to "#"
    [{ hash: "#token=new", search: "?token=old" }, "new"],
    [{ hash: "#other=1", search: "" }, ""],
    [{ hash: "", search: "" }, ""],
  ])("tokenFromLocation(%p) = %p", (location, token) => expect(tokenFromLocation(location)).toBe(token));

  test("the token is taken out of the address bar as soon as the page has read it", async () => {
    const replace = jest.spyOn(window.history, "replaceState");
    axios.post.mockResolvedValue({ data: { verified: true } });
    renderWithAuth(<VerifyEmail />, { route: "/verify-email#token=tok-123456789012345678901" });
    await screen.findByRole("heading", { name: /Email confirmed/ });
    expect(replace.mock.calls.map((call) => call[2])).toEqual(["/verify-email"]); // same page, no token
    expect(axios.post).toHaveBeenCalledWith("/auth/verify-email", { token: "tok-123456789012345678901" });
    replace.mockRestore();
  });

  test("opening the link again in the same tab starts over (the server then says it's been used)", async () => {
    const history = createMemoryHistory({ initialEntries: ["/reset-password#token=tok-123456789012345678901"] });
    render(
      <AuthContext.Provider value={{ user: null, dispatch: jest.fn(), isFetching: false, error: false, checking: false }}>
        <Router history={history}>
          <ResetPassword />
        </Router>
      </AuthContext.Provider>
    );
    const save = async () => {
      userEvent.type(screen.getByLabelText("New password"), "new-password-1");
      userEvent.type(screen.getByLabelText("Confirm new password"), "new-password-1");
      userEvent.click(screen.getByRole("button", { name: "Save new password" }));
    };
    axios.post.mockResolvedValueOnce({ data: { ...ME, emailVerified: true } });
    await save();
    await screen.findByRole("status");
    expect(screen.queryByLabelText("New password")).toBeNull();
    // Only the "#" part changes: no page load, but the form must come back.
    axios.post.mockRejectedValueOnce(httpError(400, { error: "This link has already been used." }));
    act(() => history.push("/reset-password#token=tok-123456789012345678901"));
    await screen.findByLabelText("New password");
    await save();
    expect(await screen.findByRole("alert")).toHaveTextContent("already been used");
    expect(axios.post).toHaveBeenCalledTimes(2);
  });

  test("an old ?token= reset link still works", async () => {
    axios.post.mockResolvedValueOnce({ data: { ...ME, emailVerified: true } });
    renderWithAuth(<ResetPassword />, { user: null, route: "/reset-password?token=tok-old-12345678901234567" });
    userEvent.type(screen.getByLabelText("New password"), "new-password-1");
    userEvent.type(screen.getByLabelText("Confirm new password"), "new-password-1");
    userEvent.click(screen.getByRole("button", { name: "Save new password" }));
    await screen.findByRole("status");
    expect(axios.post).toHaveBeenCalledWith("/auth/reset-password", { token: "tok-old-12345678901234567", password: "new-password-1" });
  });
});

describe("ForgotPassword", () => {
  const setup = () => renderWithAuth(<ForgotPassword />, { user: null });

  test("sends the trimmed email and shows the same neutral message", async () => {
    axios.post.mockResolvedValueOnce({ data: { message: "If an account uses that email, we've sent a link." } });
    setup();
    const form = screen.getByRole("form", { name: "Reset your password" });
    const send = within(form).getByRole("button", { name: "Send reset link" });
    expect(send).toBeDisabled();
    userEvent.type(within(form).getByLabelText("Email"), "  jane@example.com ");
    userEvent.click(send);
    expect(await screen.findByRole("status")).toHaveTextContent("If an account uses that email");
    expect(axios.post).toHaveBeenCalledWith("/auth/forgot-password", { email: "jane@example.com" });
    expect(screen.getByRole("link", { name: "Back to sign in" })).toHaveAttribute("href", "/login");
  });

  test("shows errors (e.g. rate limit) and keeps the form", async () => {
    axios.post.mockRejectedValueOnce(httpError(429, { error: "Too many attempts. Please wait a few minutes and try again." }));
    setup();
    userEvent.type(screen.getByLabelText("Email"), "jane@example.com");
    userEvent.click(screen.getByRole("button", { name: "Send reset link" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Too many attempts");
    expect(screen.getByLabelText("Email")).toHaveValue("jane@example.com");
  });
});

describe("ResetPassword", () => {
  const setup = (route = "/reset-password#token=tok-123456789012345678901") => renderWithAuth(<ResetPassword />, { user: null, route });

  test("saves the new password, signs you in and offers the way home", async () => {
    axios.post.mockResolvedValueOnce({ data: { ...ME, emailVerified: true } });
    const { dispatch } = setup();
    userEvent.type(screen.getByLabelText("New password"), "new-password-1");
    userEvent.type(screen.getByLabelText("Confirm new password"), "new-password-1");
    userEvent.click(screen.getByRole("button", { name: "Save new password" }));
    expect(await screen.findByRole("status")).toHaveTextContent("signed in");
    expect(axios.post).toHaveBeenCalledWith("/auth/reset-password", { token: "tok-123456789012345678901", password: "new-password-1" });
    expect(dispatch).toHaveBeenCalledWith({ type: "LOGIN_SUCCESS", payload: { ...ME, emailVerified: true } });
  });

  test("mismatched passwords never reach the server", () => {
    setup();
    userEvent.type(screen.getByLabelText("New password"), "new-password-1");
    userEvent.type(screen.getByLabelText("Confirm new password"), "new-password-2");
    userEvent.click(screen.getByRole("button", { name: "Save new password" }));
    expect(screen.getByRole("alert")).toHaveTextContent("don't match");
    expect(axios.post).not.toHaveBeenCalled();
  });

  test("Save waits for 8 characters", () => {
    setup();
    userEvent.type(screen.getByLabelText("New password"), "1234567");
    expect(screen.getByRole("button", { name: "Save new password" })).toBeDisabled();
  });

  test("an expired link explains and offers a new one", async () => {
    axios.post.mockRejectedValueOnce(httpError(400, { error: "This link has expired. Ask for a new one." }));
    setup();
    userEvent.type(screen.getByLabelText("New password"), "new-password-1");
    userEvent.type(screen.getByLabelText("Confirm new password"), "new-password-1");
    userEvent.click(screen.getByRole("button", { name: "Save new password" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("expired");
    expect(within(alert).getByRole("link", { name: "Ask for a new link" })).toHaveAttribute("href", "/forgot-password");
  });

  test("no token in the link", () => {
    setup("/reset-password");
    expect(screen.getByRole("heading", { name: "This link isn't complete" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ask for a new link" })).toHaveAttribute("href", "/forgot-password");
  });
});

describe("VerifyEmail", () => {
  const route = "/verify-email#token=tok-123456789012345678901";

  test("confirms the email once and updates the signed-in user", async () => {
    axios.post.mockResolvedValue({ data: { verified: true } });
    const { dispatch } = renderWithAuth(<VerifyEmail />, { route });
    expect(await screen.findByRole("heading", { name: /Email confirmed/ })).toBeInTheDocument();
    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(axios.post).toHaveBeenCalledWith("/auth/verify-email", { token: "tok-123456789012345678901" });
    expect(dispatch).toHaveBeenCalledWith({ type: "UPDATE_USER", payload: { emailVerified: true } });
    expect(screen.getByRole("link", { name: "Go to your circles" })).toHaveAttribute("href", "/");
  });

  test("works signed out too, pointing to sign-in", async () => {
    axios.post.mockResolvedValue({ data: { verified: true } });
    const { dispatch } = renderWithAuth(<VerifyEmail />, { route, user: null });
    expect(await screen.findByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
    expect(dispatch).not.toHaveBeenCalled();
  });

  test("a used or expired link explains where to get a new one", async () => {
    axios.post.mockRejectedValueOnce(httpError(400, { error: "This link has already been used. Ask for a new one." }));
    renderWithAuth(<VerifyEmail />, { route });
    expect(await screen.findByRole("heading", { name: "We couldn't confirm your email" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("already been used");
    expect(screen.getByRole("link", { name: "Open Settings" })).toHaveAttribute("href", "/settings");
  });

  test("network errors are shown", async () => {
    axios.post.mockRejectedValueOnce(networkError());
    renderWithAuth(<VerifyEmail />, { route, user: null });
    expect(await screen.findByRole("alert")).toHaveTextContent(/reach the server/i);
  });

  test("no token: no request, a clear message", async () => {
    renderWithAuth(<VerifyEmail />, { route: "/verify-email" });
    expect(await screen.findByRole("alert")).toHaveTextContent("isn't complete");
    await waitFor(() => expect(axios.post).not.toHaveBeenCalled());
  });
});
