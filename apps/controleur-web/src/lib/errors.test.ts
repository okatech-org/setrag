import { describe, expect, it } from "vitest"

import { humanError } from "./errors"

/**
 * Un motif d'échec est lu par un contrôleur, pas par un développeur. Ces
 * tests fixent ce qui doit rester à l'écran d'un terminal.
 */
describe("Messages d'erreur", () => {
  it("réduit une erreur Convex à son motif métier", () => {
    const brut =
      "[CONVEX M(functions/control:syncSale)] [Request ID: abc123] Server Error\n" +
      "Uncaught Error: Aucune session de caisse ouverte : vente impossible\n" +
      "    at performSale (../convex/functions/sales.ts:219:15)"
    expect(humanError(new Error(brut))).toBe(
      "Aucune session de caisse ouverte : vente impossible"
    )
  })

  it("laisse intact un message déjà lisible", () => {
    expect(humanError(new Error("Réseau perdu au lot 7"))).toBe(
      "Réseau perdu au lot 7"
    )
  })

  it("ne rend jamais une chaîne vide", () => {
    expect(humanError(undefined)).toBe("Erreur inconnue")
    expect(humanError(new Error(""))).toBe("Erreur inconnue")
  })
})
