import { defineConfig } from "@playwright/test";
import { RESOLUTIONS } from "../scripts/ui-audit/ui-screenshot-config.js";

const baseURL = process.env.BASE_URL || "http://localhost:8080";

function e2eResolutionProjects() {
  const soak = process.env.E2E_SOAK === "1" || process.env.E2E_SOAK === "true";
  const filter = process.env.E2E_RESOLUTION?.trim() || (soak ? "1920x1080" : "");
  const resolutions = filter
    ? RESOLUTIONS.filter((r) => r.key === filter || r.label === filter)
    : RESOLUTIONS;

  if (filter && resolutions.length === 0) {
    throw new Error(
      `E2E_RESOLUTION "${filter}" is not defined in scripts/ui-audit/ui-screenshot-config.js RESOLUTIONS`
    );
  }

  if (!filter) {
    console.log(`[e2e] running ${resolutions.length} viewport projects (${resolutions.map((r) => r.key).join(", ")})`);
  } else {
    console.log(`[e2e] running viewport project ${resolutions.map((r) => r.key).join(", ")}`);
  }

  return resolutions.map((resolution) => ({
    name: resolution.key,
    use: {
      viewport: { width: resolution.width, height: resolution.height },
    },
    testMatch: soak ? /soak-s\d+.*\.spec\.js$/ : undefined,
  }));
}

export default defineConfig({
  testDir: "../e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  timeout: 180000,
  reporter: "list",
  use: {
    baseURL,
    trace: "on-first-failure",
    screenshot: "only-on-failure",
  },
  projects: e2eResolutionProjects(),
  webServer: {
    command: "npm run dev",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});