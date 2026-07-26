import { v } from "convex/values"
import { query } from "../_generated/server"
import type { Doc, DataModel } from "../_generated/dataModel"
import type { GenericQueryCtx } from "convex/server"
import { requirePermission } from "../lib/auth"
import { addDays, toServiceDate } from "../model/calendar"
import {
  ZERO_METRICS,
  addMetrics,
  aggregateLoadFactor,
  averageBasketTtc,
  byRevenue,
  compare,
  groupBy,
  netTtc,
  refundRatePct,
  summarizeVariances,
  topWithRest,
  type Metrics,
  type Slice,
} from "../model/kpi"

/**
 * Restitution des indicateurs.
 *
 * Toutes les requêtes lisent des cumuls pré-calculés (`dailyMetrics`,
 * `tripMetrics`), jamais les ventes. Le coût d'un tableau de bord est donc
 * proportionnel au nombre de JOURS affichés, pas au volume vendu — un mois
 * coûte trente lectures, qu'il porte cent ou vingt mille ventes.
 *
 * Conséquence à connaître : une journée non clôturée n'apparaît pas. C'est
 * volontaire. Un chiffre d'affaires qui bouge encore n'est pas un indicateur,
 * c'est une caisse ouverte.
 */

type Ctx = GenericQueryCtx<DataModel>

/** Fenêtre d'analyse, bornes incluses, au format AAAA-MM-JJ. */
const periodArgs = {
  from: v.string(),
  to: v.string(),
}

/* ═════════════════════════════ Lectures ════════════════════════════════ */

async function readMetrics(
  ctx: Ctx,
  from: string,
  to: string,
): Promise<Doc<"dailyMetrics">[]> {
  // L'index porte sur la date : la plage se lit d'un trait, sans filtrage.
  return await ctx.db
    .query("dailyMetrics")
    .withIndex("by_date", (q) => q.gte("date", from).lte("date", to))
    .collect()
}

function toMetrics(row: Doc<"dailyMetrics">): Metrics {
  return {
    salesCount: row.salesCount,
    ticketCount: row.ticketCount,
    cancelledCount: row.cancelledCount,
    refundedCount: row.refundedCount,
    gross: {
      ht: row.grossHt,
      vat: row.grossVat,
      css: row.grossCss,
      ttc: row.grossTtc,
      received: row.grossReceived,
    },
    refunded: {
      ht: row.refundedHt,
      vat: row.refundedVat,
      css: row.refundedCss,
      ttc: row.refundedTtc,
      received: row.refundedReceived,
    },
  }
}

function total(rows: readonly Doc<"dailyMetrics">[]): Metrics {
  return rows.reduce((t, r) => addMetrics(t, toMetrics(r)), ZERO_METRICS)
}

/** Période de même longueur, immédiatement antérieure. */
function previousPeriod(from: string, to: string): { from: string; to: string } {
  const jours = Math.max(1, daysBetween(from, to) + 1)
  return { from: addDays(from, -jours), to: addDays(to, -jours) }
}

function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000,
  )
}

/* ════════════════════════════ Vue d'ensemble ═══════════════════════════ */

/**
 * Chiffres de tête, comparés à la période précédente de même longueur.
 *
 * La comparaison est systématique parce qu'un chiffre seul ne dit rien : « 4,2
 * millions » n'est ni bon ni mauvais tant qu'on ignore ce qu'était la semaine
 * d'avant.
 */
export const dashboard = query({
  args: periodArgs,
  handler: async (ctx, args) => {
    await requirePermission(ctx, "rapports", "consulter")

    const courant = total(await readMetrics(ctx, args.from, args.to))
    const précédent = previousPeriod(args.from, args.to)
    const antérieur = total(
      await readMetrics(ctx, précédent.from, précédent.to),
    )

    const trips = await ctx.db
      .query("tripMetrics")
      .withIndex("by_service_date", (q) =>
        q.gte("serviceDate", args.from).lte("serviceDate", args.to),
      )
      .collect()

    return {
      period: { from: args.from, to: args.to, days: daysBetween(args.from, args.to) + 1 },
      comparedTo: précédent,
      revenue: {
        grossTtc: courant.gross.ttc,
        refundedTtc: courant.refunded.ttc,
        netTtc: netTtc(courant),
        variation: compare(netTtc(courant), netTtc(antérieur)),
      },
      volume: {
        sales: courant.salesCount,
        tickets: courant.ticketCount,
        variation: compare(courant.ticketCount, antérieur.ticketCount),
      },
      quality: {
        refundRatePct: refundRatePct(courant),
        cancelledCount: courant.cancelledCount,
        refundedCount: courant.refundedCount,
        averageBasketTtc: averageBasketTtc(courant),
      },
      occupancy: {
        ...aggregateLoadFactor(trips),
        tripCount: new Set(trips.map((t) => t.tripId)).size,
      },
      /**
       * Une période sans aucun cumul n'est pas une période à zéro : c'est,
       * le plus souvent, une période dont les journées ne sont pas clôturées.
       * Le tableau de bord doit pouvoir le dire au lieu d'afficher des zéros.
       */
      hasData: courant.salesCount > 0 || courant.refundedCount > 0,
    }
  },
})

