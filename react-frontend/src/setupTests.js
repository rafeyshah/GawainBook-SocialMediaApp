import "@testing-library/jest-dom";

// jsdom lacks these browser APIs.
if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
  });
}
if (!URL.createObjectURL) URL.createObjectURL = () => "blob:preview";
if (!URL.revokeObjectURL) URL.revokeObjectURL = () => {};

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});
