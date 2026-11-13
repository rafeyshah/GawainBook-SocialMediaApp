import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axios from "axios";
import BookPage from "./BookPage";
import Library from "./Library";
import { ProfileShelves } from "../profile/Profile";
import { renderWithAuth, httpError } from "../../testUtils";
import { BOOK, OZ, routeGet } from "../../readingFixtures";

jest.mock("axios");

const chaptersOf = (n) => Array.from({ length: n }, (_, i) => ({ seq: i + 1, title: `Chapter ${i + 1}` }));
const bookDetail = (over = {}) => ({
  ...BOOK,
  publishedYear: 1813,
  description: "A classic.",
  sourceNote: "Public domain.",
  chapters: chaptersOf(61),
  shelf: "reading",
  chapter: 12,
  circles: [
    { _id: "c1", name: "The Netherfield Circle", visibility: "public", memberCount: 6, isMember: true },
    { _id: "c2", name: "Pemberley Book Club", visibility: "private", memberCount: 3, isMember: true },
  ],
  ...over,
});
const NO_CHAPTERS = { chapters: [], chapterCount: 0, chapter: 0, circles: [] };

const renderBook = () => renderWithAuth(<BookPage />, { route: "/books/pride-and-prejudice", path: "/books/:slug" });
const showBook = (over) => {
  routeGet(axios, { "/books/pride-and-prejudice": bookDetail(over) });
  renderBook();
  return screen.findByRole("heading", { name: "Pride and Prejudice", level: 1 });
};
// The book page answers `first`, then `after` once something reloads it.
const showBookThenReload = (first, after) => {
  let calls = 0;
  axios.get.mockImplementation((url) => Promise.resolve({ data: url !== "/books/pride-and-prejudice" ? [] : ++calls === 1 ? bookDetail(first) : bookDetail(after) }));
  renderBook();
};
const chapterForm = () => screen.getByRole("form", { name: "Set up chapters" });

