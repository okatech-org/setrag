import { convexTest, type TestConvex } from "convex-test"
import { describe, expect, it } from "vitest"

import { api } from "../_generated/api"
import type { AppRole } from "../model/permissions"
import schema from "../schema"
import { modules } from "../test.setup"

type T = TestConvex<typeof schema>

async function agent(t: T, role: AppRole) {
  const authId = `${role}-${Math.floor(Math.random() * 1e9)}`
  await t.run((ctx) =>
    ctx.db.insert("users", { authId, firstName: "Agent", lastName: role, role, identitySource: "annuaire", isActive: true })
  )
  return t.withIdentity({ subject: authId })
}

describe("Préférences du portail agent", () => {
  it("garde les réglages par défaut tant que l'agent n'a rien changé", async () => {
    const t = convexTest(schema, modules)
    const vendeuse = await agent(t, "vendeur_guichet")
    expect(await vendeuse.query(api.functions.preferences.mesPreferences, {})).toEqual({
      raccourcisActifs: true,
      afficherTouches: true,
      touches: {},
      personnalise: false,
    })
  })

  it("enregistre les touches de l'agent, et seulement les siennes", async () => {
    const t = convexTest(schema, modules)
    const vendeuse = await agent(t, "vendeur_guichet")
    const collegue = await agent(t, "vendeur_guichet")
    await vendeuse.mutation(api.functions.preferences.enregistrerRaccourcis, {
      raccourcisActifs: true,
      afficherTouches: false,
      touches: { "/vente/billet": "V", "/vente/caisse": null },
    })
    expect(await vendeuse.query(api.functions.preferences.mesPreferences, {})).toMatchObject({
      afficherTouches: false,
      touches: { "/vente/billet": "v", "/vente/caisse": null },
      personnalise: true,
    })
    expect(await collegue.query(api.functions.preferences.mesPreferences, {})).toMatchObject({ personnalise: false })
  })

  it("refuse une touche prise deux fois ou qui n'est ni une lettre ni un chiffre", async () => {
    const t = convexTest(schema, modules)
    const vendeuse = await agent(t, "vendeur_guichet")
    const enregistrer = (touches: Record<string, string | null>) =>
      vendeuse.mutation(api.functions.preferences.enregistrerRaccourcis, { raccourcisActifs: true, afficherTouches: true, touches })
    await expect(enregistrer({ "/vente/billet": "b", "/vente/bagage": "B" })).rejects.toThrow(/déjà prise/)
    await expect(enregistrer({ "/vente/billet": "Entrée" })).rejects.toThrow(/lettre ou un chiffre/)
    await expect(enregistrer({ "/vente/billet": "?" })).rejects.toThrow(/lettre ou un chiffre/)
  })

  it("revient aux réglages par défaut", async () => {
    const t = convexTest(schema, modules)
    const vendeuse = await agent(t, "vendeur_guichet")
    await vendeuse.mutation(api.functions.preferences.enregistrerRaccourcis, {
      raccourcisActifs: false,
      afficherTouches: true,
      touches: { "/vente/billet": "v" },
    })
    await vendeuse.mutation(api.functions.preferences.reinitialiserRaccourcis, {})
    expect(await vendeuse.query(api.functions.preferences.mesPreferences, {})).toMatchObject({ raccourcisActifs: true, touches: {}, personnalise: false })
  })
})
