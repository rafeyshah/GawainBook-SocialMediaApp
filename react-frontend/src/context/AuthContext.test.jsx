import { useContext } from "react";
import { render, screen, waitFor, act } from "@testing-library/react";
import axios from "axios";
import { AuthContext, AuthContextProvider } from "./AuthContext";
import * as http from "../http";
import { ME, httpError } from "../testUtils";

jest.mock("axios");

function Probe() {
  const { user, checking } = useContext(AuthContext);
  return <div data-testid="probe">{checking ? "checking" : user ? user.username : "signed out"}</div>;
}
const renderProvider = () =>
  render(
    <AuthContextProvider>
      <Probe />
    </AuthContextProvider>
  );
const probe = () => screen.getByTestId("probe");

test("asks the server who is signed in and shows 'checking' until it answers", async () => {
  axios.get.mockResolvedValueOnce({ data: ME });
  renderProvider();
  expect(probe()).toHaveTextContent("checking");
  await waitFor(() => expect(probe()).toHaveTextContent(ME.username));
  expect(axios.get).toHaveBeenCalledWith("/auth/me");
});

test("no session (401) means signed out", async () => {
  axios.get.mockRejectedValueOnce(httpError(401, { error: "Please sign in to continue." }));
  renderProvider();
  await waitFor(() => expect(probe()).toHaveTextContent("signed out"));
});

test("a network error also ends the check as signed out", async () => {
  axios.get.mockRejectedValueOnce(new Error("Network Error"));
  renderProvider();
  await waitFor(() => expect(probe()).toHaveTextContent("signed out"));
});

test("never trusts a user saved in localStorage, and removes the old copy", async () => {
  localStorage.setItem("user", JSON.stringify({ ...ME, username: "impostor" }));
  axios.get.mockRejectedValueOnce(httpError(401, {}));
  renderProvider();
  expect(probe()).not.toHaveTextContent("impostor");
  await waitFor(() => expect(probe()).toHaveTextContent("signed out"));
  expect(localStorage.getItem("user")).toBeNull();
});

test("doesn't write the user to localStorage after signing in", async () => {
  axios.get.mockResolvedValueOnce({ data: ME });
  renderProvider();
  await waitFor(() => expect(probe()).toHaveTextContent(ME.username));
  expect(localStorage.getItem("user")).toBeNull();
});

test("signs out locally when any request later reports the session ended", async () => {
  let handler;
  const spy = jest.spyOn(http, "onUnauthorized").mockImplementation((fn) => {
    handler = fn;
    return () => {};
  });
  axios.get.mockResolvedValueOnce({ data: ME });
  renderProvider();
  await waitFor(() => expect(probe()).toHaveTextContent(ME.username));
  act(() => handler());
  expect(probe()).toHaveTextContent("signed out");
  spy.mockRestore();
});

test("ignores a late /auth/me answer after unmounting", async () => {
  let resolve;
  axios.get.mockReturnValueOnce(new Promise((r) => (resolve = r)));
  const errors = jest.spyOn(console, "error").mockImplementation(() => {});
  const { unmount } = renderProvider();
  unmount();
  await act(async () => resolve({ data: ME }));
  expect(errors).not.toHaveBeenCalled();
  errors.mockRestore();
});
