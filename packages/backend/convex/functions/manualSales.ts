import { v } from "convex/values"
import { mutation, query } from "../_generated/server"
import { audit, requirePermission } from "../lib/auth"
import { serviceClass } from "../schema"
import {
  accrueToAccountingDay,
  activeFareSchedule,
  currentAccountingDay,
  nextSequence,
} from "../lib/saleContext"
import { buildAmounts, formatNumber, sequenceKey } from "../model/sales"
import { parsePreprintedNumber } from "../model/accounting"
import { toServiceDate } from "../model/calendar"

/**
 * Ressaisie des ventes réalisées en mode dégradé (CDC §7.10).
 *
 * Quand l'application est indisponible, les guichets vendent sur des billets
 * papier pré-imprimés. Ces ventes doivent ensuite entrer dans le système
 * « sans autre émission de titre de transport » : la ressaisie ne crée donc
 * PAS de billet électronique, elle enregistre l'opération commerciale et
 * comptable, en conservant les deux numérotations.
 *
 * Le contrôle d'unicité du numéro pré-imprimé est strict : c'est le garde-fou
 * contre la double ressaisie d'un même billet papier.
 */

export const recordManualSale = mutation({
  args: {
    /** Numéro du carnet papier, ex. « PP-0042817 ». */
    preprintedNumber: v.string(),
    /** Date et heure réelles de la vente, distinctes de la ressaisie. */
    soldAt: v.number(),
    originalSellerId: v.id("users"),
    tripId: v.optional(v.id("trips")),
    originStationId: v.id("stations"),
    destinationStationId: v.id("stations"),
    serviceClass,
    passengerName: v.string(),
    amountReceivedXaf: v.number(),
    notes: v.optional(v.string()),
    deviceId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "ventes_manuelles", "creer")

    // Format contrôlé avant tout : un numéro illisible rendrait la
    // vérification de continuité impossible.
    const parsed = parsePreprintedNumber(args.preprintedNumber)
    const normalized = args.preprintedNumber.trim()

    // Unicité stricte — garde-fou contre la double ressaisie.
    const existing = await ctx.db
      .query("manualTickets")
      .withIndex("by_preprinted", (q) => q.eq("preprintedNumber", normalized))
      .unique()
    if (existing) {
      throw new Error(
        `Le billet pré-imprimé ${normalized} a déjà été ressaisi : ` +
          `double enregistrement refusé`,
      )
    }

    if (!Number.isFinite(args.amountReceivedXaf) || args.amountReceivedXaf < 0) {
      throw new Error(`Montant perçu invalide : ${args.amountReceivedXaf}`)
    }
    if (args.soldAt > Date.now()) {
      throw new Error("La date de vente ne peut pas être dans le futur")
    }

    const seller = await ctx.db.get(args.originalSellerId)
    if (!seller) throw new Error("Vendeur d'origine introuvable")

    const pointOfSaleId = seller.pointOfSaleId ?? actor.pointOfSaleId
    if (!pointOfSaleId) {
      throw new Error(
        "Ni le vendeur d'origine ni l'agent de ressaisie ne sont rattachés " +
          "à un point de vente",
      )
    }
    const pointOfSale = await ctx.db.get(pointOfSaleId)
    if (!pointOfSale) throw new Error("Point de vente introuvable")

    const { schedule } = await activeFareSchedule(ctx)
    const amounts = buildAmounts(
      args.amountReceivedXaf,
      schedule.vatPct,
      schedule.cssPct,
      args.amountReceivedXaf,
    )

    const day = await currentAccountingDay(ctx)
    const serviceDate = toServiceDate(Date.now())
    const seq = await nextSequence(
      ctx,
      sequenceKey(pointOfSale.code, serviceDate, "vente"),
    )
    const systemNumber = formatNumber(
      "vente",
      pointOfSale.code,
      serviceDate,
      seq,
    )

    const saleId = await ctx.db.insert("sales", {
      number: systemNumber,
      kind: "vente",
      product: "billet",
      channel: "manuel",
      status: "confirmee",
      pointOfSaleId,
      sellerId: args.originalSellerId,
      deviceId: args.deviceId,
      amounts,
      accountingDayId: day._id,
      refundReason: args.notes,
      // Date RÉELLE de la vente, pas celle de la ressaisie.
      soldAt: args.soldAt,
    })

    const manualId = await ctx.db.insert("manualTickets", {
      saleId,
      preprintedNumber: normalized,
      systemNumber,
      soldAt: args.soldAt,
      recordedAt: Date.now(),
      originalSellerId: args.originalSellerId,
      recordedBy: actor._id,
    })

    await accrueToAccountingDay(ctx, day, amounts.ttc, amounts.received)

    await audit(ctx, {
      actorId: actor._id,
      action: "vente.manuelle.ressaisir",
      entityTable: "manualTickets",
      entityId: manualId,
      deviceId: args.deviceId,
      after: {
        preprintedNumber: normalized,
        systemNumber,
        carnet: parsed.prefix,
        soldAt: new Date(args.soldAt).toISOString(),
        recordedAt: new Date().toISOString(),
        originalSeller: `${seller.firstName ?? ""} ${seller.lastName ?? ""}`.trim(),
        ttc: amounts.ttc,
      },
    })

    return {
      saleId,
      manualId,
      preprintedNumber: normalized,
      systemNumber,
      amounts,
    }
  },
})

/** Ventes manuelles ressaisies, les plus récentes d'abord. */
export const list = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "ventes_manuelles", "consulter")
    const manuals = await ctx.db.query("manualTickets").collect()
    const ordered = manuals.sort((a, b) => b.recordedAt - a.recordedAt)
    const limited = ordered.slice(0, args.limit ?? 50)

    return await Promise.all(
      limited.map(async (manual) => {
        const [sale, seller, recorder] = await Promise.all([
          ctx.db.get(manual.saleId),
          ctx.db.get(manual.originalSellerId),
          ctx.db.get(manual.recordedBy),
        ])
        return {
          manual,
          sale,
          originalSeller: seller
            ? `${seller.firstName ?? ""} ${seller.lastName ?? ""}`.trim()
            : null,
          recordedBy: recorder
            ? `${recorder.firstName ?? ""} ${recorder.lastName ?? ""}`.trim()
            : null,
          /** Écart entre la vente réelle et sa régularisation. */
          delayHours: Math.round(
            (manual.recordedAt - manual.soldAt) / 3_600_000,
          ),
        }
      }),
    )
  },
})
