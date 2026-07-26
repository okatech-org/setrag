import { convexTest } from "convex-test"
import { describe, expect, it } from "vitest"
import schema from "./schema"
import { modules } from "./test.setup"

/**
 * Vérification de la chaîne d'outillage de test, pas du métier.
 *
 * Ces tests garantissent que l'infrastructure fonctionne de bout en bout :
 * l'environnement `edge-runtime`, le chargement des modules par `convex-test`,
 * la validation du schéma, les index, et l'isolation entre tests. Ils servent
 * de canari : s'ils tombent après une montée de version, le problème est dans
 * l'outillage, pas dans le domaine.
 */

const OWENDO = {
  code: "OWE",
  name: "Owendo",
  province: "Estuaire",
  kilometerPoint: 0,
  isEquipped: true,
  isActive: true,
}

describe("Chaîne d'outillage convex-test", () => {
  it("instancie un backend de test à partir du schéma", () => {
    const t = convexTest(schema, modules)
    expect(t).toBeDefined()
  })

  it("charge bien les modules de fonctions", () => {
    // Garde-fou contre la régression du glob : la documentation Convex
    // propose un motif extglob qui ne résout rien avec Vitest 4 / Vite 7.
    expect(Object.keys(modules).length).toBeGreaterThan(0)
  })

  it("écrit puis relit un document", async () => {
    const t = convexTest(schema, modules)
    const id = await t.run(async (ctx) => ctx.db.insert("stations", OWENDO))
    const station = await t.run(async (ctx) => ctx.db.get(id))
    expect(station?.code).toBe("OWE")
    expect(station?.kilometerPoint).toBe(0)
  })

  it("isole complètement les données entre deux instances de test", async () => {
    const premier = convexTest(schema, modules)
    await premier.run(async (ctx) => ctx.db.insert("stations", OWENDO))

    const second = convexTest(schema, modules)
    const stations = await second.run(async (ctx) =>
      ctx.db.query("stations").collect(),
    )
    expect(stations).toHaveLength(0)
  })

  it("fait respecter le schéma : un document incomplet est rejeté", async () => {
    const t = convexTest(schema, modules)
    await expect(
      t.run(async (ctx) =>
        // @ts-expect-error champs obligatoires volontairement omis
        ctx.db.insert("stations", { code: "XXX" }),
      ),
    ).rejects.toThrow()
  })

  it("fait respecter les énumérations du schéma", async () => {
    const t = convexTest(schema, modules)
    await expect(
      t.run(async (ctx) =>
        ctx.db.insert("trains", {
          number: "TR-999",
          name: "Train inconnu",
          // @ts-expect-error type de train hors énumération
          type: "TGV",
          isActive: true,
        }),
      ),
    ).rejects.toThrow()
  })

  it("exploite les index déclarés dans le schéma", async () => {
    const t = convexTest(schema, modules)
    await t.run(async (ctx) => {
      await ctx.db.insert("stations", OWENDO)
      await ctx.db.insert("stations", {
        code: "BOO",
        name: "Booué",
        province: "Ogooué-Ivindo",
        kilometerPoint: 340,
        isEquipped: true,
        isActive: true,
      })
    })
    const trouvee = await t.run(async (ctx) =>
      ctx.db
        .query("stations")
        .withIndex("by_code", (q) => q.eq("code", "BOO"))
        .unique(),
    )
    expect(trouvee?.name).toBe("Booué")
  })

  it("respecte l'intégrité référentielle des identifiants", async () => {
    const t = convexTest(schema, modules)
    const trainId = await t.run(async (ctx) =>
      ctx.db.insert("trains", {
        number: "TR-201",
        name: "Express Transgabonais",
        type: "EXPRESS",
        isActive: true,
      }),
    )
    const coachId = await t.run(async (ctx) =>
      ctx.db.insert("coaches", {
        trainId,
        label: "V1",
        serviceClass: "DEUXIEME",
        rowCount: 20,
        columnCount: 4,
        seatCount: 80,
        standingCapacity: 20,
        position: 1,
      }),
    )
    const coach = await t.run(async (ctx) => ctx.db.get(coachId))
    expect(coach?.trainId).toBe(trainId)
  })

  it("permet de simuler un utilisateur authentifié", () => {
    const t = convexTest(schema, modules)
    const identifie = t.withIdentity({
      subject: "agent-de-test",
      name: "A. MBOUMBA",
    })
    expect(identifie).toBeDefined()
  })
})
