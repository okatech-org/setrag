import { convexTest } from "convex-test"
import { describe, expect, it } from "vitest"
import { internal } from "../_generated/api"
import schema from "../schema"
import { modules } from "../test.setup"
import { computeTicketFare, type FareSchedule } from "../model/fares"

/**
 * Tests de l'amorçage du référentiel.
 *
 * L'enjeu n'est pas seulement que le seed s'exécute : c'est qu'il produise un
 * réseau cohérent, que le rejouer ne duplique rien, et que la grille
 * tarifaire amorcée reproduise exactement les prix de l'annexe 2 du CDC.
 */

describe("seed du référentiel — première exécution", () => {
  it("crée les 23 gares de la ligne", async () => {
    const t = convexTest(schema, modules)
    const rapport = await t.mutation(internal.seeds.referential.run, {})
    expect(rapport.stations.created).toBe(23)

    const gares = await t.run(async (ctx) => ctx.db.query("stations").collect())
    expect(gares).toHaveLength(23)
  })

  it("ouvre un point de vente sur chaque gare équipée, et seulement là", async () => {
    const t = convexTest(schema, modules)
    const rapport = await t.mutation(internal.seeds.referential.run, {})

    // Le CDC annonce 19 gares opérationnelles sur 22 à équiper.
    expect(rapport.pointsOfSale.created).toBe(19)

    const gares = await t.run(async (ctx) => ctx.db.query("stations").collect())
    const equipees = gares.filter((g) => g.isEquipped)
    expect(equipees).toHaveLength(19)

    const pdv = await t.run(async (ctx) =>
      ctx.db.query("pointsOfSale").collect(),
    )
    expect(pdv).toHaveLength(19)
    for (const p of pdv) {
      expect(p.type).toBe("gare")
      expect(p.stationId).toBeDefined()
    }
  })

  it("ordonne les gares d'Owendo à Franceville sans PK en double", async () => {
    const t = convexTest(schema, modules)
    await t.mutation(internal.seeds.referential.run, {})

    const gares = await t.run(async (ctx) =>
      ctx.db.query("stations").withIndex("by_kilometerPoint").collect(),
    )
    expect(gares[0]?.code).toBe("OWE")
    expect(gares[0]?.kilometerPoint).toBe(0)
    expect(gares[gares.length - 1]?.code).toBe("FCV")
    expect(gares[gares.length - 1]?.kilometerPoint).toBe(648)

    // Strictement croissant : indispensable au calcul de distance.
    for (let i = 1; i < gares.length; i += 1) {
      expect(gares[i]!.kilometerPoint).toBeGreaterThan(
        gares[i - 1]!.kilometerPoint,
      )
    }
    const codes = gares.map((g) => g.code)
    expect(new Set(codes).size).toBe(codes.length)
  })

  it("crée les deux compositions et toutes leurs places", async () => {
    const t = convexTest(schema, modules)
    const rapport = await t.mutation(internal.seeds.referential.run, {})

    expect(rapport.trains.created).toBe(2)
    expect(rapport.coaches.created).toBe(10)
    // TR-201 : 32 VIP + 96 1re + 240 2e = 368 ; TR-202 : 48 + 264 = 312.
    expect(rapport.seats.created).toBe(680)

    const places = await t.run(async (ctx) => ctx.db.query("seats").collect())
    expect(places).toHaveLength(680)
  })

  it("engendre des libellés de place uniques par voiture", async () => {
    const t = convexTest(schema, modules)
    await t.mutation(internal.seeds.referential.run, {})

    const voitures = await t.run(async (ctx) =>
      ctx.db.query("coaches").collect(),
    )
    for (const voiture of voitures) {
      const places = await t.run(async (ctx) =>
        ctx.db
          .query("seats")
          .withIndex("by_coach", (q) => q.eq("coachId", voiture._id))
          .collect(),
      )
      expect(places).toHaveLength(voiture.seatCount)
      expect(new Set(places.map((p) => p.label)).size).toBe(places.length)
    }
  })

  it("signale explicitement les points kilométriques interpolés", async () => {
    const t = convexTest(schema, modules)
    const rapport = await t.mutation(internal.seeds.referential.run, {})
    const avertissement = rapport.warnings.find((w) =>
      w.includes("kilométrique INTERPOLÉ"),
    )
    expect(avertissement).toBeDefined()
    expect(avertissement).toContain("21 gares sur 23")
  })

  it("journalise l'amorçage", async () => {
    const t = convexTest(schema, modules)
    await t.mutation(internal.seeds.referential.run, {})
    const logs = await t.run(async (ctx) => ctx.db.query("auditLogs").collect())
    expect(logs.some((l) => l.action === "seed.referentiel")).toBe(true)
  })
})

