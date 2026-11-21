import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";
import { BROWSER_PORT } from "./browser/port";

// CI installs the browser Playwright pins. Locally a matching download may be absent, so a
// preinstalled Chromium is used when its path is given or found at the usual location.
const LOCAL_CHROMIUM = "/opt/pw-browsers/chromium";
const executablePath =
  process.env.IDG_CHROMIUM_PATH ?? (existsSync(LOCAL_CHROMIUM) ? LOCAL_CHROMIUM : undefined);

export default defineConfig({
  testDir: "browser",
  testMatch: "**/*.browser.ts",
  globalSetup: "./browser/global-setup.ts",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://127.0.0.1:${String(BROWSER_PORT)}`,
    trace: "off",
    launchOptions: executablePath === undefined ? {} : { executablePath },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
