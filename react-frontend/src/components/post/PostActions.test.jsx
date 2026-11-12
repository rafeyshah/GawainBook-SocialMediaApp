import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axios from "axios";
import { Route } from "react-router-dom";
import Post, { commentLabel } from "./Post";
import PostComments from "./PostComments";
import Share from "../share/Share";
import PostPage from "../../pages/post/PostPage";
import { renderWithAuth, makePost, ME, httpError } from "../../testUtils";

jest.mock("axios");

const OTHER = { _id: "u2", username: "sam" };
const comment = (over = {}) => ({
  _id: "c1",
  body: "Lovely pick",
  createdAt: new Date().toISOString(),
  editedAt: null,
  author: OTHER,
  canDelete: false,
  ...over,
});

// Author lookups, comment lists and the post page by URL.
const api = ({ author = OTHER, comments = [], post } = {}) => {
  axios.get.mockImplementation((url) => {
    if (url.startsWith("/users?userId=")) return Promise.resolve({ data: author });
    if (/\/posts\/[^/]+\/comments$/.test(url)) return Promise.resolve({ data: comments });
    if (post && url === `/posts/${post._id}`) return Promise.resolve({ data: post });
    return Promise.resolve({ data: [] });
  });
};

beforeEach(() => jest.spyOn(window, "confirm").mockReturnValue(true));
afterEach(() => window.confirm.mockRestore());

const settle = () => act(async () => {});

test("commentLabel", () => {
  expect(commentLabel(0)).toBe("Comment");
  expect(commentLabel(1)).toBe("1 comment");
  expect(commentLabel(7)).toBe("7 comments");
});