/* ═══════════════════════ Ventilations par dimension ════════════════════ */

const CHANNEL_LABELS: Record<string, string> = {
  guichet: "Guichet",
  ligne: "En ligne",
  agence: "Agence accréditée",
  bord: "À bord",
  manuel: "Ressaisie manuelle",
}

const PRODUCT_LABELS: Record<string, string> = {
  billet: "Billets",
  bagage: "Bagages",
  colis: "Colis",
  taa: "Transport de véhicule",
  funeraire: "Transport funéraire",
}

/** Répartition du chiffre d'affaires par canal de vente. */
export const byChannel = query({
  args: periodArgs,
  handler: async (ctx, args) => {
    await requirePermission(ctx, "rapports", "consulter")
    const rows = await readMetrics(ctx, args.from, args.to)
    return byRevenue(
      groupBy(
        rows,
        (r) => ({ key: r.channel, label: CHANNEL_LABELS[r.channel] ?? r.channel }),
        toMetrics,
      ),
    ).map(withNet)
  },
})

/** Répartition par produit. */
export const byProduct = query({
  args: periodArgs,
  handler: async (ctx, args) => {
    await requirePermission(ctx, "rapports", "consulter")
    const rows = await readMetrics(ctx, args.from, args.to)
    return byRevenue(
      groupBy(
        rows,
        (r) => ({ key: r.product, label: PRODUCT_LABELS[r.product] ?? r.product }),
        toMetrics,
      ),
    ).map(withNet)
  },
})

/**
 * Répartition par point de vente, tronquée aux plus contributeurs.
 *
 * Dix-neuf points de vente sur un graphique deviennent illisibles ; les
 * suivants sont donc regroupés sous « autres », en gardant le total juste.
 */
export const byPointOfSale = query({
  args: { ...periodArgs, top: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "rapports", "consulter")
    const rows = await readMetrics(ctx, args.from, args.to)

    const noms = new Map<string, string>()
    for (const id of new Set(
      rows.map((r) => r.pointOfSaleId).filter(Boolean),
    )) {
      const pos = await ctx.db.get(id!)
      if (pos) noms.set(id!, `${pos.code} — ${pos.name}`)
    }

    const slices = groupBy(
      rows,
      (r) => ({
        key: r.pointOfSaleId ?? "__sans__",
        label: r.pointOfSaleId
          ? (noms.get(r.pointOfSaleId) ?? "Point de vente inconnu")
          : "Sans point de vente (en ligne)",
      }),
      toMetrics,
    )
    return topWithRest(slices, args.top ?? 8).map(withNet)
  },
})

/** Série journalière, pour la courbe de chiffre d'affaires. */
export const dailySeries = query({
  args: periodArgs,
  handler: async (ctx, args) => {
    await requirePermission(ctx, "rapports", "consulter")
    const rows = await readMetrics(ctx, args.from, args.to)

    const parJour = new Map<string, Metrics>()
    for (const r of rows) {
      parJour.set(
        r.date,
        addMetrics(parJour.get(r.date) ?? ZERO_METRICS, toMetrics(r)),
      )
    }

    // Les jours sans vente sont rendus à zéro plutôt qu'omis : une courbe qui
    // saute les jours creux laisse croire à une activité continue.
    const série: Array<{
      date: string
      grossTtc: number
      refundedTtc: number
      netTtc: number
      tickets: number
    }> = []
    for (let d = args.from; d <= args.to; d = addDays(d, 1)) {
      const m = parJour.get(d) ?? ZERO_METRICS
      série.push({
        date: d,
        grossTtc: m.gross.ttc,
        refundedTtc: m.refunded.ttc,
        netTtc: netTtc(m),
        tickets: m.ticketCount,
      })
    }
    return série
  },
})

/* ═══════════════════════ Remplissage des dessertes ═════════════════════ */

/**
 * Remplissage par desserte, du plus chargé au moins chargé.
 *
 * Le tronçon de pointe est rendu à part : c'est lui qui borne la vente. Un
 * train à 55 % de remplissage moyen dont un tronçon est à 100 % refuse déjà
 * des voyageurs, et ajouter des places ailleurs n'y changerait rien.
 */
export const occupancy = query({
  args: { ...periodArgs, limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "places", "consulter")
    const rows = await ctx.db
      .query("tripMetrics")
      .withIndex("by_service_date", (q) =>
        q.gte("serviceDate", args.from).lte("serviceDate", args.to),
      )
      .collect()

    return rows
      .sort((a, b) => b.loadFactorPct - a.loadFactorPct)
      .slice(0, Math.min(args.limit ?? 50, 200))
      .map((r) => ({
        tripId: r.tripId,
        serviceDate: r.serviceDate,
        trainNumber: r.trainNumber,
        trainType: r.trainType,
        serviceClass: r.serviceClass,
        loadFactorPct: r.loadFactorPct,
        peakSegmentIndex: r.peakSegmentIndex,
        peakPct: r.peakPct,
        /** Vrai quand la moyenne est basse mais un tronçon saturé. */
        constrainedByPeak: r.peakPct >= 95 && r.loadFactorPct < 80,
        ticketCount: r.ticketCount,
        revenueTtc: r.revenueTtc,
        seatKmOffered: r.seatKmOffered,
        seatKmSold: r.seatKmSold,
      }))
  },
})

