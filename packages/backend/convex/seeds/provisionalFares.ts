/**
 * Barèmes PROVISOIRES de démonstration.
 *
 * ⚠️ AUCUNE de ces valeurs ne vient de SETRAG.
 *
 * Le cahier des charges décrit la structure de trois barèmes puis renvoie à
 * des tableaux qui ne sont pas joints au document :
 *   — colis express : sept zones × paliers de poids (annexe 2 §9.8.4) ;
 *   — transport auto accompagné : prix au tonnage (§7.1.4) ;
 *   — transport funéraire : prix au tonnage (§7.1.5) ;
 *   — excédent de bagages : « migration de 8 % » renvoyant à une annexe
 *     absente (§9.8.3).
 *
 * Sans eux, ces quatre produits ne peuvent pas être vendus — ce qui empêche
 * toute démonstration du système. Ce module engendre donc des valeurs
 * plausibles, cohérentes entre elles, dans le seul but de faire fonctionner
 * l'application.
 *
 * Trois garde-fous les rendent impossibles à confondre avec un barème réel :
 *   1. chaque ligne porte `isProvisional: true` en base ;
 *   2. chaque libellé commence par « [PROVISOIRE] » ;
 *   3. le seed émet un avertissement explicite à chaque exécution.
 *
 * À la réception des vrais barèmes : `bunx convex run
 * seeds/provisionalFares:purge` retire toutes ces lignes d'un coup.
 */

import { internalMutation } from "../_generated/server"
import { v } from "convex/values"
import { PARCEL_ZONES } from "../model/fares"

/** Marqueur porté par tous les libellés provisoires. */
export const PROVISIONAL_PREFIX = "[PROVISOIRE]"

/**
 * Nombre de paliers de poids engendrés pour les colis : le régime express
 * plafonne à 100 kg par article, soit dix tranches de 10 kg.
 */
const PARCEL_TIERS = 10

/**
 * Prix de la première tranche de poids, par zone, en francs CFA hors taxes.
 * La progression suit la distance sans lui être proportionnelle : le coût de
 * manutention, identique partout, pèse davantage sur les courtes distances.
 */
const PARCEL_ZONE_BASE = [1500, 2000, 2600, 3100, 3500, 3800, 4000]

/** Incrément par tranche de 10 kg supplémentaire, par zone. */
const PARCEL_ZONE_STEP = [600, 800, 1000, 1150, 1250, 1350, 1400]

/** Prix de la tonne pour un transport auto accompagné, par zone. */
const TAA_ZONE_RATE = [25000, 45000, 62000, 78000, 95000, 110000, 120000]

/** Prix de la tonne pour un transport funéraire, par zone. */
const FUNERAL_ZONE_RATE = [20000, 36000, 50000, 62000, 76000, 88000, 95000]

/** Prix du kilogramme excédentaire de bagage, par zone. */
const BAGGAGE_EXCESS_RATE = [60, 85, 105, 125, 140, 150, 160]

/**
 * Franchise de poids incluse dans les frais d'enregistrement, par zone.
 * Volontairement constante : rien n'indique qu'elle varie avec la distance.
 */
const BAGGAGE_FRANCHISE_KG = 10

/** Une ligne de barème prête à insérer. */
export interface ProvisionalFareRow {
  product: "bagage" | "colis" | "taa" | "funeraire"
  zone: number
  weightTier?: number
  amountHt: number
  franchiseKg?: number
  label: string
}

