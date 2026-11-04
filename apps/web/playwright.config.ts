import { defineConfig, devices } from "@playwright/test";

// Optional override for environments with a pre-installed Chromium.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.ts",
  // Journeys share one seeded database: run them one at a time.
  fullyParallel: false,
  workers: 1,
  forbidOnly: isCI,
  retries: 0, // serial journeys mutate shared state: a retry would not be meaningful
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
    // Server logs (structured JSON errors) appear in the CI log on failure.
    stdout: "pipe",
    stderr: "pipe",
  },
});