/* ═════════════════════════ Contrôle des recettes ═══════════════════════ */

/** Écarts de caisse de la période, pour le contrôle des recettes. */
export const cashVariances = query({
  args: periodArgs,
  handler: async (ctx, args) => {
    await requirePermission(ctx, "caisse", "consulter")

    const days = await ctx.db
      .query("accountingDays")
      .withIndex("by_date", (q) => q.gte("date", args.from).lte("date", args.to))
      .collect()

    const sessions: Doc<"cashSessions">[] = []
    for (const day of days) {
      const duJour = await ctx.db
        .query("cashSessions")
        .withIndex("by_day", (q) => q.eq("accountingDayId", day._id))
        .collect()
      sessions.push(...duJour)
    }

    const résumé = summarizeVariances(sessions)
    const pires = sessions
      .filter((s) => (s.varianceXaf ?? 0) !== 0)
      .sort(
        (a, b) => Math.abs(b.varianceXaf ?? 0) - Math.abs(a.varianceXaf ?? 0),
      )
      .slice(0, 10)

    return {
      summary: résumé,
      worst: await Promise.all(
        pires.map(async (s) => {
          const [seller, pos] = await Promise.all([
            ctx.db.get(s.sellerId),
            ctx.db.get(s.pointOfSaleId),
          ])
          return {
            sessionId: s._id,
            varianceXaf: s.varianceXaf ?? 0,
            reason: s.varianceReason,
            seller: seller ? `${seller.lastName ?? ""} ${seller.firstName ?? ""}`.trim() : "?",
            pointOfSale: pos?.code ?? "?",
            openedAt: s.openedAt,
            closedAt: s.closedAt,
          }
        }),
      ),
    }
  },
})

/* ══════════════════════════════ Export ═════════════════════════════════ */

/**
 * Export CSV de la ventilation journalière.
 *
 * Le séparateur est le point-virgule et le décimal la virgule : c'est ce
 * qu'attend un Excel configuré en français, et l'export finit toujours dans
 * Excel. Un fichier qu'il faut réimporter à la main n'est pas un export.
 */
export const exportDailyCsv = query({
  args: periodArgs,
  handler: async (ctx, args) => {
    await requirePermission(ctx, "rapports", "creer")
    const rows = await readMetrics(ctx, args.from, args.to)

    const noms = new Map<string, string>()
    for (const id of new Set(rows.map((r) => r.pointOfSaleId).filter(Boolean))) {
      const pos = await ctx.db.get(id!)
      if (pos) noms.set(id!, pos.code)
    }

    const entête = [
      "Date",
      "Point de vente",
      "Canal",
      "Produit",
      "Ventes",
      "Titres",
      "Annulations",
      "Remboursements",
      "Brut HT",
      "TVA",
      "CSS",
      "Brut TTC",
      "Sorties TTC",
      "Net TTC",
    ].join(";")

    const lignes = rows
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((r) =>
        [
          r.date,
          r.pointOfSaleId ? (noms.get(r.pointOfSaleId) ?? "?") : "",
          CHANNEL_LABELS[r.channel] ?? r.channel,
          PRODUCT_LABELS[r.product] ?? r.product,
          r.salesCount,
          r.ticketCount,
          r.cancelledCount,
          r.refundedCount,
          r.grossHt,
          r.grossVat,
          r.grossCss,
          r.grossTtc,
          r.refundedTtc,
          r.grossTtc - r.refundedTtc,
        ].join(";"),
      )

    return {
      filename: `setrag-ventes-${args.from}-${args.to}.csv`,
      rowCount: lignes.length,
      content: [entête, ...lignes].join("\n"),
    }
  },
})

/* ─────────────────────────────── Utilitaires ───────────────────────────── */

/** Ajoute les valeurs dérivées attendues par l'affichage. */
function withNet(slice: Slice) {
  return {
    key: slice.key,
    label: slice.label,
    salesCount: slice.metrics.salesCount,
    ticketCount: slice.metrics.ticketCount,
    grossTtc: slice.metrics.gross.ttc,
    refundedTtc: slice.metrics.refunded.ttc,
    netTtc: netTtc(slice.metrics),
    refundRatePct: refundRatePct(slice.metrics),
    averageBasketTtc: averageBasketTtc(slice.metrics),
  }
}

/** Période par défaut d'un tableau de bord : les trente derniers jours. */
export const defaultPeriod = query({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, "rapports", "consulter")
    const today = toServiceDate(Date.now())
    return { from: addDays(today, -29), to: today }
  },
})
