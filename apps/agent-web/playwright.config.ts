import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "./e2e",
  // Les parcours contre le vrai backend ont leur propre configuration.
  testIgnore: /\.reel\.spec\.ts$/,
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3101",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: "NEXT_PUBLIC_E2E_MODE=1 bunx next dev --port 3101",
    url: "http://localhost:3101",
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
