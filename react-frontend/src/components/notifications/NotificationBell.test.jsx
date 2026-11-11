import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axios from "axios";
import NotificationBell, { POLL_MS } from "./NotificationBell";
import { renderWithAuth } from "../../testUtils";

jest.mock("axios");
jest.unmock("./NotificationBell");

const item = (over = {}) => ({
  _id: "n1",
  type: "reply",
  read: false,
  createdAt: new Date().toISOString(),
  actor: { _id: "u2", username: "darcy", profilePicture: "" },
  thread: { _id: "t1", title: "That opening line", chapterSeq: 1 },
  circle: { _id: "c1", name: "The Netherfield Circle" },
  preview: "Ten thousand a year!",
  ...over,
});

const setup = async (data) => {
  if (data instanceof Error) axios.get.mockRejectedValue(data);
  else axios.get.mockResolvedValue({ data });
  const utils = renderWithAuth(<NotificationBell />);
  // Let the first load finish (and its state update land) inside act().
  await act(async () => {});
  expect(axios.get).toHaveBeenCalledWith("/notifications");
  return utils;
};

const openPanel = async (name = /^Notifications/) => {
  userEvent.click(await screen.findByRole("button", { name }));
  await act(async () => {});
};

test("shows the unread count in the button and its label", async () => {
  await setup({ unread: 2, items: [item(), item({ _id: "n2" })] });
  expect(await screen.findByRole("button", { name: "Notifications, 2 unread" })).toHaveTextContent("2");
});

test("caps the visible count at 9+", async () => {
  await setup({ unread: 12, items: [] });
  expect(await screen.findByText("9+")).toBeInTheDocument();
});

test("no badge when everything is read", async () => {
  await setup({ unread: 0, items: [item({ read: true })] });
  const btn = await screen.findByRole("button", { name: "Notifications" });
  expect(btn).not.toHaveTextContent(/\d/);
});

test("opening lists replies with who, where, a preview and a link", async () => {
  await setup({ unread: 1, items: [item()] });
  await openPanel("Notifications, 1 unread");
  const panel = screen.getByRole("region", { name: "Notifications" });
  const link = within(panel).getByRole("link", { name: /darcy replied to That opening line/ });
  expect(link).toHaveAttribute("href", "/threads/t1");
  expect(link).toHaveTextContent("“Ten thousand a year!”");
  expect(link).toHaveTextContent("The Netherfield Circle · Ch 1");
  expect(within(panel).getByLabelText("Unread")).toBeInTheDocument();
});

test("clicking one marks it read and closes the panel", async () => {
  axios.post.mockResolvedValue({ data: { ok: true } });
  await setup({ unread: 1, items: [item()] });
  await openPanel("Notifications, 1 unread");
  userEvent.click(screen.getByRole("link", { name: /darcy replied/ }));
  expect(axios.post).toHaveBeenCalledWith("/notifications/read", { ids: ["n1"] });
  expect(screen.queryByRole("region", { name: "Notifications" })).toBeNull();
  expect(screen.getByRole("button", { name: "Notifications" })).toBeInTheDocument();
});

test("clicking an already-read one doesn't call the server", async () => {
  await setup({ unread: 0, items: [item({ read: true })] });
  await openPanel("Notifications");
  userEvent.click(screen.getByRole("link", { name: /darcy replied/ }));
  expect(axios.post).not.toHaveBeenCalled();
});

test("Mark all as read clears the count", async () => {
  axios.post.mockResolvedValueOnce({ data: { ok: true } });
  await setup({ unread: 1, items: [item()] });
  await openPanel("Notifications, 1 unread");
  userEvent.click(screen.getByRole("button", { name: "Mark all as read" }));
  expect(axios.post).toHaveBeenCalledWith("/notifications/read");
  expect(screen.getByRole("button", { name: "Notifications" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Mark all as read" })).toBeNull();
});

test("if marking all fails, it reloads the real state", async () => {
  axios.post.mockRejectedValueOnce(new Error("Network Error"));
  await setup({ unread: 1, items: [item()] });
  await openPanel("Notifications, 1 unread");
  userEvent.click(screen.getByRole("button", { name: "Mark all as read" }));
  expect(await screen.findByRole("button", { name: "Notifications, 1 unread" })).toBeInTheDocument();
});

test("empty state explains what will appear", async () => {
  await setup({ unread: 0, items: [] });
  await openPanel("Notifications");
  expect(await screen.findByText(/No notifications yet/)).toBeInTheDocument();
});

test("a load failure says so when opened", async () => {
  await setup(new Error("Network Error"));
  await openPanel("Notifications");
  expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load notifications.");
});

test("tolerates an odd response shape", async () => {
  await setup([]);
  await openPanel("Notifications");
  expect(await screen.findByText(/No notifications yet/)).toBeInTheDocument();
});

test("Escape and outside clicks close the panel", async () => {
  await setup({ unread: 0, items: [] });
  await openPanel("Notifications");
  expect(screen.getByRole("button", { name: "Notifications" })).toHaveAttribute("aria-expanded", "true");
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("region", { name: "Notifications" })).toBeNull();
  await openPanel("Notifications");
  userEvent.click(document.body);
  expect(screen.queryByRole("region", { name: "Notifications" })).toBeNull();
});

test("polls in the background while the tab is visible", async () => {
  jest.useFakeTimers();
  try {
    axios.get.mockResolvedValue({ data: { unread: 0, items: [] } });
    renderWithAuth(<NotificationBell />);
    await act(async () => {});
    expect(axios.get).toHaveBeenCalledTimes(1);
    await act(async () => {
      jest.advanceTimersByTime(POLL_MS);
    });
    expect(axios.get).toHaveBeenCalledTimes(2);
  } finally {
    jest.useRealTimers();
  }
});
