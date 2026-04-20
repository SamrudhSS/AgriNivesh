// Minimal local Playwright config for redirect smoke checks.
module.exports = {
  testDir: "./e2e",
  timeout: 90000,
  retries: 0,
  use: {
    baseURL: "http://127.0.0.1:5500",
    headless: true,
    trace: "off",
  },
  workers: 1,
};
