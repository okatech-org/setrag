import { defineConfig } from "vitest/config"

/**
 * Tests du backend Convex : `edge-runtime` reproduit l'environnement
 * d'exécution des fonctions, et `convex-test` doit être inliné pour charger
 * les modules du dossier `convex/`.
 */
export default defineConfig({
  test: {
    name: "backend",
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test"] } },
    include: ["convex/**/*.test.ts"],
    testTimeout: 20000,
    hookTimeout: 20000,
  },
})
