import { v } from "convex/values"
import { mutation, query, type MutationCtx } from "../_generated/server"
import type { Doc, Id } from "../_generated/dataModel"
import { audit, requirePermission } from "../lib/auth"
import {
  buildJournalEntries,
  findSequenceGaps,
  parsePreprintedNumber,
  serializeJournal,
  summarizeByAccount,
  validateJournal,
  type AccountableSale,
  type AccountingProduct,
} from "../model/accounting"

/**
 * Journal comptable et déversement vers SAGE X3.
 *
 * Le CDC §7.8 impose de transmettre le chiffre d'affaires après chaque
 * journée comptable. La transmission passe par la file d'envoi : si SAGE est
 * indisponible, l'écriture est conservée et rejouable, jamais perdue.
 */

/** Site financier par défaut, à confirmer avec la direction financière. */
const DEFAULT_FINANCIAL_SITE = "SETRAG"

/** Convertit une vente en ligne comptable. */
async function toAccountableSale(
  ctx: Parameters<typeof requirePermission>[0],
  sale: Doc<"sales">,
): Promise<AccountableSale> {
  const pointOfSale = sale.pointOfSaleId
    ? await ctx.db.get(sale.pointOfSaleId)
    : null
  return {
    number: sale.number,
    product: sale.product as AccountingProduct,
    kind: sale.kind,
    pointOfSaleCode: pointOfSale?.code ?? "INCONNU",
    saleDate: new Date(sale.soldAt).toISOString().slice(0, 10),
    ht: sale.amounts.ht,
    vat: sale.amounts.vat,
    css: sale.amounts.css,
    ttc: sale.amounts.ttc,
  }
}

/**
 * Engendre les écritures V65 d'une journée clôturée et les met en file
 * d'envoi vers SAGE.
 *
 * Refuse de transmettre un journal déséquilibré : mieux vaut bloquer une
 * clôture que déverser une comptabilité fausse, qui ne se rattrape pas une
 * fois transmise.
 */
export const generateJournal = mutation({
  args: {
    accountingDayId: v.id("accountingDays"),
    financialSite: v.optional(v.string()),
    costCenter: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "journal_comptable", "creer")
    return await engendrerJournal(ctx, args, actor._id)
  },
})

/**
 * Corps de `generateJournal`, partagé avec l'amorçage de démonstration
 * (`pilotage.amorcerJourneeDemo`) : mêmes contrôles, mêmes écritures.
 */
export async function engendrerJournal(
  ctx: MutationCtx,
  args: {
    accountingDayId: Id<"accountingDays">
    financialSite?: string
    costCenter?: string
  },
  actorId: Id<"users"> | undefined,
) {
  const day = await ctx.db.get(args.accountingDayId)
  if (!day) throw new Error("Journée comptable introuvable")
  if (day.status !== "cloturee") {
    throw new Error(
      "Journée comptable non clôturée : déversement prématuré",
    )
  }

  // Un écart de caisse se vise par le contrôle des recettes avant le
  // déversement : une recette non visée n'a rien à faire en comptabilité.
  const nonVisees = (
    await ctx.db
      .query("cashSessions")
      .withIndex("by_day", (q) => q.eq("accountingDayId", args.accountingDayId))
      .collect()
  ).filter((s) => s.status === "cloturee" && (s.varianceXaf ?? 0) !== 0)
  if (nonVisees.length > 0) {
    throw new Error(
      `${nonVisees.length} écart(s) de caisse non visé(s) par le contrôle ` +
        `des recettes : déversement refusé`,
    )
  }

  const existing = await ctx.db
    .query("journalEntries")
    .withIndex("by_day", (q) => q.eq("accountingDayId", args.accountingDayId))
    .collect()
  if (existing.length > 0) {
    throw new Error(
      `Journal déjà engendré pour le ${day.date} (${existing.length} ` +
        `écritures) : régénération refusée`,
    )
  }

  const sales = await ctx.db
    .query("sales")
    .withIndex("by_accounting_day", (q) =>
      q.eq("accountingDayId", args.accountingDayId),
    )
    .collect()

  const accountable: AccountableSale[] = []
  for (const sale of sales) {
    accountable.push(await toAccountableSale(ctx, sale))
  }

  const entries = buildJournalEntries(accountable, {
    financialSite: args.financialSite ?? DEFAULT_FINANCIAL_SITE,
    costCenter: args.costCenter,
  })

  const validation = validateJournal(entries, day.totalTtc)
  if (!validation.balanced) {
    throw new Error(
      `Journal déséquilibré, déversement refusé :\n` +
        validation.anomalies
          .map((a) => `  • ${a.pieceNumber} — ${a.reason}`)
          .join("\n"),
    )
  }

  for (const entry of entries) {
    await ctx.db.insert("journalEntries", {
      accountingDayId: args.accountingDayId,
      journalCode: entry.journalCode,
      pieceNumber: entry.pieceNumber,
      saleDate: entry.saleDate,
      financialSite: entry.financialSite,
      pointOfSaleCode: entry.pointOfSaleCode,
      analyticAccount: entry.analyticAccount,
      costCenter: entry.costCenter,
      ht: entry.ht,
      vat: entry.vat,
      css: entry.css,
      ttc: entry.ttc,
    })
  }

  // La transmission passe par la file : rien ne se perd si SAGE est
  // indisponible, et le rejeu est possible depuis le back-office.
  await ctx.db.insert("outboxEvents", {
    type: "sage_export",
    entityId: args.accountingDayId,
    payload: serializeJournal(entries),
    status: "en_attente",
    attempts: 0,
    createdAt: Date.now(),
  })

  await ctx.db.patch(args.accountingDayId, {
    exportStatus: "en_attente",
    journalEntryCount: entries.length,
    journalTotalTtc: validation.totalTtc,
    journalRefundsTtc:
      Math.round(
        entries
          .filter((e) => e.ttc < 0)
          .reduce((sum, e) => sum + Math.abs(e.ttc), 0) * 100,
      ) / 100,
    journalGeneratedAt: Date.now(),
  })

  await audit(ctx, {
    actorId,
    action: "comptabilite.journal",
    entityTable: "accountingDays",
    entityId: args.accountingDayId,
    after: {
      date: day.date,
      entries: entries.length,
      totalTtc: validation.totalTtc,
    },
  })

  return {
    entries: entries.length,
    totalTtc: validation.totalTtc,
    byAccount: summarizeByAccount(entries),
  }
}

