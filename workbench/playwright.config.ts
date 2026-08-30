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
    channel: "chrome",
    trace: "retain-on-failure",
  },
  projects: [
    {name: "desktop", use: {viewport: {width: 1440, height: 900}}},
    {name: "mobile", use: {viewport: {width: 390, height: 844}, deviceScaleFactor: 1, isMobile: true, hasTouch: true}},
  ],
  webServer: {
    command: `pnpm dev --host 127.0.0.1 --port ${port}`,
    port,
    reuseExistingServer: false,
  },
});
