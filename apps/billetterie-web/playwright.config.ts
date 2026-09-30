import { defineConfig, devices } from "@playwright/test"

/**
 * Parcours de bout en bout sur le backend Convex de développement.
 *
 * `E2E_URL` vise un serveur déjà lancé (par exemple `bun run dev`) ; sans lui,
 * Playwright démarre un serveur dédié, avec son propre dossier de build pour
 * ne pas écraser celui du serveur de développement.
 */
const URL_EXTERNE = process.env.E2E_URL

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  reporter: "list",
  timeout: 60_000,
  use: {
    baseURL: URL_EXTERNE ?? "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: URL_EXTERNE
    ? undefined
    : {
        command: "NEXT_DIST_DIR=.next-e2e bunx next dev --port 3100",
        url: "http://127.0.0.1:3100",
        reuseExistingServer: true,
        timeout: 180_000,
      },
})
