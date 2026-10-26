import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e", fullyParallel: true, forbidOnly: !!process.env.CI,
  retries: 0, reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:4174",
    trace: "retain-on-failure", launchOptions: { channel: process.env.PLAYWRIGHT_CHANNEL } },
  projects: [
    { name: "desktop", use: { viewport: { width: 1920, height: 1080 } } },
    { name: "laptop", use: { viewport: { width: 1366, height: 768 } } },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL ? undefined : {
    command: "node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 4174",
    url: "http://127.0.0.1:4174", reuseExistingServer: false,
  },
});
