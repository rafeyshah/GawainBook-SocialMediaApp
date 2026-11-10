import { useEffect, useState } from "react";

const KEY = "theme"; // "light" | "dark"

// Saved choice first; otherwise start from the visitor's OS preference.
const initial = () => {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "light" || v === "dark") return v;
  } catch {
    /* storage unavailable */
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

// Applies the theme as <html data-theme="..."> and remembers the choice.
export default function useTheme() {
  const [theme, setTheme] = useState(initial);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const choose = (value) => {
    setTheme(value);
    try {
      localStorage.setItem(KEY, value);
    } catch {
      /* storage unavailable; applies for this visit only */
    }
  };

  return [theme, choose];
}
