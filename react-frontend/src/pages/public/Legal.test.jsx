import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import axios from "axios";
import { Impressum, Privacy } from "./Legal";

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
