import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axios from "axios";
import ThreadPage from "./ThreadPage";
import { renderWithAuth, httpError, networkError, ME } from "../../testUtils";
import { threadDetail, routeGet } from "../../readingFixtures";

jest.mock("axios");

const ME_HERE = { ...ME, _id: "u1", username: "jane" };
const renderPage = () => renderWithAuth(<ThreadPage />, { user: ME_HERE, route: "/threads/t1", path: "/threads/:id" });

test("shows the discussion, chapter, author and replies", async () => {
  routeGet(axios, { "/threads/t1": threadDetail() });
  renderPage();
  expect(await screen.findByRole("heading", { name: "That opening line" })).toBeInTheDocument();
  expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toHaveTextContent("The Netherfield Circle › Chapter 1");
  expect(screen.getByText("What did you think?")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "2 replies" })).toBeInTheDocument();
  expect(axios.get).toHaveBeenCalledWith("/threads/t1");
});

test("a locked discussion shows only its chapter and a way back", async () => {
  routeGet(axios, { "/threads/t1": httpError(403, { locked: true, chapterSeq: 34, circleId: "c1", error: "Reach chapter 34 to read this discussion." }) });
  renderPage();
  expect(await screen.findByRole("heading", { name: "Chapter 34 discussion" })).toBeInTheDocument();
  expect(screen.getByText(/Reach chapter 34 to read it/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Back to the circle" })).toHaveAttribute("href", "/circles/c1");
  expect(screen.queryByRole("form", { name: "Reply" })).toBeNull();
});

test.each([
  [httpError(404, { error: "Discussion not found." }), "Discussion not found"],
  [networkError(), "Couldn't load this discussion"],
])("load failure %#", async (err, heading) => {
  routeGet(axios, { "/threads/t1": err });
  renderPage();
  expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
});

test("replying appends your reply and clears the box", async () => {
  routeGet(axios, { "/threads/t1": threadDetail() });
  axios.post.mockResolvedValueOnce({
    data: { _id: "m3", body: "New thought", createdAt: new Date().toISOString(), author: { _id: "u1", username: "jane" } },
  });
  renderPage();
  const form = await screen.findByRole("form", { name: "Reply" });
  const send = within(form).getByRole("button", { name: "Reply" });
  expect(send).toBeDisabled();
  userEvent.type(within(form).getByLabelText("Your reply"), "  New thought  ");
  userEvent.click(send);
  expect(await screen.findByText("New thought")).toBeInTheDocument();
  expect(axios.post).toHaveBeenCalledWith("/threads/t1/comments", { body: "New thought" });
  expect(within(form).getByLabelText("Your reply")).toHaveValue("");
  expect(screen.getByRole("heading", { name: "3 replies" })).toBeInTheDocument();
});

test("a failed reply keeps your text and shows why", async () => {
  routeGet(axios, { "/threads/t1": threadDetail() });
  axios.post.mockRejectedValueOnce(httpError(403, { error: "Join the circle to reply." }));
  renderPage();
  const form = await screen.findByRole("form", { name: "Reply" });
  userEvent.type(within(form).getByLabelText("Your reply"), "Hello");
  userEvent.click(within(form).getByRole("button", { name: "Reply" }));
  expect(await within(form).findByRole("alert")).toHaveTextContent("Join the circle to reply.");
  expect(within(form).getByLabelText("Your reply")).toHaveValue("Hello");
});

test("you can delete only your own replies", async () => {
  routeGet(axios, { "/threads/t1": threadDetail() });
  axios.delete.mockResolvedValueOnce({ data: { deleted: true } });
  renderPage();
  await screen.findByRole("heading", { name: "That opening line" });
  expect(screen.queryByRole("button", { name: "Delete reply by elinor" })).toBeNull();
  userEvent.click(screen.getByRole("button", { name: "Delete reply by jane" }));
  await waitFor(() => expect(screen.queryByText("Me too")).toBeNull());
  expect(axios.delete).toHaveBeenCalledWith("/comments/m2");
});

test("moderators can delete anyone's reply", async () => {
  routeGet(axios, { "/threads/t1": threadDetail({ canModerate: true }) });
  renderPage();
  await screen.findByRole("heading", { name: "That opening line" });
  expect(screen.getByRole("button", { name: "Delete reply by elinor" })).toBeInTheDocument();
});

test("visitors who can't reply are invited to join instead", async () => {
  routeGet(axios, { "/threads/t1": threadDetail({ canReply: false }) });
  renderPage();
  expect(await screen.findByRole("link", { name: "Join the circle" })).toHaveAttribute("href", "/circles/c1");
  expect(screen.queryByRole("form", { name: "Reply" })).toBeNull();
});