describe("BookPage", () => {
  test("shows details, subjects, shelf, progress and the circles reading it", async () => {
    await showBook({ subjects: ["Courtship", "Regency"], pageCount: 432 });
    expect(screen.getByText(/1813 · 61 chapters/)).toHaveTextContent("about 432 pages");
    expect(screen.getByRole("list", { name: "Subjects" })).toHaveTextContent("CourtshipRegency");
    expect(screen.getByRole("radio", { name: "Reading" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("Chapter 12 of 61")).toBeInTheDocument();
    expect(screen.getByText("Public domain.")).toBeInTheDocument();
    const aside = screen.getByRole("complementary", { name: "More for you" });
    const circles = within(aside).getByRole("region", { name: "Circles reading this book" });
    expect(within(circles).getByRole("link", { name: /Netherfield/ })).toHaveAttribute("href", "/circles/c1");
    expect(within(circles).getByText("Private")).toBeInTheDocument();
  });

  test.each([
    ["reading chapter 12", { chapter: 12 }, { read: 11, current: 11 }],
    ["finished", { shelf: "finished", chapter: 61 }, { read: 61, current: null }],
  ])("the chapter map when %s", async (_state, over, { read, current }) => {
    await showBook(over);
    const cells = within(screen.getByRole("list", { name: "61 chapters" })).getAllByRole("listitem");
    expect(cells.filter((c) => c.classList.contains("read"))).toHaveLength(read);
    expect(cells[0]).toHaveAttribute("aria-label", "Chapter 1, read");
    if (current === null) expect(cells.some((c) => c.classList.contains("current"))).toBe(false);
    else {
      expect(cells[current]).toHaveAttribute("aria-label", "Chapter 12, you're here");
      expect(cells[current + 1]).toHaveAttribute("aria-label", "Chapter 13");
    }
  });

  test("an Open Library book without chapters: its cover, a note instead of the map, no chapter picker", async () => {
    await showBook({ ...NO_CHAPTERS, shelf: "want", olWorkId: "OL5W", coverUrl: "https://covers.openlibrary.org/b/id/5-M.jpg" });
    expect(document.querySelector(".bookHeroAuthor")).not.toHaveTextContent(/chapter/);
    expect(screen.getByText("No chapter list yet", { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See it on Open Library" })).toHaveAttribute("href", "https://openlibrary.org/works/OL5W");
    expect(screen.queryByLabelText(/Chapter you've reached/)).toBeNull();
    expect(screen.getByRole("img", { name: /Pride and Prejudice by/ })).toHaveAttribute("src", "https://covers.openlibrary.org/b/id/5-M.jpg");
    expect(screen.getByRole("radio", { name: "Want to read" })).toHaveAttribute("aria-checked", "true");
  });

  test("not on a shelf: no progress or Remove until you pick a shelf", async () => {
    axios.put.mockResolvedValueOnce({ data: { shelf: "want", chapter: 0, chapterCount: 61 } });
    await showBook({ shelf: null, chapter: 0, circles: [] });
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove from my shelves" })).toBeNull();
    expect(screen.getByText("No circles yet")).toBeInTheDocument();
    userEvent.click(screen.getByRole("radio", { name: "Want to read" }));
    await waitFor(() => expect(screen.getByRole("radio", { name: "Want to read" })).toHaveAttribute("aria-checked", "true"));
    expect(axios.put).toHaveBeenCalledWith("/books/b1/progress", { shelf: "want" });
  });

  test("Finished moves progress to the end; Remove clears every shelf", async () => {
    axios.put.mockResolvedValueOnce({ data: { shelf: "finished", chapter: 61, chapterCount: 61 } });
    axios.delete.mockResolvedValueOnce({ data: { shelf: null, chapter: 0 } });
    await showBook();
    userEvent.click(screen.getByRole("radio", { name: "Finished" }));
    expect(await screen.findByText("Finished", { selector: ".progressLabel" })).toBeInTheDocument();
    userEvent.click(screen.getByRole("button", { name: "Remove from my shelves" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Remove from my shelves" })).toBeNull());
    expect(axios.delete).toHaveBeenCalledWith("/books/b1/progress");
    for (const r of within(screen.getByRole("radiogroup", { name: "Shelf" })).getAllByRole("radio")) expect(r).toHaveAttribute("aria-checked", "false");
  });

  test.each([
    ["changing shelf", "put", () => screen.getByRole("radio", { name: "Finished" }), {}, "Something went wrong"],
    ["removing", "delete", () => screen.getByRole("button", { name: "Remove from my shelves" }), { error: "Book not found." }, "Book not found."],
    ["restoring chapters", "post", () => screen.getByRole("button", { name: "Use Project Gutenberg's chapter list" }), { error: "Project Gutenberg isn't answering." }, "isn't answering"],
  ])("an error while %s is shown", async (_action, method, control, body, shown) => {
    axios[method].mockRejectedValueOnce(httpError(500, body));
    await showBook({ chaptersSetByReader: true, canSetChapters: true, canRestoreChapters: true, gutenbergId: 1342 });
    userEvent.click(control());
    expect(await screen.findByRole("alert")).toHaveTextContent(shown);
  });

  test("unknown book", async () => {
    routeGet(axios, { "/books/pride-and-prejudice": httpError(404, { error: "Book not found." }) });
    renderBook();
    expect(await screen.findByRole("heading", { name: "Book not found" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to the library" })).toHaveAttribute("href", "/library");
  });
});

describe("BookPage: setting and changing chapters", () => {
  test("a book without chapters: enter the count (1–200), save, and the page reloads with them", async () => {
    showBookThenReload({ ...NO_CHAPTERS, canSetChapters: true }, { chapterCount: 31, chapters: chaptersOf(31), chapter: 0, chaptersSetByReader: true, canSetChapters: true, circles: [] });
    axios.post.mockResolvedValueOnce({ data: { chapterCount: 31, chaptersSetByReader: true } });
    const form = await screen.findByRole("form", { name: "Set up chapters" });
    const box = within(form).getByLabelText(/How many chapters/);
    const save = within(form).getByRole("button", { name: "Save chapters" });
    for (const bad of ["", "0", "201"]) {
      userEvent.clear(box);
      if (bad) userEvent.type(box, bad);
      expect(save).toBeDisabled();
    }
    userEvent.clear(box);
    userEvent.type(box, "31");
    userEvent.click(save);
    expect(await screen.findByRole("list", { name: "31 chapters" })).toBeInTheDocument();
    expect(axios.post).toHaveBeenCalledWith("/books/b1/chapters", { count: 31 });
    expect(screen.getByText(/Chapters were added by a reader/)).toBeInTheDocument();
  });

  test("Change it opens the form with the current count; errors show in it; Cancel closes it", async () => {
    axios.post.mockRejectedValueOnce(httpError(409, { error: "A circle has a discussion about chapter 40." }));
    await showBook({ chaptersSetByReader: true, canSetChapters: true });
    userEvent.click(screen.getByRole("button", { name: "Change it" }));
    expect(chapterForm()).toHaveTextContent("titles you already have are kept");
    expect(within(chapterForm()).getByLabelText(/How many chapters/)).toHaveValue(61);
    userEvent.click(within(chapterForm()).getByRole("button", { name: "Save chapters" }));
    expect(await within(chapterForm()).findByRole("alert")).toHaveTextContent("discussion about chapter 40");
    userEvent.click(within(chapterForm()).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("form", { name: "Set up chapters" })).toBeNull();
  });

  test.each([
    ["not on a shelf", { shelf: null }, true],
    ["on a shelf", { shelf: "reading" }, false],
    ["not on a shelf, no chapters yet", { ...NO_CHAPTERS, shelf: null }, true],
  ])("%s: the form says saving adds it to Want to read: %p", async (_case, over, noted) => {
    await showBook({ canSetChapters: true, ...over });
    if (over.chapterCount !== 0) userEvent.click(screen.getByRole("button", { name: "Change it" }));
    expect(chapterForm().textContent.includes("Saving also adds this book to your Want to read shelf")).toBe(noted);
  });

  test("readers who can't change it (signed out, or a list we checked) see neither the form nor Change it", async () => {
    await showBook({ ...NO_CHAPTERS, shelf: null, canSetChapters: false });
    expect(screen.getByText(/Sign in to set up its chapters/)).toBeInTheDocument();
    expect(screen.queryByRole("form", { name: "Set up chapters" })).toBeNull();
  });

  test("a list from Project Gutenberg can be changed, without the reader-added note or a restore button", async () => {
    await showBook({ canSetChapters: true, chaptersSetByReader: false, gutenbergId: 55 });
    expect(screen.getByText(/Wrong number of chapters\?/)).toBeInTheDocument();
    expect(screen.queryByText(/added by a reader/)).toBeNull();
    expect(screen.queryByRole("button", { name: /Project Gutenberg/ })).toBeNull();
  });

  test("with a circle discussing chapter 30, the form won't go below 30", async () => {
    await showBook({ canSetChapters: true, chaptersSetByReader: true, minChapterCount: 30 });
    userEvent.click(screen.getByRole("button", { name: "Change it" }));
    expect(chapterForm()).toHaveTextContent("discussion about chapter 30, so it needs at least 30");
    const box = within(chapterForm()).getByLabelText(/How many chapters/);
    expect(box).toHaveAttribute("min", "30");
    for (const [value, enabled] of [["29", false], ["30", true]]) {
      userEvent.clear(box);
      userEvent.type(box, value);
      expect(within(chapterForm()).getByRole("button", { name: "Save chapters" }).disabled).toBe(!enabled);
    }
  });

  test("Use Project Gutenberg's chapter list restores it and reloads the page", async () => {
    showBookThenReload({ chaptersSetByReader: true, canSetChapters: true, canRestoreChapters: true, gutenbergId: 1342 }, { chaptersSetByReader: false, canSetChapters: true });
    axios.post.mockResolvedValueOnce({ data: { chapterCount: 61, chaptersSetByReader: false } });
    userEvent.click(await screen.findByRole("button", { name: "Use Project Gutenberg's chapter list" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Use Project Gutenberg's chapter list" })).toBeNull());
    expect(axios.post).toHaveBeenCalledWith("/books/b1/chapters/restore");
    expect(screen.queryByText(/added by a reader/)).toBeNull();
  });
});

describe("Library", () => {
  const shelves = { reading: [{ ...BOOK, chapter: 12 }], want: [], finished: [{ ...OZ, chapter: 24 }] };
  const PERSUASION = { _id: "b3", slug: "persuasion", title: "Persuasion", author: "Jane Austen", chapterCount: 24 };
  const mockApi = (s = shelves) => {
    axios.get.mockImplementation((url) => Promise.resolve({ data: url === "/shelves" ? s : [{ ...BOOK, shelf: "reading" }, { ...OZ, shelf: "finished" }, { ...PERSUASION, shelf: null }] }));
  };

  test("tabs with counts; Reading shows progress; other tabs and their empty states", async () => {
    mockApi();
    renderWithAuth(<Library />);
    const reading = await screen.findByRole("tab", { name: /Reading/ });
    expect(reading).toHaveAttribute("aria-selected", "true");
    expect(reading).toHaveTextContent("1");
    for (const l of screen.getAllByRole("link", { name: /Pride and Prejudice/ })) expect(l).toHaveAttribute("href", "/books/pride-and-prejudice");
    expect(screen.getByText("Chapter 12 of 61")).toBeInTheDocument();
    userEvent.click(screen.getByRole("tab", { name: /Want to read/ }));
    expect(screen.getByText(/Save books you'd like to read next/)).toBeInTheDocument();
    userEvent.click(screen.getByRole("tab", { name: /Finished/ }));
    expect(screen.getAllByRole("link", { name: /Wonderful Wizard/ }).length).toBeGreaterThan(0);
  });

  test("books not on a shelf can be added, and the tab switches to that shelf", async () => {
    mockApi();
    axios.put.mockResolvedValueOnce({ data: { shelf: "want", chapter: 0, chapterCount: 24 } });
    renderWithAuth(<Library />);
    const more = await screen.findByRole("region", { name: "More books" });
    expect(within(more).queryByRole("heading", { name: "Pride and Prejudice" })).toBeNull();
    mockApi({ ...shelves, want: [{ ...PERSUASION, chapter: 0 }] });
    userEvent.click(within(more).getByRole("button", { name: "Want to read" }));
    await waitFor(() => expect(screen.getByRole("tab", { name: /Want to read/ })).toHaveAttribute("aria-selected", "true"));
    expect(axios.put).toHaveBeenCalledWith("/books/b3/progress", { shelf: "want" });
  });

  test("Remove takes a book off your shelf and reloads", async () => {
    mockApi();
    axios.delete.mockImplementationOnce(async () => {
      mockApi({ ...shelves, reading: [] });
      return { data: { shelf: null, chapter: 0 } };
    });
    renderWithAuth(<Library />);
    const panel = await screen.findByRole("tabpanel", { name: "Reading" });
    userEvent.click(within(panel).getByRole("button", { name: "Remove Pride and Prejudice from your shelves" }));
    await waitFor(() => expect(within(screen.getByRole("tabpanel", { name: "Reading" })).queryByText("Pride and Prejudice")).toBeNull());
    expect(axios.delete).toHaveBeenCalledWith("/books/b1/progress");
  });

  test("load errors are shown", async () => {
    axios.get.mockRejectedValue(httpError(500, {}));
    renderWithAuth(<Library />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong");
  });
});

describe("ProfileShelves", () => {
  test("shows reading covers linking to books; empty shelves are hidden", async () => {
    routeGet(axios, { "/shelves": { reading: [BOOK], want: [OZ], finished: [] } });
    renderWithAuth(<ProfileShelves username="jane doe" isMe={false} />);
    expect(await screen.findByRole("heading", { name: "Reading now" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Finished" })).toBeNull();
    expect(screen.getByTitle("Pride and Prejudice by Jane Austen")).toHaveAttribute("href", "/books/pride-and-prejudice");
    expect(axios.get).toHaveBeenCalledWith("/shelves?username=jane%20doe");
  });

  test("an empty bookshelf: a hint for you, nothing for others", async () => {
    axios.get.mockResolvedValue({ data: { reading: [], want: [], finished: [] } });
    const { unmount } = renderWithAuth(<ProfileShelves username="me" isMe />);
    expect(await screen.findByText("Your bookshelf is empty")).toBeInTheDocument();
    unmount();
    const { container } = renderWithAuth(<ProfileShelves username="them" isMe={false} />);
    await waitFor(() => expect(axios.get).toHaveBeenCalledTimes(2));
    expect(container).toBeEmptyDOMElement();
  });
});
