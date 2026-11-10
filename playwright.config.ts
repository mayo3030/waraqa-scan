import { defineConfig } from "@playwright/test";

// End-to-end tests run against the VITE_E2E build (npm run build:e2e), where the
// in-app updater talks to a stand-in so the update screens work in a browser.
export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : 3,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["json", { outputFile: "e2e-results.json" }]],
  use: {
    baseURL: "http://localhost:4174",
    viewport: { width: 390, height: 844 },
    colorScheme: "dark",
    permissions: ["camera"],
    acceptDownloads: true,
    // CHROME_PATH points at an installed Chrome (CI and local). Without it, Playwright's own Chromium is used.
    channel: process.env.CHROME_PATH ? undefined : "chromium",
    launchOptions: {
      executablePath: process.env.CHROME_PATH || undefined,
      args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
    },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npx vite preview --outDir dist-e2e --port 4174 --strictPort",
    url: "http://localhost:4174",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
