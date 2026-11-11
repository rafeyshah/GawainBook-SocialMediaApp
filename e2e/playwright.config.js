// End-to-end tests for GawainBook.
//
//   npm test                              # starts a throwaway local GawainBook (see below)
//   BASE_URL=https://gawainbook.onrender.com E2E_CLEANUP=1 npm test   # against a deployed site
//
// Locally on Windows, PW_CHANNEL=msedge uses the installed Edge instead of
// downloading Chromium.
const { defineConfig, devices } = require("@playwright/test");

const PORT = Number(process.env.E2E_PORT) || 8899;
const external = Boolean(process.env.BASE_URL);

module.exports = defineConfig({
  testDir: "./tests",
  timeout: external ? 180_000 : 60_000,
  expect: { timeout: external ? 30_000 : 10_000 },
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: process.env.BASE_URL || `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], channel: process.env.PW_CHANNEL || undefined } }],
  // A complete app on a temporary database: needs `npm run build` in both
  // Node-Rest-API and react-frontend first.
  webServer: external
    ? undefined
    : {
        command: "node ../Node-Rest-API/dist/scripts/e2eServer.js",
        url: `http://localhost:${PORT}/api/health`,
        env: { E2E_PORT: String(PORT), NODE_ENV: "production" },
        timeout: 120_000,
        reuseExistingServer: !process.env.CI,
        stdout: process.env.E2E_DEBUG ? "pipe" : "ignore",
      },
});
