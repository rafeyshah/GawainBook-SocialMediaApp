import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axios from "axios";
import App from "./App";
import { AuthContextProvider } from "./context/AuthContext";
import { ME } from "./testUtils";

jest.mock("axios");

const renderAt = (path) => {
  window.history.pushState({}, "", path);
  return render(
    <AuthContextProvider>
      <App />
    </AuthContextProvider>
  );
};

beforeEach(() => {
  axios.get.mockImplementation((url) =>
    Promise.resolve({ data: url.startsWith("/users?") ? { ...ME, followers: [], followings: [] } : [] })
  );
});

describe("signed out", () => {
  test.each(["/", "/profile/jane", "/some/unknown/page"])("%s redirects to sign in", async (path) => {
    renderAt(path);
    expect(await screen.findByRole("heading", { name: "Sign in to GawainBook" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/login");
  });

  test("/register shows create account", () => {
    renderAt("/register");
    expect(screen.getByRole("heading", { name: "Create your account" })).toBeInTheDocument();
  });

  test("a corrupted saved session is ignored", () => {
    localStorage.setItem("user", "{not json");
    renderAt("/");
    expect(screen.getByRole("heading", { name: "Sign in to GawainBook" })).toBeInTheDocument();
  });
});

describe("signed in", () => {
  beforeEach(() => localStorage.setItem("user", JSON.stringify(ME)));

  test("home shows the feed", async () => {
    renderAt("/");
    expect(await screen.findByText("Your feed is quiet")).toBeInTheDocument();
    expect(screen.getByRole("form", { name: "Create a post" })).toBeInTheDocument();
  });

  test.each(["/login", "/register"])("%s sends you home", async (path) => {
    renderAt(path);
    expect(await screen.findByText("Your feed is quiet")).toBeInTheDocument();
    expect(window.location.pathname).toBe("/");
  });

  test("log out clears the session and returns to sign in", async () => {
    renderAt("/");
    await screen.findByText("Your feed is quiet");
    userEvent.click(screen.getByRole("button", { name: /log out/i }));
    expect(await screen.findByRole("heading", { name: "Sign in to GawainBook" })).toBeInTheDocument();
    expect(localStorage.getItem("user")).toBeNull();
  });
});