describe("seed du référentiel — idempotence", () => {
  it("rejouer le seed ne duplique rien", async () => {
    const t = convexTest(schema, modules)
    await t.mutation(internal.seeds.referential.run, {})
    const second = await t.mutation(internal.seeds.referential.run, {})

    expect(second.stations.created).toBe(0)
    expect(second.stations.updated).toBe(23)
    expect(second.trains.created).toBe(0)
    expect(second.coaches.created).toBe(0)
    expect(second.coaches.skipped).toBe(10)
    expect(second.seats.created).toBe(0)

    const [gares, trains, voitures, places, pdv] = await t.run(async (ctx) =>
      Promise.all([
        ctx.db.query("stations").collect(),
        ctx.db.query("trains").collect(),
        ctx.db.query("coaches").collect(),
        ctx.db.query("seats").collect(),
        ctx.db.query("pointsOfSale").collect(),
      ]),
    )
    expect(gares).toHaveLength(23)
    expect(trains).toHaveLength(2)
    expect(voitures).toHaveLength(10)
    expect(places).toHaveLength(680)
    expect(pdv).toHaveLength(19)
  })

  it("ne recrée pas une grille tarifaire déjà active", async () => {
    const t = convexTest(schema, modules)
    await t.mutation(internal.seeds.referential.run, {})
    const second = await t.mutation(internal.seeds.referential.run, {})

    expect(second.fareSchedule).toContain("déjà en place")
    const grilles = await t.run(async (ctx) =>
      ctx.db.query("fareSchedules").collect(),
    )
    expect(grilles).toHaveLength(1)
  })

  it("ne crée qu'un seul compte de service, même après plusieurs passages", async () => {
    const t = convexTest(schema, modules)
    await t.mutation(internal.seeds.referential.run, {})
    await t.mutation(internal.seeds.referential.run, {})
    const comptes = await t.run(async (ctx) =>
      ctx.db
        .query("users")
        .withIndex("by_authId", (q) => q.eq("authId", "seed-service-account"))
        .collect(),
    )
    expect(comptes).toHaveLength(1)
    expect(comptes[0]?.role).toBe("admin_fonctionnel")
  })
})

