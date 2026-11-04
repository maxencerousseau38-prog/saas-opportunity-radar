import { defineConfig, devices } from "@playwright/test";

// Optional override for environments with a pre-installed Chromium.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.ts",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: executablePath ? { executablePath } : {},
      },
    },
  ],
  webServer: {
    command: "pnpm start",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: !isCI,
    timeout: 60_000,
  },
});
