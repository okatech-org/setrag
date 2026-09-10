import path from "node:path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    exclude: ["e2e/**", "node_modules/**", ".next/**"],
    // Node ≥ 22 expose un `localStorage` natif expérimental qui masque celui
    // de jsdom (sans `clear()`) : on le désactive dans les workers de test.
    execArgv: ["--no-experimental-webstorage"],
  },
})
