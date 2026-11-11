import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axios from "axios";
import CircleSearch, { highlight } from "./CircleSearch";
import { renderWithAuth, httpError } from "../../testUtils";

jest.mock("axios");

describe("highlight", () => {
  const html = (node) => {
    const { container } = render(<p>{node}</p>);
    return container.querySelector("p").innerHTML;
  };
  test("marks every case-insensitive match", () => {
    expect(html(highlight("Darcy and darcy", "DARCY"))).toBe("<mark>Darcy</mark> and <mark>darcy</mark>");
  });
  test("no query or no match leaves the text alone", () => {
    expect(highlight("text", "")).toBe("text");
    expect(html(highlight("text", "zzz"))).toBe("text");
  });
  test("treats regex characters literally", () => {
    expect(html(highlight("100% (yes)", "% ("))).toBe("100<mark>% (</mark>yes)");
  });
});

const setup = (onResults = jest.fn()) => {
  renderWithAuth(<CircleSearch circleId="c1" onResults={onResults} />);
  return { onResults, box: screen.getByRole("searchbox", { name: "Search discussions" }) };
};

test("searches with the trimmed query and lists results with chapter and snippet", async () => {
  axios.get.mockResolvedValueOnce({
    data: { query: "Collins", results: [{ threadId: "t1", title: "Enter Mr Collins", chapterSeq: 13, snippet: "…Mr Collins proposes…" }] },
  });
  const { box, onResults } = setup();
  userEvent.type(box, "  Collins ");
  userEvent.click(screen.getByRole("button", { name: "Search" }));
  const results = await screen.findByLabelText("Search results");
  expect(axios.get).toHaveBeenCalledWith("/circles/c1/search", { params: { q: "Collins" } });
  const hit = within(results).getByRole("link");
  expect(hit).toHaveAttribute("href", "/threads/t1");
  expect(hit).toHaveTextContent("Ch 13");
  expect(hit.querySelectorAll("mark")).toHaveLength(2);
  expect(onResults).toHaveBeenCalledWith(true);
});

test("the search button waits for at least 2 characters", () => {
  const { box } = setup();
  const btn = screen.getByRole("button", { name: "Search" });
  expect(btn).toBeDisabled();
  userEvent.type(box, "a");
  expect(btn).toBeDisabled();
  userEvent.type(box, "b");
  expect(btn).toBeEnabled();
});

test("no matches explains that only reached chapters are searched", async () => {
  axios.get.mockResolvedValueOnce({ data: { query: "Lydia", results: [] } });
  const { box } = setup();
  userEvent.type(box, "Lydia{enter}");
  expect(await screen.findByText("No matches for “Lydia”")).toBeInTheDocument();
  expect(screen.getByText(/up to your current chapter/)).toBeInTheDocument();
});

test("Clear empties the box and gives the list back", async () => {
  axios.get.mockResolvedValueOnce({ data: { query: "ab", results: [] } });
  const { box, onResults } = setup();
  userEvent.type(box, "ab{enter}");
  await screen.findByText(/No matches/);
  userEvent.click(screen.getByRole("button", { name: "Clear" }));
  expect(box).toHaveValue("");
  expect(screen.queryByText(/No matches/)).toBeNull();
  expect(onResults).toHaveBeenLastCalledWith(false);
});

test("errors are shown", async () => {
  axios.get.mockRejectedValueOnce(httpError(400, { error: "Search for 2–100 characters." }));
  const { box } = setup();
  userEvent.type(box, "ab{enter}");
  expect(await screen.findByRole("alert")).toHaveTextContent("2–100 characters");
  await waitFor(() => expect(screen.getByRole("button", { name: "Search" })).toBeEnabled());
});
