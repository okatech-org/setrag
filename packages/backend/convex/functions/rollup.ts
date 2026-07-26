import { v } from "convex/values"
import { internalMutation } from "../_generated/server"
import type { Doc, Id, DataModel } from "../_generated/dataModel"
import type { GenericMutationCtx } from "convex/server"
import { absAmounts, loadFactor, type SegmentLoad } from "../model/kpi"

/**
 * Calcul des cumuls d'indicateurs.
 *
 * Déclenché à la clôture d'une journée comptable, et rejouable à l'identique :
 * un recalcul remplace les lignes existantes au lieu de s'y ajouter. C'est ce
 * qui permet de reprendre une journée après correction sans dédoubler les
 * chiffres — et de reconstruire tout l'historique si la définition d'un
 * indicateur change.
 *
 * Les cumuls ne sont jamais la source de vérité : ils se recalculent à partir
 * des ventes, qui elles le sont. Une divergence se corrige en relançant.
 */

type Ctx = GenericMutationCtx<DataModel>

/* ══════════════════════════ Cumuls journaliers ═════════════════════════ */

/** Clé de regroupement d'un cumul journalier. */
function bucketKey(sale: Doc<"sales">): string {
  return `${sale.pointOfSaleId ?? "-"}|${sale.channel}|${sale.product}`
}

interface Bucket {
  pointOfSaleId?: Id<"pointsOfSale">
  channel: Doc<"sales">["channel"]
  product: Doc<"sales">["product"]
  salesCount: number
  ticketCount: number
  cancelledCount: number
  refundedCount: number
  grossHt: number
  grossVat: number
  grossCss: number
  grossTtc: number
  grossReceived: number
  refundedHt: number
  refundedVat: number
  refundedCss: number
  refundedTtc: number
  refundedReceived: number
}

export const rollupAccountingDay = internalMutation({
  args: { accountingDayId: v.id("accountingDays") },
  handler: async (ctx, args) => {
    const day = await ctx.db.get(args.accountingDayId)
    if (!day) throw new Error("Journée comptable introuvable")
    return await rollupDay(ctx, day)
  },
})

/* ═══════════════════════ Remplissage d'une desserte ════════════════════ */

export const rollupTrip = internalMutation({
  args: { tripId: v.id("trips") },
  handler: async (ctx, args) => {
    const trip = await ctx.db.get(args.tripId)
    if (!trip) throw new Error("Desserte introuvable")

    const stops = (
      await ctx.db
        .query("tripStops")
        .withIndex("by_trip_sequence", (q) => q.eq("tripId", args.tripId))
        .collect()
    ).sort((a, b) => a.sequence - b.sequence)

    // Longueur de chaque tronçon, depuis les points kilométriques des arrêts.
    // Sans elle, le siège-kilomètre n'a pas de sens : un tronçon de 5 km et un
    // de 90 km ne pèsent pas pareil dans un taux de remplissage.
    const lengths = new Map<number, number>()
    for (let i = 0; i + 1 < stops.length; i += 1) {
      lengths.set(
        i,
        Math.abs(stops[i + 1]!.kilometerPoint - stops[i]!.kilometerPoint),
      )
    }

    const counters = await ctx.db
      .query("segmentCounters")
      .withIndex("by_trip_class", (q) => q.eq("tripId", args.tripId))
      .collect()

    const tickets = await ctx.db
      .query("tickets")
      .withIndex("by_trip", (q) => q.eq("tripId", args.tripId))
      .collect()

    const anciens = await ctx.db
      .query("tripMetrics")
      .withIndex("by_trip", (q) => q.eq("tripId", args.tripId))
      .collect()
    for (const ligne of anciens) await ctx.db.delete(ligne._id)

    const classes = [...new Set(counters.map((c) => c.serviceClass))]
    const computedAt = Date.now()
    let written = 0

    for (const serviceClass of classes) {
      const segments: SegmentLoad[] = counters
        .filter((c) => c.serviceClass === serviceClass)
        .map((c) => ({
          segmentIndex: c.segmentIndex,
          capacity: c.capacity,
          sold: c.sold,
          lengthKm: lengths.get(c.segmentIndex) ?? 0,
        }))

      const facteur = loadFactor(segments)
      const titres = tickets.filter(
        (t) => t.serviceClass === serviceClass && estOpposable(t.status),
      )

      await ctx.db.insert("tripMetrics", {
        tripId: args.tripId,
        serviceDate: trip.serviceDate,
        trainNumber: trip.trainNumber,
        trainType: trip.trainType,
        serviceClass,
        seatKmOffered: facteur.seatKmOffered,
        seatKmSold: facteur.seatKmSold,
        loadFactorPct: facteur.pct,
        peakSegmentIndex: facteur.peakSegmentIndex ?? undefined,
        peakPct: facteur.peakPct,
        ticketCount: titres.length,
        revenueTtc: titres.reduce((t, x) => t + x.unitPriceTtc, 0),
        computedAt,
      })
      written += 1
    }

    return { tripId: args.tripId, classes: written, replaced: anciens.length }
  },
})

