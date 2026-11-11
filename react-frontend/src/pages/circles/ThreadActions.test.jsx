import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axios from "axios";
import ThreadPage from "./ThreadPage";
import { renderWithAuth, httpError, ME } from "../../testUtils";
import { threadDetail, routeGet } from "../../readingFixtures";

jest.mock("axios");

const ME_HERE = { ...ME, _id: "u1", username: "jane" };
const renderPage = () => renderWithAuth(<ThreadPage />, { user: ME_HERE, route: "/threads/t1", path: "/threads/:id" });
const ready = () => screen.findByRole("heading", { name: "That opening line" });
const mine = (over = {}) => threadDetail({ author: { _id: "u1", username: "jane", profilePicture: "" }, ...over });

beforeEach(() => {
  jest.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(() => window.confirm.mockRestore());

describe("editing", () => {
  test("you edit your own reply in place; it's marked edited", async () => {
    routeGet(axios, { "/threads/t1": threadDetail() });
    axios.patch.mockResolvedValueOnce({ data: { _id: "m2", body: "Me three", editedAt: new Date().toISOString() } });
    renderPage();
    await ready();
    expect(screen.queryByRole("button", { name: "Edit reply by elinor" })).toBeNull();
    userEvent.click(screen.getByRole("button", { name: "Edit reply by jane" }));
    const form = screen.getByRole("form", { name: "Edit Your reply" });
    const box = within(form).getByLabelText("Your reply");
    expect(box).toHaveValue("Me too");
    userEvent.clear(box);
    userEvent.type(box, "  Me three ");
    userEvent.click(within(form).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(axios.patch).toHaveBeenCalled());
    expect(await screen.findByText("Me three")).toBeInTheDocument();
    expect(axios.patch).toHaveBeenCalledWith("/comments/m2", { body: "Me three" });
    expect(screen.getAllByText("· edited")).toHaveLength(1);
  });

  test("Save is disabled for an empty reply", async () => {
    routeGet(axios, { "/threads/t1": threadDetail() });
    renderPage();
    await ready();
    userEvent.click(screen.getByRole("button", { name: "Edit reply by jane" }));
    const form = screen.getByRole("form", { name: "Edit Your reply" });
    userEvent.clear(within(form).getByLabelText("Your reply"));
    expect(within(form).getByRole("button", { name: "Save" })).toBeDisabled();
  });

  test("a failed edit keeps the box open with the error; Cancel restores the reply", async () => {
    routeGet(axios, { "/threads/t1": threadDetail() });
    axios.patch.mockRejectedValueOnce(httpError(400, { error: "Replies can be at most 2000 characters." }));
    renderPage();
    await ready();
    userEvent.click(screen.getByRole("button", { name: "Edit reply by jane" }));
    const form = screen.getByRole("form", { name: "Edit Your reply" });
    userEvent.type(within(form).getByLabelText("Your reply"), "!");
    userEvent.click(within(form).getByRole("button", { name: "Save" }));
    expect(await within(form).findByRole("alert")).toHaveTextContent("2000 characters");
    userEvent.click(within(form).getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("Me too")).toBeInTheDocument();
  });

  test("the author edits the discussion title and text", async () => {
    routeGet(axios, { "/threads/t1": mine() });
    axios.patch.mockResolvedValueOnce({ data: { _id: "t1", title: "Better title", body: "What did you think?", editedAt: new Date().toISOString() } });
    renderPage();
    await ready();
    userEvent.click(screen.getByRole("button", { name: "Edit" }));
    const form = screen.getByRole("form", { name: "Edit discussion" });
    userEvent.clear(within(form).getByLabelText("Title"));
    userEvent.type(within(form).getByLabelText("Title"), "Better title");
    userEvent.click(within(form).getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("heading", { name: "Better title" })).toBeInTheDocument();
    expect(axios.patch).toHaveBeenCalledWith("/threads/t1", { title: "Better title", body: "What did you think?" });
    expect(screen.getByText("· edited")).toBeInTheDocument();
  });

  test("a too-short title can't be saved", async () => {
    routeGet(axios, { "/threads/t1": mine() });
    renderPage();
    await ready();
    userEvent.click(screen.getByRole("button", { name: "Edit" }));
    const form = screen.getByRole("form", { name: "Edit discussion" });
    userEvent.clear(within(form).getByLabelText("Title"));
    userEvent.type(within(form).getByLabelText("Title"), "ab");
    expect(within(form).getByRole("button", { name: "Save" })).toBeDisabled();
  });

  test("on other readers' discussions there's no Edit or Delete, but Report and Block", async () => {
    routeGet(axios, { "/threads/t1": threadDetail() });
    renderPage();
    await ready();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete discussion" })).toBeNull();
    expect(screen.getAllByRole("button", { name: "Report" }).length).toBeGreaterThan(0);
    // Elinor wrote the discussion and a reply: one Block button for each.
    expect(screen.getAllByRole("button", { name: "Block elinor" })).toHaveLength(2);
  });

  test("on your own discussion there's no Report or Block for it", async () => {
    routeGet(axios, { "/threads/t1": mine({ comments: [] }) });
    renderPage();
    await ready();
    expect(screen.queryByRole("button", { name: "Report" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Block/ })).toBeNull();
  });
});

describe("reporting", () => {
  test("choose a reason, add a note, send, see a thank-you", async () => {
    routeGet(axios, { "/threads/t1": threadDetail() });
    axios.post.mockResolvedValueOnce({ data: { _id: "r1", status: "open" } });
    renderPage();
    await ready();
    expect(screen.queryByRole("button", { name: "Report reply by jane" })).toBeNull();
    userEvent.click(screen.getByRole("button", { name: "Report reply by elinor" }));
    const form = screen.getByRole("form", { name: "Report this reply" });
    const send = within(form).getByRole("button", { name: "Send report" });
    expect(send).toBeDisabled();
    userEvent.click(within(form).getByLabelText("Spoiler for a later chapter"));
    userEvent.type(within(form).getByLabelText(/Anything the moderators/), " ch 40 ");
    userEvent.click(send);
    expect(await screen.findByRole("status")).toHaveTextContent("moderators will take a look");
    expect(axios.post).toHaveBeenCalledWith("/reports", { targetType: "comment", targetId: "m1", reason: "spoiler", details: "ch 40" });
    expect(screen.queryByRole("form", { name: "Report this reply" })).toBeNull();
  });

  test("a duplicate report shows the server's message inside the form", async () => {
    routeGet(axios, { "/threads/t1": threadDetail() });
    axios.post.mockRejectedValueOnce(httpError(409, { error: "You've already reported this." }));
    renderPage();
    await ready();
    userEvent.click(screen.getAllByRole("button", { name: "Report" })[0]);
    const form = screen.getByRole("form", { name: "Report this discussion" });
    userEvent.click(within(form).getByLabelText("Spam or advertising"));
    userEvent.click(within(form).getByRole("button", { name: "Send report" }));
    expect(await within(form).findByRole("alert")).toHaveTextContent("already reported");
  });

  test("Cancel closes the report form without sending", async () => {
    routeGet(axios, { "/threads/t1": threadDetail() });
    renderPage();
    await ready();
    userEvent.click(screen.getAllByRole("button", { name: "Report" })[0]);
    userEvent.click(within(screen.getByRole("form", { name: "Report this discussion" })).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("form", { name: /Report this/ })).toBeNull();
    expect(axios.post).not.toHaveBeenCalled();
  });
});

describe("blocking", () => {
  test("blocking a replier removes their replies and says how to undo it", async () => {
    const [elinorReply, janeReply] = threadDetail().comments;
    routeGet(axios, { "/threads/t1": mine({ comments: [elinorReply, janeReply] }) });
    axios.put.mockResolvedValueOnce({ data: { blocked: true } });
    renderPage();
    await screen.findByText("Loved it");
    userEvent.click(screen.getByRole("button", { name: "Block elinor" }));
    await waitFor(() => expect(screen.queryByText("Loved it")).toBeNull());
    expect(axios.put).toHaveBeenCalledWith("/blocks/u9");
    expect(screen.getByRole("status")).toHaveTextContent("unblock them from your profile");
    expect(screen.getByText("Me too")).toBeInTheDocument();
  });

  test("blocking the discussion's author leaves the page", async () => {
    routeGet(axios, { "/threads/t1": threadDetail() });
    axios.put.mockResolvedValueOnce({ data: { blocked: true } });
    const { container } = renderPage();
    await ready();
    userEvent.click(screen.getAllByRole("button", { name: "Block elinor" })[0]);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  test("cancelling the confirmation does nothing", async () => {
    window.confirm.mockReturnValue(false);
    routeGet(axios, { "/threads/t1": threadDetail() });
    renderPage();
    await ready();
    userEvent.click(screen.getAllByRole("button", { name: "Block elinor" })[0]);
    expect(axios.put).not.toHaveBeenCalled();
  });
});

describe("moderation", () => {
  test("moderators hide and unhide a reply and the discussion", async () => {
    routeGet(axios, { "/threads/t1": threadDetail({ canModerate: true }) });
    axios.post.mockResolvedValue({ data: {} });
    renderPage();
    await ready();
    userEvent.click(screen.getByRole("button", { name: "Hide reply by elinor" }));
    expect(await screen.findByRole("button", { name: "Unhide reply by elinor" })).toBeInTheDocument();
    expect(axios.post).toHaveBeenCalledWith("/comments/m1/hide");
    expect(screen.getByText("Hidden")).toBeInTheDocument();
    // Your own replies you delete, not hide.
    expect(screen.queryByRole("button", { name: "Hide reply by jane" })).toBeNull();
    userEvent.click(screen.getByRole("button", { name: "Hide from members" }));
    expect(await screen.findByText("Hidden from members")).toBeInTheDocument();
    expect(axios.post).toHaveBeenCalledWith("/threads/t1/hide");
    userEvent.click(screen.getByRole("button", { name: "Unhide" }));
    await waitFor(() => expect(axios.post).toHaveBeenCalledWith("/threads/t1/unhide"));
  });

  test("members don't get hide buttons", async () => {
    routeGet(axios, { "/threads/t1": threadDetail() });
    renderPage();
    await ready();
    expect(screen.queryByRole("button", { name: /^Hide/ })).toBeNull();
  });

  test("members see a hidden reply as a placeholder with no author or actions", async () => {
    routeGet(axios, { "/threads/t1": threadDetail({ comments: [{ _id: "m1", body: "", hidden: true, author: null, createdAt: new Date().toISOString() }] }) });
    renderPage();
    expect(await screen.findByText("A moderator hid this reply.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /reply by/ })).toBeNull();
  });

  test("deleting your discussion asks first, then returns to the circle", async () => {
    routeGet(axios, { "/threads/t1": mine() });
    axios.delete.mockResolvedValueOnce({ data: { deleted: true, circleId: "c1" } });
    const { container } = renderPage();
    await ready();
    userEvent.click(screen.getByRole("button", { name: "Delete discussion" }));
    await waitFor(() => expect(axios.delete).toHaveBeenCalledWith("/threads/t1"));
    expect(window.confirm).toHaveBeenCalled();
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  test("not confirming the delete keeps the discussion", async () => {
    window.confirm.mockReturnValue(false);
    routeGet(axios, { "/threads/t1": mine() });
    renderPage();
    await ready();
    userEvent.click(screen.getByRole("button", { name: "Delete discussion" }));
    expect(axios.delete).not.toHaveBeenCalled();
  });

  test("an action failure is shown at the top", async () => {
    routeGet(axios, { "/threads/t1": threadDetail({ canModerate: true }) });
    axios.post.mockRejectedValueOnce(httpError(403, { error: "Only the circle's owner and moderators can hide content." }));
    renderPage();
    await ready();
    userEvent.click(screen.getByRole("button", { name: "Hide reply by elinor" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Only the circle's owner");
  });
});
