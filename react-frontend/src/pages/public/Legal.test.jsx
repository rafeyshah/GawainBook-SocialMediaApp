import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import axios from "axios";
import { Impressum, Privacy, Terms, TERMS_VERSION } from "./Legal";
import { renderWithAuth } from "../../testUtils";

jest.mock("axios");

const OPERATOR = { name: "Jane Reader", address: ["Bookstraße 1", "10115 Berlin", "Germany"], email: "hello@example.com" };
const renderWith = (Page, operator) => {
  axios.get.mockResolvedValueOnce({ data: { operator, privacyVersion: "2026-11-10", waitlistOpen: Boolean(operator) } });
  render(
    <MemoryRouter>
      <Page />
    </MemoryRouter>
  );
};

describe("Impressum", () => {
  test("shows the operator's name, full address and email", async () => {
    renderWith(Impressum, OPERATOR);
    const address = (await screen.findByText(/Bookstraße 1/)).closest("address");
    expect(address).toHaveTextContent("Jane Reader");
    expect(address).toHaveTextContent("10115 Berlin");
    expect(address).toHaveTextContent("Germany");
    expect(screen.getByRole("link", { name: "hello@example.com" })).toHaveAttribute("href", "mailto:hello@example.com");
    expect(screen.getByText(/§ 5 DDG/)).toBeInTheDocument();
  });

  test("says clearly when details aren't published yet (never invents them)", async () => {
    renderWith(Impressum, null);
    expect(await screen.findByText(/haven't been published yet/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /@/ })).toBeNull();
  });

  test("handles the API being unreachable", async () => {
    axios.get.mockRejectedValueOnce(new Error("Network Error"));
    render(
      <MemoryRouter>
        <Impressum />
      </MemoryRouter>
    );
    expect(await screen.findByText(/haven't been published yet/)).toBeInTheDocument();
  });
});

describe("Privacy notice", () => {
  test("names the controller, version, data, legal bases, processors and rights", async () => {
    renderWith(Privacy, OPERATOR);
    expect(await screen.findByText(/Version 2026-11-10/)).toBeInTheDocument();
    expect(screen.getByText(/Bookstraße 1/).closest("address")).toHaveTextContent("Jane Reader");
    expect(screen.getByText(/Art\. 6\(1\)\(a\) GDPR/)).toBeInTheDocument();
    expect(screen.getByText(/Art\. 6\(1\)\(b\) GDPR/)).toBeInTheDocument();
    expect(screen.getByText(/Render/)).toBeInTheDocument();
    expect(screen.getByText(/Neon/)).toBeInTheDocument();
    expect(screen.getByText(/withdraw consent at any time/)).toBeInTheDocument();
    expect(screen.getByText(/don't use advertising or tracking cookies/)).toBeInTheDocument();
  });

  test("works before the operator is configured", async () => {
    renderWith(Privacy, null);
    expect(await screen.findByText(/haven't been published yet/)).toBeInTheDocument();
  });
});


describe("Terms", () => {
  test("covers age, conduct, spoilers, content rights, moderation and law, with the version", async () => {
    axios.get.mockResolvedValueOnce({ data: { operator: null, privacyVersion: "v", waitlistOpen: false } });
    renderWithAuth(<Terms />, { user: null });
    expect(screen.getByRole("heading", { name: "Terms of use" })).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`Version ${TERMS_VERSION}`))).toBeInTheDocument();
    for (const h of ["Your account", "Be kind, and don't spoil", "What you post", "Moderation", "The service"]) {
      expect(screen.getByRole("heading", { name: h })).toBeInTheDocument();
    }
    expect(screen.getByText("You must be at least 16.")).toBeInTheDocument();
    expect(screen.getByText(/German law applies/)).toBeInTheDocument();
    expect(await screen.findByText(/haven't been published yet/)).toBeInTheDocument();
  });

  test("the footer links to Terms", async () => {
    axios.get.mockResolvedValueOnce({ data: { operator: null } });
    renderWithAuth(<Terms />, { user: null });
    expect(screen.getByRole("navigation", { name: "Legal" })).toContainElement(screen.getByRole("link", { name: "Terms" }));
    await screen.findByText(/haven't been published yet/);
  });
});

test("the privacy notice covers emails, the minimum age, Resend, Open Library and self-service tools", async () => {
  axios.get.mockResolvedValueOnce({ data: { operator: null } });
  renderWithAuth(<Privacy />, { user: null });
  expect(screen.getByRole("heading", { name: "Emails" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Minimum age" })).toBeInTheDocument();
  expect(screen.getByText(/Resend/)).toBeInTheDocument();
  expect(screen.getByText(/Open Library/)).toBeInTheDocument();
  expect(screen.getByText(/download all your data/)).toBeInTheDocument();
  expect(screen.getByText(/no cookie banner/)).toBeInTheDocument();
  await screen.findByText(/haven't been published yet/);
});
