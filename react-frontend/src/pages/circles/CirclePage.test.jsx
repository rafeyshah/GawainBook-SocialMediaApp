import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axios from "axios";
import CirclePage, { ReaderTrack, ThreadList } from "./CirclePage";
import { renderWithAuth, httpError, networkError, ME } from "../../testUtils";
import { THREADS, circleDetail } from "../../readingFixtures";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

jest.mock("axios");

const ME_HERE = { ...ME, _id: "u1", username: "jane" };

const mockApi = (circle = circleDetail(), threads = THREADS) => {
  axios.get.mockImplementation((url) => {
    if (url === "/circles/c1") return circle instanceof Error ? Promise.reject(circle) : Promise.resolve({ data: circle });
    if (url === "/circles/c1/threads") return Promise.resolve({ data: threads });
    return Promise.resolve({ data: [] });
  });
};

const renderPage = () => renderWithAuth(<CirclePage />, { user: ME_HERE, route: "/circles/c1", path: "/circles/:id" });
const hero = () => screen.findByRole("region", { name: "The Netherfield Circle" });

test("shows the circle, the book, your progress and badges", async () => {
  mockApi();
  renderPage();
  const h = within(await hero());
  expect(h.getByRole("heading", { name: "The Netherfield Circle" })).toBeInTheDocument();
  for (const link of h.getAllByRole("link", { name: "Pride and Prejudice" })) expect(link).toHaveAttribute("href", "/books/pride-and-prejudice");
  expect(h.getByText("6 members")).toBeInTheDocument();
  expect(h.getByText("5 chapters a week")).toBeInTheDocument();
  expect(h.getByText("Chapter 12 of 61")).toBeInTheDocument();
  expect(h.queryByText(/Invite code/)).toBeNull();
});

test("open discussions link through; locked ones show only the chapter", async () => {
  mockApi();
  renderPage();
  await hero();
  expect(screen.getByRole("link", { name: /That opening line/ })).toHaveAttribute("href", "/threads/t1");
  const locked = screen.getByLabelText("Chapter 34 discussion, locked");
  expect(locked).toHaveTextContent("Reach chapter 34 to read");
  expect(locked.closest("a")).toBeNull();
  expect(screen.getByText(/1 open, 1 ahead of you/)).toBeInTheDocument();
});

test("members' positions are shown; owners and moderators are labelled", async () => {
  mockApi();
  renderPage();
  await hero();
  const where = screen.getByRole("region", { name: "Who's where" });
  expect(within(where).getByRole("img", { name: /Where each member is/ })).toBeInTheDocument();
  expect(within(where).getByText(/Organiser · Chapter 15/)).toBeInTheDocument();
  expect(within(where).getByText(/Moderator · Finished/)).toBeInTheDocument();
});

