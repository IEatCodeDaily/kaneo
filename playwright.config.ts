import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "https://kaneo.entelechia.cloud";

export default defineConfig({
  testDir: "./tests/e2e/specs",
  outputDir: "./tests/e2e/.artifacts",
  // Provider-backed flows (GitHub mirror sync) are slower than pure local UI.
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  // Serial: specs mutate shared GitHub fixtures and Kaneo task links.
  workers: 1,
  reporter: process.env.CI
    ? [["github"], ["list"], ["html", { outputFolder: "tests/e2e/.report", open: "never" }]]
    : [["list"], ["html", { outputFolder: "tests/e2e/.report", open: "never" }]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL,
    storageState: "tests/e2e/.auth/user.json",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 20_000,
    navigationTimeout: 45_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
