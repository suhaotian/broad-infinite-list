// playwright.config.ts
import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for BidirectionalList e2e tests.
 *
 * See https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: "./tests",

  // Maximum time one test can run
  timeout: 30000,

  // Run tests in files in parallel
  fullyParallel: true,

  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,

  // Retry on CI only
  retries: process.env.CI ? 2 : 0,

  // Reporter to use
  reporter: [["html"], ["list"]],

  // Shared settings for all the projects below
  use: {
    // Base URL for page.goto('/')
    baseURL: "http://localhost:3002?demo=e2e",

    // Collect trace when retrying the failed test
    trace: "on-first-retry",

    // Screenshot on failure
    screenshot: "only-on-failure",

    // Video on failure
    video: "retain-on-failure",
  },

  // Configure projects for major browsers
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },

    // {
    //   name: "firefox",
    //   use: { ...devices["Desktop Firefox"] },
    // },

    // {
    //   name: "webkit",
    //   use: { ...devices["Desktop Safari"] },
    // },

    // // Test against mobile viewports
    // {
    //   name: "Mobile Chrome",
    //   use: { ...devices["Pixel 5"] },
    // },
    // {
    //   name: "Mobile Safari",
    //   use: { ...devices["iPhone 12"] },
    // },
  ],

  // Run your local dev server before starting the tests
  webServer: {
    command: "bun run dev",
    url: "http://localhost:3002",
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