/** Journal d'une journée, avec son récapitulatif par compte. */
export const getJournal = query({
  args: { accountingDayId: v.id("accountingDays") },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "journal_comptable", "consulter")
    const day = await ctx.db.get(args.accountingDayId)
    if (!day) throw new Error("Journée comptable introuvable")

    const entries = await ctx.db
      .query("journalEntries")
      .withIndex("by_day", (q) => q.eq("accountingDayId", args.accountingDayId))
      .collect()

    return {
      day,
      entries,
      byAccount: summarizeByAccount(
        entries.map((e) => ({
          journalCode: e.journalCode,
          pieceNumber: e.pieceNumber,
          saleDate: e.saleDate,
          financialSite: e.financialSite,
          pointOfSaleCode: e.pointOfSaleCode,
          analyticAccount: e.analyticAccount,
          costCenter: e.costCenter,
          ht: e.ht,
          vat: e.vat,
          css: e.css,
          ttc: e.ttc,
        })),
      ),
    }
  },
})

/** Fichier tel qu'il sera transmis à SAGE, pour contrôle avant envoi. */
export const previewExport = query({
  args: { accountingDayId: v.id("accountingDays") },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "journal_comptable", "consulter")
    const entries = await ctx.db
      .query("journalEntries")
      .withIndex("by_day", (q) => q.eq("accountingDayId", args.accountingDayId))
      .collect()
    if (entries.length === 0) return null

    return serializeJournal(
      entries.map((e) => ({
        journalCode: e.journalCode,
        pieceNumber: e.pieceNumber,
        saleDate: e.saleDate,
        financialSite: e.financialSite,
        pointOfSaleCode: e.pointOfSaleCode,
        analyticAccount: e.analyticAccount,
        costCenter: e.costCenter,
        ht: e.ht,
        vat: e.vat,
        css: e.css,
        ttc: e.ttc,
      })),
    )
  },
})

/** État des déversements, pour l'écran d'intégration du back-office. */
export const listExports = query({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, "journal_comptable", "consulter")
    const events = await ctx.db
      .query("outboxEvents")
      .withIndex("by_type_status", (q) => q.eq("type", "sage_export"))
      .collect()

    return await Promise.all(
      events.map(async (event) => {
        const day = await ctx.db.get(
          event.entityId as Parameters<typeof ctx.db.get>[0],
        )
        return {
          event: {
            _id: event._id,
            status: event.status,
            attempts: event.attempts,
            lastError: event.lastError,
            createdAt: event.createdAt,
            sentAt: event.sentAt,
          },
          day,
        }
      }),
    )
  },
})

/**
 * Marque un déversement comme intégré par SAGE.
 * Appelé à réception de l'accusé, ou manuellement par le comptable en cas
 * de transmission hors ligne.
 */
