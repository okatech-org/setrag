import { v } from "convex/values"
import { mutation, query } from "../_generated/server"
import type { Doc, Id } from "../_generated/dataModel"
import type { MutationCtx } from "../_generated/server"
import { audit, requirePermission } from "../lib/auth"
import {
  activeFareSchedule,
  currentAccountingDay,
  nextSequence,
} from "../lib/saleContext"
import { paymentMethod, serviceClass } from "../schema"
import { computeTicketFare, type FareSchedule } from "../model/fares"
import {
  isRangeFree,
  occupy,
  release,
  segmentMask,
  SeatUnavailableError,
} from "../model/inventory"
import { occupancyRate, quotePrice, type PricingRule } from "../model/pricing"
import {
  buildAmounts,
  formatNumber,
  negateAmounts,
  refundAmount,
  sequenceKey,
  sumAmounts,
  type Amounts,
} from "../model/sales"
import { daysUntilDeparture, toServiceDate, weekdayOf } from "../model/calendar"
import { PAYLOAD_VERSION, expiryFromArrival } from "../model/barcode"
import { CURRENT_KEY_VERSION, signTicket } from "../lib/signature"
import { quoteTrip } from "../lib/tripQuote"

/**
 * Vente de billets — le cœur transactionnel du système.
 *
 * Toute la vente tient dans UNE mutation : lecture des disponibilités,
 * attribution des places, décrément des compteurs, écriture de la vente et
 * des titres. C'est l'atomicité de la transaction Convex qui rend la
 * survente structurellement impossible — deux ventes concurrentes sur les
 * mêmes segments entrent en conflit et l'une est rejouée.
 */

/* ────────────────────────── Vente au guichet ───────────────────────────── */

const passengerArg = v.object({
  lastName: v.string(),
  firstName: v.string(),
  gender: v.union(v.literal("M"), v.literal("F")),
  phone: v.optional(v.string()),
  emergencyPhone: v.optional(v.string()),
  birthDate: v.optional(v.string()),
  nationality: v.optional(v.string()),
  documentNumber: v.optional(v.string()),
  /** Code de réduction présenté, vérifié contre la grille active. */
  discountCode: v.optional(v.string()),
  /** Place souhaitée ; à défaut, la première libre est attribuée. */
  seatId: v.optional(v.id("seats")),
})

/** Vente ferme au guichet — conserve la signature historique. */
export async function performCounterSale(
  ctx: MutationCtx,
  actor: Doc<"users">,
  args: CounterSaleArgs
) {
  return await performSale(
    ctx,
    { actor, channel: "guichet", mode: "ferme" },
    args
  )
}

export const createCounterSale = mutation({
  args: {
    tripId: v.id("trips"),
    originStationId: v.id("stations"),
    destinationStationId: v.id("stations"),
    serviceClass,
    passengers: v.array(passengerArg),
    method: paymentMethod,
    /** Montant remis par le client, pour le rendu de monnaie en espèces. */
    tendered: v.optional(v.number()),
    promoCode: v.optional(v.string()),
    deviceId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "ventes", "creer")
    return await performCounterSale(ctx, actor, args)
  },
})

/** Devis utilisant exactement le canal et les règles tarifaires du guichet. */
export const quoteCounterSale = query({
  args: {
    tripId: v.id("trips"),
    originStationId: v.id("stations"),
    destinationStationId: v.id("stations"),
    serviceClass,
    passengerCount: v.number(),
    discountCodes: v.optional(v.array(v.string())),
    promoCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "ventes", "consulter")
    return await quoteTrip(ctx, args, "guichet")
  },
})

/** Arguments de la vente au guichet, partagés par les points d'entrée. */
export interface CounterSaleArgs {
  tripId: Id<"trips">
  originStationId: Id<"stations">
  destinationStationId: Id<"stations">
  serviceClass: "DEUXIEME" | "PREMIERE" | "VIP"
  passengers: Array<{
    lastName: string
    firstName: string
    gender: "M" | "F"
    phone?: string
    emergencyPhone?: string
    birthDate?: string
    nationality?: string
    documentNumber?: string
    discountCode?: string
    seatId?: Id<"seats">
  }>
  method:
    | "especes"
    | "airtel_money"
    | "moov_money"
    | "clickpay"
    | "visa"
    | "mastercard"
    | "en_compte"
  tendered?: number
  promoCode?: string
  deviceId?: string
  /** Clé d'idempotence des ventes rejouées depuis un terminal hors ligne. */
  clientSaleId?: string
}

/**
 * Cœur transactionnel de la vente au guichet.
 *
 * Extrait de la mutation publique pour que les tests de concurrence contre un
 * vrai backend exercent EXACTEMENT le même code que la vente réelle — un
 * test qui vérifierait une copie de la logique ne prouverait rien.
 *
 * Le contrôle d'accès reste à la charge de l'appelant : cette fonction reçoit
 * un acteur déjà autorisé.
 */
