import axios from "axios";

export const CSRF_COOKIE = "gb_csrf";
export const CSRF_HEADER = "X-CSRF-Token";
const SAFE_METHODS = ["get", "head", "options"];

// Auth endpoints answer 401 as part of their normal job; they must not
// trigger the global "your session ended" handler.
const AUTH_PATHS = ["/auth/me", "/auth/login", "/auth/register", "/auth/logout"];

export function readCookie(name, cookieString = typeof document === "undefined" ? "" : document.cookie) {
  for (const part of cookieString.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) {
      try {
        return decodeURIComponent(rest.join("="));
      } catch {
        return rest.join("=");
      }
    }
  }
  return "";
}

let unauthorizedHandler = null;

// The auth context registers a callback that signs the user out locally
// when the server says the session has ended (expired, logged out elsewhere).
export function onUnauthorized(fn) {
  unauthorizedHandler = fn;
  return () => {
    if (unauthorizedHandler === fn) unauthorizedHandler = null;
  };
}

export function setupHttp(instance = axios, getCookie = readCookie) {
  instance.defaults.baseURL = "/api";
  instance.defaults.withCredentials = true;

  // Double-submit CSRF: copy the server's readable cookie into a header on
  // every state-changing request.
  instance.interceptors.request.use((config) => {
    const method = (config.method || "get").toLowerCase();
    if (!SAFE_METHODS.includes(method)) {
      const token = getCookie(CSRF_COOKIE);
      if (token) {
        config.headers = { ...(config.headers || {}), [CSRF_HEADER]: token };
      }
    }
    return config;
  });

  instance.interceptors.response.use(
    (res) => res,
    (err) => {
      const url = err?.config?.url || "";
      if (err?.response?.status === 401 && !AUTH_PATHS.some((p) => url.startsWith(p)) && unauthorizedHandler) {
        unauthorizedHandler();
      }
      return Promise.reject(err);
    }
  );
  return instance;
}