test("organisers see the invite code; owners have no Leave button", async () => {
  mockApi(circleDetail({ myRole: "owner", inviteCode: "abc123xyz789" }));
  renderPage();
  await hero();
  expect(screen.getByText("abc123xyz789")).toBeInTheDocument();
  expect(screen.getByText("You're the organiser")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Leave" })).toBeNull();
});

test("visitors to a public circle can join (and see no progress track)", async () => {
  mockApi(circleDetail({ myRole: null, members: circleDetail().members.map(({ chapter, ...m }) => m) }));
  axios.post.mockResolvedValueOnce({ status: 201, data: {} });
  renderPage();
  await hero();
  expect(screen.queryByRole("img", { name: /Where each member is/ })).toBeNull();
  expect(screen.queryByRole("button", { name: /New discussion/ })).toBeNull();
  userEvent.click(screen.getByRole("button", { name: "Join this circle" }));
  await waitFor(() => expect(axios.post).toHaveBeenCalledWith("/circles/c1/join"));
  expect(axios.get.mock.calls.filter(([u]) => u === "/circles/c1").length).toBeGreaterThanOrEqual(2);
});

test("leave calls the API and shows errors", async () => {
  mockApi();
  axios.post.mockRejectedValueOnce(httpError(403, { error: "Owners can't leave their own circle." }));
  renderPage();
  await hero();
  userEvent.click(screen.getByRole("button", { name: "Leave" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Owners can't leave");
  expect(axios.post).toHaveBeenCalledWith("/circles/c1/leave");
});

describe("new discussion", () => {
  test("only offers chapters you've reached, and posts the right payload", async () => {
    mockApi(circleDetail({ myProgress: 3 }));
    axios.post.mockResolvedValueOnce({ status: 201, data: { _id: "t5" } });
    renderPage();
    await hero();
    userEvent.click(screen.getByRole("button", { name: /New discussion/ }));
    const form = screen.getByRole("form", { name: "Start a discussion" });
    const chapter = within(form).getByLabelText("About chapter");
    expect([...chapter.options].map((o) => o.value)).toEqual(["0", "1", "2", "3"]);
    expect(chapter).toHaveValue("3");
    userEvent.selectOptions(chapter, "2");
    userEvent.type(within(form).getByLabelText("Title"), "  Mrs Bennet  ");
    userEvent.type(within(form).getByLabelText("Your thoughts"), "So funny");
    userEvent.click(within(form).getByRole("button", { name: "Start discussion" }));
    await waitFor(() => expect(screen.queryByRole("form", { name: "Start a discussion" })).toBeNull());
    expect(axios.post).toHaveBeenCalledWith("/circles/c1/threads", { chapter: 2, title: "Mrs Bennet", body: "So funny" });
  });

  test("needs a title of at least 3 characters, shows server errors", async () => {
    mockApi();
    axios.post.mockRejectedValueOnce(httpError(403, { error: "You're on chapter 12. Reach chapter 13 to discuss it." }));
    renderPage();
    await hero();
    userEvent.click(screen.getByRole("button", { name: /New discussion/ }));
    const form = screen.getByRole("form", { name: "Start a discussion" });
    const submit = within(form).getByRole("button", { name: "Start discussion" });
    userEvent.type(within(form).getByLabelText("Title"), "Hi");
    expect(submit).toBeDisabled();
    userEvent.type(within(form).getByLabelText("Title"), "!");
    userEvent.click(submit);
    expect(await within(form).findByRole("alert")).toHaveTextContent("Reach chapter 13");
  });
});

test.each([
  [httpError(404, { error: "Circle not found." }), "Circle not found"],
  [networkError(), "Couldn't load this circle"],
])("load failure %#", async (err, heading) => {
  mockApi(err);
  renderPage();
  expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Back to your circles" })).toHaveAttribute("href", "/");
});

describe("ThreadList", () => {
  test("empty state", () => {
    render(<ThreadList threads={[]} />, { wrapper: MemoryRouter });
    expect(screen.getByText("No discussions yet")).toBeInTheDocument();
  });

  test("chapter 0 is labelled Intro", () => {
    render(<ThreadList threads={[{ ...THREADS[0], chapterSeq: 0 }]} />, { wrapper: MemoryRouter });
    expect(screen.getByText("Intro")).toBeInTheDocument();
  });
});

describe("ReaderTrack", () => {
  test("places members by chapter and highlights you", () => {
    const { container } = render(<ReaderTrack members={circleDetail().members} total={61} meId="u1" />);
    const dots = container.querySelectorAll(".readerTrackDot");
    expect(dots).toHaveLength(3);
    expect(container.querySelector(".readerTrackDot.me").style.left).toBe(`${(12 / 61) * 100}%`);
    expect(container.querySelector('[title="darcy: finished"]').style.left).toBe("100%");
  });

  test("renders nothing without positions or chapters", () => {
    const { container } = render(<ReaderTrack members={[{ _id: "a", username: "a" }]} total={61} meId="a" />);
    expect(container).toBeEmptyDOMElement();
  });
});
