import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axios from "axios";
import { Route } from "react-router-dom";
import JoinPage from "./JoinPage";
import { codeFrom } from "./CirclesHome";
import { safeNext } from "../../App";
import { renderWithAuth, httpError, networkError } from "../../testUtils";
import { BOOK, routeGet } from "../../readingFixtures";

jest.mock("axios");

const invite = (over = {}) => ({
  circle: { _id: "c1", name: "The Netherfield Circle", description: "Austen on Sundays", visibility: "private", book: BOOK, memberCount: 4 },
  alreadyMember: false,
  expiresAt: null,
  ...over,
});

const renderPage = (code = "abcDEF123456") =>
  renderWithAuth(
    <>
      <Route path="/join/:code">
        <JoinPage />
      </Route>
      <Route path="/circles/:id" render={({ match }) => <p>Circle page {match.params.id}</p>} />
    </>,
    { route: `/join/${code}` }
  );

describe("codeFrom", () => {
  test.each([
    ["abc123", "abc123"],
    ["  abc123  ", "abc123"],
    ["https://gawainbook.onrender.com/join/abcDEF123456", "abcDEF123456"],
    ["http://localhost:3000/join/abc-_9/", "abc-_9"],
    ["", ""],
  ])("%p → %p", (input, code) => expect(codeFrom(input)).toBe(code));
});

describe("safeNext", () => {
  test.each([
    ["?next=%2Fjoin%2FabcDEF123456", "/join/abcDEF123456"],
    ["", "/"],
    ["?next=%2Fprofile%2Fx", "/"],
    ["?next=https%3A%2F%2Fevil.example%2Fjoin%2Fabcdef", "/"],
    ["?next=%2F%2Fevil.example%2Fjoin%2Fabcdef", "/"],
    ["?next=%2Fjoin%2Fabc", "/"],
    ["?next=%2Fjoin%2FabcDEF123456%2F..%2F..", "/"],
  ])("%p → %p", (search, expected) => expect(safeNext(search)).toBe(expected));
});

test("shows what you're invited to", async () => {
  routeGet(axios, { "/invitations/": invite() });
  renderPage();
  expect(await screen.findByRole("heading", { name: "The Netherfield Circle" })).toBeInTheDocument();
  expect(screen.getByText("You're invited to join")).toBeInTheDocument();
  expect(screen.getByText(/Reading Pride and Prejudice by Jane Austen/)).toBeInTheDocument();
  expect(screen.getByText("Private")).toBeInTheDocument();
  expect(screen.getByText("4 members")).toBeInTheDocument();
  expect(axios.get).toHaveBeenCalledWith("/invitations/abcDEF123456");
});

test("joining goes to the circle", async () => {
  routeGet(axios, { "/invitations/": invite() });
  axios.post.mockResolvedValueOnce({ data: { circleId: "c1" } });
  renderPage();
  userEvent.click(await screen.findByRole("button", { name: "Join the circle" }));
  expect(await screen.findByText("Circle page c1")).toBeInTheDocument();
  expect(axios.post).toHaveBeenCalledWith("/circles/join", { code: "abcDEF123456" });
});

test("a failed join shows why and lets you try again", async () => {
  routeGet(axios, { "/invitations/": invite() });
  axios.post.mockRejectedValueOnce(httpError(410, { error: "This invite link has already been used the maximum number of times." }));
  renderPage();
  userEvent.click(await screen.findByRole("button", { name: "Join the circle" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("maximum number of times");
  await waitFor(() => expect(screen.getByRole("button", { name: "Join the circle" })).toBeEnabled());
});

test("already a member: a link to the circle instead of Join", async () => {
  routeGet(axios, { "/invitations/": invite({ alreadyMember: true }) });
  renderPage();
  expect(await screen.findByRole("link", { name: /already in this circle/ })).toHaveAttribute("href", "/circles/c1");
  expect(screen.queryByRole("button", { name: "Join the circle" })).toBeNull();
});

test.each([
  [httpError(410, { error: "This invite link has expired. Ask for a new one." }), "This invite link no longer works", /expired/],
  [httpError(404, { error: "That invite code isn't valid." }), "Invite link not found", /ask the organiser/],
  [networkError(), "Couldn't open this invitation", /reach the server/i],
])("failure %#", async (err, heading, text) => {
  routeGet(axios, { "/invitations/": err });
  renderPage();
  expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
  expect(screen.getByText(text)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Back to your circles" })).toHaveAttribute("href", "/");
});

test("codes are URL-encoded when asked about", async () => {
  routeGet(axios, { "/invitations/": invite() });
  renderPage("a b");
  await screen.findByRole("heading", { name: "The Netherfield Circle" });
  expect(axios.get).toHaveBeenCalledWith("/invitations/a%20b");
});
