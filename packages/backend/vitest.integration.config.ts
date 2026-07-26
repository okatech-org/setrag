import { defineConfig } from "vitest/config"

/**
 * Tests d'intégration contre un vrai backend Convex (Docker).
 *
 * Trois différences avec la configuration unitaire :
 *  - environnement Node, pas `edge-runtime` : on parle à un serveur distant ;
 *  - `fileParallelism` désactivé et un seul worker, car le backend est un
 *    état partagé que les tests purgent entre eux ;
 *  - délais généreux, un démarrage de conteneur n'étant pas instantané.
 */
export default defineConfig({
  test: {
    name: "integration",
    environment: "node",
    include: ["integration/**/*.test.ts"],
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
    testTimeout: 180_000,
    hookTimeout: 60_000,
  },
})