/**
 * Mode d'écriture de l'inventaire.
 *
 * `ferme` — la place est vendue définitivement (guichet, agence, bord).
 * `hold`  — la place est réservée temporairement, en attente de règlement
 *           (vente en ligne). Le masque et les compteurs distinguent les
 *           deux : une réservation expirée se libère sans toucher aux ventes.
 */
export type SaleMode = "ferme" | "hold"

export interface PerformSaleContext {
  /** Agent vendeur, pour les canaux internes. */
  readonly actor?: Doc<"users">
  /** Client, pour la vente en ligne. */
  readonly customer?: Doc<"users"> | null
  readonly channel: "guichet" | "ligne" | "agence" | "bord"
  readonly mode: SaleMode
  /** Durée du blocage, en millisecondes. Requis en mode `hold`. */
  readonly holdMs?: number
  readonly contactPhone?: string
  readonly contactEmail?: string
}

/**
 * Cœur transactionnel de la vente, tous canaux confondus.
 *
 * Guichet et vente en ligne partagent EXACTEMENT le même code d'allocation :
 * c'est la seule façon de garantir qu'une réservation en ligne et une vente
 * au comptoir ne peuvent pas attribuer la même place. Seuls diffèrent le
 * mode d'écriture de l'inventaire, l'exigence de caisse et le statut final.
 */
