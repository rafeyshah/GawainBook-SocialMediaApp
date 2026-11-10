import { screen, waitFor } from "@testing-library/react";
import axios from "axios";
import userEvent from "@testing-library/user-event";
import Topbar from "./Topbar";
import { renderWithAuth, ME } from "../../testUtils";

jest.mock("axios");

test("shows the brand linking home, and your profile", () => {
  renderWithAuth(<Topbar />);
  expect(screen.getByRole("link", { name: "GawainBook home" })).toHaveAttribute("href", "/");
  expect(screen.getByRole("link", { name: "Your profile" })).toHaveAttribute("href", `/profile/${ME.username}`);
  expect(screen.getByText(ME.username)).toBeInTheDocument();
});

test("has the theme switcher", () => {
  renderWithAuth(<Topbar />);
  expect(screen.getByRole("radiogroup", { name: "Color theme" })).toBeInTheDocument();
});

test("Log out ends the session on the server, then signs out locally", async () => {
  axios.post.mockResolvedValueOnce({ status: 204 });
  const { dispatch } = renderWithAuth(<Topbar />);
  userEvent.click(screen.getByRole("button", { name: /log out/i }));
  await waitFor(() => expect(dispatch).toHaveBeenCalledWith({ type: "LOGOUT" }));
  expect(axios.post).toHaveBeenCalledWith("/auth/logout");
});

test("Log out still signs out locally if the server can't be reached", async () => {
  axios.post.mockRejectedValueOnce(new Error("Network Error"));
  const { dispatch } = renderWithAuth(<Topbar />);
  userEvent.click(screen.getByRole("button", { name: /log out/i }));
  await waitFor(() => expect(dispatch).toHaveBeenCalledWith({ type: "LOGOUT" }));
});

test("renders nothing when signed out", () => {
  const { container } = renderWithAuth(<Topbar />, { user: null });
  expect(container).toBeEmptyDOMElement();
});
