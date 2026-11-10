import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axios from "axios";
import Feed from "./Feed";
import { renderWithAuth, makePost, ME, httpError } from "../../testUtils";

jest.mock("axios");

const day = (n) => new Date(2026, 0, n).toISOString();

// Route the two kinds of GET: feed lists and post authors.
const mockApi = (posts) => {
  axios.get.mockImplementation((url) => {
    if (url.startsWith("/users")) return Promise.resolve({ data: { _id: "u2", username: "sam" } });
    if (posts instanceof Error) return Promise.reject(posts);
    return Promise.resolve({ data: posts });
  });
};

test("home feed loads the timeline, newest first, with the composer", async () => {
  mockApi([makePost({ desc: "older", createdAt: day(1) }), makePost({ desc: "newer", createdAt: day(5) })]);
  renderWithAuth(<Feed />);
  expect(screen.getByLabelText("Loading posts")).toBeInTheDocument();
  const texts = await screen.findAllByText(/older|newer/);
  expect(texts.map((t) => t.textContent)).toEqual(["newer", "older"]);
  expect(axios.get).toHaveBeenCalledWith("/posts/timeline");
  expect(screen.getByRole("form", { name: "Create a post" })).toBeInTheDocument();
});

test("profile feed uses the profile endpoint and hides the composer for other readers", async () => {
  mockApi([makePost({ desc: "by sam" })]);
  renderWithAuth(<Feed username="sam" />);
  await screen.findByText("by sam");
  expect(axios.get).toHaveBeenCalledWith("/posts/profile/sam");
  expect(screen.queryByRole("form", { name: "Create a post" })).toBeNull();
});

test("your own profile feed shows the composer", async () => {
  mockApi([]);
  renderWithAuth(<Feed username={ME.username} />);
  await screen.findByText("No posts yet");
  expect(screen.getByRole("form", { name: "Create a post" })).toBeInTheDocument();
});

test("encodes unusual usernames in the URL", async () => {
  mockApi([]);
  renderWithAuth(<Feed username="a b/c" />);
  await screen.findByText("No posts yet");
  expect(axios.get).toHaveBeenCalledWith("/posts/profile/a%20b%2Fc");
});

test.each([
  [undefined, "Your feed is quiet"],
  ["sam", "sam hasn't posted yet."],
])("empty state for %p", async (username, text) => {
  mockApi([]);
  renderWithAuth(<Feed username={username} />);
  expect(await screen.findByText(text)).toBeInTheDocument();
});

test("shows an error with a working retry", async () => {
  mockApi(httpError(500, { error: "Database unavailable." }));
  renderWithAuth(<Feed />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Database unavailable.");

  mockApi([makePost({ desc: "back again" })]);
  userEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("back again")).toBeInTheDocument();
});

test("a new post appears at the top without reloading", async () => {
  mockApi([makePost({ desc: "existing" })]);
  axios.post.mockResolvedValueOnce({ data: makePost({ _id: "new", userId: ME._id, desc: "fresh post" }) });
  renderWithAuth(<Feed />);
  await screen.findByText("existing");

  userEvent.type(screen.getByRole("textbox"), "fresh post");
  userEvent.click(screen.getByRole("button", { name: "Post" }));
  await waitFor(() => {
    const texts = screen.getAllByText(/existing|fresh post/).map((t) => t.textContent);
    expect(texts).toEqual(["fresh post", "existing"]);
  });
});