export async function performSale(
  ctx: MutationCtx,
  sale: PerformSaleContext,
  args: CounterSaleArgs
) {
  {
    const actor = sale.actor
    const isInternal = sale.channel !== "ligne"

    if (args.passengers.length === 0) {
      throw new Error("Aucun voyageur : vente impossible")
    }

    let pointOfSale: Doc<"pointsOfSale"> | null = null
    let session: Doc<"cashSessions"> | null = null

    if (isInternal) {
      if (!actor?.pointOfSaleId) {
        throw new Error(
          "Agent non rattaché à un point de vente : vente impossible"
        )
      }
      pointOfSale = await ctx.db.get(actor.pointOfSaleId)
      if (!pointOfSale || !pointOfSale.isActive) {
        throw new Error("Point de vente inconnu ou fermé")
      }

      /* ── Session de caisse ouverte ─────────────────────────────────── */
      session = await ctx.db
        .query("cashSessions")
        .withIndex("by_seller", (q) => q.eq("sellerId", actor._id))
        .filter((q) => q.eq(q.field("status"), "ouverte"))
        .first()
      if (!session) {
        throw new Error("Aucune session de caisse ouverte : vente impossible")
      }
    }

    /* ── Desserte et trajet ──────────────────────────────────────────── */
    const trip = await ctx.db.get(args.tripId)
    if (!trip) throw new Error("Desserte introuvable")
    if (!trip.isOpenForSale) {
      throw new Error("Desserte fermée à la vente")
    }
    if (trip.status === "annule" || trip.status === "termine") {
      throw new Error(`Desserte « ${trip.status} » : vente impossible`)
    }

    const stops = (
      await ctx.db
        .query("tripStops")
        .withIndex("by_trip_sequence", (q) => q.eq("tripId", args.tripId))
        .collect()
    ).sort((a, b) => a.sequence - b.sequence)

    const fromIndex = stops.findIndex(
      (s) => s.stationId === args.originStationId
    )
    const toIndex = stops.findIndex(
      (s) => s.stationId === args.destinationStationId
    )
    if (fromIndex === -1) throw new Error("Gare de départ non desservie")
    if (toIndex === -1) throw new Error("Gare d'arrivée non desservie")
    if (toIndex <= fromIndex) {
      throw new Error("Sens de circulation incompatible avec cette desserte")
    }

    const distanceKm = Math.abs(
      stops[toIndex]!.kilometerPoint - stops[fromIndex]!.kilometerPoint
    )
    const request = segmentMask({ fromIndex, toIndex }, trip.segmentCount)
    const seatsNeeded = args.passengers.length

    /* ── Compteurs : le garde-fou anti-survente ──────────────────────── */
    const counters = (
      await ctx.db
        .query("segmentCounters")
        .withIndex("by_trip_class", (q) => q.eq("tripId", args.tripId))
        .collect()
    ).filter((c) => c.serviceClass === args.serviceClass)

    if (counters.length === 0) {
      throw new Error(
        `Classe ${args.serviceClass} non commercialisée sur cette desserte`
      )
    }

    const onRoute = counters.filter(
      (c) => c.segmentIndex >= fromIndex && c.segmentIndex < toIndex
    )
    const available = Math.min(...onRoute.map((c) => c.available))
    if (available < seatsNeeded) {
      throw new Error(
        `Places insuffisantes : ${seatsNeeded} demandée(s), ` +
          `${available} disponible(s) sur le segment le plus chargé`
      )
    }

    /* ── Attribution des places ──────────────────────────────────────── */
    const occupancies = (
      await ctx.db
        .query("seatOccupancy")
        .withIndex("by_trip_class", (q) => q.eq("tripId", args.tripId))
        .collect()
    ).filter((o) => o.serviceClass === args.serviceClass)

    const assigned: Array<{
      occupancy: Doc<"seatOccupancy">
      seat: Doc<"seats"> | null
    }> = []
    const taken = new Set<string>()

    for (const passenger of args.passengers) {
      let chosen: Doc<"seatOccupancy"> | undefined

      if (passenger.seatId) {
        chosen = occupancies.find(
          (o) => o.seatId === passenger.seatId && !taken.has(o._id)
        )
        if (!chosen) {
          throw new Error("Place demandée inconnue sur cette desserte")
        }
        const busy = chosen.soldMask | chosen.heldMask | chosen.blockedMask
        if (!isRangeFree(busy, request)) {
          throw new SeatUnavailableError(busy, request)
        }
      } else {
        chosen = occupancies.find((o) => {
          if (taken.has(o._id)) return false
          const busy = o.soldMask | o.heldMask | o.blockedMask
          return isRangeFree(busy, request)
        })
        if (!chosen) {
          throw new Error(
            "Aucune place libre sur l'intégralité du trajet demandé"
          )
        }
      }

      taken.add(chosen._id)
      assigned.push({
        occupancy: chosen,
        seat: await ctx.db.get(chosen.seatId),
      })
    }

    /* ── Tarification ────────────────────────────────────────────────── */
    const { schedule, bases, discounts } = await activeFareSchedule(ctx)
    const fareSchedule: FareSchedule = {
      taxes: { vatPct: schedule.vatPct, cssPct: schedule.cssPct },
      roundingBasis: schedule.roundingBasis,
      bases: bases.map((b) => ({
        trainType: b.trainType,
        serviceClass: b.serviceClass,
        shortDistanceRate: b.shortDistanceRate,
        longDistanceRate: b.longDistanceRate,
      })),
    }

    const quotas = (
      await ctx.db
        .query("fareClassQuotas")
        .withIndex("by_trip_class", (q) => q.eq("tripId", args.tripId))
        .collect()
    ).filter((q) => q.serviceClass === args.serviceClass)

    const rules = await ctx.db
      .query("pricingRules")
      .withIndex("by_active_priority", (q) => q.eq("isActive", true))
      .collect()
    const scopedRules: PricingRule[] = rules
      .filter((r) => r.tripId === undefined || r.tripId === args.tripId)
      .filter(
        (r) =>
          r.serviceClass === undefined || r.serviceClass === args.serviceClass
      )
      .map((r) => ({
        id: r._id,
        type: r.type,
        threshold: r.threshold,
        modifierPct: r.modifierPct,
        priority: r.priority,
        validFrom: r.validFrom,
        validUntil: r.validUntil,
        code: r.code,
        isActive: r.isActive,
      }))

    const capacity = onRoute[0]?.capacity ?? 0
    const soldOnRoute = Math.max(...onRoute.map((c) => c.sold))
    const now = Date.now()
    const pricingContext = {
      occupancyRate: occupancyRate(capacity, soldOnRoute),
      daysUntilDeparture: daysUntilDeparture(trip.departureAt, now),
      departureWeekday: weekdayOf(trip.serviceDate),
      // Le canal réel de la vente : une règle de yield « ligne » doit valoir
      // pour le prix figé d'une réservation en ligne comme pour le devis
      // annoncé par `bookings.quote`, et non celles du guichet.
      channel: sale.channel,
      now,
      promoCode: args.promoCode,
    }

    // Bornes de sécurité : la règle la plus prioritaire qui en déclare.
    const bounds = rules
      .filter((r) => r.floorXaf !== undefined || r.capXaf !== undefined)
      .sort((a, b) => a.priority - b.priority)[0]

    /* ── Titres ──────────────────────────────────────────────────────── */
    const serviceDate = toServiceDate(now)
    const accountingDay = await currentAccountingDay(ctx)
    const code = pointOfSale?.code ?? "LIGNE"

    const saleSeq = await nextSequence(
      ctx,
      sequenceKey(code, serviceDate, "vente")
    )
    const saleNumber = formatNumber("vente", code, serviceDate, saleSeq)

    const ticketAmounts: Amounts[] = []
    const ticketDrafts: Array<{
      number: string
      passenger: (typeof args.passengers)[number]
      occupancy: Doc<"seatOccupancy">
      seat: Doc<"seats"> | null
      unitPriceTtc: number
      fare: {
        distanceKm: number
        chargeableKm: number
        ratePerKm: number
        fareCode?: string
        discountCode?: string
        discountPct: number
        appliedRules: string[]
        roundingStep: number
      }
    }> = []

    for (const [index, passenger] of args.passengers.entries()) {
      const discount = passenger.discountCode
        ? discounts.find((d) => d.code === passenger.discountCode && d.isActive)
        : undefined
      if (passenger.discountCode && !discount) {
        throw new Error(
          `Réduction « ${passenger.discountCode} » inconnue ou désactivée`
        )
      }

      const base = computeTicketFare({
        schedule: fareSchedule,
        trainType: trip.trainType,
        serviceClass: args.serviceClass,
        distanceKm,
        discount: discount
          ? {
              code: discount.code as never,
              ratePct: discount.ratePct,
              label: discount.label,
            }
          : null,
      })

      const quote = quotePrice({
        basePriceTtc: base.ttc,
        distanceKm,
        quotas: quotas.map((q) => ({
          label: q.label,
          priority: q.priority,
          seatCount: q.seatCount,
          soldCount: q.soldCount,
          coefficient: q.coefficient,
          isActive: q.isActive,
        })),
        seatsNeeded,
        rules: scopedRules,
        context: pricingContext,
        floorXaf: bounds?.floorXaf,
        capXaf: bounds?.capXaf,
      })

      const ticketSeq = await nextSequence(
        ctx,
        sequenceKey(code, serviceDate, "billet")
      )
      ticketDrafts.push({
        number: formatNumber("billet", code, serviceDate, ticketSeq),
        passenger,
        occupancy: assigned[index]!.occupancy,
        seat: assigned[index]!.seat,
        unitPriceTtc: quote.unitPriceTtc,
        fare: {
          distanceKm,
          chargeableKm: base.chargeableKm,
          ratePerKm: base.ratePerKm,
          fareCode: discount?.code,
          discountCode: base.discountCode ?? undefined,
          discountPct: base.discountPct,
          appliedRules: quote.appliedRules,
          roundingStep: base.roundingStep,
        },
      })
      ticketAmounts.push(
        buildAmounts(
          quote.unitPriceTtc,
          schedule.vatPct,
          schedule.cssPct,
          quote.unitPriceTtc
        )
      )
    }

    const total = sumAmounts(ticketAmounts)

    // Le rendu de monnaie est calculé, mais c'est le TTC qui est encaissé.
    if (args.method === "especes" && args.tendered !== undefined) {
      if (args.tendered < total.ttc) {
        throw new Error(
          `Règlement insuffisant : ${args.tendered} remis pour ${total.ttc} dus`
        )
      }
    }

    /* ── Écritures : vente, titres, inventaire ───────────────────────── */
    // Une réservation n'encaisse rien : le montant perçu reste à zéro tant
    // que le règlement n'est pas intervenu.
    const recorded = sale.mode === "hold" ? { ...total, received: 0 } : total

    const saleId = await ctx.db.insert("sales", {
      number: saleNumber,
      kind: "vente",
      product: "billet",
      channel: sale.channel,
      status: sale.mode === "hold" ? "en_attente_paiement" : "confirmee",
      pointOfSaleId: pointOfSale?._id,
      sellerId: actor?._id,
      customerId: sale.customer?._id,
      contactPhone: sale.contactPhone,
      contactEmail: sale.contactEmail,
      deviceId: args.deviceId,
      amounts: recorded,
      // Une réservation n'entre en comptabilité qu'une fois réglée.
      accountingDayId: sale.mode === "hold" ? undefined : accountingDay._id,
      cashSessionId: session?._id,
      // Le prix est figé pour toute la durée du blocage.
      priceLockedUntil:
        sale.mode === "hold" ? now + (sale.holdMs ?? 0) : undefined,
      clientSaleId: args.clientSaleId,
      soldAt: now,
    })

    for (const draft of ticketDrafts) {
      // Occupe la place : lève si un segment vient d'être pris.
      const busy =
        draft.occupancy.soldMask |
        draft.occupancy.heldMask |
        draft.occupancy.blockedMask
      occupy(busy, request)
      await ctx.db.patch(
        draft.occupancy._id,
        sale.mode === "hold"
          ? { heldMask: draft.occupancy.heldMask | request }
          : { soldMask: draft.occupancy.soldMask | request }
      )

      // Le code-barres est signé dès l'émission, y compris pour une
      // réservation non réglée : il n'atteste que l'identité et la portée du
      // titre. Son statut — en attente, annulé, déjà contrôlé — vient du
      // manifeste, pas du symbole. Une seule signature, donc, quel que soit
      // le devenir de la vente.
      const signed = signTicket({
        v: PAYLOAD_VERSION,
        k: CURRENT_KEY_VERSION,
        kind: "billet",
        ref: draft.number,
        trip: args.tripId,
        // La date de CIRCULATION, pas celle de la vente : `serviceDate` vaut
        // ici la journée de guichet, qui sert à numéroter les pièces. Un
        // billet acheté la veille afficherait sinon une date démentie par le
        // train dans lequel il est présenté.
        date: trip.serviceDate,
        cls: args.serviceClass,
        from: fromIndex,
        to: toIndex,
        seat: draft.seat?.label,
        exp: expiryFromArrival(trip.arrivalAt),
      })

      await ctx.db.insert("tickets", {
        saleId,
        number: draft.number,
        tripId: args.tripId,
        passenger: {
          lastName: draft.passenger.lastName,
          firstName: draft.passenger.firstName,
          gender: draft.passenger.gender,
          phone: draft.passenger.phone,
          emergencyPhone: draft.passenger.emergencyPhone,
          birthDate: draft.passenger.birthDate,
          nationality: draft.passenger.nationality,
          documentNumber: draft.passenger.documentNumber,
        },
        originStationId: args.originStationId,
        destinationStationId: args.destinationStationId,
        fromStopIndex: fromIndex,
        toStopIndex: toIndex,
        serviceClass: args.serviceClass,
        seatId: draft.occupancy.seatId,
        seatLabel: draft.seat?.label,
        coachLabel: undefined,
        isStanding: false,
        fare: draft.fare,
        unitPriceTtc: draft.unitPriceTtc,
        status: sale.mode === "hold" ? "en_attente" : "valide",
        barcodePayload: signed.barcode,
        barcodeSignature: signed.signatureHex,
        keyVersion: signed.keyVersion,
        duplicateCount: 0,
      })
    }

    // Décrémente les compteurs de chaque segment emprunté. En mode « hold »,
    // les places passent en réservation temporaire plutôt qu'en vente ferme :
    // la disponibilité chute pareillement, mais l'expiration les libère.
    for (const counter of onRoute) {
      const sold =
        sale.mode === "hold" ? counter.sold : counter.sold + seatsNeeded
      const held =
        sale.mode === "hold" ? counter.held + seatsNeeded : counter.held
      const available = counter.capacity - sold - held - counter.reserved
      if (available < 0) {
        throw new Error(
          `Survente détectée sur le segment ${counter.segmentIndex} : ` +
            `transaction annulée`
        )
      }
      await ctx.db.patch(counter._id, { sold, held, available })
    }

    // Consomme le contingent tarifaire retenu, celui-là même qui a servi au
    // calcul du prix : le moins prioritaire capable d'absorber l'effectif.
    for (const quota of [...quotas].sort((a, b) => a.priority - b.priority)) {
      if (quota.seatCount - quota.soldCount >= seatsNeeded && quota.isActive) {
        await ctx.db.patch(quota._id, {
          soldCount: quota.soldCount + seatsNeeded,
        })
        break
      }
    }

    if (sale.mode !== "hold") {
      await ctx.db.patch(accountingDay._id, {
        totalTtc: accountingDay.totalTtc + recorded.ttc,
        totalReceived: accountingDay.totalReceived + recorded.received,
      })
    }

    await audit(ctx, {
      actorId: actor?._id,
      action: sale.mode === "hold" ? "reservation.creer" : "vente.guichet",
      entityTable: "sales",
      entityId: saleId,
      deviceId: args.deviceId,
      after: {
        number: saleNumber,
        tickets: ticketDrafts.length,
        ttc: total.ttc,
        tripId: args.tripId,
      },
    })

    return {
      saleId,
      number: saleNumber,
      amounts: recorded,
      tickets: ticketDrafts.map((d) => ({
        number: d.number,
        seatLabel: d.seat?.label ?? null,
        unitPriceTtc: d.unitPriceTtc,
      })),
      changeDue:
        args.method === "especes" && args.tendered !== undefined
          ? Math.round((args.tendered - total.ttc) * 100) / 100
          : 0,
    }
  }
}

