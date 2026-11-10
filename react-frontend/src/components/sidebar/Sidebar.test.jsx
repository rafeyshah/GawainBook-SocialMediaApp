import { screen } from "@testing-library/react";
import axios from "axios";
import Sidebar from "./Sidebar";
import { renderWithAuth, ME, networkError } from "../../testUtils";

jest.mock("axios");

test("has Home and Profile links, with the current page highlighted", async () => {
  axios.get.mockResolvedValue({ data: [] });
  renderWithAuth(<Sidebar />, { route: "/" });
  expect(screen.getByRole("link", { name: "Home" })).toHaveClass("active");
  expect(screen.getByRole("link", { name: "Profile" })).toHaveAttribute("href", `/profile/${ME.username}`);
  expect(screen.getByRole("link", { name: "Profile" })).not.toHaveClass("active");
  await screen.findByText(/not following anyone/);
});

test("highlights Profile on your profile page", async () => {
  axios.get.mockResolvedValue({ data: [] });
  renderWithAuth(<Sidebar />, { route: `/profile/${ME.username}` });
  expect(screen.getByRole("link", { name: "Profile" })).toHaveClass("active");
  expect(screen.getByRole("link", { name: "Home" })).not.toHaveClass("active");
  await screen.findByText(/not following anyone/);
});

test("lists the readers you follow, linking to their profiles", async () => {
  axios.get.mockResolvedValue({ data: [{ _id: "a", username: "sam", profilePicture: "" }, { _id: "b", username: "lee", profilePicture: "" }] });
  renderWithAuth(<Sidebar />);
  expect(screen.getByLabelText("Loading")).toBeInTheDocument();
  expect(await screen.findByRole("link", { name: /sam/ })).toHaveAttribute("href", "/profile/sam");
  expect(screen.getByRole("link", { name: /lee/ })).toBeInTheDocument();
  expect(axios.get).toHaveBeenCalledWith(`/users/friends/${ME._id}`);
});

test("explains the empty state", async () => {
  axios.get.mockResolvedValue({ data: [] });
  renderWithAuth(<Sidebar />);
  expect(await screen.findByText(/not following anyone yet/)).toBeInTheDocument();
});

test("shows a message if the list can't load", async () => {
  axios.get.mockRejectedValue(networkError());
  renderWithAuth(<Sidebar />);
  expect(await screen.findByText(/Couldn't load who you follow/)).toBeInTheDocument();
});
