import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axios from "axios";
import Post, { likeLabel } from "./Post";
import { renderWithAuth, makePost, ME, httpError } from "../../testUtils";

jest.mock("axios");

const AUTHOR = { _id: "u2", username: "sam", profilePicture: "" };

beforeEach(() => {
  axios.get.mockResolvedValue({ data: AUTHOR });
});

test("likeLabel pluralises", () => {
  expect(likeLabel(0)).toBe("0 likes");
  expect(likeLabel(1)).toBe("1 like");
  expect(likeLabel(2)).toBe("2 likes");
});

test("shows the author, text and relative time", async () => {
  renderWithAuth(<Post post={makePost({ desc: "Loved it" })} />);
  expect(await screen.findByRole("link", { name: /sam/ })).toHaveAttribute("href", "/profile/sam");
  expect(screen.getByText("Loved it")).toBeInTheDocument();
  expect(screen.getByText(/ago|just now/)).toBeInTheDocument();
  expect(axios.get).toHaveBeenCalledWith("/users?userId=u2");
});

test("does not render an image when the post has none", async () => {
  const { container } = renderWithAuth(<Post post={makePost()} />);
  await screen.findByText("sam");
  expect(container.querySelector(".postImg")).toBeNull();
});

test("renders the image for photo posts, and photo-only posts have no empty text", async () => {
  const { container } = renderWithAuth(<Post post={makePost({ desc: "", img: "123-abc.jpg" })} />);
  await screen.findByText("sam");
  expect(container.querySelector(".postImg").getAttribute("src")).toMatch(/123-abc\.jpg$/);
  expect(container.querySelector(".postText")).toBeNull();
});

test("keeps line breaks in text", async () => {
  renderWithAuth(<Post post={makePost({ desc: "line one\nline two" })} />);
  expect(await screen.findByText(/line one/)).toHaveClass("postText");
});

test("starts liked when the current user already liked it", async () => {
  renderWithAuth(<Post post={makePost({ likes: [ME._id, "x"] })} />);
  await screen.findByText("sam");
  expect(screen.getByRole("button", { name: "Unlike" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByText("2 likes")).toBeInTheDocument();
});

test("liking updates instantly and syncs with the server count", async () => {
  axios.put.mockResolvedValueOnce({ data: { liked: true, likes: 5 } });
  renderWithAuth(<Post post={makePost({ _id: "p9", likes: ["x"] })} />);
  await screen.findByText("sam");

  userEvent.click(screen.getByRole("button", { name: "Like" }));
  expect(screen.getByText("2 likes")).toBeInTheDocument(); // optimistic
  expect(await screen.findByText("5 likes")).toBeInTheDocument(); // server truth
  expect(axios.put).toHaveBeenCalledWith("/posts/p9/like"); // the server likes as the signed-in user
  expect(screen.getByRole("button", { name: "Unlike" })).toBeInTheDocument();
});

test("unliking works the same way", async () => {
  axios.put.mockResolvedValueOnce({ data: { liked: false, likes: 0 } });
  renderWithAuth(<Post post={makePost({ likes: [ME._id] })} />);
  await screen.findByText("sam");
  userEvent.click(screen.getByRole("button", { name: "Unlike" }));
  expect(await screen.findByText("0 likes")).toBeInTheDocument();
});

test("rolls back and shows an error when the like fails", async () => {
  axios.put.mockRejectedValueOnce(httpError(500, {}));
  renderWithAuth(<Post post={makePost({ likes: [] })} />);
  await screen.findByText("sam");
  userEvent.click(screen.getByRole("button", { name: "Like" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't update");
  expect(screen.getByText("0 likes")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Like" })).toHaveAttribute("aria-pressed", "false");
});

test("ignores double clicks while a like is in flight", async () => {
  let resolve;
  axios.put.mockReturnValueOnce(new Promise((r) => (resolve = r)));
  renderWithAuth(<Post post={makePost()} />);
  await screen.findByText("sam");
  const button = screen.getByRole("button", { name: "Like" });
  userEvent.click(button);
  userEvent.click(button);
  expect(axios.put).toHaveBeenCalledTimes(1);
  resolve({ data: { liked: true, likes: 1 } });
  await waitFor(() => expect(screen.getByRole("button", { name: "Unlike" })).not.toBeDisabled());
});

test("shows a placeholder name when the author can't be loaded", async () => {
  axios.get.mockRejectedValueOnce(httpError(404, { error: "User not found." }));
  renderWithAuth(<Post post={makePost()} />);
  expect(await screen.findByText("Unknown reader")).toBeInTheDocument();
  expect(screen.queryByRole("link")).toBeNull();
});