/* ─────────────── Annulations, remboursements, duplicatas ───────────────── */

/**
 * Session de caisse à laquelle rattacher une écriture d'annulation ou de
 * remboursement.
 *
 * L'argent ressort du tiroir qui l'a encaissé : on vise donc la session de la
 * vente d'origine. Si elle est déjà clôturée, l'écriture reste non rattachée
 * — modifier une caisse close fausserait un comptage déjà validé. Le montant
 * reste dans les totaux de la journée comptable dans les deux cas.
 */
async function refundCashSession(
  ctx: MutationCtx,
  sale: Doc<"sales">
): Promise<Id<"cashSessions"> | undefined> {
  if (!sale.cashSessionId) return undefined
  const session = await ctx.db.get(sale.cashSessionId)
  return session?.status === "ouverte" ? session._id : undefined
}

/**
 * Libère l'inventaire occupé par une liste de titres.
 *
 * Retire le masque de segments de chaque place et réincrémente les compteurs
 * correspondants. Plafonné à la capacité pour qu'une double libération ne
 * puisse jamais créer de places fantômes.
 */
async function releaseTicketsInventory(
  ctx: MutationCtx,
  tickets: readonly Doc<"tickets">[],
  trip: Doc<"trips">
): Promise<void> {
  for (const ticket of tickets) {
    const mask = segmentMask(
      { fromIndex: ticket.fromStopIndex, toIndex: ticket.toStopIndex },
      trip.segmentCount
    )

    if (ticket.seatId) {
      const occupancy = await ctx.db
        .query("seatOccupancy")
        .withIndex("by_trip_seat", (q) =>
          q.eq("tripId", ticket.tripId).eq("seatId", ticket.seatId!)
        )
        .unique()
      if (occupancy) {
        await ctx.db.patch(occupancy._id, {
          soldMask: release(occupancy.soldMask, mask),
        })
      }
    }

    const counters = (
      await ctx.db
        .query("segmentCounters")
        .withIndex("by_trip_class", (q) => q.eq("tripId", ticket.tripId))
        .collect()
    ).filter(
      (c) =>
        c.serviceClass === ticket.serviceClass &&
        c.segmentIndex >= ticket.fromStopIndex &&
        c.segmentIndex < ticket.toStopIndex
    )

    for (const counter of counters) {
      const sold = Math.max(0, counter.sold - 1)
      await ctx.db.patch(counter._id, {
        sold,
        available: Math.min(
          counter.capacity,
          counter.capacity - sold - counter.held - counter.reserved
        ),
      })
    }

    // Restitue la place au contingent tarifaire.
    const quotas = (
      await ctx.db
        .query("fareClassQuotas")
        .withIndex("by_trip_class", (q) => q.eq("tripId", ticket.tripId))
        .collect()
    )
      .filter((q) => q.serviceClass === ticket.serviceClass && q.soldCount > 0)
      .sort((a, b) => b.priority - a.priority)
    const quota = quotas[0]
    if (quota) {
      await ctx.db.patch(quota._id, {
        soldCount: Math.max(0, quota.soldCount - 1),
      })
    }
  }
}