export const acknowledgeExport = mutation({
  args: {
    accountingDayId: v.id("accountingDays"),
    integrated: v.boolean(),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "journal_comptable", "modifier")
    const day = await ctx.db.get(args.accountingDayId)
    if (!day) throw new Error("Journée comptable introuvable")

    const event = await ctx.db
      .query("outboxEvents")
      .withIndex("by_type_status", (q) => q.eq("type", "sage_export"))
      .filter((q) => q.eq(q.field("entityId"), args.accountingDayId))
      .first()

    if (args.integrated) {
      await ctx.db.patch(args.accountingDayId, {
        exportStatus: "integre",
        exportError: undefined,
      })
      if (event) {
        await ctx.db.patch(event._id, {
          status: "envoye",
          sentAt: Date.now(),
        })
      }
    } else {
      await ctx.db.patch(args.accountingDayId, {
        exportStatus: "echec",
        exportError: args.error,
      })
      if (event) {
        await ctx.db.patch(event._id, {
          status: "echec",
          attempts: event.attempts + 1,
          lastError: args.error,
        })
      }
    }

    await audit(ctx, {
      actorId: actor._id,
      action: "comptabilite.deversement",
      entityTable: "accountingDays",
      entityId: args.accountingDayId,
      after: { integrated: args.integrated, error: args.error },
    })
  },
})

/**
 * Rejoue un déversement en échec, après correction du paramétrage.
 * Le journal n'est pas régénéré : seule la transmission est relancée, ce qui
 * évite tout risque de double comptage.
 */
export const retryExport = mutation({
  args: { accountingDayId: v.id("accountingDays") },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "journal_comptable", "modifier")

    const event = await ctx.db
      .query("outboxEvents")
      .withIndex("by_type_status", (q) => q.eq("type", "sage_export"))
      .filter((q) => q.eq(q.field("entityId"), args.accountingDayId))
      .first()
    if (!event) throw new Error("Aucun déversement à rejouer pour cette journée")
    if (event.status === "envoye") {
      throw new Error("Déversement déjà intégré : rejeu refusé")
    }

    await ctx.db.patch(event._id, { status: "en_attente", lastError: undefined })
    await ctx.db.patch(args.accountingDayId, {
      exportStatus: "en_attente",
      exportError: undefined,
    })

    await audit(ctx, {
      actorId: actor._id,
      action: "comptabilite.rejeu",
      entityTable: "accountingDays",
      entityId: args.accountingDayId,
      after: { attempts: event.attempts },
    })
    return { attempts: event.attempts }
  },
})

/* ─────────────────── Contrôle des billets manuels ──────────────────────── */

/**
 * Contrôle la continuité des carnets de billets pré-imprimés.
 *
 * Un trou signale un billet émis en mode dégradé mais jamais ressaisi. Le
 * CDC en fait un point de contrôle explicite : c'est une occasion de fraude
 * classique.
 */
export const checkManualSequence = query({
  args: { accountingDayId: v.optional(v.id("accountingDays")) },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "ventes_manuelles", "consulter")

    const manuals = await ctx.db.query("manualTickets").collect()
    let filtered = manuals
    if (args.accountingDayId) {
      const sales = await ctx.db
        .query("sales")
        .withIndex("by_accounting_day", (q) =>
          q.eq("accountingDayId", args.accountingDayId),
        )
        .collect()
      const ids = new Set(sales.map((s) => s._id))
      filtered = manuals.filter((m) => ids.has(m.saleId))
    }

    if (filtered.length === 0) {
      return { carnets: [], totalMissing: 0 }
    }

    // Regroupe par carnet : la continuité se contrôle carnet par carnet.
    // Le découpage passe par `parsePreprintedNumber` pour rester cohérent
    // avec la détection de trous, qui refuse les carnets hétérogènes.
    const byPrefix = new Map<string, string[]>()
    for (const manual of filtered) {
      const { prefix } = parsePreprintedNumber(manual.preprintedNumber)
      const list = byPrefix.get(prefix) ?? []
      list.push(manual.preprintedNumber)
      byPrefix.set(prefix, list)
    }

    const carnets = [...byPrefix.entries()].map(([prefix, numbers]) => {
      const gaps = findSequenceGaps(numbers)
      return {
        prefix,
        recorded: numbers.length,
        min: gaps.min,
        max: gaps.max,
        missing: gaps.missing,
      }
    })

    return {
      carnets,
      totalMissing: carnets.reduce((sum, c) => sum + c.missing.length, 0),
    }
  },
})
