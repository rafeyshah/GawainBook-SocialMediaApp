import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axios from "axios";
import { Route, Switch } from "react-router-dom";
import Auth from "./Auth";
import { renderWithAuth } from "../../testUtils";

jest.mock("axios");

const renderAuth = (mode, auth = {}) => renderWithAuth(<Auth mode={mode} />, { user: null, auth });

const field = (label) => screen.getByLabelText(label);

const agree = () => {
  userEvent.click(screen.getByLabelText(/I accept the terms of use/));
  userEvent.click(screen.getByLabelText(/at least 16 years old/));
};

test("sign-in links to 'Forgot your password?'; sign-up doesn't show it", () => {
  renderAuth("login");
  expect(screen.getByRole("link", { name: "Forgot your password?" })).toHaveAttribute("href", "/forgot-password");
});

describe("sign in", () => {
  test("shows only email and password", () => {
    renderAuth("login");
    expect(screen.getByRole("heading", { name: "Sign in to GawainBook" })).toBeInTheDocument();
    expect(field("Email")).toBeEnabled();
    expect(field("Password")).toBeEnabled();
    // Sign-up-only fields are collapsed and disabled so they don't block submit.
    expect(screen.getByLabelText("Username", { selector: "input" })).toBeDisabled();
    expect(screen.getByLabelText("Confirm password", { selector: "input" })).toBeDisabled();
    expect(screen.getByRole("link", { name: "Create one" })).toHaveAttribute("href", "/register");
  });

  test("submits trimmed email and the exact password", async () => {
    axios.post.mockResolvedValueOnce({ data: { _id: "u1" } });
    const { dispatch } = renderAuth("login");
    userEvent.type(field("Email"), "  jane@example.com ");
    userEvent.type(field("Password"), " pass word ");
    userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(axios.post).toHaveBeenCalledWith("/auth/login", { email: "jane@example.com", password: " pass word " });
    await screen.findByRole("button", { name: "Sign in" });
    expect(dispatch).toHaveBeenCalledWith({ type: "LOGIN_START" });
  });

  test("shows the server's error message", () => {
    renderAuth("login", { error: "Incorrect email or password." });
    expect(screen.getByRole("alert")).toHaveTextContent("Incorrect email or password.");
  });

  test("shows a spinner and disables submit while signing in", () => {
    renderAuth("login", { isFetching: true });
    const submit = screen.getAllByRole("button").find((b) => b.type === "submit");
    expect(submit).toBeDisabled();
    expect(submit.querySelector("[role='progressbar']")).not.toBeNull();
  });

  test("Show/Hide toggles password visibility", () => {
    renderAuth("login");
    expect(field("Password")).toHaveAttribute("type", "password");
    userEvent.click(screen.getByRole("button", { name: "Show" }));
    expect(field("Password")).toHaveAttribute("type", "text");
    userEvent.click(screen.getByRole("button", { name: "Hide" }));
    expect(field("Password")).toHaveAttribute("type", "password");
  });

  test("typing clears a server error", () => {
    const { dispatch } = renderAuth("login", { error: "Incorrect email or password." });
    userEvent.type(field("Email"), "a");
    expect(dispatch).toHaveBeenCalledWith({ type: "CLEAR_ERROR" });
  });

  test("email field doesn't auto-capitalise on phones", () => {
    renderAuth("login");
    expect(field("Email")).toHaveAttribute("autocapitalize", "none");
  });
});

describe("create account", () => {
  const fill = ({ username = "jane", email = "jane@example.com", password = "secret123", again = password } = {}) => {
    userEvent.type(field("Username"), username);
    userEvent.type(field("Email"), email);
    userEvent.type(field("Password"), password);
    userEvent.type(field("Confirm password"), again);
  };

  test("shows all four fields and the hint", () => {
    renderAuth("register");
    expect(screen.getByRole("heading", { name: "Create your account" })).toBeInTheDocument();
    ["Username", "Email", "Password", "Confirm password"].forEach((l) => expect(field(l)).toBeEnabled());
    expect(screen.getByText(/At least 8 characters\./)).toBeInTheDocument();
    expect(screen.getByLabelText(/I accept the terms of use/)).not.toBeChecked();
    expect(screen.getByLabelText(/at least 16 years old/)).not.toBeChecked();
    expect(screen.getByRole("link", { name: "terms of use" })).toHaveAttribute("href", "/terms");
    expect(screen.getByRole("link", { name: "privacy notice" })).toHaveAttribute("href", "/privacy");
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
  });

  test("blocks mismatched passwords without calling the API", () => {
    renderAuth("register");
    fill({ again: "different1" });
    userEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Passwords don't match.");
    expect(axios.post).not.toHaveBeenCalled();
  });

  test("the mismatch error clears when you edit a field", () => {
    renderAuth("register");
    fill({ again: "different1" });
    userEvent.click(screen.getByRole("button", { name: "Create account" }));
    userEvent.type(field("Confirm password"), "x");
    expect(screen.getByRole("alert", { hidden: true }).closest(".authCollapse")).not.toHaveClass("open");
  });

  test("registers with trimmed username and email", async () => {
    axios.post.mockResolvedValueOnce({ data: { _id: "u1" } });
    renderAuth("register");
    fill({ username: "  jane ", email: " jane@example.com " });
    agree();
    userEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(axios.post).toHaveBeenCalledWith("/auth/register", {
      username: "jane",
      email: "jane@example.com",
      password: "secret123",
      acceptTerms: true,
      confirmAge: true,
    });
    await screen.findByRole("button", { name: "Create account" });
  });

  test("without accepting the terms, nothing is sent", () => {
    renderAuth("register");
    fill({});
    userEvent.click(screen.getByLabelText(/at least 16 years old/));
    userEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(screen.getByRole("alert")).toHaveTextContent("accept the terms");
    expect(axios.post).not.toHaveBeenCalled();
  });

  test("without confirming your age, nothing is sent", () => {
    renderAuth("register");
    fill({});
    userEvent.click(screen.getByLabelText(/I accept the terms of use/));
    userEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(screen.getByRole("alert")).toHaveTextContent("at least 16");
    expect(axios.post).not.toHaveBeenCalled();
  });

  test("the password must be at least 8 characters", () => {
    renderAuth("register");
    expect(field("Password")).toHaveAttribute("minLength", "8");
    expect(field("Confirm password")).toHaveAttribute("minLength", "8");
  });

  test("Show reveals both password fields", () => {
    renderAuth("register");
    userEvent.click(screen.getByRole("button", { name: "Show" }));
    expect(field("Password")).toHaveAttribute("type", "text");
    expect(field("Confirm password")).toHaveAttribute("type", "text");
  });
});

test("switching modes keeps the email, clears passwords and errors", () => {
  // Same routing shape as App.js, so the page stays mounted between modes.
  const { dispatch } = renderWithAuth(
    <Switch>
      <Route path="/login">
        <Auth mode="login" />
      </Route>
      <Route path="/register">
        <Auth mode="register" />
      </Route>
    </Switch>,
    { user: null, route: "/register" }
  );
  userEvent.type(field("Email"), "jane@example.com");
  userEvent.type(field("Password"), "secret123");
  dispatch.mockClear();

  userEvent.click(screen.getByRole("link", { name: "Sign in" }));

  expect(screen.getByRole("heading", { name: "Sign in to GawainBook" })).toBeInTheDocument();
  expect(field("Email")).toHaveValue("jane@example.com");
  expect(field("Password")).toHaveValue("");
  expect(dispatch).toHaveBeenCalledWith({ type: "CLEAR_ERROR" });
});