/** Titres à traiter : ceux demandés, ou tous ceux de la vente. */
async function resolveTickets(
  ctx: MutationCtx,
  saleId: Id<"sales">,
  ticketIds?: readonly Id<"tickets">[]
): Promise<Doc<"tickets">[]> {
  const all = await ctx.db
    .query("tickets")
    .withIndex("by_sale", (q) => q.eq("saleId", saleId))
    .collect()
  if (!ticketIds || ticketIds.length === 0) return all

  const selected = all.filter((t) => ticketIds.includes(t._id))
  if (selected.length !== ticketIds.length) {
    throw new Error("Un titre demandé n'appartient pas à cette vente")
  }
  return selected
}

/** Retire les représentations PDF devenues obsolètes après un changement. */
async function invalidateSaleDocuments(
  ctx: MutationCtx,
  sale: Doc<"sales">,
  tickets: readonly Doc<"tickets">[]
): Promise<void> {
  for (const ticket of tickets) {
    if (ticket.pdfStorageId) await ctx.storage.delete(ticket.pdfStorageId)
  }
  if (sale.bundlePdfStorageId) {
    await ctx.storage.delete(sale.bundlePdfStorageId)
  }
  await ctx.db.patch(sale._id, { bundlePdfStorageId: undefined })
}

/**
 * Annule tout ou partie d'une vente.
 *
 * L'annulation ne supprime rien : elle crée une écriture liée en montants
 * négatifs et bascule les titres concernés à l'état « annulé ». Le CDC cite
 * l'indétectabilité des billets annulés comme une faille de fraude — la
 * traçabilité est donc le point central de cette fonction.
 */
