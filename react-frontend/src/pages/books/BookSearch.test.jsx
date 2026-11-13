import { screen, waitFor, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axios from "axios";
import BookSearch from "./BookSearch";
import BookCover from "../../components/book/BookCover";
import ProgressEditor from "../../components/book/ProgressEditor";
import { renderWithAuth, httpError } from "../../testUtils";
import { BOOK } from "../../readingFixtures";

jest.mock("axios");

const ol = (over = {}) => ({ key: "/works/OL1W", title: "Emma", author: "Jane Austen", year: 1815, coverUrl: "https://covers.openlibrary.org/b/id/1-M.jpg", editions: 10, ...over });
const results = (over = {}) => ({ query: "austen", local: [{ ...BOOK, chaptersAvailable: true, shelf: null }], openLibrary: [ol(), ol({ key: "/works/OL2W", title: "Lady Susan", coverUrl: null, year: null })], openLibraryError: false, ...over });

const search = (q = "austen") => {
  userEvent.type(screen.getByRole("searchbox", { name: "Title or author" }), q);
  userEvent.click(screen.getByRole("button", { name: "Search" }));
};
const setup = async (data = results()) => {
  axios.get.mockResolvedValueOnce({ data });
  const onShelved = jest.fn();
  renderWithAuth(<BookSearch onShelved={onShelved} />);
  search();
  await screen.findByRole("heading", { name: "From Open Library" });
  return { onShelved };
};

describe("results", () => {
  test("our books and Open Library books, each with shelf buttons", async () => {
    await setup();
    expect(axios.get).toHaveBeenCalledWith("/books/search", { params: { q: "austen" } });
    const ours = screen.getByRole("list", { name: "Books on GawainBook" });
    expect(within(ours).getAllByRole("link", { name: /Pride and Prejudice/ })[0]).toHaveAttribute("href", "/books/pride-and-prejudice");
    expect(within(ours).getByText("Ready for circles")).toBeInTheDocument();
    expect(within(ours).getByRole("button", { name: "Add Pride and Prejudice to Want to read" })).toBeInTheDocument();
    const theirs = screen.getByRole("list", { name: "Open Library results" });
    expect(within(theirs).getByRole("link", { name: "Emma" })).toHaveAttribute("href", "https://openlibrary.org/works/OL1W");
    expect(within(theirs).getByRole("button", { name: "Add Emma to Reading" })).toBeInTheDocument();
    expect(within(theirs).getByRole("button", { name: "Add Lady Susan to Want to read" })).toBeInTheDocument();
  });

  test("a book already on your shelf says so instead of offering to add it", async () => {
    await setup(results({ local: [{ ...BOOK, shelf: "reading", chaptersAvailable: true }] }));
    const ours = screen.getByRole("list", { name: "Books on GawainBook" });
    expect(within(ours).getByRole("status")).toHaveTextContent("Reading");
    expect(within(ours).queryByRole("button", { name: /^Add/ })).toBeNull();
    expect(within(ours).getByRole("button", { name: "Move Pride and Prejudice to Want to read" })).toBeInTheDocument();
  });

  test("Search needs 2+ characters", () => {
    renderWithAuth(<BookSearch />);
    expect(screen.getByRole("button", { name: "Search" })).toBeDisabled();
    userEvent.type(screen.getByRole("searchbox", { name: "Title or author" }), "e");
    expect(screen.getByRole("button", { name: "Search" })).toBeDisabled();
  });

  test("Open Library down: our results still show, with a note", async () => {
    await setup(results({ openLibrary: [], openLibraryError: true }));
    expect(screen.getByText(/Open Library isn't answering/)).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Books on GawainBook" })).toBeInTheDocument();
  });

  test("nothing found anywhere", async () => {
    await setup(results({ query: "zzqx", local: [], openLibrary: [] }));
    expect(screen.getByText("No books found for “zzqx”.")).toBeInTheDocument();
  });

  test("search errors are shown and the button comes back", async () => {
    axios.get.mockRejectedValueOnce(httpError(400, { error: "Search for 2–100 characters." }));
    renderWithAuth(<BookSearch />);
    search("ab");
    expect(await screen.findByRole("alert")).toHaveTextContent("2–100");
    await waitFor(() => expect(screen.getByRole("button", { name: "Search" })).toBeEnabled());
  });
});

describe("adding to a shelf", () => {
  test("an Open Library book is imported and shelved; links to its new page", async () => {
    axios.post.mockResolvedValueOnce({ data: { book: { _id: "b9", slug: "emma" }, shelf: "reading", created: true } });
    const { onShelved } = await setup();
    const theirs = screen.getByRole("list", { name: "Open Library results" });
    userEvent.click(within(theirs).getByRole("button", { name: "Add Emma to Reading" }));
    const item = within(theirs).getByRole("link", { name: "Emma" }).closest("li");
    expect(await within(item).findByRole("status")).toHaveTextContent("Reading");
    expect(axios.post).toHaveBeenCalledWith("/books/import", { key: "/works/OL1W", shelf: "reading" });
    expect(within(item).getByRole("link", { name: "Open" })).toHaveAttribute("href", "/books/emma");
    expect(onShelved).toHaveBeenCalledWith("reading");
    // The other result is untouched.
    expect(within(theirs).getByRole("button", { name: "Add Lady Susan to Reading" })).toBeEnabled();
  });

  test("buttons say 'Adding…' and are disabled while it works", async () => {
    let resolve;
    axios.post.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    await setup();
    const theirs = screen.getByRole("list", { name: "Open Library results" });
    userEvent.click(within(theirs).getByRole("button", { name: "Add Emma to Want to read" }));
    const item = within(theirs).getByRole("link", { name: "Emma" }).closest("li");
    expect(within(item).getByRole("button", { name: "Add Emma to Want to read" })).toHaveTextContent("Adding…");
    expect(within(item).getByRole("button", { name: "Add Emma to Reading" })).toBeDisabled();
    resolve({ data: { book: { _id: "b9", slug: "emma" }, shelf: "want", created: true } });
    expect(await within(item).findByRole("status")).toHaveTextContent("Want to read");
  });

  test("you can move an added book to the other shelf", async () => {
    axios.post
      .mockResolvedValueOnce({ data: { book: { _id: "b9", slug: "emma" }, shelf: "want" } })
      .mockResolvedValueOnce({ data: { book: { _id: "b9", slug: "emma" }, shelf: "reading" } });
    await setup();
    const theirs = screen.getByRole("list", { name: "Open Library results" });
    userEvent.click(within(theirs).getByRole("button", { name: "Add Emma to Want to read" }));
    userEvent.click(await within(theirs).findByRole("button", { name: "Move Emma to Reading" }));
    await waitFor(() => expect(axios.post).toHaveBeenLastCalledWith("/books/import", { key: "/works/OL1W", shelf: "reading" }));
    expect(await within(theirs).findByRole("button", { name: "Move Emma to Want to read" })).toBeInTheDocument();
  });

  test("one of our books is shelved directly", async () => {
    axios.put.mockResolvedValueOnce({ data: { shelf: "want", chapter: 0, chapterCount: 61 } });
    const { onShelved } = await setup();
    const ours = screen.getByRole("list", { name: "Books on GawainBook" });
    userEvent.click(within(ours).getByRole("button", { name: "Add Pride and Prejudice to Want to read" }));
    expect(await within(ours).findByRole("status")).toHaveTextContent("Want to read");
    expect(axios.put).toHaveBeenCalledWith(`/books/${BOOK._id}/progress`, { shelf: "want" });
    expect(onShelved).toHaveBeenCalledWith("want");
  });

  test("errors show on that result only, and you can try again", async () => {
    axios.post.mockRejectedValueOnce(httpError(502, { error: "Open Library isn't answering right now. Please try again in a minute." }));
    await setup();
    const theirs = screen.getByRole("list", { name: "Open Library results" });
    userEvent.click(within(theirs).getByRole("button", { name: "Add Emma to Reading" }));
    const item = within(theirs).getByRole("link", { name: "Emma" }).closest("li");
    expect(await within(item).findByRole("alert")).toHaveTextContent("isn't answering");
    expect(within(item).getByRole("button", { name: "Add Emma to Reading" })).toBeEnabled();
  });

  test("a new search clears what was added", async () => {
    axios.post.mockResolvedValueOnce({ data: { book: { _id: "b9", slug: "emma" }, shelf: "want" } });
    await setup();
    userEvent.click(screen.getByRole("button", { name: "Add Emma to Want to read" }));
    await screen.findByRole("status");
    axios.get.mockResolvedValueOnce({ data: results() });
    userEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(await screen.findByRole("button", { name: "Add Emma to Want to read" })).toBeInTheDocument();
  });
});

describe("covers and progress for books without chapters", () => {
  test("BookCover shows the Open Library cover, and falls back to a typeset cover if it fails", () => {
    renderWithAuth(<BookCover book={{ ...BOOK, coverUrl: "https://covers.openlibrary.org/b/id/1-M.jpg" }} />);
    const img = screen.getByRole("img", { name: "Pride and Prejudice by Jane Austen" });
    expect(img.tagName).toBe("IMG");
    expect(img).toHaveAttribute("src", "https://covers.openlibrary.org/b/id/1-M.jpg");
    fireEvent.error(img);
    expect(screen.getByRole("img", { name: "Pride and Prejudice by Jane Austen" }).tagName).toBe("DIV");
  });

  test("ProgressEditor shows nothing for a book without chapters", () => {
    const { container } = renderWithAuth(<ProgressEditor book={{ ...BOOK, chapterCount: 0 }} chapter={0} />);
    expect(container).toBeEmptyDOMElement();
  });
});
