import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
/** Points at a server already running (Next refuses a second `next dev` in one folder). */
const EXTERNAL = process.env.E2E_BASE_URL;

/** Browser tests against the real app: `next dev` on its own port, phone and desktop widths. */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: EXTERNAL ?? `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [
    { name: "phone", use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 } } },
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
  ],
  ...(EXTERNAL
    ? {}
    : {
        webServer: {
          command: `next dev -p ${PORT}`,
          url: `http://localhost:${PORT}`,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      }),
});
