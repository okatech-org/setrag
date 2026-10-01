import { defineConfig, devices } from "@playwright/test"

/**
 * Parcours de gestion contre le vrai backend de dev (Convex cloud, données de
 * démonstration). Le serveur Next est celui déjà lancé sur le port 3021 :
 * Playwright le réutilise et n'en démarre pas d'autre.
 *
 *   E2E_REEL=1 bunx playwright test -c playwright.reel.config.ts
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: /\.reel\.spec\.ts$/,
  fullyParallel: true,
  // Un serveur de dev compile à la demande : peu de navigateurs à la fois.
  workers: 3,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  reporter: "list",
  use: {
    baseURL: "http://localhost:3021",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: "bunx next dev --port 3021",
    url: "http://localhost:3021",
    reuseExistingServer: true,
    timeout: 180_000,
  },
})
