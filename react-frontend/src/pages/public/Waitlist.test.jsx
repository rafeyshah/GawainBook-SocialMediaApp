import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import axios from "axios";
import Waitlist, { GENRE_OPTIONS } from "./Waitlist";
import { httpError, networkError } from "../../testUtils";

jest.mock("axios");

const OPERATOR = { name: "Jane Reader", address: ["Bookstraße 1", "10115 Berlin"], email: "hello@example.com" };
const legal = (waitlistOpen) => ({ data: { operator: waitlistOpen ? OPERATOR : null, privacyVersion: "v1", waitlistOpen } });

const renderPage = async (open = true) => {
  axios.get.mockResolvedValueOnce(legal(open));
  render(
    <MemoryRouter>
      <Waitlist />
    </MemoryRouter>
  );
  await waitFor(() => expect(screen.queryByText("Loading…")).toBeNull());
};

const fill = ({ email = "reader@example.com", genre = "romantasy", organiser = "Yes", consent = true } = {}) => {
  if (email) userEvent.type(screen.getByLabelText("Email"), email);
  if (genre) userEvent.selectOptions(screen.getByLabelText("Favourite genre"), genre);
  if (organiser) userEvent.click(screen.getByRole("radio", { name: organiser }));
  if (consent) userEvent.click(screen.getByRole("checkbox"));
};
const submit = () => userEvent.click(screen.getByRole("button", { name: "Join the waitlist" }));

test("genre options match the server's list", () => {
  expect(GENRE_OPTIONS.map(([v]) => v)).toEqual([
    "fantasy",
    "romantasy",
    "romance",
    "science-fiction",
    "mystery-thriller",
    "literary",
    "classics",
    "non-fiction",
    "other",
  ]);
});

test("while closed, it explains and shows no form (nothing can be collected)", async () => {
  await renderPage(false);
  expect(screen.getByText(/waitlist opens soon/)).toBeInTheDocument();
  expect(screen.queryByLabelText("Email")).toBeNull();
  expect(screen.getByRole("link", { name: "create an account" })).toHaveAttribute("href", "/register");
});

test("if the status can't load, it stays closed", async () => {
  axios.get.mockRejectedValueOnce(networkError());
  render(
    <MemoryRouter>
      <Waitlist />
    </MemoryRouter>
  );
  expect(await screen.findByText(/waitlist opens soon/)).toBeInTheDocument();
});

test("sends the details with explicit consent and shows the confirmation", async () => {
  axios.post.mockResolvedValueOnce({ data: { message: "Thanks! You're on the list." } });
  await renderPage();
  fill({ email: "  Reader@Example.com " });
  submit();
  expect(await screen.findByRole("status")).toHaveTextContent("Thanks! You're on the list.");
  expect(axios.post).toHaveBeenCalledWith("/waitlist", {
    email: "Reader@Example.com",
    favouriteGenre: "romantasy",
    organizesBookClub: true,
    consent: true,
    website: "",
  });
  expect(screen.queryByLabelText("Email")).toBeNull();
});

test("'No' is sent as false, not missing", async () => {
  axios.post.mockResolvedValueOnce({ data: { message: "ok" } });
  await renderPage();
  fill({ organiser: "No" });
  submit();
  await screen.findByRole("status");
  expect(axios.post.mock.calls[0][1].organizesBookClub).toBe(false);
});

test("consent is unticked by default and required", async () => {
  await renderPage();
  expect(screen.getByRole("checkbox")).not.toBeChecked();
  fill({ consent: false });
  submit();
  expect(screen.getByRole("alert")).toHaveTextContent(/agree to the privacy notice/);
  expect(axios.post).not.toHaveBeenCalled();
});

test("the organiser question must be answered", async () => {
  await renderPage();
  fill({ organiser: null });
  submit();
  expect(screen.getByRole("alert")).toHaveTextContent(/organise a book club/);
  expect(axios.post).not.toHaveBeenCalled();
});

test("links to the privacy notice next to the consent box", async () => {
  await renderPage();
  expect(screen.getByRole("link", { name: "privacy notice" })).toHaveAttribute("href", "/privacy");
});

test("the honeypot field is hidden from people and assistive tech", async () => {
  await renderPage();
  const trap = document.getElementById("wlWebsite");
  expect(trap).toHaveAttribute("tabindex", "-1");
  expect(trap.closest("[aria-hidden='true']")).not.toBeNull();
});

test("shows server errors and lets you retry", async () => {
  axios.post
    .mockRejectedValueOnce(httpError(429, { error: "Too many sign-ups from this network. Please try again later." }))
    .mockResolvedValueOnce({ data: { message: "Done" } });
  await renderPage();
  fill();
  submit();
  expect(await screen.findByRole("alert")).toHaveTextContent("Too many sign-ups");
  submit();
  expect(await screen.findByRole("status")).toHaveTextContent("Done");
});

test("disables the button while sending", async () => {
  let resolve;
  axios.post.mockReturnValueOnce(new Promise((r) => (resolve = r)));
  await renderPage();
  fill();
  submit();
  expect(screen.getByRole("button", { name: "Joining…" })).toBeDisabled();
  resolve({ data: { message: "ok" } });
  await screen.findByRole("status");
});
