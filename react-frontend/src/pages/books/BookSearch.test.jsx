import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axios from "axios";
import BookSearch from "./BookSearch";
import { renderWithAuth, httpError } from "../../testUtils";
import { BOOK } from "../../readingFixtures";

jest.mock("axios");

const ol = (over = {}) => ({ key: "/works/OL1W", title: "Emma", author: "Jane Austen", year: 1815, coverUrl: "https://covers.openlibrary.org/b/id/1-M.jpg", editions: 10, ...over });

const search = (q) => {
  userEvent.type(screen.getByRole("searchbox", { name: "Title or author" }), q);
  userEvent.click(screen.getByRole("button", { name: "Search" }));
};

test("shows our books (ready for circles) and Open Library results", async () => {
  axios.get.mockResolvedValueOnce({ data: { query: "austen", local: [{ ...BOOK, chaptersAvailable: true }], openLibrary: [ol(), ol({ key: "/works/OL2W", title: "Lady Susan", coverUrl: null, year: null })], openLibraryError: false } });
  renderWithAuth(<BookSearch />);
  search(" austen ");
  const ours = await screen.findByLabelText("Books with chapters");
  expect(axios.get).toHaveBeenCalledWith("/books/search", { params: { q: "austen" } });
  expect(within(ours).getByRole("link", { name: /Pride and Prejudice/ })).toHaveAttribute("href", "/books/pride-and-prejudice");
  expect(within(ours).getByText(/61 chapters/)).toBeInTheDocument();

  const others = screen.getByRole("list", { name: "Open Library results" });
  const emma = within(others).getByRole("link", { name: "Emma" });
  expect(emma).toHaveAttribute("href", "https://openlibrary.org/works/OL1W");
  expect(emma).toHaveAttribute("rel", "noopener noreferrer");
  expect(within(others).getByText("Jane Austen · 1815")).toBeInTheDocument();
  // No cover: a text placeholder, no broken image.
  expect(within(others).getAllByRole("img", { hidden: true })).toHaveLength(1);
  expect(screen.getByText(/don't have chapters in GawainBook yet/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Open Library" })).toHaveAttribute("href", "https://openlibrary.org");
});

test("Search needs 2+ characters", () => {
  renderWithAuth(<BookSearch />);
  expect(screen.getByRole("button", { name: "Search" })).toBeDisabled();
  userEvent.type(screen.getByRole("searchbox", { name: "Title or author" }), "e");
  expect(screen.getByRole("button", { name: "Search" })).toBeDisabled();
});

test("Open Library down: our results still show, with a note", async () => {
  axios.get.mockResolvedValueOnce({ data: { query: "pride", local: [{ ...BOOK }], openLibrary: [], openLibraryError: true } });
  renderWithAuth(<BookSearch />);
  search("pride");
  expect(await screen.findByText(/Open Library isn't answering/)).toBeInTheDocument();
  expect(screen.getByLabelText("Books with chapters")).toBeInTheDocument();
});

test("nothing found anywhere", async () => {
  axios.get.mockResolvedValueOnce({ data: { query: "zzqx", local: [], openLibrary: [], openLibraryError: false } });
  renderWithAuth(<BookSearch />);
  search("zzqx");
  expect(await screen.findByText("No books found for “zzqx”.")).toBeInTheDocument();
  expect(screen.queryByLabelText("Books with chapters")).toBeNull();
});

test("only our books found", async () => {
  axios.get.mockResolvedValueOnce({ data: { query: "pride", local: [BOOK], openLibrary: [], openLibraryError: false } });
  renderWithAuth(<BookSearch />);
  search("pride");
  expect(await screen.findByText("No other editions found.")).toBeInTheDocument();
});

test("errors are shown and the button comes back", async () => {
  axios.get.mockRejectedValueOnce(httpError(400, { error: "Search for 2–100 characters." }));
  renderWithAuth(<BookSearch />);
  search("ab");
  expect(await screen.findByRole("alert")).toHaveTextContent("2–100");
  await waitFor(() => expect(screen.getByRole("button", { name: "Search" })).toBeEnabled());
});
