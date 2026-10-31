import { defineConfig } from "@playwright/test";

/**
 * e2e against the full local stack on a Base fork (scripts/local-stack.sh): anvil + our contracts, the
 * indexer and the web app. Reuses a running stack if one is up on :3000.
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 240_000,
  expect: { timeout: 60_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:3000", trace: "retain-on-failure" },
  webServer: {
    command: "bash ../../scripts/local-stack.sh",
    url: "http://localhost:3000/api/indexer/stats",
    reuseExistingServer: true,
    timeout: 300_000,
  },
});
