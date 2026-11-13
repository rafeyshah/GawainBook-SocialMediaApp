import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axios from "axios";
import { Route } from "react-router-dom";
import CirclesHome, { greeting, plural } from "./CirclesHome";
import { renderWithAuth, httpError, networkError, ME } from "../../testUtils";
import { BOOK, OZ, circleCard } from "../../readingFixtures";

jest.mock("axios");

const mockApi = ({ mine = [circleCard()], discover = [], books = [{ ...BOOK, shelf: "reading", chapter: 12 }, { ...OZ, shelf: null, chapter: 0 }] } = {}) => {
  axios.get.mockImplementation((url) => {
    if (url === "/circles") return Promise.resolve({ data: { mine, discover } });
    if (url === "/books") return Promise.resolve({ data: books });
    return Promise.resolve({ data: [] });
  });
};

// Renders the page plus a stub for wherever it navigates.
const renderPage = () =>
  renderWithAuth(
    <>
      <Route exact path="/">
        <CirclesHome />
      </Route>
      <Route path="/circles/:id" render={({ match }) => <p>Circle page {match.params.id}</p>} />
    </>
  );

describe("helpers", () => {
  test.each([
    [3, "Reading late"],
    [9, "Good morning"],
    [14, "Good afternoon"],
    [20, "Good evening"],
  ])("greeting at %p:00 → %p", (hour, text) => {
    const d = new Date(2026, 0, 1, hour);
    expect(greeting(d)).toBe(text);
  });
  test("plural", () => {
    expect(plural(1, "member")).toBe("1 member");
    expect(plural(2, "member")).toBe("2 members");
    expect(plural(0, "reply", "replies")).toBe("0 replies");
  });
});

test("greets you and shows continue reading, your circles and discover", async () => {
  mockApi({ discover: [circleCard({ _id: "c2", name: "Yellow Brick Readers", myRole: null, book: OZ })] });
  renderPage();
  expect(screen.getByLabelText("Loading circles")).toBeInTheDocument();
  expect(await screen.findByRole("heading", { name: new RegExp(ME.username) })).toBeInTheDocument();

  const cont = screen.getByRole("region", { name: "Continue reading" });
  expect(within(cont).getByRole("heading", { name: "Pride and Prejudice" })).toBeInTheDocument();
  expect(within(cont).getByText("Chapter 12 of 61")).toBeInTheDocument();
  expect(within(cont).queryByRole("heading", { name: OZ.title })).toBeNull();

  const mine = screen.getByRole("region", { name: "Your circles" });
  const card = within(mine).getByRole("article", { name: "The Netherfield Circle" });
  expect(within(card).getByText("6 members")).toBeInTheDocument();
  expect(within(card).getByText(/4 discussions open/)).toBeInTheDocument();
  expect(within(card).getByText(/2 ahead/)).toBeInTheDocument();
  expect(within(card).getByRole("link", { name: "The Netherfield Circle" })).toHaveAttribute("href", "/circles/c1");

  const discover = screen.getByRole("region", { name: "Discover circles" });
  expect(within(discover).getByRole("article", { name: "Yellow Brick Readers" })).toBeInTheDocument();
  // Locked/open counts are only meaningful for members.
  expect(within(discover).queryByText(/discussions open/)).toBeNull();
});

test("private circles are badged", async () => {
  mockApi({ mine: [circleCard({ visibility: "private" })] });
  renderPage();
  expect(await screen.findByText("Private")).toBeInTheDocument();
});

test("empty state when you're in no circles, and no discover section if there's nothing to discover", async () => {
  mockApi({ mine: [], discover: [] });
  renderPage();
  expect(await screen.findByText("You're not in a circle yet")).toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "Discover circles" })).toBeNull();
});

test("no 'continue reading' when nothing is on the reading shelf", async () => {
  mockApi({ books: [{ ...BOOK, shelf: "want", chapter: 0 }] });
  renderPage();
  await screen.findByRole("region", { name: "Your circles" });
  expect(screen.queryByRole("region", { name: "Continue reading" })).toBeNull();
});

test("joining a public circle takes you to it", async () => {
  mockApi({ mine: [], discover: [circleCard({ _id: "c2", myRole: null })] });
  axios.post.mockResolvedValueOnce({ status: 201, data: { circleId: "c2" } });
  renderPage();
  userEvent.click(within(await screen.findByRole("region", { name: "Discover circles" })).getByRole("button", { name: "Join" }));
  expect(await screen.findByText("Circle page c2")).toBeInTheDocument();
  expect(axios.post).toHaveBeenCalledWith("/circles/c2/join");
});

