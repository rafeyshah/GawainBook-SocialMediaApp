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

// The notification bell polls the API from the top bar on every page. Page
// tests stub it so their axios mocks only see the page's own requests; the
// bell has its own tests (which use the real component).
jest.mock("./components/notifications/NotificationBell", () => () => <button type="button">Notifications</button>);
