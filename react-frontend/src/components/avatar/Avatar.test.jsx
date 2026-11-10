import { render, screen } from "@testing-library/react";
import Avatar, { initialsOf, colorFor } from "./Avatar";

describe("initialsOf", () => {
  test.each([
    ["jane", "J"],
    ["jane doe", "JD"],
    ["book_worm", "BW"],
    ["mary.ann.smith", "MA"],
    ["  ", "?"],
    ["", "?"],
    [undefined, "?"],
    ["élodie", "É"],
    ["!!!", "?"],
  ])("%p → %p", (name, expected) => {
    expect(initialsOf(name)).toBe(expected);
  });
});

test("colorFor is stable per name", () => {
  expect(colorFor("jane")).toBe(colorFor("jane"));
  expect(colorFor("jane")).toMatch(/^#[0-9a-f]{6}$/i);
});

test("shows the profile photo when there is one", () => {
  render(<Avatar user={{ username: "jane", profilePicture: "person/1.jpeg" }} />);
  const img = screen.getByRole("img", { name: "jane" });
  expect(img.tagName).toBe("IMG");
  expect(img.getAttribute("src")).toMatch(/person\/1\.jpeg$/);
});

test("falls back to initials without a photo", () => {
  render(<Avatar user={{ username: "jane doe", profilePicture: "" }} size={50} />);
  const el = screen.getByRole("img", { name: "jane doe" });
  expect(el.tagName).toBe("SPAN");
  expect(el).toHaveTextContent("JD");
  expect(el).toHaveStyle({ width: "50px", height: "50px" });
});

test("handles a missing user", () => {
  render(<Avatar user={null} />);
  expect(screen.getByRole("img", { name: "Reader" })).toHaveTextContent("?");
});
