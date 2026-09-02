import { defineConfig } from "@playwright/test";

// Keep the productization lane isolated from the accepted V2 worktree, whose
// retained local preview owns 4173 on the review machine.
const port = Number(process.env.WORKBENCH_PORT ?? "4174");

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  retries: 0,
  reporter: "line",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
  },
  projects: [
    {name: "desktop-chrome", use: {browserName: "chromium", channel: "chrome", viewport: {width: 1440, height: 900}}},
    {name: "desktop-webkit", use: {browserName: "webkit", viewport: {width: 1440, height: 900}}},
  ],
  webServer: {
    command: `VITE_MODEL_REVIEW_URL=/api/challenge ./node_modules/.bin/vite --host 127.0.0.1 --port ${port}`,
    port,
    reuseExistingServer: false,
  },
});
