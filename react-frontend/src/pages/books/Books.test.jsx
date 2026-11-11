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
    expect(screen.getByRole("link", { name: /Pride and Prejudice/ })).toHaveAttribute("href", "/books/pride-and-prejudice");
    expect(screen.getByText("Chapter 12 of 61")).toBeInTheDocument();
  });

  test("switching tabs and empty states", async () => {
    mockApi();
    renderWithAuth(<Library />);
    userEvent.click(await screen.findByRole("tab", { name: /Want to read/ }));
    expect(screen.getByText(/Save books you'd like to read next/)).toBeInTheDocument();
    userEvent.click(screen.getByRole("tab", { name: /Finished/ }));
    expect(screen.getByRole("link", { name: /Wonderful Wizard/ })).toBeInTheDocument();
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