/** Engendre l'intégralité des barèmes provisoires. */
export function buildProvisionalFares(): ProvisionalFareRow[] {
  const rows: ProvisionalFareRow[] = []

  for (const { zone, minKm, maxKm } of PARCEL_ZONES) {
    const index = zone - 1
    const portee = `zone ${zone} (${minKm}-${maxKm} km)`

    // Colis express : une ligne par palier de poids.
    for (let tier = 1; tier <= PARCEL_TIERS; tier += 1) {
      const min = (tier - 1) * 10 + 1
      const max = tier * 10
      rows.push({
        product: "colis",
        zone,
        weightTier: tier,
        amountHt:
          PARCEL_ZONE_BASE[index]! + (tier - 1) * PARCEL_ZONE_STEP[index]!,
        label: `${PROVISIONAL_PREFIX} Colis express — ${portee}, ${min}-${max} kg`,
      })
    }

    rows.push({
      product: "taa",
      zone,
      amountHt: TAA_ZONE_RATE[index]!,
      label: `${PROVISIONAL_PREFIX} Transport auto accompagné — ${portee}, la tonne`,
    })

    rows.push({
      product: "funeraire",
      zone,
      amountHt: FUNERAL_ZONE_RATE[index]!,
      label: `${PROVISIONAL_PREFIX} Transport funéraire — ${portee}, la tonne`,
    })

    rows.push({
      product: "bagage",
      zone,
      amountHt: BAGGAGE_EXCESS_RATE[index]!,
      franchiseKg: BAGGAGE_FRANCHISE_KG,
      label:
        `${PROVISIONAL_PREFIX} Bagage — ${portee}, kg excédentaire ` +
        `(franchise ${BAGGAGE_FRANCHISE_KG} kg)`,
    })
  }

  return rows
}

/**
 * Pose les barèmes provisoires sur la grille tarifaire active.
 * Idempotent : les lignes provisoires existantes sont remplacées.
 */
export const seed = internalMutation({
  args: { scheduleId: v.optional(v.id("fareSchedules")) },
  handler: async (ctx, args) => {
    const schedule = args.scheduleId
      ? await ctx.db.get(args.scheduleId)
      : await ctx.db
          .query("fareSchedules")
          .withIndex("by_status", (q) => q.eq("status", "actif"))
          .first()
    if (!schedule) {
      throw new Error("Aucune grille tarifaire active : barèmes non posés")
    }

    // Retire les lignes provisoires précédentes, sans toucher aux vraies.
    const existing = await ctx.db
      .query("ancillaryFares")
      .withIndex("by_schedule_product", (q) =>
        q.eq("scheduleId", schedule._id),
      )
      .collect()
    let removed = 0
    for (const row of existing) {
      if (row.isProvisional === true) {
        await ctx.db.delete(row._id)
        removed += 1
      }
    }

    const rows = buildProvisionalFares()
    for (const row of rows) {
      await ctx.db.insert("ancillaryFares", {
        scheduleId: schedule._id,
        product: row.product,
        zone: row.zone,
        weightTier: row.weightTier,
        amountHt: row.amountHt,
        franchiseKg: row.franchiseKg,
        label: row.label,
        isProvisional: true,
      })
    }

    return {
      inserted: rows.length,
      replaced: removed,
      byProduct: rows.reduce<Record<string, number>>((acc, r) => {
        acc[r.product] = (acc[r.product] ?? 0) + 1
        return acc
      }, {}),
      warning:
        `${rows.length} lignes de barème PROVISOIRE posées. Ces montants ` +
        `NE VIENNENT PAS DE SETRAG : ils rendent la démonstration possible ` +
        `mais ne doivent jamais servir à facturer un client. Les retirer ` +
        `avec « bunx convex run seeds/provisionalFares:purge » dès réception ` +
        `des barèmes officiels.`,
    }
  },
})

/**
 * Retire tous les barèmes provisoires.
 * À exécuter dès que les barèmes officiels sont chargés.
 */
export const purge = internalMutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("ancillaryFares").collect()
    let removed = 0
    for (const row of rows) {
      if (row.isProvisional === true) {
        await ctx.db.delete(row._id)
        removed += 1
      }
    }
    return { removed }
  },
})

/** Inventaire des barèmes en place, provisoires et définitifs. */
export const audit = internalMutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("ancillaryFares").collect()
    const provisional = rows.filter((r) => r.isProvisional === true)
    return {
      total: rows.length,
      provisional: provisional.length,
      definitive: rows.length - provisional.length,
      productsStillProvisional: [
        ...new Set(provisional.map((r) => r.product)),
      ].sort(),
    }
  },
})
