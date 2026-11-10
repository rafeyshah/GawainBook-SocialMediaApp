import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Topbar from "./Topbar";
import { renderWithAuth, ME } from "../../testUtils";

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

test("Log out dispatches LOGOUT", () => {
  const { dispatch } = renderWithAuth(<Topbar />);
  userEvent.click(screen.getByRole("button", { name: /log out/i }));
  expect(dispatch).toHaveBeenCalledWith({ type: "LOGOUT" });
});

test("renders nothing when signed out", () => {
  const { container } = renderWithAuth(<Topbar />, { user: null });
  expect(container).toBeEmptyDOMElement();
});