describe("Grille tarifaire amorcée", () => {
  it("reproduit les sept bases kilométriques de l'annexe 2", async () => {
    const t = convexTest(schema, modules)
    await t.mutation(internal.seeds.referential.run, {})

    const bases = await t.run(async (ctx) => ctx.db.query("fareBases").collect())
    expect(bases).toHaveLength(7)

    const express2e = bases.find(
      (b) => b.trainType === "EXPRESS" && b.serviceClass === "DEUXIEME",
    )
    expect(express2e?.shortDistanceRate).toBe(47.51)
    expect(express2e?.longDistanceRate).toBe(43.42)

    const expressVip = bases.find(
      (b) => b.trainType === "EXPRESS" && b.serviceClass === "VIP",
    )
    expect(expressVip?.shortDistanceRate).toBe(72.38)
    expect(expressVip?.longDistanceRate).toBe(62.16)
  })

  it("ne commercialise pas la classe VIP en OMNIBUS", async () => {
    const t = convexTest(schema, modules)
    await t.mutation(internal.seeds.referential.run, {})
    const bases = await t.run(async (ctx) => ctx.db.query("fareBases").collect())
    expect(
      bases.some((b) => b.trainType === "OMNIBUS" && b.serviceClass === "VIP"),
    ).toBe(false)
  })

  it("active les réductions arrêtées et neutralise les tarifs en projet", async () => {
    const t = convexTest(schema, modules)
    await t.mutation(internal.seeds.referential.run, {})

    const reductions = await t.run(async (ctx) =>
      ctx.db.query("discounts").collect(),
    )
    const actives = reductions.filter((r) => r.isActive)
    expect(actives.map((r) => r.code).sort()).toEqual([
      "ENFANT",
      "GROUPE_10_49",
      "GROUPE_50_PLUS",
      "MILITAIRE",
    ])

    const enfant = reductions.find((r) => r.code === "ENFANT")
    expect(enfant?.ratePct).toBe(50)
    expect(enfant?.minAge).toBe(4)
    expect(enfant?.maxAge).toBe(11)

    // Les tarifs en projet existent mais à 0 % et désactivés.
    for (const code of ["WEEKEND", "ETUDIANT", "TROISIEME_AGE", "PROMOTIONNEL"]) {
      const r = reductions.find((d) => d.code === code)
      expect(r?.isActive).toBe(false)
      expect(r?.ratePct).toBe(0)
    }
  })

  it("pose les barèmes provisoires nécessaires à la démonstration", async () => {
    const t = convexTest(schema, modules)
    const rapport = await t.mutation(internal.seeds.referential.run, {})

    // Les frais d'enregistrement (490 / 700 F HT) sont fixés par le CDC et
    // calculés en code : ils ne figurent PAS dans la grille tabulaire, dont
    // le champ « zone » désigne sans ambiguïté une zone kilométrique.
    const grille = await t.run(async (ctx) =>
      ctx.db.query("ancillaryFares").collect(),
    )
    expect(grille.length).toBe(rapport.provisionalFares)
    expect(grille.every((f) => f.isProvisional === true)).toBe(true)
    expect(grille.every((f) => f.label.startsWith("[PROVISOIRE]"))).toBe(true)
  })

  it("permet de désactiver les barèmes provisoires", async () => {
    const t = convexTest(schema, modules)
    const rapport = await t.mutation(internal.seeds.referential.run, {
      includeProvisionalFares: false,
    })
    expect(rapport.provisionalFares).toBe(0)
    const grille = await t.run(async (ctx) =>
      ctx.db.query("ancillaryFares").collect(),
    )
    expect(grille).toHaveLength(0)
  })

  it("avertit que les barèmes provisoires ne viennent pas de SETRAG", async () => {
    const t = convexTest(schema, modules)
    const rapport = await t.mutation(internal.seeds.referential.run, {})
    const avertissement = rapport.warnings.find((w) =>
      w.includes("PROVISOIRE"),
    )
    expect(avertissement).toContain("NE VIENNENT PAS DE SETRAG")
    expect(avertissement).toContain("purge")
  })

  it("la grille amorcée produit les prix attendus du réseau", async () => {
    const t = convexTest(schema, modules)
    await t.mutation(internal.seeds.referential.run, {})

    const [grille, bases] = await t.run(async (ctx) =>
      Promise.all([
        ctx.db.query("fareSchedules").first(),
        ctx.db.query("fareBases").collect(),
      ]),
    )

    const schedule: FareSchedule = {
      taxes: { vatPct: grille!.vatPct, cssPct: grille!.cssPct },
      roundingBasis: grille!.roundingBasis,
      bases: bases.map((b) => ({
        trainType: b.trainType,
        serviceClass: b.serviceClass,
        shortDistanceRate: b.shortDistanceRate,
        longDistanceRate: b.longDistanceRate,
      })),
    }

    // Owendo → Franceville, 648 km, EXPRESS 2e : 648 × 43,42 arrondi au 100 F.
    const prix = computeTicketFare({
      schedule: { ...schedule, taxes: { vatPct: 0, cssPct: 0 } },
      trainType: "EXPRESS",
      serviceClass: "DEUXIEME",
      distanceKm: 648,
    })
    expect(prix.ttc).toBe(28100)
  })
})

describe("Purge du référentiel", () => {
  it("vide les tables amorcées", async () => {
    const t = convexTest(schema, modules)
    await t.mutation(internal.seeds.referential.run, {})
    const supprimes = await t.mutation(internal.seeds.referential.reset, {})

    expect(supprimes.stations).toBe(23)
    expect(supprimes.seats).toBe(680)

    const gares = await t.run(async (ctx) => ctx.db.query("stations").collect())
    expect(gares).toHaveLength(0)
  })

  it("refuse la purge si des ventes existent", async () => {
    const t = convexTest(schema, modules)
    await t.mutation(internal.seeds.referential.run, {})

    await t.run(async (ctx) => {
      await ctx.db.insert("sales", {
        number: "V-1",
        kind: "vente",
        product: "billet",
        channel: "guichet",
        status: "confirmee",
        amounts: { ht: 100, vat: 18, css: 0, ttc: 118, received: 118 },
        soldAt: Date.now(),
      })
    })

    await expect(
      t.mutation(internal.seeds.referential.reset, {}),
    ).rejects.toThrow(/purge refusée/)
  })
})
