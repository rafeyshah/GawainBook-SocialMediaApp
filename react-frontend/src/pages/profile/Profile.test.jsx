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

test("on your own profile you can change your photo and cover", async () => {
  mockGets({ ...ME, followers: [], followings: [] });
  renderProfile(ME.username);
  await header();
  expect(screen.getByRole("button", { name: "Change photo" })).toHaveClass("photoBadge");
  expect(screen.getByRole("button", { name: "Change cover" })).toBeInTheDocument();
  // No photo yet, so nothing to remove.
  expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
});

test("uploading a new photo updates the profile straight away", async () => {
  mockGets({ ...ME, followers: [], followings: [] });
  axios.post.mockResolvedValueOnce({ data: { filename: "uploads/9-z.png" } });
  axios.put.mockResolvedValueOnce({ data: { profilePicture: "uploads/9-z.png" } });
  renderProfile(ME.username);
  const h = await header();
  userEvent.upload(screen.getByTestId("profilePicture-file"), new File(["x"], "me.png", { type: "image/png" }));
  await waitFor(() => expect(h.querySelector("img.avatar")).not.toBeNull());
  expect(h.querySelector("img.avatar").getAttribute("src")).toMatch(/uploads\/9-z\.png$/);
  // With a photo set, a Remove option appears.
  expect(screen.getAllByRole("button", { name: "Remove" }).length).toBeGreaterThan(0);
});

test("a cover image is shown as the banner background", async () => {
  mockGets({ ...SAM, coverPicture: "uploads/c-1.jpg" });
  renderProfile("sam");
  await header();
  expect(screen.getByTestId("profile-cover").style.backgroundImage).toMatch(/uploads\/c-1\.jpg/);
});

test("other readers' profiles have no photo controls", async () => {
  mockGets(SAM);
  renderProfile("sam");
  await header();
  expect(screen.queryByRole("button", { name: /Change (photo|cover)/ })).toBeNull();
  expect(screen.getByRole("button", { name: "Follow" })).toBeInTheDocument();
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

test("your own profile shows your reading profile and blocked readers", async () => {
  axios.get.mockImplementation((url) => {
    if (url.startsWith("/users?username=")) return Promise.resolve({ data: { ...ME, followers: [], followings: [], favoriteGenres: ["Romantasy"], pace: 3 } });
    if (url === "/blocks") return Promise.resolve({ data: [{ _id: "u7", username: "wick" }] });
    return Promise.resolve({ data: [] });
  });
  renderProfile(ME.username);
  await header();
  expect(screen.getByRole("region", { name: "Reading profile" })).toHaveTextContent("Romantasy");
  expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  expect(await screen.findByRole("region", { name: "Blocked readers" })).toHaveTextContent("wick");
  expect(screen.queryByRole("button", { name: /^Block / })).toBeNull();
});

test("blocking a reader from their profile hides their posts and Follow button", async () => {
  jest.spyOn(window, "confirm").mockReturnValue(true);
  mockGets({ ...SAM, followers: [ME._id] });
  axios.put.mockResolvedValueOnce({ data: { blocked: true } });
  const { dispatch } = renderProfile("sam");
  const h = await header();
  userEvent.click(within(h).getByRole("button", { name: "Block sam" }));
  expect(await screen.findByText("You've blocked sam")).toBeInTheDocument();
  expect(axios.put).toHaveBeenCalledWith("/blocks/u2");
  expect(dispatch).toHaveBeenCalledWith({ type: "UNFOLLOW", payload: "u2" });
  expect(within(h).queryByRole("button", { name: /Follow/ })).toBeNull();
  expect(within(h).getByText(/followers/)).toHaveTextContent("0 followers");
  window.confirm.mockRestore();
});
