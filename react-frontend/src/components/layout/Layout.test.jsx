import { screen } from "@testing-library/react";
import axios from "axios";
import Layout from "./Layout";
import { renderWithAuth, ME } from "../../testUtils";

jest.mock("axios");
beforeEach(() => axios.get.mockResolvedValue({ data: [] }));

const content = () => screen.getByTestId("layout-content");

test("wide by default, with the main content in <main>", async () => {
  renderWithAuth(<Layout>Hello</Layout>);
  expect(content()).toHaveClass("layoutContent", "wide");
  expect(content()).not.toHaveClass("withAside");
  expect(screen.getByRole("main")).toHaveTextContent("Hello");
  expect(screen.queryByRole("complementary", { name: "More for you" })).toBeNull();
  await screen.findByText(/not following anyone/);
});

test("reading width with a side panel", async () => {
  renderWithAuth(
    <Layout width="reading" aside={<p>Side stuff</p>}>
      Story
    </Layout>
  );
  expect(content()).toHaveClass("reading", "withAside");
  expect(screen.getByRole("complementary", { name: "More for you" })).toHaveTextContent("Side stuff");
  await screen.findByText(/not following anyone/);
});

test("always has the top bar, sidebar navigation and the phone tab bar", async () => {
  renderWithAuth(<Layout>x</Layout>);
  expect(screen.getByRole("link", { name: "GawainBook home" })).toBeInTheDocument();
  expect(screen.getByRole("navigation", { name: "Main" })).toBeInTheDocument();
  const tabs = screen.getByRole("navigation", { name: "Sections" });
  expect([...tabs.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toEqual(["/", "/library", "/feed", `/profile/${ME.username}`]);
  await screen.findByText(/not following anyone/);
});