export const cancel = mutation({
  args: {
    saleId: v.id("sales"),
    ticketIds: v.optional(v.array(v.id("tickets"))),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "annulations", "creer")
    if (args.reason.trim().length === 0) {
      throw new Error("Un motif d'annulation est obligatoire")
    }

    const sale = await ctx.db.get(args.saleId)
    if (!sale) throw new Error("Vente introuvable")
    if (sale.kind !== "vente") {
      throw new Error("Seule une vente peut être annulée")
    }
    if (sale.status !== "confirmee") {
      throw new Error(`Vente « ${sale.status} » : annulation impossible`)
    }

    const tickets = await resolveTickets(ctx, args.saleId, args.ticketIds)

    // Un titre déjà contrôlé à bord bloque l'annulation, et c'est le motif
    // le plus utile à afficher au guichet — il est donc vérifié en premier.
    const utilises = tickets.filter((t) => t.status === "utilise")
    if (utilises.length > 0) {
      throw new Error(
        `${utilises.length} titre(s) déjà contrôlé(s) à bord : annulation ` +
          `impossible`
      )
    }

    const actifs = tickets.filter((t) => t.status === "valide")
    if (actifs.length === 0) {
      throw new Error("Aucun titre valide à annuler dans cette vente")
    }

    const trip = await ctx.db.get(actifs[0]!.tripId)
    if (!trip) throw new Error("Desserte introuvable")

    await releaseTicketsInventory(ctx, actifs, trip)
    await invalidateSaleDocuments(ctx, sale, actifs)
    for (const ticket of actifs) {
      await ctx.db.patch(ticket._id, {
        status: "annule",
        pdfStorageId: undefined,
      })
    }

    const annuleTtc = actifs.reduce((sum, t) => sum + t.unitPriceTtc, 0)
    const schedule = await ctx.db
      .query("fareSchedules")
      .withIndex("by_status", (q) => q.eq("status", "actif"))
      .first()
    const positif = buildAmounts(
      annuleTtc,
      schedule?.vatPct ?? 0,
      schedule?.cssPct ?? 0,
      annuleTtc
    )

    const now = Date.now()
    const serviceDate = toServiceDate(now)
    const pointOfSale = sale.pointOfSaleId
      ? await ctx.db.get(sale.pointOfSaleId)
      : null
    const code = pointOfSale?.code ?? "SYS"
    const seq = await nextSequence(
      ctx,
      sequenceKey(code, serviceDate, "annulation")
    )
    const day = await currentAccountingDay(ctx)

    const cancellationId = await ctx.db.insert("sales", {
      number: formatNumber("annulation", code, serviceDate, seq),
      kind: "annulation",
      product: sale.product,
      channel: sale.channel,
      status: "confirmee",
      pointOfSaleId: sale.pointOfSaleId,
      sellerId: actor._id,
      customerId: sale.customerId,
      amounts: negateAmounts(positif),
      accountingDayId: day._id,
      cashSessionId: await refundCashSession(ctx, sale),
      originSaleId: args.saleId,
      refundReason: args.reason,
      soldAt: now,
      cancelledAt: now,
    })

    // La vente d'origine bascule seulement si tous ses titres sont annulés.
    const restants = (
      await ctx.db
        .query("tickets")
        .withIndex("by_sale", (q) => q.eq("saleId", args.saleId))
        .collect()
    ).filter((t) => t.status === "valide")
    if (restants.length === 0) {
      await ctx.db.patch(args.saleId, {
        status: "annulee",
        cancelledAt: now,
      })
    }

    await ctx.db.patch(day._id, {
      totalTtc: day.totalTtc - positif.ttc,
      totalReceived: day.totalReceived - positif.received,
    })

    await audit(ctx, {
      actorId: actor._id,
      action: "vente.annuler",
      entityTable: "sales",
      entityId: args.saleId,
      before: { status: sale.status, ttc: sale.amounts.ttc },
      after: {
        cancellationId,
        tickets: actifs.length,
        reason: args.reason,
        partial: restants.length > 0,
      },
    })

    return {
      cancellationId,
      cancelledTickets: actifs.length,
      amountTtc: -positif.ttc,
      partial: restants.length > 0,
    }
  },
})

