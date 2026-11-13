import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axios from "axios";
import BookCover, { ProgressBar, chapterName } from "./BookCover";
import ProgressEditor from "./ProgressEditor";
import { BOOK } from "../../readingFixtures";
import { httpError } from "../../testUtils";

jest.mock("axios");

describe("chapterName", () => {
  test.each([
    [0, undefined, "Before chapter 1"],
    [5, undefined, "Chapter 5"],
    [5, "Chapter 5", "Chapter 5"],
    [1, "The Cyclone", "Chapter 1: The Cyclone"],
  ])("(%p, %p) → %p", (seq, title, expected) => expect(chapterName(seq, title)).toBe(expected));
});

describe("BookCover", () => {
  test("is an accessible image with title and author", () => {
    render(<BookCover book={BOOK} />);
    const cover = screen.getByRole("img", { name: "Pride and Prejudice by Jane Austen" });
    expect(cover).toHaveTextContent("Pride and Prejudice");
    expect(cover).toHaveTextContent("Jane Austen");
    expect(cover).toHaveAttribute("lang", "en");
    expect(cover.style.getPropertyValue("--cover")).toBe("#7a3e48");
  });

  test("the tiny size drops the author; missing colour falls back", () => {
    render(<BookCover book={{ ...BOOK, coverColor: undefined }} size="xs" />);
    const cover = screen.getByRole("img");
    expect(cover).not.toHaveTextContent("Jane Austen");
    expect(cover.style.getPropertyValue("--cover")).toBe("#2f7553");
  });

  test("shows an Open Library cover, falling back to the typeset cover if it fails to load", () => {
    render(<BookCover book={{ ...BOOK, coverUrl: "https://covers.openlibrary.org/b/id/1-M.jpg" }} />);
    const img = screen.getByRole("img", { name: "Pride and Prejudice by Jane Austen" });
    expect(img).toHaveAttribute("src", "https://covers.openlibrary.org/b/id/1-M.jpg");
    fireEvent.error(img);
    expect(screen.getByRole("img", { name: "Pride and Prejudice by Jane Austen" }).tagName).toBe("DIV");
  });

  test("renders nothing without a book", () => {
    const { container } = render(<BookCover book={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("ProgressBar", () => {
  const bar = () => screen.getByRole("progressbar");
  test.each([
    [0, 61, "Not started", "0%"],
    [12, 61, "Chapter 12 of 61", "20%"],
    [61, 61, "Finished", "100%"],
    [70, 61, "Finished", "100%"],
  ])("chapter %p of %p → %p", (chapter, total, label, width) => {
    const { container } = render(<ProgressBar chapter={chapter} total={total} />);
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(container.querySelector(".progressFill").style.width).toBe(width);
    expect(bar()).toHaveAttribute("aria-valuenow", String(Math.min(chapter, total)));
  });

  test("a book with no chapter list shows a note instead of a bar", () => {
    const { container } = render(<ProgressBar chapter={0} total={0} />);
    expect(container.querySelector(".progressFill")).toBeNull();
    expect(screen.getByText("No chapter list yet")).toBeInTheDocument();
  });

  test("…and nothing at all without a label", () => {
    const { container } = render(<ProgressBar chapter={0} total={0} label={false} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("ProgressEditor", () => {
  const select = () => screen.getByLabelText(/Chapter you've reached/);

  test("renders nothing for a book without a chapter list", () => {
    const { container } = render(<ProgressEditor book={{ ...BOOK, chapterCount: 0 }} chapter={0} />);
    expect(container).toBeEmptyDOMElement();
  });

  test("lists every chapter plus 'Not started', with named chapters", () => {
    render(<ProgressEditor book={{ ...BOOK, chapterCount: 3 }} chapter={1} chapters={[{ seq: 1, title: "The Cyclone" }, { seq: 2 }, { seq: 3 }]} />);
    expect([...select().options].map((o) => o.textContent)).toEqual(["Not started", "Chapter 1: The Cyclone", "Chapter 2", "Chapter 3"]);
    expect(select()).toHaveValue("1");
  });

  test("saving a chapter calls the API and reports the result", async () => {
    axios.put.mockResolvedValueOnce({ data: { shelf: "reading", chapter: 20, chapterCount: 61 } });
    const onSaved = jest.fn();
    render(<ProgressEditor book={BOOK} chapter={12} onSaved={onSaved} />);
    userEvent.selectOptions(select(), "20");
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith({ shelf: "reading", chapter: 20, chapterCount: 61 }));
    expect(axios.put).toHaveBeenCalledWith("/books/b1/progress", { chapter: 20 });
  });

  test("+1 chapter moves forward by one", async () => {
    axios.put.mockResolvedValueOnce({ data: { shelf: "reading", chapter: 13, chapterCount: 61 } });
    render(<ProgressEditor book={BOOK} chapter={12} />);
    userEvent.click(screen.getByRole("button", { name: "+1 chapter" }));
    await waitFor(() => expect(select()).toHaveValue("13"));
    expect(axios.put).toHaveBeenCalledWith("/books/b1/progress", { chapter: 13 });
  });

  test("no +1 button once finished", () => {
    render(<ProgressEditor book={BOOK} chapter={61} />);
    expect(screen.queryByRole("button", { name: "+1 chapter" })).toBeNull();
  });

  test("a failed save shows the error and reverts the selection", async () => {
    axios.put.mockRejectedValueOnce(httpError(400, { error: "Chapter must be between 0 and 61." }));
    render(<ProgressEditor book={BOOK} chapter={12} />);
    userEvent.selectOptions(select(), "30");
    expect(await screen.findByRole("alert")).toHaveTextContent("Chapter must be between 0 and 61.");
    expect(select()).toHaveValue("12");
  });
});
