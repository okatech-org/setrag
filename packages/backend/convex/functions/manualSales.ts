import { v } from "convex/values"
import { mutation, query, type MutationCtx } from "../_generated/server"
import type { Doc, Id } from "../_generated/dataModel"
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
import { isRangeFree, segmentMask } from "../model/inventory"

/** Nom saisi « NOM Prénom » : le premier mot fait le nom de famille. */
function decouperNom(nom: string): { lastName: string; firstName: string } {
  const [premier, ...reste] = nom.trim().split(/\s+/)
  return {
    lastName: (premier ?? "").toUpperCase(),
    firstName: reste.join(" "),
  }
}

/**
 * Pose la souche sur la première place libre du trajet, pour qu'elle ne soit
 * pas revendue. Le titre système n'est jamais imprimé : le billet papier
 * reste le titre de transport du voyageur, le contrôleur le lit tel quel.
 *
 * `null` si le train est complet sur ce trajet : la vente papier reste
 * enregistrée, sans place tenue — l'écran le signale.
 */
async function tenirPlaceDeLaSouche(
  ctx: MutationCtx,
  args: {
    trip: Doc<"trips">
    originStationId: Id<"stations">
    destinationStationId: Id<"stations">
    serviceClass: Doc<"tickets">["serviceClass"]
    saleId: Id<"sales">
    passengerName: string
    amountTtc: number
    pointOfSaleCode: string
    serviceDate: string
  }
): Promise<Doc<"tickets"> | null> {
  const { trip } = args
  const stops = (
    await ctx.db
      .query("tripStops")
      .withIndex("by_trip_sequence", (q) => q.eq("tripId", trip._id))
      .collect()
  ).sort((a, b) => a.sequence - b.sequence)
  const fromIndex = stops.findIndex((s) => s.stationId === args.originStationId)
  const toIndex = stops.findIndex(
    (s) => s.stationId === args.destinationStationId
  )
  if (fromIndex === -1 || toIndex === -1 || toIndex <= fromIndex) {
    throw new Error("Trajet de la souche incompatible avec la desserte")
  }
  const request = segmentMask({ fromIndex, toIndex }, trip.segmentCount)

  const counters = (
    await ctx.db
      .query("segmentCounters")
      .withIndex("by_trip_class", (q) =>
        q.eq("tripId", trip._id).eq("serviceClass", args.serviceClass)
      )
      .collect()
  ).filter((c) => c.segmentIndex >= fromIndex && c.segmentIndex < toIndex)
  if (counters.length === 0 || Math.min(...counters.map((c) => c.available)) < 1) {
    return null
  }

  const coaches = new Map(
    (
      await ctx.db
        .query("coaches")
        .withIndex("by_train", (q) => q.eq("trainId", trip.trainId))
        .collect()
    ).map((coach) => [coach._id, coach])
  )
  const occupancies = (
    await ctx.db
      .query("seatOccupancy")
      .withIndex("by_trip_class", (q) =>
        q.eq("tripId", trip._id).eq("serviceClass", args.serviceClass)
      )
      .collect()
  ).filter((o) => isRangeFree(o.soldMask | o.heldMask | o.blockedMask, request))
  const candidates = await Promise.all(
    occupancies.map(async (o) => ({ occupancy: o, seat: await ctx.db.get(o.seatId) }))
  )
  const libre = candidates
    .filter((c) => c.seat !== null)
    .sort(
      (a, b) =>
        (coaches.get(a.occupancy.coachId)?.position ?? 0) -
          (coaches.get(b.occupancy.coachId)?.position ?? 0) ||
        a.seat!.row - b.seat!.row ||
        a.seat!.column - b.seat!.column
    )[0]
  if (!libre) return null

  await ctx.db.patch(libre.occupancy._id, {
    soldMask: libre.occupancy.soldMask | request,
  })
  for (const counter of counters) {
    const sold = counter.sold + 1
    await ctx.db.patch(counter._id, {
      sold,
      available: counter.capacity - sold - counter.held - counter.reserved,
    })
  }

  const seq = await nextSequence(
    ctx,
    sequenceKey(args.pointOfSaleCode, args.serviceDate, "billet")
  )
  const distanceKm = Math.abs(
    stops[toIndex]!.kilometerPoint - stops[fromIndex]!.kilometerPoint
  )
  const ticketId = await ctx.db.insert("tickets", {
    saleId: args.saleId,
    number: formatNumber("billet", args.pointOfSaleCode, args.serviceDate, seq),
    tripId: trip._id,
    passenger: { ...decouperNom(args.passengerName), gender: "M" },
    originStationId: args.originStationId,
    destinationStationId: args.destinationStationId,
    fromStopIndex: fromIndex,
    toStopIndex: toIndex,
    serviceClass: args.serviceClass,
    seatId: libre.occupancy.seatId,
    seatLabel: libre.seat!.label,
    coachLabel: coaches.get(libre.occupancy.coachId)?.label,
    isStanding: false,
    fare: {
      distanceKm,
      chargeableKm: distanceKm,
      ratePerKm: 0,
      discountPct: 0,
      appliedRules: ["vente_manuelle"],
      roundingStep: 0,
    },
    unitPriceTtc: args.amountTtc,
    status: "valide",
    duplicateCount: 0,
  })
  return (await ctx.db.get(ticketId))!
}

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
    if (!args.passengerName.trim()) {
      throw new Error("Le nom du voyageur inscrit sur la souche est obligatoire")
    }
    if (args.originStationId === args.destinationStationId) {
      throw new Error("Le départ et l'arrivée doivent être différents")
    }
    const trip = args.tripId ? await ctx.db.get(args.tripId) : null
    if (args.tripId && !trip) throw new Error("Desserte introuvable")

    // L'argent de la souche est dans le tiroir du vendeur qui la ressaisit
    // lui-même pendant sa session : elle entre dans son rapprochement.
    const session =
      args.originalSellerId === actor._id
        ? await ctx.db
            .query("cashSessions")
            .withIndex("by_seller", (q) => q.eq("sellerId", actor._id))
            .filter((q) => q.eq(q.field("status"), "ouverte"))
            .first()
        : null
    const cashSessionId =
      session && session.openedAt <= args.soldAt ? session._id : undefined

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
      paymentMethod: "especes",
      accountingDayId: day._id,
      cashSessionId,
      refundReason: args.notes,
      // Date RÉELLE de la vente, pas celle de la ressaisie.
      soldAt: args.soldAt,
    })

    const ticket = trip
      ? await tenirPlaceDeLaSouche(ctx, {
          trip,
          originStationId: args.originStationId,
          destinationStationId: args.destinationStationId,
          serviceClass: args.serviceClass,
          saleId,
          passengerName: args.passengerName,
          amountTtc: amounts.ttc,
          pointOfSaleCode: pointOfSale.code,
          serviceDate,
        })
      : null

    const manualId = await ctx.db.insert("manualTickets", {
      saleId,
      preprintedNumber: normalized,
      systemNumber,
      soldAt: args.soldAt,
      recordedAt: Date.now(),
      originalSellerId: args.originalSellerId,
      recordedBy: actor._id,
      passengerName: args.passengerName.trim(),
      tripId: trip?._id,
      originStationId: args.originStationId,
      destinationStationId: args.destinationStationId,
      serviceClass: args.serviceClass,
      ticketId: ticket?._id,
      pointOfSaleId,
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
        ticket: ticket?.number,
        seat: ticket ? `${ticket.coachLabel ?? ""} ${ticket.seatLabel ?? ""}`.trim() : null,
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
      ticketNumber: ticket?.number ?? null,
      seat: ticket
        ? { coachLabel: ticket.coachLabel ?? null, seatLabel: ticket.seatLabel ?? null }
        : null,
      /** Desserte fournie mais train complet : aucune place tenue. */
      withoutSeat: Boolean(trip) && !ticket,
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