/**
 * Rembourse tout ou partie d'une vente, pénalité déduite.
 *
 * Le taux de pénalité vient du paramétrage d'exploitation (CDC §8.5), il
 * n'est jamais codé en dur : il est passé par l'appelant, qui l'a lu dans le
 * motif de remboursement choisi au guichet.
 */
export const refund = mutation({
  args: {
    saleId: v.id("sales"),
    ticketIds: v.optional(v.array(v.id("tickets"))),
    reason: v.string(),
    penaltyPct: v.number(),
  },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "remboursements", "creer")
    if (args.reason.trim().length === 0) {
      throw new Error("Un motif de remboursement est obligatoire")
    }

    const sale = await ctx.db.get(args.saleId)
    if (!sale) throw new Error("Vente introuvable")
    if (sale.kind !== "vente") {
      throw new Error("Seule une vente peut être remboursée")
    }
    if (sale.status === "remboursee") {
      throw new Error("Vente déjà remboursée")
    }

    const tickets = await resolveTickets(ctx, args.saleId, args.ticketIds)
    const remboursables = tickets.filter((t) => t.status === "valide")
    if (remboursables.length === 0) {
      throw new Error("Aucun titre remboursable dans cette vente")
    }

    const trip = await ctx.db.get(remboursables[0]!.tripId)
    if (!trip) throw new Error("Desserte introuvable")

    await releaseTicketsInventory(ctx, remboursables, trip)
    await invalidateSaleDocuments(ctx, sale, remboursables)
    for (const ticket of remboursables) {
      await ctx.db.patch(ticket._id, {
        status: "rembourse",
        pdfStorageId: undefined,
      })
    }

    const payeTtc = remboursables.reduce((sum, t) => sum + t.unitPriceTtc, 0)
    const rembourseTtc = refundAmount(payeTtc, args.penaltyPct)

    const schedule = await ctx.db
      .query("fareSchedules")
      .withIndex("by_status", (q) => q.eq("status", "actif"))
      .first()
    const positif = buildAmounts(
      rembourseTtc,
      schedule?.vatPct ?? 0,
      schedule?.cssPct ?? 0,
      rembourseTtc
    )

    const now = Date.now()
    const serviceDate = toServiceDate(now)
    const pointOfSale = sale.pointOfSaleId
      ? await ctx.db.get(sale.pointOfSaleId)
      : null
    const code = pointOfSale?.code ?? "SYS"
    const seq = await nextSequence(
      ctx,
      sequenceKey(code, serviceDate, "remboursement")
    )
    const day = await currentAccountingDay(ctx)

    const refundId = await ctx.db.insert("sales", {
      number: formatNumber("remboursement", code, serviceDate, seq),
      kind: "remboursement",
      product: sale.product,
      channel: sale.channel,
      status: "confirmee",
      pointOfSaleId: sale.pointOfSaleId,
      sellerId: actor._id,
      customerId: sale.customerId,
      amounts: negateAmounts(positif),
      accountingDayId: day._id,
      cashSessionId: await refundCashSession(ctx, sale),
      originSaleId: args.saleId,
      refundReason: args.reason,
      penaltyPct: args.penaltyPct,
      soldAt: now,
    })

    const restants = (
      await ctx.db
        .query("tickets")
        .withIndex("by_sale", (q) => q.eq("saleId", args.saleId))
        .collect()
    ).filter((t) => t.status === "valide")
    if (restants.length === 0) {
      await ctx.db.patch(args.saleId, { status: "remboursee" })
    }

    await ctx.db.patch(day._id, {
      totalTtc: day.totalTtc - positif.ttc,
      totalReceived: day.totalReceived - positif.received,
    })

    await audit(ctx, {
      actorId: actor._id,
      action: "vente.rembourser",
      entityTable: "sales",
      entityId: args.saleId,
      before: { paidTtc: payeTtc },
      after: {
        refundId,
        tickets: remboursables.length,
        penaltyPct: args.penaltyPct,
        refundedTtc: rembourseTtc,
        reason: args.reason,
      },
    })

    return {
      refundId,
      refundedTickets: remboursables.length,
      paidTtc: payeTtc,
      penaltyPct: args.penaltyPct,
      refundedTtc: rembourseTtc,
      partial: restants.length > 0,
    }
  },
})

