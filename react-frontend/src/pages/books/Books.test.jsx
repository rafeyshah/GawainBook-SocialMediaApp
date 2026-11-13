import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axios from "axios";
import BookPage from "./BookPage";
import Library from "./Library";
import { ProfileShelves } from "../profile/Profile";
import { renderWithAuth, httpError } from "../../testUtils";
import { BOOK, OZ, routeGet } from "../../readingFixtures";

jest.mock("axios");

const bookDetail = (over = {}) => ({
  ...BOOK,
  publishedYear: 1813,
  description: "A classic.",
  sourceNote: "Public domain.",
  chapters: Array.from({ length: 61 }, (_, i) => ({ seq: i + 1, title: `Chapter ${i + 1}` })),
  shelf: "reading",
  chapter: 12,
  circles: [
    { _id: "c1", name: "The Netherfield Circle", visibility: "public", memberCount: 6, isMember: true },
    { _id: "c2", name: "Pemberley Book Club", visibility: "private", memberCount: 3, isMember: true },
  ],
  ...over,
});

describe("BookPage", () => {
  const renderBook = () => renderWithAuth(<BookPage />, { route: "/books/pride-and-prejudice", path: "/books/:slug" });

  test("shows details, shelf, progress and circles", async () => {
    routeGet(axios, { "/books/pride-and-prejudice": bookDetail() });
    renderBook();
    expect(await screen.findByRole("heading", { name: "Pride and Prejudice" })).toBeInTheDocument();
    expect(screen.getByText(/1813 · 61 chapters/)).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Reading" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("Chapter 12 of 61")).toBeInTheDocument();
    expect(screen.getByText("Public domain.")).toBeInTheDocument();
    const circles = screen.getByRole("region", { name: "Circles reading this book" });
    expect(within(circles).getByRole("link", { name: /Netherfield/ })).toHaveAttribute("href", "/circles/c1");
    expect(within(circles).getByText("Private")).toBeInTheDocument();
    expect(axios.get).toHaveBeenCalledWith("/books/pride-and-prejudice");
  });

  test("a book added from Open Library: its cover, a note instead of the chapter map, no chapter picker", async () => {
    routeGet(axios, {
      "/books/pride-and-prejudice": bookDetail({ chapters: [], chapterCount: 0, chapter: 0, shelf: "want", olWorkId: "OL5W", coverUrl: "https://covers.openlibrary.org/b/id/5-M.jpg", circles: [] }),
    });
    renderBook();
    expect(await screen.findByRole("heading", { name: "Pride and Prejudice" })).toBeInTheDocument();
    expect(document.querySelector(".bookHeroAuthor")).not.toHaveTextContent(/chapter/);
    expect(screen.getByText("No chapter list yet", { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See it on Open Library" })).toHaveAttribute("href", "https://openlibrary.org/works/OL5W");
    expect(screen.queryByLabelText(/Chapter you've reached/)).toBeNull();
    expect(screen.getByRole("img", { name: /Pride and Prejudice by/ })).toHaveAttribute("src", "https://covers.openlibrary.org/b/id/5-M.jpg");
    // Shelves still work.
    expect(screen.getByRole("radio", { name: "Want to read" })).toHaveAttribute("aria-checked", "true");
  });

  test("chapter map marks read chapters and where you are", async () => {
    routeGet(axios, { "/books/pride-and-prejudice": bookDetail() });
    renderBook();
    const map = await screen.findByRole("list", { name: "61 chapters" });
    const cells = within(map).getAllByRole("listitem");
    expect(cells).toHaveLength(61);
    expect(cells[0]).toHaveClass("read");
    expect(cells[0]).toHaveAttribute("aria-label", "Chapter 1, read");
    expect(cells[11]).toHaveClass("current");
    expect(cells[11]).toHaveAttribute("aria-label", "Chapter 12, you're here");
    expect(cells[12]).not.toHaveClass("read");
    expect(cells[12]).toHaveAttribute("aria-label", "Chapter 13");
  });

  test("when finished, every chapter is read and none is 'current'", async () => {
    routeGet(axios, { "/books/pride-and-prejudice": bookDetail({ shelf: "finished", chapter: 61 }) });
    renderBook();
    const map = await screen.findByRole("list", { name: "61 chapters" });
    const cells = within(map).getAllByRole("listitem");
    expect(cells.every((c) => c.classList.contains("read"))).toBe(true);
    expect(map.querySelector(".current")).toBeNull();
  });

  test("circles reading the book are in the side panel", async () => {
    routeGet(axios, { "/books/pride-and-prejudice": bookDetail() });
    renderBook();
    const aside = await screen.findByRole("complementary", { name: "More for you" });
    expect(within(aside).getByRole("region", { name: "Circles reading this book" })).toBeInTheDocument();
  });

  test("not on a shelf: no progress controls until you pick one", async () => {
    routeGet(axios, { "/books/pride-and-prejudice": bookDetail({ shelf: null, chapter: 0, circles: [] }) });
    axios.put.mockResolvedValueOnce({ data: { shelf: "want", chapter: 0, chapterCount: 61 } });
    renderBook();
    await screen.findByRole("heading", { name: "Pride and Prejudice" });
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.getByText("No circles yet")).toBeInTheDocument();
    userEvent.click(screen.getByRole("radio", { name: "Want to read" }));
    await waitFor(() => expect(screen.getByRole("radio", { name: "Want to read" })).toHaveAttribute("aria-checked", "true"));
    expect(axios.put).toHaveBeenCalledWith("/books/b1/progress", { shelf: "want" });
  });

  test("marking finished updates the progress to the end", async () => {
    routeGet(axios, { "/books/pride-and-prejudice": bookDetail() });
    axios.put.mockResolvedValueOnce({ data: { shelf: "finished", chapter: 61, chapterCount: 61 } });
    renderBook();
    await screen.findByRole("heading", { name: "Pride and Prejudice" });
    userEvent.click(screen.getByRole("radio", { name: "Finished" }));
    expect(await screen.findByText("Finished", { selector: ".progressLabel" })).toBeInTheDocument();
  });

  test("shelf errors are shown", async () => {
    routeGet(axios, { "/books/pride-and-prejudice": bookDetail() });
    axios.put.mockRejectedValueOnce(httpError(500, {}));
    renderBook();
    await screen.findByRole("heading", { name: "Pride and Prejudice" });
    userEvent.click(screen.getByRole("radio", { name: "Finished" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong");
  });

  test("unknown book", async () => {
    routeGet(axios, { "/books/pride-and-prejudice": httpError(404, { error: "Book not found." }) });
    renderBook();
    expect(await screen.findByRole("heading", { name: "Book not found" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to the library" })).toHaveAttribute("href", "/library");
  });
});

describe("Library", () => {
  const shelves = {
    reading: [{ ...BOOK, chapter: 12 }],
    want: [],
    finished: [{ ...OZ, chapter: 24 }],
  };
  const mockApi = (s = shelves, books = [{ ...BOOK, shelf: "reading" }, { ...OZ, shelf: "finished" }, { _id: "b3", slug: "persuasion", title: "Persuasion", author: "Jane Austen", chapterCount: 24, shelf: null }]) => {
    axios.get.mockImplementation((url) => Promise.resolve({ data: url === "/shelves" ? s : books }));
  };

  test("tabs with counts; reading shows progress", async () => {
    mockApi();
    renderWithAuth(<Library />);
    const reading = await screen.findByRole("tab", { name: /Reading/ });
    expect(reading).toHaveAttribute("aria-selected", "true");
    expect(reading).toHaveTextContent("1");
    expect(screen.getByRole("tab", { name: /Want to read/ })).toHaveTextContent("0");
    for (const l of screen.getAllByRole("link", { name: /Pride and Prejudice/ })) expect(l).toHaveAttribute("href", "/books/pride-and-prejudice");
    expect(screen.getByText("Chapter 12 of 61")).toBeInTheDocument();
  });

  test("switching tabs and empty states", async () => {
    mockApi();
    renderWithAuth(<Library />);
    userEvent.click(await screen.findByRole("tab", { name: /Want to read/ }));
    expect(screen.getByText(/Save books you'd like to read next/)).toBeInTheDocument();
    userEvent.click(screen.getByRole("tab", { name: /Finished/ }));
    expect(screen.getAllByRole("link", { name: /Wonderful Wizard/ }).length).toBeGreaterThan(0);
  });

  test("books not on a shelf can be added, then the tab switches", async () => {
    mockApi();
    axios.put.mockResolvedValueOnce({ data: { shelf: "want", chapter: 0, chapterCount: 24 } });
    renderWithAuth(<Library />);
    const more = await screen.findByRole("region", { name: "More books" });
    expect(within(more).getByRole("heading", { name: "Persuasion" })).toBeInTheDocument();
    expect(within(more).queryByRole("heading", { name: "Pride and Prejudice" })).toBeNull();
    mockApi({ ...shelves, want: [{ _id: "b3", slug: "persuasion", title: "Persuasion", author: "Jane Austen", chapterCount: 24, chapter: 0 }] });
    userEvent.click(within(more).getByRole("button", { name: "Want to read" }));
    await waitFor(() => expect(screen.getByRole("tab", { name: /Want to read/ })).toHaveAttribute("aria-selected", "true"));
    expect(axios.put).toHaveBeenCalledWith("/books/b3/progress", { shelf: "want" });
  });

  test("load errors are shown", async () => {
    axios.get.mockRejectedValue(httpError(500, {}));
    renderWithAuth(<Library />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong");
  });
});

describe("ProfileShelves", () => {
  test("shows reading and finished covers, linking to books", async () => {
    routeGet(axios, { "/shelves": { reading: [BOOK], want: [OZ], finished: [] } });
    renderWithAuth(<ProfileShelves username="jane doe" isMe={false} />);
    expect(await screen.findByRole("heading", { name: "Reading now" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Finished" })).toBeNull();
    expect(screen.getByTitle("Pride and Prejudice by Jane Austen")).toHaveAttribute("href", "/books/pride-and-prejudice");
    expect(axios.get).toHaveBeenCalledWith("/shelves?username=jane%20doe");
  });

  test("an empty shelf: a hint for you, nothing for others", async () => {
    axios.get.mockResolvedValue({ data: { reading: [], want: [], finished: [] } });
    const { unmount } = renderWithAuth(<ProfileShelves username="me" isMe />);
    expect(await screen.findByText("Your bookshelf is empty")).toBeInTheDocument();
    unmount();
    const { container } = renderWithAuth(<ProfileShelves username="them" isMe={false} />);
    await waitFor(() => expect(axios.get).toHaveBeenCalledTimes(2));
    expect(container).toBeEmptyDOMElement();
  });
});


describe("removing books and book details", () => {
  const renderBook = () => renderWithAuth(<BookPage />, { route: "/books/pride-and-prejudice", path: "/books/:slug" });

  test("Remove from my shelves takes it off, and the button goes away", async () => {
    routeGet(axios, { "/books/pride-and-prejudice": bookDetail() });
    axios.delete.mockResolvedValueOnce({ data: { shelf: null, chapter: 0 } });
    renderBook();
    userEvent.click(await screen.findByRole("button", { name: "Remove from my shelves" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Remove from my shelves" })).toBeNull());
    expect(axios.delete).toHaveBeenCalledWith("/books/b1/progress");
    for (const r of within(screen.getByRole("radiogroup", { name: "Shelf" })).getAllByRole("radio")) expect(r).toHaveAttribute("aria-checked", "false");
  });

  test("a failed remove shows why", async () => {
    routeGet(axios, { "/books/pride-and-prejudice": bookDetail() });
    axios.delete.mockRejectedValueOnce(httpError(404, { error: "Book not found." }));
    renderBook();
    userEvent.click(await screen.findByRole("button", { name: "Remove from my shelves" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Book not found.");
  });

  test("no Remove button when it isn't on a shelf", async () => {
    routeGet(axios, { "/books/pride-and-prejudice": bookDetail({ shelf: null }) });
    renderBook();
    await screen.findByRole("heading", { name: "Pride and Prejudice" });
    expect(screen.queryByRole("button", { name: "Remove from my shelves" })).toBeNull();
  });

  test("shows subjects and page count", async () => {
    routeGet(axios, { "/books/pride-and-prejudice": bookDetail({ subjects: ["Courtship", "Regency"], pageCount: 432 }) });
    renderBook();
    expect(await screen.findByRole("list", { name: "Subjects" })).toHaveTextContent("CourtshipRegency");
    expect(document.querySelector(".bookHeroAuthor")).toHaveTextContent("about 432 pages");
  });

  test("a shelved book without chapters: set the count, then the page reloads with them", async () => {
    let calls = 0;
    axios.get.mockImplementation((url) => {
      if (url !== "/books/pride-and-prejudice") return Promise.resolve({ data: [] });
      calls += 1;
      return Promise.resolve({
        data:
          calls === 1
            ? bookDetail({ chapters: [], chapterCount: 0, chapter: 0, shelf: "reading", canSetChapters: true, circles: [] })
            : bookDetail({ chapterCount: 31, chapters: Array.from({ length: 31 }, (_, i) => ({ seq: i + 1, title: `Chapter ${i + 1}` })), chapter: 0, shelf: "reading", chaptersSetByReader: true, canSetChapters: true, circles: [] }),
      });
    });
    axios.post.mockResolvedValueOnce({ data: { chapterCount: 31, chaptersSetByReader: true } });
    renderBook();
    const form = await screen.findByRole("form", { name: "Set up chapters" });
    const save = within(form).getByRole("button", { name: "Save chapters" });
    expect(save).toBeDisabled();
    userEvent.type(within(form).getByLabelText(/How many chapters/), "0");
    expect(save).toBeDisabled();
    userEvent.clear(within(form).getByLabelText(/How many chapters/));
    userEvent.type(within(form).getByLabelText(/How many chapters/), "201");
    expect(save).toBeDisabled();
    userEvent.clear(within(form).getByLabelText(/How many chapters/));
    userEvent.type(within(form).getByLabelText(/How many chapters/), "31");
    userEvent.click(save);
    expect(await screen.findByRole("list", { name: "31 chapters" })).toBeInTheDocument();
    expect(axios.post).toHaveBeenCalledWith("/books/b1/chapters", { count: 31 });
    expect(screen.getByText(/Chapters were added by a reader/)).toBeInTheDocument();
  });

  test("reader-set chapters can be corrected; errors are shown", async () => {
    routeGet(axios, { "/books/pride-and-prejudice": bookDetail({ chaptersSetByReader: true, canSetChapters: true }) });
    axios.post.mockRejectedValueOnce(httpError(409, { error: "A circle is already reading this book, so its chapters can't change." }));
    renderBook();
    userEvent.click(await screen.findByRole("button", { name: "Change it" }));
    const form = screen.getByRole("form", { name: "Set up chapters" });
    expect(within(form).getByLabelText(/How many chapters/)).toHaveValue(61);
    userEvent.click(within(form).getByRole("button", { name: "Save chapters" }));
    expect(await within(form).findByRole("alert")).toHaveTextContent("circle is already reading");
    userEvent.click(within(form).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("form", { name: "Set up chapters" })).toBeNull();
  });

  test("not on a shelf: explains how to set up chapters instead of the form", async () => {
    routeGet(axios, { "/books/pride-and-prejudice": bookDetail({ chapters: [], chapterCount: 0, shelf: null, canSetChapters: false, circles: [] }) });
    renderBook();
    expect(await screen.findByText(/Sign in to set up its chapters/)).toBeInTheDocument();
    expect(screen.queryByRole("form", { name: "Set up chapters" })).toBeNull();
  });
});

test("Library: Remove takes a book off your shelf and reloads", async () => {
  let removed = false;
  axios.get.mockImplementation((url) => {
    if (url === "/shelves") return Promise.resolve({ data: { reading: removed ? [] : [{ ...BOOK, shelf: "reading", chapter: 12 }], want: [], finished: [] } });
    if (url === "/books") return Promise.resolve({ data: [{ ...BOOK, shelf: removed ? null : "reading", chapter: 0 }] });
    return Promise.resolve({ data: [] });
  });
  axios.delete.mockImplementationOnce(async () => {
    removed = true;
    return { data: { shelf: null, chapter: 0 } };
  });
  renderWithAuth(<Library />);
  const panel = await screen.findByRole("tabpanel", { name: "Reading" });
  userEvent.click(within(panel).getByRole("button", { name: "Remove Pride and Prejudice from your shelves" }));
  await waitFor(() => expect(within(screen.getByRole("tabpanel", { name: "Reading" })).queryByText("Pride and Prejudice")).toBeNull());
  expect(axios.delete).toHaveBeenCalledWith("/books/b1/progress");
});


describe("changing a chapter list later", () => {
  const renderBook = () => renderWithAuth(<BookPage />, { route: "/books/pride-and-prejudice", path: "/books/:slug" });

  test("not on a shelf: Change it is still there, and the form says saving adds it to Want to read", async () => {
    routeGet(axios, { "/books/pride-and-prejudice": bookDetail({ shelf: null, canSetChapters: true }) });
    renderBook();
    userEvent.click(await screen.findByRole("button", { name: "Change it" }));
    expect(screen.getByRole("form", { name: "Set up chapters" })).toHaveTextContent("Saving also adds this book to your Want to read shelf");
  });

  test("on a shelf already: no Want to read note", async () => {
    routeGet(axios, { "/books/pride-and-prejudice": bookDetail({ shelf: "reading", canSetChapters: true }) });
    renderBook();
    userEvent.click(await screen.findByRole("button", { name: "Change it" }));
    expect(screen.getByRole("form", { name: "Set up chapters" })).not.toHaveTextContent("Want to read shelf");
  });

  test("no chapters and not on a shelf: the setup form shows straight away, with the note", async () => {
    routeGet(axios, { "/books/pride-and-prejudice": bookDetail({ chapters: [], chapterCount: 0, shelf: null, canSetChapters: true, circles: [] }) });
    renderBook();
    expect(await screen.findByRole("form", { name: "Set up chapters" })).toHaveTextContent("Saving also adds this book to your Want to read shelf");
  });

  test("a Gutenberg list (not reader-set) can be changed too", async () => {
    routeGet(axios, { "/books/pride-and-prejudice": bookDetail({ chaptersSetByReader: false, canSetChapters: true, gutenbergId: 55 }) });
    renderBook();
    expect(await screen.findByText(/Wrong number of chapters\?/)).toBeInTheDocument();
    expect(screen.queryByText(/added by a reader/)).toBeNull();
    expect(screen.queryByRole("button", { name: /Project Gutenberg/ })).toBeNull();
    userEvent.click(screen.getByRole("button", { name: "Change it" }));
    expect(screen.getByRole("form", { name: "Set up chapters" })).toHaveTextContent("titles you already have are kept");
  });

  test("no change option when the reader can't change it (curated book, or not on a shelf)", async () => {
    routeGet(axios, { "/books/pride-and-prejudice": bookDetail({ canSetChapters: false }) });
    renderBook();
    await screen.findByRole("heading", { name: "Pride and Prejudice" });
    expect(screen.queryByRole("button", { name: "Change it" })).toBeNull();
  });

  test("with a circle discussing chapter 30, the form won't go below 30", async () => {
    routeGet(axios, { "/books/pride-and-prejudice": bookDetail({ canSetChapters: true, chaptersSetByReader: true, minChapterCount: 30 }) });
    renderBook();
    userEvent.click(await screen.findByRole("button", { name: "Change it" }));
    const form = screen.getByRole("form", { name: "Set up chapters" });
    expect(form).toHaveTextContent("discussion about chapter 30, so it needs at least 30");
    const box = within(form).getByLabelText(/How many chapters/);
    expect(box).toHaveAttribute("min", "30");
    userEvent.clear(box);
    userEvent.type(box, "29");
    expect(within(form).getByRole("button", { name: "Save chapters" })).toBeDisabled();
    userEvent.clear(box);
    userEvent.type(box, "30");
    expect(within(form).getByRole("button", { name: "Save chapters" })).toBeEnabled();
  });

  test("restoring Project Gutenberg's list reloads the page", async () => {
    let calls = 0;
    axios.get.mockImplementation((url) => {
      if (url !== "/books/pride-and-prejudice") return Promise.resolve({ data: [] });
      calls += 1;
      return Promise.resolve({ data: calls === 1 ? bookDetail({ chaptersSetByReader: true, canSetChapters: true, canRestoreChapters: true, gutenbergId: 1342 }) : bookDetail({ chaptersSetByReader: false, canSetChapters: true, canRestoreChapters: false }) });
    });
    axios.post.mockResolvedValueOnce({ data: { chapterCount: 61, chaptersSetByReader: false } });
    renderBook();
    userEvent.click(await screen.findByRole("button", { name: "Use Project Gutenberg's chapter list" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Use Project Gutenberg's chapter list" })).toBeNull());
    expect(axios.post).toHaveBeenCalledWith("/books/b1/chapters/restore");
    expect(screen.queryByText(/added by a reader/)).toBeNull();
  });

  test("a failed restore shows why", async () => {
    routeGet(axios, { "/books/pride-and-prejudice": bookDetail({ chaptersSetByReader: true, canSetChapters: true, canRestoreChapters: true, gutenbergId: 1342 }) });
    axios.post.mockRejectedValueOnce(httpError(502, { error: "Project Gutenberg isn't answering right now. Please try again in a minute." }));
    renderBook();
    userEvent.click(await screen.findByRole("button", { name: "Use Project Gutenberg's chapter list" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("isn't answering");
  });
});
