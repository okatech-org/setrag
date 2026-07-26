import { convexTest } from "convex-test"
import { describe, expect, it } from "vitest"
import { internal } from "../_generated/api"
import schema from "../schema"
import { modules } from "../test.setup"
import {
  PROVISIONAL_PREFIX,
  buildProvisionalFares,
} from "./provisionalFares"
import { computeParcelItemFare, computeTonnageFare } from "../model/ancillary"
import { PARCEL_ZONES } from "../model/fares"

/**
 * Barèmes provisoires de démonstration.
 *
 * L'enjeu de ces tests n'est pas l'exactitude des montants — ils sont
 * inventés — mais leur TRAÇABILITÉ : ils doivent être impossibles à
 * confondre avec un barème officiel, et retirables d'un seul geste.
 */

describe("Génération des barèmes provisoires", () => {
  it("couvre les sept zones pour les quatre produits concernés", () => {
    const rows = buildProvisionalFares()
    for (const { zone } of PARCEL_ZONES) {
      for (const product of ["colis", "taa", "funeraire", "bagage"] as const) {
        const zoneRows = rows.filter(
          (r) => r.zone === zone && r.product === product,
        )
        expect(zoneRows.length).toBeGreaterThan(0)
      }
    }
  })

  it("engendre dix paliers de poids par zone pour les colis", () => {
    const rows = buildProvisionalFares()
    for (const { zone } of PARCEL_ZONES) {
      const paliers = rows
        .filter((r) => r.product === "colis" && r.zone === zone)
        .map((r) => r.weightTier)
        .sort((a, b) => a! - b!)
      expect(paliers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    }
  })

  it("marque CHAQUE libellé comme provisoire", () => {
    const rows = buildProvisionalFares()
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(row.label.startsWith(PROVISIONAL_PREFIX)).toBe(true)
    }
  })

  it("produit des montants strictement croissants avec le poids", () => {
    const rows = buildProvisionalFares()
    for (const { zone } of PARCEL_ZONES) {
      const paliers = rows
        .filter((r) => r.product === "colis" && r.zone === zone)
        .sort((a, b) => a.weightTier! - b.weightTier!)
      for (let i = 1; i < paliers.length; i += 1) {
        expect(paliers[i]!.amountHt).toBeGreaterThan(paliers[i - 1]!.amountHt)
      }
    }
  })

  it("produit des montants croissants avec la distance", () => {
    const rows = buildProvisionalFares()
    const prixTier1 = PARCEL_ZONES.map(
      ({ zone }) =>
        rows.find(
          (r) => r.product === "colis" && r.zone === zone && r.weightTier === 1,
        )!.amountHt,
    )
    for (let i = 1; i < prixTier1.length; i += 1) {
      expect(prixTier1[i]!).toBeGreaterThan(prixTier1[i - 1]!)
    }
  })

  it("place le transport funéraire sous le transport auto accompagné", () => {
    const rows = buildProvisionalFares()
    for (const { zone } of PARCEL_ZONES) {
      const taa = rows.find((r) => r.product === "taa" && r.zone === zone)!
      const fun = rows.find((r) => r.product === "funeraire" && r.zone === zone)!
      expect(fun.amountHt).toBeLessThan(taa.amountHt)
    }
  })

  it("attache une franchise aux lignes de bagage", () => {
    const rows = buildProvisionalFares()
    for (const row of rows.filter((r) => r.product === "bagage")) {
      expect(row.franchiseKg).toBe(10)
      expect(row.amountHt).toBeGreaterThan(0)
    }
  })
})

