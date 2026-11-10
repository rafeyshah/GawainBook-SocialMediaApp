import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axios from "axios";
import Profile, { joinedLabel } from "./Profile";
import { renderWithAuth, ME, httpError, networkError } from "../../testUtils";

jest.mock("axios");

const SAM = {
  _id: "u2",
  username: "sam",
  profilePicture: "",
  coverPicture: "",
  followers: ["x"],
  followings: ["y", "z"],
  desc: "Sci-fi and slow mornings",
  city: "Lahore",
  from: "Karachi",
  createdAt: "2025-03-10T00:00:00.000Z",
};

// GET /users → profile; feed and sidebar calls → empty lists.
const mockGets = (profileResult) => {
  axios.get.mockImplementation((url) => {
    if (url.startsWith("/users?username=")) {
      return profileResult instanceof Error ? Promise.reject(profileResult) : Promise.resolve({ data: profileResult });
    }
    return Promise.resolve({ data: [] });
  });
};

const renderProfile = (username, options = {}) =>
  renderWithAuth(<Profile />, { route: `/profile/${username}`, path: "/profile/:username", ...options });

const header = () => screen.findByRole("region", { name: /'s profile/ });

describe("joinedLabel", () => {
  test("formats month and year", () => expect(joinedLabel("2025-03-10T12:00:00Z")).toBe("Joined March 2025"));
  test.each([[undefined], [""], ["not a date"]])("returns empty for %p", (v) => expect(joinedLabel(v)).toBe(""));
});

test("shows the reader's details and stats", async () => {
  mockGets(SAM);
  renderProfile("sam");
  const h = within(await header());
  expect(h.getByRole("heading", { name: "sam" })).toBeInTheDocument();
  expect(h.getByText("Sci-fi and slow mornings")).toBeInTheDocument();
  expect(h.getByText("Lahore")).toBeInTheDocument();
  expect(h.getByText("From Karachi")).toBeInTheDocument();
  expect(h.getByText("Joined March 2025")).toBeInTheDocument();
  expect(h.getByText("follower", { exact: false })).toHaveTextContent("1 follower");
  expect(h.getByText("following", { exact: false })).toHaveTextContent("2 following");
  expect(axios.get).toHaveBeenCalledWith("/users?username=sam");
});

test("hides empty optional details", async () => {
  mockGets({ ...SAM, desc: "", city: "", from: "", createdAt: undefined });
  renderProfile("sam");
  const h = await header();
  expect(h.querySelector(".profileDesc")).toBeNull();
  expect(h.querySelector(".profileDetails")).toBeNull();
});

test("your own profile has no Follow button but has the composer", async () => {
  mockGets({ ...ME, followers: [], followings: [] });
  renderProfile(ME.username);
  await header();
  expect(screen.queryByRole("button", { name: /follow/i })).toBeNull();
  expect(await screen.findByRole("form", { name: "Create a post" })).toBeInTheDocument();
});

test("following a reader updates the button, count and app state", async () => {
  mockGets(SAM);
  axios.put.mockResolvedValueOnce({ data: { following: true } });
  const { dispatch } = renderProfile("sam");
  await header();
  userEvent.click(screen.getByRole("button", { name: "Follow" }));
  await waitFor(() => expect(dispatch).toHaveBeenCalledWith({ type: "FOLLOW", payload: "u2" }));
  expect(axios.put).toHaveBeenCalledWith("/users/u2/follow"); // no userId: the server uses the session
  expect(screen.getByText(/followers/)).toHaveTextContent("2 followers");
});

test("unfollowing when you already follow them", async () => {
  mockGets({ ...SAM, followers: [ME._id] });
  axios.put.mockResolvedValueOnce({ data: { following: false } });
  const { dispatch } = renderProfile("sam", { user: { ...ME, followings: ["u2"] } });
  await header();
  const button = screen.getByRole("button", { name: "Following" });
  expect(button).toHaveAttribute("aria-pressed", "true");
  userEvent.click(button);
  await waitFor(() => expect(dispatch).toHaveBeenCalledWith({ type: "UNFOLLOW", payload: "u2" }));
  expect(axios.put).toHaveBeenCalledWith("/users/u2/unfollow");
  expect(screen.getByText(/followers/)).toHaveTextContent("0 followers");
});

test("a failed follow shows the error and changes nothing", async () => {
  mockGets(SAM);
  axios.put.mockRejectedValueOnce(httpError(409, { error: "You already follow this reader." }));
  const { dispatch } = renderProfile("sam");
  await header();
  userEvent.click(screen.getByRole("button", { name: "Follow" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("You already follow this reader.");
  expect(dispatch).not.toHaveBeenCalled();
  expect(screen.getByText(/follower/)).toHaveTextContent("1 follower");
});

test("unknown readers get a friendly not-found page", async () => {
  mockGets(httpError(404, { error: "User not found." }));
  renderProfile("ghost");
  expect(await screen.findByRole("heading", { name: "Reader not found" })).toBeInTheDocument();
  expect(screen.getByText(/no reader called “ghost”/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Back to home" })).toHaveAttribute("href", "/");
});

test("other failures show the error message", async () => {
  mockGets(networkError());
  renderProfile("sam");
  expect(await screen.findByRole("alert")).toHaveTextContent("Can't reach the server");
});
