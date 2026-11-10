import { render } from "@testing-library/react";
import { MemoryRouter, Route } from "react-router-dom";
import { AuthContext } from "./context/AuthContext";

export const ME = {
  _id: "u1",
  username: "jane",
  email: "jane@example.com",
  profilePicture: "",
  followers: [],
  followings: [],
};

export const makePost = (overrides = {}) => ({
  _id: `p${Math.random().toString(36).slice(2, 8)}`,
  userId: "u2",
  desc: "Just finished a wonderful book.",
  likes: [],
  createdAt: new Date().toISOString(),
  ...overrides,
});

// Renders UI with a fake signed-in user and a router.
// `path` lets route params (e.g. /profile/:username) resolve.
export function renderWithAuth(
  ui,
  { user = ME, dispatch = jest.fn(), route = "/", path, auth = {} } = {}
) {
  const value = { user, dispatch, isFetching: false, error: false, checking: false, ...auth };
  const content = path ? <Route path={path}>{ui}</Route> : ui;
  const utils = render(
    <AuthContext.Provider value={value}>
      <MemoryRouter initialEntries={[route]}>{content}</MemoryRouter>
    </AuthContext.Provider>
  );
  return { ...utils, dispatch, value };
}

// Builds an axios-style error.
export const httpError = (status, data) => {
  const err = new Error(`HTTP ${status}`);
  err.response = { status, data };
  return err;
};

export const networkError = () => new Error("Network Error");