/** Un titre annulé ou remboursé ne compte pas dans la fréquentation. */
function estOpposable(status: Doc<"tickets">["status"]): boolean {
  return status === "valide" || status === "utilise"
}

/* ══════════════════════════ Reprise d'historique ═══════════════════════ */

/**
 * Recalcule les cumuls d'une série de journées.
 *
 * Sert après un changement de définition d'indicateur, ou pour amorcer un
 * déploiement dont les journées ont été clôturées avant la mise en place des
 * cumuls. Borné : une mutation ne parcourt pas une table entière.
 */
export const backfillDailyMetrics = internalMutation({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args): Promise<{ processed: number; dates: string[] }> => {
    const limite = Math.min(args.limit ?? 30, 90)

    const days = await ctx.db
      .query("accountingDays")
      .withIndex("by_status", (q) => q.eq("status", "cloturee"))
      .take(limite)

    const dates: string[] = []
    for (const day of days) {
      await rollupDay(ctx, day)
      dates.push(day.date)
    }
    return { processed: dates.length, dates }
  },
})

/**
 * Corps du cumul journalier, partagé par le calcul unitaire et la reprise.
 *
 * Une mutation Convex ne peut pas s'appeler elle-même. Extraire le corps évite
 * d'en tenir deux copies, avec la dérive que cela finit toujours par produire.
 */
async function rollupDay(ctx: Ctx, day: Doc<"accountingDays">) {
  const sales = await ctx.db
    .query("sales")
    .withIndex("by_accounting_day", (q) => q.eq("accountingDayId", day._id))
    .collect()

  // Remplace plutôt qu'ajoute : le recalcul doit être idempotent.
  const anciens = await ctx.db
    .query("dailyMetrics")
    .withIndex("by_date", (q) => q.eq("date", day.date))
    .collect()
  for (const ligne of anciens) await ctx.db.delete(ligne._id)

  const buckets = new Map<string, Bucket>()

  for (const sale of sales) {
    // Une réservation non réglée n'est pas une vente : elle n'entre dans
    // aucun indicateur tant qu'elle n'est pas encaissée. Une réservation
    // expirée n'en est pas une non plus — elle n'a jamais rien produit.
    if (
      sale.status === "brouillon" ||
      sale.status === "en_attente_paiement" ||
      sale.status === "expiree"
    ) {
      continue
    }

    const key = bucketKey(sale)
    const bucket = buckets.get(key) ?? {
      pointOfSaleId: sale.pointOfSaleId,
      channel: sale.channel,
      product: sale.product,
      salesCount: 0,
      ticketCount: 0,
      cancelledCount: 0,
      refundedCount: 0,
      grossHt: 0,
      grossVat: 0,
      grossCss: 0,
      grossTtc: 0,
      grossReceived: 0,
      refundedHt: 0,
      refundedVat: 0,
      refundedCss: 0,
      refundedTtc: 0,
      refundedReceived: 0,
    }

    if (sale.kind === "vente") {
      bucket.salesCount += 1
      bucket.grossHt += sale.amounts.ht
      bucket.grossVat += sale.amounts.vat
      bucket.grossCss += sale.amounts.css
      bucket.grossTtc += sale.amounts.ttc
      bucket.grossReceived += sale.amounts.received

      const tickets = await ctx.db
        .query("tickets")
        .withIndex("by_sale", (q) => q.eq("saleId", sale._id))
        .collect()
      bucket.ticketCount += tickets.length
    } else {
      // Annulations et remboursements portent des montants négatifs : on les
      // cumule en valeur absolue pour que « ce qui est ressorti » soit un
      // nombre positif, lisible sur un graphique.
      const sortie = absAmounts(sale.amounts)
      bucket.refundedHt += sortie.ht
      bucket.refundedVat += sortie.vat
      bucket.refundedCss += sortie.css
      bucket.refundedTtc += sortie.ttc
      bucket.refundedReceived += sortie.received
      if (sale.kind === "annulation") bucket.cancelledCount += 1
      else bucket.refundedCount += 1
    }

    buckets.set(key, bucket)
  }

  const computedAt = Date.now()
  for (const bucket of buckets.values()) {
    await ctx.db.insert("dailyMetrics", { date: day.date, ...bucket, computedAt })
  }

  return {
    date: day.date,
    salesExamined: sales.length,
    buckets: buckets.size,
    replaced: anciens.length,
  }
}
