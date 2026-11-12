import { act, screen } from "@testing-library/react";
import axios from "axios";
import Sidebar from "./Sidebar";
import { renderWithAuth, ME, networkError } from "../../testUtils";

jest.mock("axios");

const links = () => ["Circles", "Library", "Feed", "Profile"].map((name) => screen.getByRole("link", { name }));
const active = () => links().filter((l) => l.classList.contains("active")).map((l) => l.textContent);

describe("navigation", () => {
  beforeEach(() => axios.get.mockResolvedValue({ data: [] }));

  test("has Circles (home), Library, Feed and Profile", async () => {
    renderWithAuth(<Sidebar />);
    expect(links().map((l) => l.getAttribute("href"))).toEqual(["/", "/library", "/feed", `/profile/${ME.username}`]);
    await screen.findByText(/not following anyone/);
  });

  test.each([
    ["/", "Circles"],
    ["/circles/abc", "Circles"],
    ["/threads/abc", "Circles"],
    ["/library", "Library"],
    ["/books/pride-and-prejudice", "Library"],
    ["/feed", "Feed"],
    [`/profile/${ME.username}`, "Profile"],
  ])("on %s only %s is highlighted", async (route, expected) => {
    renderWithAuth(<Sidebar />, { route });
    expect(active()).toEqual([expected]);
    await screen.findByText(/not following anyone/);
  });
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


test("links to Settings; Admin only for admins", async () => {
  axios.get.mockResolvedValue({ data: [] });
  const { unmount } = renderWithAuth(<Sidebar />);
  await act(async () => {});
  expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings");
  expect(screen.queryByRole("link", { name: "Admin" })).toBeNull();
  unmount();
  renderWithAuth(<Sidebar />, { user: { ...ME, isAdmin: true } });
  await act(async () => {});
  expect(screen.getByRole("link", { name: "Admin" })).toHaveAttribute("href", "/admin");
});
