import { defineConfig } from "@playwright/test";

// Keep the productization lane isolated from the accepted V2 worktree, whose
// retained local preview owns 4173 on the review machine.
const port = Number(process.env.WORKBENCH_PORT ?? "4174");
// PLAYWRIGHT_CHROMIUM_CHANNEL=bundled runs the desktop project on Playwright's bundled Chromium
// (Linux verification containers without Google Chrome); the default stays the reviewed Chrome channel.
const chromiumChannel = process.env.PLAYWRIGHT_CHROMIUM_CHANNEL === "bundled" ? undefined : "chrome";
const chromiumExecutable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
const projectFilter = process.env.PLAYWRIGHT_PROJECTS?.split(",").map((name) => name.trim()).filter(Boolean);

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
    // The canonical desktop project owns reviewed screenshots and print proof.
    // WebKit independently exercises the same desktop product behavior.
    {name: "desktop", use: {browserName: "chromium" as const, channel: chromiumChannel, viewport: {width: 1440, height: 900}, launchOptions: chromiumExecutable ? {executablePath: chromiumExecutable} : undefined}},
    {name: "desktop-webkit", use: {browserName: "webkit" as const, viewport: {width: 1440, height: 900}}},
  ].filter((project) => !projectFilter?.length || projectFilter.includes(project.name)),
  webServer: {
    command: `VITE_MODEL_REVIEW_URL=/api/challenge ./node_modules/.bin/vite --host 127.0.0.1 --port ${port}`,
    port,
    reuseExistingServer: false,
  },
});