/**
 * Réimprime un titre.
 *
 * La réimpression produit un DUPLICATA tracé, jamais un second original :
 * le CDC cite « la réimpression de plusieurs billets sans outils de
 * contrôle » et l'absence de mention duplicata parmi les failles de fraude
 * de l'existant.
 */
export const reprintTicket = mutation({
  args: { ticketId: v.id("tickets") },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "duplicatas", "creer")
    const ticket = await ctx.db.get(args.ticketId)
    if (!ticket) throw new Error("Titre introuvable")
    if (ticket.status !== "valide") {
      throw new Error(`Titre « ${ticket.status} » : réimpression impossible`)
    }

    const duplicateCount = ticket.duplicateCount + 1
    await ctx.db.patch(args.ticketId, { duplicateCount })

    await audit(ctx, {
      actorId: actor._id,
      action: "billet.duplicata",
      entityTable: "tickets",
      entityId: args.ticketId,
      before: { duplicateCount: ticket.duplicateCount },
      after: { duplicateCount, number: ticket.number },
    })

    return {
      ticketNumber: ticket.number,
      duplicateCount,
      /** Mention à imprimer en clair sur le titre. */
      mention: `DUPLICATA N°${duplicateCount}`,
    }
  },
})

/** Détail d'une vente et de ses titres. */
export const get = query({
  args: { saleId: v.id("sales") },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "ventes", "consulter")
    const sale = await ctx.db.get(args.saleId)
    if (!sale) throw new Error("Vente introuvable")
    const tickets = await ctx.db
      .query("tickets")
      .withIndex("by_sale", (q) => q.eq("saleId", args.saleId))
      .collect()
    return { sale, tickets }
  },
})

/** Recherche d'opérations pour l'écran d'annulation et de duplicata. */
export const search = query({
  args: {
    number: v.optional(v.string()),
    accountingDayId: v.optional(v.id("accountingDays")),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "ventes", "consulter")
    if (args.number) {
      const sale = await ctx.db
        .query("sales")
        .withIndex("by_number", (q) => q.eq("number", args.number!))
        .unique()
      return sale ? [sale] : []
    }
    if (args.accountingDayId) {
      return await ctx.db
        .query("sales")
        .withIndex("by_accounting_day", (q) =>
          q.eq("accountingDayId", args.accountingDayId)
        )
        .collect()
    }
    return []
  },
})