describe("Pose et retrait en base", () => {
  async function withSchedule(t: ReturnType<typeof convexTest>) {
    return await t.run(async (ctx) => {
      const adminId = await ctx.db.insert("users", {
        authId: "admin",
        role: "admin_fonctionnel",
        identitySource: "local",
        isActive: true,
      })
      return await ctx.db.insert("fareSchedules", {
        label: "Grille de test",
        status: "actif",
        validFrom: 0,
        validUntil: Date.now() + 86_400_000,
        roundingBasis: "TTC",
        vatPct: 18,
        cssPct: 0,
        createdBy: adminId,
      })
    })
  }

  it("pose toutes les lignes en les marquant provisoires", async () => {
    const t = convexTest(schema, modules)
    await withSchedule(t)
    const r = await t.mutation(internal.seeds.provisionalFares.seed, {})

    expect(r.inserted).toBe(buildProvisionalFares().length)
    expect(r.byProduct.colis).toBe(70)
    expect(r.byProduct.taa).toBe(7)
    expect(r.byProduct.funeraire).toBe(7)
    expect(r.byProduct.bagage).toBe(7)

    const rows = await t.run(async (c) =>
      c.db.query("ancillaryFares").collect(),
    )
    expect(rows.every((row) => row.isProvisional === true)).toBe(true)
  })

  it("avertit explicitement de la nature provisoire", async () => {
    const t = convexTest(schema, modules)
    await withSchedule(t)
    const r = await t.mutation(internal.seeds.provisionalFares.seed, {})
    expect(r.warning).toContain("NE VIENNENT PAS DE SETRAG")
    expect(r.warning).toContain("purge")
  })

  it("est idempotent : rejouer remplace au lieu d'accumuler", async () => {
    const t = convexTest(schema, modules)
    await withSchedule(t)
    await t.mutation(internal.seeds.provisionalFares.seed, {})
    const second = await t.mutation(internal.seeds.provisionalFares.seed, {})

    expect(second.replaced).toBe(second.inserted)
    const rows = await t.run(async (c) =>
      c.db.query("ancillaryFares").collect(),
    )
    expect(rows).toHaveLength(second.inserted)
  })

  it("la purge retire les provisoires et épargne les définitifs", async () => {
    const t = convexTest(schema, modules)
    const scheduleId = await withSchedule(t)
    await t.mutation(internal.seeds.provisionalFares.seed, {})

    // Une ligne officielle, sans le marqueur.
    await t.run(async (c) =>
      c.db.insert("ancillaryFares", {
        scheduleId,
        product: "colis",
        zone: 1,
        weightTier: 1,
        amountHt: 9999,
        label: "Barème officiel SETRAG",
      }),
    )

    const r = await t.mutation(internal.seeds.provisionalFares.purge, {})
    expect(r.removed).toBe(buildProvisionalFares().length)

    const restants = await t.run(async (c) =>
      c.db.query("ancillaryFares").collect(),
    )
    expect(restants).toHaveLength(1)
    expect(restants[0]?.label).toBe("Barème officiel SETRAG")
  })

  it("l'inventaire distingue provisoires et définitifs", async () => {
    const t = convexTest(schema, modules)
    const scheduleId = await withSchedule(t)
    await t.mutation(internal.seeds.provisionalFares.seed, {})
    await t.run(async (c) =>
      c.db.insert("ancillaryFares", {
        scheduleId,
        product: "bagage",
        zone: 1,
        amountHt: 50,
        label: "Officiel",
      }),
    )

    const bilan = await t.mutation(internal.seeds.provisionalFares.audit, {})
    expect(bilan.provisional).toBe(buildProvisionalFares().length)
    expect(bilan.definitive).toBe(1)
    expect(bilan.productsStillProvisional).toEqual([
      "bagage",
      "colis",
      "funeraire",
      "taa",
    ])
  })

  it("refuse de poser sans grille tarifaire active", async () => {
    const t = convexTest(schema, modules)
    await expect(
      t.mutation(internal.seeds.provisionalFares.seed, {}),
    ).rejects.toThrow(/Aucune grille tarifaire active/)
  })
})

describe("Les barèmes provisoires rendent les produits vendables", () => {
  const grid = buildProvisionalFares().map((r) => ({
    product: r.product,
    zone: r.zone,
    weightTier: r.weightTier,
    amountHt: r.amountHt,
    franchiseKg: r.franchiseKg,
    label: r.label,
    isProvisional: true,
  }))

  it("un colis se tarife sur toute la ligne, dans toutes les zones", () => {
    for (const { zone, minKm, maxKm } of PARCEL_ZONES) {
      const distance = Math.floor((minKm + maxKm) / 2)
      const r = computeParcelItemFare({ distanceKm: distance, weightKg: 15, grid })
      expect(r.zone).toBe(zone)
      expect(r.totalHt).toBeGreaterThan(0)
    }
  })

  it("un colis de 100 kg, palier maximal, reste tarifable", () => {
    const r = computeParcelItemFare({ distanceKm: 648, weightKg: 100, grid })
    expect(r.weightTier).toBe(10)
    expect(r.totalHt).toBeGreaterThan(0)
  })

  it("les transports au tonnage se tarifent sur toute la ligne", () => {
    for (const { minKm, maxKm } of PARCEL_ZONES) {
      const distance = Math.floor((minKm + maxKm) / 2)
      for (const product of ["taa", "funeraire"] as const) {
        const r = computeTonnageFare({
          product,
          distanceKm: distance,
          tonnage: 1.4,
          grid,
        })
        expect(r.totalHt).toBeGreaterThan(0)
      }
    }
  })
})
