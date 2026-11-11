import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axios from "axios";
import CircleManage, { expiryLabel, inviteUrl } from "./CircleManage";
import { renderWithAuth, httpError } from "../../testUtils";
import { circleDetail } from "../../readingFixtures";

jest.mock("axios");

const DAY = 86_400_000;
const link = (over = {}) => ({ _id: "i1", code: "abcDEF123456", expiresAt: new Date(Date.now() + 7 * DAY).toISOString(), maxUses: null, uses: 0, ...over });
const report = (over = {}) => ({
  _id: "r1",
  targetType: "comment",
  targetId: "m1",
  reason: "spoiler",
  details: "chapter 40!",
  createdAt: new Date().toISOString(),
  reporter: { _id: "u1", username: "jane" },
  target: { _id: "m1", text: "Wickham elopes", threadId: "t1", chapterSeq: 3, author: { _id: "u7", username: "wick" } },
  ...over,
});

const api = ({ links = [], reports = [] } = {}) => {
  axios.get.mockImplementation((url) => {
    if (url.endsWith("/invitations")) return Promise.resolve({ data: links });
    if (url.endsWith("/reports")) return Promise.resolve({ data: reports });
    return Promise.resolve({ data: [] });
  });
};

const setup = async (circle = circleDetail({ myRole: "owner", _id: "c1" }), onChanged = jest.fn()) => {
  const utils = renderWithAuth(<CircleManage circle={circle} meId="u9" onChanged={onChanged} />, { user: { _id: "u9", username: "elinor" } });
  await act(async () => {});
  return { ...utils, onChanged };
};

describe("helpers", () => {
  test("inviteUrl builds a /join link", () => expect(inviteUrl("abc", "https://x.test")).toBe("https://x.test/join/abc"));
  test.each([
    [0.2, "expires in 1 day"],
    [1, "expires in 1 day"],
    [6.5, "expires in 7 days"],
    [-1, "expires today"],
  ])("expiryLabel(%p days)", (days, label) => {
    const now = Date.UTC(2026, 10, 20);
    expect(expiryLabel(new Date(now + days * DAY).toISOString(), now)).toBe(label);
  });
});