describe("your own post", () => {
  const mine = (over = {}) => makePost({ _id: "p1", userId: ME._id, desc: "Started Emma today", ...over });

  test("can be edited: text and spoiler cover; shows 'edited' afterwards", async () => {
    api({ author: ME });
    axios.put.mockResolvedValueOnce({ data: { ...mine(), desc: "Finished Emma!", spoiler: true, spoilerFor: "Emma", editedAt: new Date().toISOString() } });
    renderWithAuth(<Post post={mine()} />);
    await settle();
    userEvent.click(screen.getByRole("button", { name: "Edit post" }));
    const form = screen.getByRole("form", { name: "Edit post" });
    userEvent.clear(within(form).getByLabelText("Your post"));
    userEvent.type(within(form).getByLabelText("Your post"), "Finished Emma!");
    userEvent.click(within(form).getByLabelText("This post has spoilers"));
    userEvent.type(within(form).getByPlaceholderText("For which book? (optional)"), " Emma ");
    userEvent.click(within(form).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(axios.put).toHaveBeenCalled());
    expect(await screen.findByText("Finished Emma!")).toBeInTheDocument();
    expect(axios.put).toHaveBeenCalledWith("/posts/p1", { desc: "Finished Emma!", spoiler: true, spoilerFor: "Emma" });
    expect(screen.getByText(/· edited/)).toBeInTheDocument();
    expect(screen.getByText("Spoiler for Emma")).toBeInTheDocument();
  });

  test("Save is disabled for an empty text-only post; Cancel restores it", async () => {
    api({ author: ME });
    renderWithAuth(<Post post={mine()} />);
    await settle();
    userEvent.click(screen.getByRole("button", { name: "Edit post" }));
    const form = screen.getByRole("form", { name: "Edit post" });
    userEvent.clear(within(form).getByLabelText("Your post"));
    expect(within(form).getByRole("button", { name: "Save" })).toBeDisabled();
    userEvent.click(within(form).getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("Started Emma today")).toBeInTheDocument();
  });

  test("a failed edit keeps the form with the error", async () => {
    api({ author: ME });
    axios.put.mockRejectedValueOnce(httpError(429, { error: "You're posting very quickly." }));
    renderWithAuth(<Post post={mine()} />);
    await settle();
    userEvent.click(screen.getByRole("button", { name: "Edit post" }));
    userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("posting very quickly");
    expect(screen.getByRole("form", { name: "Edit post" })).toBeInTheDocument();
  });

  test("can be deleted after confirming; the feed is told", async () => {
    api({ author: ME });
    axios.delete.mockResolvedValueOnce({ data: { message: "Post deleted." } });
    const onDeleted = jest.fn();
    renderWithAuth(<Post post={mine()} onDeleted={onDeleted} />);
    await settle();
    userEvent.click(screen.getByRole("button", { name: "Delete post" }));
    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith("p1"));
    expect(axios.delete).toHaveBeenCalledWith("/posts/p1");
  });

  test("not confirming keeps it; a failed delete shows why", async () => {
    api({ author: ME });
    window.confirm.mockReturnValueOnce(false);
    axios.delete.mockRejectedValueOnce(httpError(403, { error: "You can only delete your own posts." }));
    const onDeleted = jest.fn();
    renderWithAuth(<Post post={mine()} onDeleted={onDeleted} />);
    await settle();
    userEvent.click(screen.getByRole("button", { name: "Delete post" }));
    expect(axios.delete).not.toHaveBeenCalled();
    userEvent.click(screen.getByRole("button", { name: "Delete post" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("only delete your own");
    expect(onDeleted).not.toHaveBeenCalled();
  });

  test("your own spoiler posts aren't covered for you, and you can't report yourself", async () => {
    api({ author: ME });
    renderWithAuth(<Post post={mine({ spoiler: true })} />);
    await settle();
    expect(screen.queryByRole("button", { name: "Show spoiler" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Report/ })).toBeNull();
  });
});

describe("someone else's post", () => {
  test("has no Edit or Delete", async () => {
    api();
    renderWithAuth(<Post post={makePost({ userId: "u2" })} />);
    await settle();
    expect(screen.queryByRole("button", { name: "Edit post" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete post" })).toBeNull();
  });

  test("a spoiler post is covered until you choose to reveal it", async () => {
    api();
    renderWithAuth(<Post post={makePost({ userId: "u2", desc: "Wickham elopes!", spoiler: true, spoilerFor: "Pride and Prejudice" })} />);
    await settle();
    expect(screen.getByText("Spoiler for Pride and Prejudice")).toBeInTheDocument();
    const content = screen.getByText("Wickham elopes!").closest(".postContent");
    expect(content).toHaveAttribute("aria-hidden", "true");
    expect(content.closest(".postBody")).toHaveClass("isCovered");
    userEvent.click(screen.getByRole("button", { name: "Show spoiler" }));
    expect(content).not.toHaveAttribute("aria-hidden");
    expect(screen.queryByRole("button", { name: "Show spoiler" })).toBeNull();
  });

  test("a spoiler without a book name says just 'Spoiler'", async () => {
    api();
    renderWithAuth(<Post post={makePost({ userId: "u2", spoiler: true })} />);
    await settle();
    expect(screen.getByText("Spoiler")).toBeInTheDocument();
  });

  test("the date links to the post's own page", async () => {
    api();
    renderWithAuth(<Post post={makePost({ _id: "p7", userId: "u2" })} />);
    await settle();
    expect(screen.getByText("just now").closest("a")).toHaveAttribute("href", "/posts/p7");
  });
});

describe("comments", () => {
  test("the count shows on the post; opening loads the comments", async () => {
    api({ comments: [comment(), comment({ _id: "c2", body: "Me too" })] });
    renderWithAuth(<Post post={makePost({ _id: "p1", userId: "u2", commentCount: 2 })} />);
    await settle();
    const toggle = screen.getByRole("button", { name: "2 comments" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    userEvent.click(toggle);
    expect(await screen.findByText("Lovely pick")).toBeInTheDocument();
    expect(screen.getByText("Me too")).toBeInTheDocument();
    expect(axios.get).toHaveBeenCalledWith("/posts/p1/comments");
  });

  test("adding a comment appends it, clears the box and updates the count", async () => {
    api({ comments: [] });
    axios.post.mockResolvedValueOnce({ data: comment({ _id: "c9", body: "First!", author: { _id: ME._id, username: ME.username }, canDelete: true }) });
    renderWithAuth(<Post post={makePost({ _id: "p1", userId: "u2", commentCount: 0 })} showComments />);
    expect(await screen.findByText(/No comments yet/)).toBeInTheDocument();
    const form = screen.getByRole("form", { name: "Add a comment" });
    expect(within(form).getByRole("button", { name: "Send" })).toBeDisabled();
    userEvent.type(within(form).getByLabelText("Write a comment"), "  First!  ");
    userEvent.click(within(form).getByRole("button", { name: "Send" }));
    expect(await screen.findByText("First!")).toBeInTheDocument();
    expect(axios.post).toHaveBeenCalledWith("/posts/p1/comments", { body: "First!" });
    expect(within(form).getByLabelText("Write a comment")).toHaveValue("");
    expect(screen.getByRole("button", { name: "1 comment" })).toBeInTheDocument();
  });

  test("a failed comment keeps your text and shows why", async () => {
    api({ comments: [] });
    axios.post.mockRejectedValueOnce(httpError(404, { error: "Post not found." }));
    renderWithAuth(<PostComments postId="p1" />);
    await settle();
    userEvent.type(screen.getByLabelText("Write a comment"), "Hello");
    userEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Post not found.");
    expect(screen.getByLabelText("Write a comment")).toHaveValue("Hello");
  });

  test("you can edit your own comment; it's marked edited", async () => {
    api({ comments: [comment({ author: { _id: ME._id, username: ME.username }, canDelete: true })] });
    axios.patch.mockResolvedValueOnce({ data: { _id: "c1", body: "Lovely pick indeed", editedAt: new Date().toISOString() } });
    renderWithAuth(<PostComments postId="p1" />);
    await screen.findByText("Lovely pick");
    userEvent.click(screen.getByRole("button", { name: `Edit comment by ${ME.username}` }));
    const form = screen.getByRole("form", { name: "Edit comment" });
    userEvent.clear(within(form).getByLabelText("Your comment"));
    userEvent.type(within(form).getByLabelText("Your comment"), "Lovely pick indeed");
    userEvent.click(within(form).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(axios.patch).toHaveBeenCalled());
    expect(await screen.findByText("Lovely pick indeed")).toBeInTheDocument();
    expect(axios.patch).toHaveBeenCalledWith("/post-comments/c1", { body: "Lovely pick indeed" });
    expect(screen.getByText("· edited")).toBeInTheDocument();
  });

  test("Delete appears only when the server allows it, and removes the comment", async () => {
    api({ comments: [comment({ canDelete: true }), comment({ _id: "c2", body: "Not deletable", canDelete: false })] });
    axios.delete.mockResolvedValueOnce({ data: { deleted: true } });
    renderWithAuth(<PostComments postId="p1" />);
    await screen.findByText("Lovely pick");
    const [first, second] = screen.getAllByRole("listitem");
    expect(within(second).queryByRole("button", { name: /Delete/ })).toBeNull();
    userEvent.click(within(first).getByRole("button", { name: "Delete comment by sam" }));
    await waitFor(() => expect(screen.queryByText("Lovely pick")).toBeNull());
    expect(axios.delete).toHaveBeenCalledWith("/post-comments/c1");
  });

  test("others' comments can be reported; your own can't be edited by others", async () => {
    api({ comments: [comment()] });
    axios.post.mockResolvedValueOnce({ data: { _id: "r1", status: "open" } });
    renderWithAuth(<PostComments postId="p1" />);
    await screen.findByText("Lovely pick");
    expect(screen.queryByRole("button", { name: "Edit comment by sam" })).toBeNull();
    userEvent.click(screen.getByRole("button", { name: "Report comment by sam" }));
    const form = screen.getByRole("form", { name: "Report this comment" });
    userEvent.click(within(form).getByLabelText("Unkind or harassing"));
    userEvent.click(within(form).getByRole("button", { name: "Send report" }));
    expect(await screen.findByRole("status")).toHaveTextContent("moderators will take a look");
    expect(axios.post).toHaveBeenCalledWith("/reports", { targetType: "post_comment", targetId: "c1", reason: "harassment", details: "" });
  });

  test("a load failure is shown", async () => {
    axios.get.mockRejectedValue(httpError(404, { error: "Post not found." }));
    renderWithAuth(<PostComments postId="p1" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Post not found.");
  });
});

describe("composer spoiler option", () => {
  test("appears once you've written something, and is sent with the post", async () => {
    axios.post.mockResolvedValueOnce({ data: makePost({ spoiler: true }) });
    const onPosted = jest.fn();
    renderWithAuth(<Share onPosted={onPosted} />);
    expect(screen.queryByLabelText("This post has spoilers")).toBeNull();
    userEvent.type(screen.getByLabelText("What are you reading?"), "The ending!");
    userEvent.click(screen.getByLabelText("This post has spoilers"));
    userEvent.type(screen.getByPlaceholderText("For which book? (optional)"), " Persuasion ");
    userEvent.click(screen.getByRole("button", { name: "Post" }));
    await waitFor(() => expect(onPosted).toHaveBeenCalled());
    expect(axios.post).toHaveBeenCalledWith("/posts", { desc: "The ending!", img: undefined, spoiler: true, spoilerFor: "Persuasion" });
    // Reset for the next post.
    expect(screen.queryByLabelText("This post has spoilers")).toBeNull();
  });

  test("plain posts don't send spoiler fields", async () => {
    axios.post.mockResolvedValueOnce({ data: makePost() });
    renderWithAuth(<Share onPosted={jest.fn()} />);
    userEvent.type(screen.getByLabelText("What are you reading?"), "Hello");
    userEvent.click(screen.getByRole("button", { name: "Post" }));
    await waitFor(() => expect(axios.post).toHaveBeenCalledWith("/posts", { desc: "Hello", img: undefined }));
  });
});

describe("PostPage", () => {
  const renderPage = () =>
    renderWithAuth(
      <>
        <Route path="/posts/:id">
          <PostPage />
        </Route>
        <Route path="/feed" render={() => <p>Feed page</p>} />
      </>,
      { route: "/posts/p5" }
    );

  test("shows the post with comments open", async () => {
    api({ post: makePost({ _id: "p5", userId: "u2", desc: "A single post", commentCount: 1 }), comments: [comment()] });
    renderPage();
    expect(await screen.findByText("A single post")).toBeInTheDocument();
    expect(await screen.findByText("Lovely pick")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toHaveTextContent("Feed › Post");
  });

  test("deleting your post goes back to the feed", async () => {
    api({ author: ME, post: makePost({ _id: "p5", userId: ME._id }) });
    axios.delete.mockResolvedValueOnce({ data: {} });
    renderPage();
    userEvent.click(await screen.findByRole("button", { name: "Delete post" }));
    expect(await screen.findByText("Feed page")).toBeInTheDocument();
  });

  test.each([
    [httpError(404, { error: "Post not found." }), "Post not found"],
    [new Error("Network Error"), "Couldn't load this post"],
  ])("load failure %#", async (err, heading) => {
    axios.get.mockImplementation((url) => (url === "/posts/p5" ? Promise.reject(err) : Promise.resolve({ data: [] })));
    renderPage();
    expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to your feed" })).toHaveAttribute("href", "/feed");
  });
});

describe("comments under a spoiler cover", () => {
  test("stay hidden while the post is covered (even on the post page)", async () => {
    api({ comments: [comment({ body: "Wickham did it" })] });
    renderWithAuth(<Post post={makePost({ userId: "u2", spoiler: true, commentCount: 1 })} showComments />);
    await settle();
    expect(screen.queryByText("Wickham did it")).toBeNull();
    expect(axios.get).not.toHaveBeenCalledWith(expect.stringMatching(/\/comments$/));
    userEvent.click(screen.getByRole("button", { name: "Show spoiler" }));
    expect(await screen.findByText("Wickham did it")).toBeInTheDocument();
  });

  test("opening the comments of a covered post reveals it", async () => {
    api({ comments: [comment({ body: "Big twist" })] });
    renderWithAuth(<Post post={makePost({ userId: "u2", spoiler: true, commentCount: 1 })} />);
    await settle();
    userEvent.click(screen.getByRole("button", { name: "1 comment" }));
    expect(await screen.findByText("Big twist")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show spoiler" })).toBeNull();
  });
});
