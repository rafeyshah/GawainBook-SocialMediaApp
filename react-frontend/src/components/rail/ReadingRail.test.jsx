import { screen, within } from "@testing-library/react";
import axios from "axios";
import ReadingRail from "./ReadingRail";
import { renderWithAuth, networkError } from "../../testUtils";
import { BOOK, OZ, circleCard, routeGet } from "../../readingFixtures";

jest.mock("axios");

test("lists books you're reading (with progress) and your circles", async () => {
  routeGet(axios, {
    "/books": [{ ...BOOK, shelf: "reading", chapter: 12 }, { ...OZ, shelf: "want", chapter: 0 }],
    "/circles": { mine: [circleCard(), circleCard({ _id: "c2", name: "Solo", openThreads: 1 })], discover: [] },
  });
  renderWithAuth(<ReadingRail />);
  expect(screen.getByLabelText("Loading your reading")).toBeInTheDocument();

  const reading = await screen.findByRole("region", { name: "Continue reading" });
  expect(within(reading).getByRole("link", { name: /Pride and Prejudice/ })).toHaveAttribute("href", "/books/pride-and-prejudice");
  expect(within(reading).getByText("Chapter 12 of 61")).toBeInTheDocument();
  expect(within(reading).queryByText(OZ.title)).toBeNull();

  const circles = screen.getByRole("region", { name: "Your circles" });
  expect(within(circles).getByRole("link", { name: /The Netherfield Circle/ })).toHaveAttribute("href", "/circles/c1");
  expect(within(circles).getByText("4 discussions open")).toBeInTheDocument();
  expect(within(circles).getByText("1 discussion open")).toBeInTheDocument();
});

test("empty states point to the library and to circles", async () => {
  routeGet(axios, { "/books": [], "/circles": { mine: [], discover: [] } });
  renderWithAuth(<ReadingRail />);
  expect(await screen.findByRole("link", { name: "library" })).toHaveAttribute("href", "/library");
  expect(screen.getByRole("link", { name: "Find one" })).toHaveAttribute("href", "/");
});

test("tolerates unexpected responses", async () => {
  routeGet(axios, { "/books": { not: "a list" }, "/circles": {} });
  renderWithAuth(<ReadingRail />);
  expect(await screen.findByText(/Nothing on the go/)).toBeInTheDocument();
  expect(screen.getByText(/not in a circle yet/)).toBeInTheDocument();
});

test("shows a short note if it can't load", async () => {
  routeGet(axios, { "/books": networkError(), "/circles": { mine: [] } });
  renderWithAuth(<ReadingRail />);
  expect(await screen.findByText("Couldn't load your reading right now.")).toBeInTheDocument();
});
