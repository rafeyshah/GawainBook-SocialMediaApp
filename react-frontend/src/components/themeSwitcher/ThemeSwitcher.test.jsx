import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ThemeSwitcher from "./ThemeSwitcher";

const html = document.documentElement;
const setSystemDark = (dark) => {
  window.matchMedia = (q) => ({ matches: dark && q.includes("dark"), media: q, addListener() {}, removeListener() {} });
};

afterEach(() => setSystemDark(false));

test("offers exactly Light and Dark", () => {
  render(<ThemeSwitcher />);
  expect(screen.getAllByRole("radio").map((b) => b.textContent)).toEqual(["Light", "Dark"]);
});

test("starts from the system preference when nothing is saved", () => {
  setSystemDark(true);
  render(<ThemeSwitcher />);
  expect(screen.getByRole("radio", { name: "Dark" })).toHaveAttribute("aria-checked", "true");
  expect(html).toHaveAttribute("data-theme", "dark");
});

test("defaults to light when the system has no dark preference", () => {
  render(<ThemeSwitcher />);
  expect(screen.getByRole("radio", { name: "Light" })).toHaveAttribute("aria-checked", "true");
  expect(html).toHaveAttribute("data-theme", "light");
});

test("a saved choice wins over the system preference", () => {
  setSystemDark(true);
  localStorage.setItem("theme", "light");
  render(<ThemeSwitcher />);
  expect(html).toHaveAttribute("data-theme", "light");
});

test("ignores an invalid saved value", () => {
  localStorage.setItem("theme", "purple");
  render(<ThemeSwitcher />);
  expect(html).toHaveAttribute("data-theme", "light");
});

test("clicking a theme applies and remembers it", () => {
  render(<ThemeSwitcher />);
  userEvent.click(screen.getByRole("radio", { name: "Dark" }));
  expect(html).toHaveAttribute("data-theme", "dark");
  expect(localStorage.getItem("theme")).toBe("dark");
  expect(screen.getByRole("radio", { name: "Dark" })).toHaveAttribute("aria-checked", "true");

  userEvent.click(screen.getByRole("radio", { name: "Light" }));
  expect(html).toHaveAttribute("data-theme", "light");
  expect(localStorage.getItem("theme")).toBe("light");
});

test("still works when storage is unavailable", () => {
  const spy = jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  render(<ThemeSwitcher />);
  userEvent.click(screen.getByRole("radio", { name: "Dark" }));
  expect(html).toHaveAttribute("data-theme", "dark");
  spy.mockRestore();
});