test("a failed join shows the error", async () => {
  mockApi({ mine: [], discover: [circleCard({ _id: "c2", myRole: null })] });
  axios.post.mockRejectedValueOnce(httpError(409, { error: "You're already in this circle." }));
  renderPage();
  userEvent.click(within(await screen.findByRole("region", { name: "Discover circles" })).getByRole("button", { name: "Join" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("You're already in this circle.");
});

describe("invite code", () => {
  test("joins and opens the circle", async () => {
    mockApi();
    axios.post.mockResolvedValueOnce({ data: { circleId: "c7" } });
    renderPage();
    const form = await screen.findByRole("form", { name: "Join with an invite code" });
    const button = within(form).getByRole("button", { name: "Join" });
    expect(button).toBeDisabled();
    userEvent.type(within(form).getByLabelText("Invite code"), "  abc123  ");
    userEvent.click(button);
    expect(await screen.findByText("Circle page c7")).toBeInTheDocument();
    expect(axios.post).toHaveBeenCalledWith("/circles/join", { code: "abc123" });
  });

  test("shows an invalid code error", async () => {
    mockApi();
    axios.post.mockRejectedValueOnce(httpError(404, { error: "That invite code isn't valid." }));
    renderPage();
    const form = await screen.findByRole("form", { name: "Join with an invite code" });
    userEvent.type(within(form).getByLabelText("Invite code"), "nope");
    userEvent.click(within(form).getByRole("button", { name: "Join" }));
    expect(await within(form).findByRole("alert")).toHaveTextContent("That invite code isn't valid.");
  });
});

describe("start a circle", () => {
  test("creates it with the chosen options and opens it", async () => {
    mockApi();
    axios.post.mockResolvedValueOnce({ status: 201, data: circleCard({ _id: "new1" }) });
    renderPage();
    userEvent.click(await screen.findByRole("button", { name: /Start a circle/ }));
    const form = screen.getByRole("form", { name: "Start a circle" });
    const create = within(form).getByRole("button", { name: "Create circle" });
    expect(create).toBeDisabled();
    userEvent.type(within(form).getByLabelText("Circle name"), "  Owl Readers ");
    userEvent.selectOptions(within(form).getByLabelText("Book"), "b2");
    userEvent.selectOptions(within(form).getByLabelText("Who can find it"), "private");
    userEvent.type(within(form).getByLabelText(/Reading pace/), "2 a week");
    userEvent.click(create);
    expect(await screen.findByText("Circle page new1")).toBeInTheDocument();
    expect(axios.post).toHaveBeenCalledWith("/circles", {
      name: "Owl Readers",
      bookId: "b2",
      visibility: "private",
      schedule: "2 a week",
      description: "",
    });
  });

  test("shows server validation errors and can be cancelled", async () => {
    mockApi();
    axios.post.mockRejectedValueOnce(httpError(400, { error: "Circle names must be 3–60 characters." }));
    renderPage();
    userEvent.click(await screen.findByRole("button", { name: /Start a circle/ }));
    const form = screen.getByRole("form", { name: "Start a circle" });
    userEvent.type(within(form).getByLabelText("Circle name"), "Owl");
    userEvent.click(within(form).getByRole("button", { name: "Create circle" }));
    expect(await within(form).findByRole("alert")).toHaveTextContent("3–60");
    userEvent.click(within(form).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("form", { name: "Start a circle" })).toBeNull();
  });
});

test("updating progress from 'continue reading' updates the bar", async () => {
  mockApi();
  axios.put.mockResolvedValueOnce({ data: { shelf: "reading", chapter: 13, chapterCount: 61 } });
  renderPage();
  const cont = await screen.findByRole("region", { name: "Continue reading" });
  userEvent.click(within(cont).getByRole("button", { name: "+1 chapter" }));
  await waitFor(() => expect(within(cont).getByText("Chapter 13 of 61")).toBeInTheDocument());
});

test("load errors show a retry that works", async () => {
  axios.get.mockRejectedValueOnce(networkError()).mockRejectedValueOnce(networkError());
  renderPage();
  expect(await screen.findByRole("alert")).toHaveTextContent("Can't reach the server");
  mockApi();
  userEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByRole("region", { name: "Your circles" })).toBeInTheDocument();
});


test("Start a circle only offers books with chapters", async () => {
  mockApi({ books: [{ ...BOOK, shelf: "reading", chapter: 12 }, { ...OZ, shelf: null, chapter: 0 }, { _id: "b9", slug: "emma", title: "Emma", author: "Jane Austen", chapterCount: 0, shelf: "want", chapter: 0 }] });
  renderPage();
  userEvent.click(await screen.findByRole("button", { name: /Start a circle/ }));
  const options = within(screen.getByLabelText("Book")).getAllByRole("option").map((o) => o.textContent);
  expect(options).toEqual([BOOK.title, OZ.title]);
});

test("no Start a circle button when no book has chapters", async () => {
  mockApi({ books: [{ _id: "b9", slug: "emma", title: "Emma", author: "Jane Austen", chapterCount: 0, shelf: "want", chapter: 0 }] });
  renderPage();
  await screen.findByRole("heading", { level: 1 });
  await waitFor(() => expect(axios.get).toHaveBeenCalledWith("/books"));
  expect(screen.queryByRole("button", { name: /Start a circle/ })).toBeNull();
});
