import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axios from "axios";
import App from "./App";
import { AuthContextProvider } from "./context/AuthContext";
import { ME, httpError } from "./testUtils";

jest.mock("axios");

const LEGAL = { operator: null, privacyVersion: "2026-11-10", waitlistOpen: false };

// signedIn decides what GET /auth/me answers.
const mockApi = ({ signedIn }) => {
  axios.get.mockImplementation((url) => {
    if (url === "/auth/me") return signedIn ? Promise.resolve({ data: ME }) : Promise.reject(httpError(401, {}));
    if (url === "/legal") return Promise.resolve({ data: LEGAL });
    if (url.startsWith("/users?")) return Promise.resolve({ data: { ...ME, followers: [], followings: [] } });
    return Promise.resolve({ data: [] });
  });
  axios.post.mockResolvedValue({ status: 204 });
};

const renderAt = (path) => {
  window.history.pushState({}, "", path);
  return render(
    <AuthContextProvider>
      <App />
    </AuthContextProvider>
  );
};

describe("while the session is being checked", () => {
  test("shows a loading screen instead of flashing the sign-in page", () => {
    axios.get.mockReturnValue(new Promise(() => {}));
    renderAt("/");
    expect(screen.getByRole("status", { name: "Loading GawainBook" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Sign in to GawainBook" })).toBeNull();
  });
});

describe("signed out", () => {
  beforeEach(() => mockApi({ signedIn: false }));

  test.each(["/", "/profile/jane", "/some/unknown/page"])("%s redirects to sign in", async (path) => {
    renderAt(path);
    expect(await screen.findByRole("heading", { name: "Sign in to GawainBook" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/login");
  });

  test("/register shows create account", async () => {
    renderAt("/register");
    expect(await screen.findByRole("heading", { name: "Create your account" })).toBeInTheDocument();
  });

  test("a user saved in localStorage by an old version doesn't sign you in", async () => {
    localStorage.setItem("user", JSON.stringify(ME));
    renderAt("/");
    expect(await screen.findByRole("heading", { name: "Sign in to GawainBook" })).toBeInTheDocument();
  });

  test.each([
    ["/waitlist", "Join the waitlist"],
    ["/privacy", "Privacy notice"],
    ["/impressum", "Impressum"],
  ])("public page %s is available", async (path, heading) => {
    renderAt(path);
    expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
  });

  test("the sign-in page links to the waitlist, privacy notice and Impressum", async () => {
    renderAt("/login");
    await screen.findByRole("heading", { name: "Sign in to GawainBook" });
    const legal = screen.getByRole("navigation", { name: "Legal" });
    expect(legal).toHaveTextContent("Waitlist");
    expect(legal).toHaveTextContent("Privacy");
    expect(legal).toHaveTextContent("Impressum");
  });
});

describe("signed in", () => {
  beforeEach(() => mockApi({ signedIn: true }));

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

  test("public pages stay reachable", async () => {
    renderAt("/privacy");
    expect(await screen.findByRole("heading", { name: "Privacy notice" })).toBeInTheDocument();
  });

  test("log out ends the server session and returns to sign in", async () => {
    renderAt("/");
    await screen.findByText("Your feed is quiet");
    userEvent.click(screen.getByRole("button", { name: /log out/i }));
    expect(await screen.findByRole("heading", { name: "Sign in to GawainBook" })).toBeInTheDocument();
    expect(axios.post).toHaveBeenCalledWith("/auth/logout");
    expect(localStorage.getItem("user")).toBeNull();
  });
});

test("the app never puts a userId in any request body", async () => {
  mockApi({ signedIn: true });
  renderAt("/");
  await screen.findByText("Your feed is quiet");
  userEvent.type(screen.getByRole("textbox"), "Hello");
  axios.post.mockResolvedValueOnce({ data: { _id: "p1", userId: ME._id, desc: "Hello", likes: [], createdAt: new Date().toISOString() } });
  userEvent.click(screen.getByRole("button", { name: "Post" }));
  await waitFor(() => expect(axios.post).toHaveBeenCalledWith("/posts", expect.anything()));
  for (const [, body] of axios.post.mock.calls) {
    if (body && typeof body === "object") expect(body).not.toHaveProperty("userId");
  }
});