describe("invite links", () => {
  test("lists active links with expiry and uses", async () => {
    api({ links: [link({ maxUses: 5, uses: 2 }), link({ _id: "i2", code: "zzzZZZ999999" })] });
    await setup();
    const list = screen.getByRole("list", { name: "Active invite links" });
    // Shown short; the full URL is in the title (and is what gets copied).
    expect(within(list).getByText("…/join/abcDEF123456")).toHaveAttribute("title", `${window.location.origin}/join/abcDEF123456`);
    expect(within(list).getByText(/2 of 5 used/)).toBeInTheDocument();
    expect(within(list).getByText(/0 used/)).toBeInTheDocument();
  });

  test("creating a link sends the chosen expiry and limit, and shows it first", async () => {
    api({ links: [link()] });
    axios.post.mockResolvedValueOnce({ data: link({ _id: "new", code: "NEWcode00001", maxUses: 5 }) });
    await setup();
    const form = screen.getByRole("form", { name: "Create an invite link" });
    userEvent.selectOptions(within(form).getByLabelText("Valid for"), "14");
    userEvent.selectOptions(within(form).getByLabelText("Can be used by"), "5");
    userEvent.click(within(form).getByRole("button", { name: "Create link" }));
    await waitFor(() => expect(axios.post).toHaveBeenCalledWith("/circles/c1/invitations", { expiresInDays: 14, maxUses: 5 }));
    const items = within(screen.getByRole("list", { name: "Active invite links" })).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("NEWcode00001");
  });

  test("unlimited uses are sent as null; the default is 7 days", async () => {
    api();
    axios.post.mockResolvedValueOnce({ data: link() });
    await setup();
    userEvent.click(screen.getByRole("button", { name: "Create link" }));
    await waitFor(() => expect(axios.post).toHaveBeenCalledWith("/circles/c1/invitations", { expiresInDays: 7, maxUses: null }));
  });

  test("turning a link off removes it", async () => {
    api({ links: [link()] });
    axios.delete.mockResolvedValueOnce({ data: { revoked: true } });
    await setup();
    userEvent.click(screen.getByRole("button", { name: "Turn off link abcDEF123456" }));
    await waitFor(() => expect(screen.queryByRole("list", { name: "Active invite links" })).toBeNull());
    expect(axios.delete).toHaveBeenCalledWith("/circles/c1/invitations/i1");
  });

  test("copy puts the full link on the clipboard", async () => {
    api({ links: [link()] });
    const writeText = jest.fn().mockResolvedValue();
    Object.assign(navigator, { clipboard: { writeText } });
    await setup();
    userEvent.click(screen.getByRole("button", { name: "Copy link" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument());
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/join/abcDEF123456`);
  });

  test("a failed create shows the error", async () => {
    api();
    axios.post.mockRejectedValueOnce(httpError(403, { error: "Only the circle's owner and moderators can do that." }));
    await setup();
    userEvent.click(screen.getByRole("button", { name: "Create link" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Only the circle's owner");
  });

  test("no links yet: a hint", async () => {
    api();
    await setup();
    expect(screen.getByText(/No active links/)).toBeInTheDocument();
  });
});

describe("members", () => {
  beforeEach(() => jest.spyOn(window, "confirm").mockReturnValue(true));
  afterEach(() => window.confirm.mockRestore());

  test("the owner can promote, demote and remove; not themselves or the owner row", async () => {
    api();
    axios.put.mockResolvedValue({ data: {} });
    axios.delete.mockResolvedValue({ data: {} });
    const { onChanged } = await setup();
    const list = screen.getByRole("list", { name: "Manage members" });
    expect(within(list).queryByText("elinor")).toBeNull();
    const jane = within(list).getByText("jane").closest("li");
    userEvent.click(within(jane).getByRole("button", { name: "Make moderator" }));
    await waitFor(() => expect(axios.put).toHaveBeenCalledWith("/circles/c1/members/u1", { role: "moderator" }));
    const darcy = within(list).getByText("darcy").closest("li");
    userEvent.click(within(darcy).getByRole("button", { name: "Make member" }));
    await waitFor(() => expect(axios.put).toHaveBeenCalledWith("/circles/c1/members/u8", { role: "member" }));
    userEvent.click(within(list).getByRole("button", { name: "Remove darcy" }));
    await waitFor(() => expect(axios.delete).toHaveBeenCalledWith("/circles/c1/members/u8"));
    expect(onChanged).toHaveBeenCalledTimes(3);
  });

  test("moderators can remove members only, and can't change roles", async () => {
    api();
    await setup(circleDetail({ myRole: "moderator", _id: "c1" }));
    const list = screen.getByRole("list", { name: "Manage members" });
    expect(within(list).queryByRole("button", { name: /Make/ })).toBeNull();
    expect(within(list).getByRole("button", { name: "Remove jane" })).toBeInTheDocument();
    expect(within(list).queryByRole("button", { name: "Remove darcy" })).toBeNull();
  });

  test("not confirming a removal does nothing", async () => {
    window.confirm.mockReturnValue(false);
    api();
    await setup();
    userEvent.click(screen.getByRole("button", { name: "Remove jane" }));
    expect(axios.delete).not.toHaveBeenCalled();
  });

  test("a failed change shows the error", async () => {
    api();
    axios.delete.mockRejectedValueOnce(httpError(403, { error: "You can't remove this member." }));
    await setup();
    userEvent.click(screen.getByRole("button", { name: "Remove jane" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("You can't remove this member.");
  });

  test("an empty circle says so", async () => {
    api();
    await setup(circleDetail({ myRole: "owner", _id: "c1", members: [{ _id: "u9", username: "elinor", role: "owner" }] }));
    expect(screen.getByText("Nobody else has joined yet.")).toBeInTheDocument();
  });
});

describe("reports", () => {
  test("shows each report with reason, author, chapter, the text and the note", async () => {
    api({ reports: [report()] });
    await setup(circleDetail({ myRole: "owner", _id: "c1", openReports: 1 }));
    expect(screen.getByRole("heading", { name: "Organise · 1 to review" })).toBeInTheDocument();
    const item = within(screen.getByRole("list", { name: "Open reports" })).getByRole("listitem");
    expect(item).toHaveTextContent("Spoiler for a later chapter");
    expect(item).toHaveTextContent("reply by wick in chapter 3");
    expect(item).toHaveTextContent("Wickham elopes");
    expect(item).toHaveTextContent("Note: chapter 40!");
    expect(within(item).getByRole("link", { name: "Open" })).toHaveAttribute("href", "/threads/t1");
  });

  test("a reported discussion shows its title too", async () => {
    api({ reports: [report({ targetType: "thread", targetId: "t2", target: { _id: "t2", title: "Big reveal", text: "body", threadId: "t2", chapterSeq: 5, author: { username: "wick" } } })] });
    await setup();
    expect(screen.getByRole("list", { name: "Open reports" })).toHaveTextContent("discussion by wick");
    expect(screen.getByText(/Big reveal/)).toBeInTheDocument();
  });

  test("Hide it hides the reported item and reloads; Dismiss dismisses", async () => {
    api({ reports: [report(), report({ _id: "r2", targetType: "thread", targetId: "t5" })] });
    axios.post.mockResolvedValue({ data: {} });
    const { onChanged } = await setup();
    const [first, second] = within(screen.getByRole("list", { name: "Open reports" })).getAllByRole("listitem");
    userEvent.click(within(first).getByRole("button", { name: "Hide it" }));
    await waitFor(() => expect(axios.post).toHaveBeenCalledWith("/comments/m1/hide"));
    userEvent.click(within(second).getByRole("button", { name: "Hide it" }));
    await waitFor(() => expect(axios.post).toHaveBeenCalledWith("/threads/t5/hide"));
    userEvent.click(within(second).getByRole("button", { name: "Dismiss" }));
    await waitFor(() => expect(axios.post).toHaveBeenCalledWith("/reports/r2/dismiss"));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  test("nothing to review", async () => {
    api();
    await setup();
    expect(screen.getByText(/No open reports/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Organise" })).toBeInTheDocument();
  });
});
