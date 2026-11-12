import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axios from "axios";
import Settings from "./Settings";
import VerifyBanner from "../../components/verifyBanner/VerifyBanner";
import { renderWithAuth, httpError, ME } from "../../testUtils";

jest.mock("axios");

const VERIFIED = { ...ME, emailVerified: true };
const UNVERIFIED = { ...ME, emailVerified: false };

beforeEach(() => axios.get.mockResolvedValue({ data: [] }));

const setup = async (user = VERIFIED) => {
  const utils = renderWithAuth(<Settings />, { user, route: "/settings" });
  await act(async () => {});
  return utils;
};

describe("email", () => {
  test("shows your address and that it's confirmed", async () => {
    await setup();
    expect(screen.getByText(ME.email)).toBeInTheDocument();
    expect(screen.getAllByText("Confirmed").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Send the link again" })).toBeNull();
  });

  test("unconfirmed: explains and can resend", async () => {
    axios.post.mockResolvedValue({ data: { sent: true } });
    await setup(UNVERIFIED);
    expect(screen.getByText("Not confirmed yet")).toBeInTheDocument();
    const section = screen.getByRole("region", { name: "Account settings" });
    userEvent.click(within(section).getByRole("button", { name: "Send the link again" }));
    expect(await within(section).findByRole("status")).toHaveTextContent("Sent!");
    expect(axios.post).toHaveBeenCalledWith("/auth/resend-verification");
  });

  test("resend errors (cooldown) are shown", async () => {
    axios.post.mockRejectedValue(httpError(429, { error: "We just sent one. Please wait a minute before asking again." }));
    await setup(UNVERIFIED);
    const section = screen.getByRole("region", { name: "Account settings" });
    userEvent.click(within(section).getByRole("button", { name: "Send the link again" }));
    expect(await within(section).findByRole("alert")).toHaveTextContent("wait a minute");
  });
});

describe("change password", () => {
  const fill = (cur, next, again = next) => {
    const form = screen.getByRole("form", { name: "Change password" });
    userEvent.type(within(form).getByLabelText("Current password"), cur);
    userEvent.type(within(form).getByLabelText("New password"), next);
    userEvent.type(within(form).getByLabelText("Confirm new password"), again);
    return form;
  };

  test("sends current and new password, then clears the form", async () => {
    axios.put.mockResolvedValueOnce({ data: { changed: true } });
    await setup();
    const form = fill("old-pass-1", "new-pass-123");
    userEvent.click(within(form).getByRole("button", { name: "Change password" }));
    expect(await within(form).findByRole("status")).toHaveTextContent("Password changed.");
    expect(axios.put).toHaveBeenCalledWith("/account/password", { currentPassword: "old-pass-1", newPassword: "new-pass-123" });
    expect(within(form).getByLabelText("Current password")).toHaveValue("");
  });

  test("mismatch is caught before sending", async () => {
    await setup();
    const form = fill("old-pass-1", "new-pass-123", "new-pass-999");
    userEvent.click(within(form).getByRole("button", { name: "Change password" }));
    expect(within(form).getByRole("alert")).toHaveTextContent("don't match");
    expect(axios.put).not.toHaveBeenCalled();
  });

  test("a wrong current password shows the server's message", async () => {
    axios.put.mockRejectedValueOnce(httpError(400, { error: "Your current password isn't right." }));
    await setup();
    const form = fill("wrong", "new-pass-123");
    userEvent.click(within(form).getByRole("button", { name: "Change password" }));
    expect(await within(form).findByRole("alert")).toHaveTextContent("current password isn't right");
  });

  test("the button waits for a current password and 8 new characters", async () => {
    await setup();
    const form = screen.getByRole("form", { name: "Change password" });
    const btn = within(form).getByRole("button", { name: "Change password" });
    expect(btn).toBeDisabled();
    userEvent.type(within(form).getByLabelText("Current password"), "x");
    userEvent.type(within(form).getByLabelText("New password"), "1234567");
    expect(btn).toBeDisabled();
    userEvent.type(within(form).getByLabelText("New password"), "8");
    expect(btn).toBeEnabled();
  });
});

test("download links to the export endpoint", async () => {
  await setup();
  const link = screen.getByRole("link", { name: "Download my data" });
  expect(link).toHaveAttribute("href", "/api/account/export");
  expect(link).toHaveAttribute("download");
});

describe("delete account", () => {
  const open = async () => {
    await setup();
    userEvent.click(screen.getByRole("button", { name: "Delete my account…" }));
    return screen.getByRole("form", { name: "Delete account" });
  };

  test("needs your exact username and your password", async () => {
    const form = await open();
    const del = within(form).getByRole("button", { name: "Delete forever" });
    expect(del).toBeDisabled();
    userEvent.type(within(form).getByLabelText(/Type your username/), ME.username.toUpperCase());
    userEvent.type(within(form).getByLabelText("Your password"), "pw");
    expect(del).toBeDisabled();
    userEvent.clear(within(form).getByLabelText(/Type your username/));
    userEvent.type(within(form).getByLabelText(/Type your username/), ME.username);
    expect(del).toBeEnabled();
  });

  test("deletes and signs out", async () => {
    axios.delete.mockResolvedValueOnce({ data: { deleted: true } });
    const form = await open();
    userEvent.type(within(form).getByLabelText(/Type your username/), ME.username);
    userEvent.type(within(form).getByLabelText("Your password"), "secret123");
    userEvent.click(within(form).getByRole("button", { name: "Delete forever" }));
    await waitFor(() => expect(axios.delete).toHaveBeenCalledWith("/account", { data: { password: "secret123" } }));
  });

  test("a wrong password keeps you here with the message", async () => {
    axios.delete.mockRejectedValueOnce(httpError(400, { error: "That password isn't right." }));
    const form = await open();
    userEvent.type(within(form).getByLabelText(/Type your username/), ME.username);
    userEvent.type(within(form).getByLabelText("Your password"), "nope");
    userEvent.click(within(form).getByRole("button", { name: "Delete forever" }));
    expect(await within(form).findByRole("alert")).toHaveTextContent("password isn't right");
  });

  test("Cancel closes it", async () => {
    const form = await open();
    userEvent.click(within(form).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("form", { name: "Delete account" })).toBeNull();
  });
});

test("successful deletion dispatches LOGOUT", async () => {
  axios.delete.mockResolvedValueOnce({ data: { deleted: true } });
  const { dispatch } = await setup();
  userEvent.click(screen.getByRole("button", { name: "Delete my account…" }));
  const form = screen.getByRole("form", { name: "Delete account" });
  userEvent.type(within(form).getByLabelText(/Type your username/), ME.username);
  userEvent.type(within(form).getByLabelText("Your password"), "secret123");
  userEvent.click(within(form).getByRole("button", { name: "Delete forever" }));
  await waitFor(() => expect(dispatch).toHaveBeenCalledWith({ type: "LOGOUT" }));
});

describe("VerifyBanner", () => {
  test("shows for unconfirmed accounts, can resend and be put off", async () => {
    axios.post.mockResolvedValue({ data: { sent: true } });
    renderWithAuth(<VerifyBanner />, { user: UNVERIFIED });
    const banner = screen.getByRole("region", { name: "Confirm your email" });
    expect(banner).toHaveTextContent(ME.email);
    userEvent.click(within(banner).getByRole("button", { name: "Send the link again" }));
    expect(await within(banner).findByRole("status")).toHaveTextContent("Sent!");
    userEvent.click(within(banner).getByRole("button", { name: "Later" }));
    expect(screen.queryByRole("region", { name: "Confirm your email" })).toBeNull();
  });

  test.each([["confirmed", VERIFIED], ["older data without the flag", ME], ["signed out", null]])("hidden when %s", (_n, user) => {
    renderWithAuth(<VerifyBanner />, { user });
    expect(screen.queryByRole("region", { name: "Confirm your email" })).toBeNull();
  });
});
