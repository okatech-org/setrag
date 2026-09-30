import { v, type ObjectType } from "convex/values"
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server"
import { internal } from "../_generated/api"
import type { Doc, Id } from "../_generated/dataModel"
import {
  assertActiveUser,
  audit,
  getUser,
  loadActor,
  requireUser,
} from "../lib/auth"
import { activeFareSchedule, currentAccountingDay } from "../lib/saleContext"
import { paymentMethod, serviceClass } from "../schema"
import { performSale } from "./sales"
import { completerCiviliteDuTitulaire } from "./customers"
import { release, segmentMask } from "../model/inventory"
import { quoteTrip } from "../lib/tripQuote"
import { horairesDuVoyageur } from "../lib/horaires"
import { CURRENT_CGV_VERSION } from "../model/cgv"
import {
  CHIFFRES_SIGNIFICATIFS_MIN,
  memeTelephone,
  telephoneDeContactValide,
} from "../model/telephone"

/**
 * Vente en ligne — réservation, règlement et espace client.
 *
 * Une réservation bloque les places pour un temps limité : le voyageur a le
 * temps de payer sans que le train se remplisse sous lui, et les places
 * reviennent automatiquement à la vente s'il abandonne.
 *
 * L'allocation passe par la MÊME fonction que la vente au guichet
 * (`performSale`) : c'est ce qui garantit qu'une réservation en ligne et une
 * vente au comptoir ne peuvent jamais attribuer la même place.
 *
 * Les opérations du voyageur sont écrites pour un profil déjà résolu. Les
 * fonctions publiques le lisent dans le jeton de session ; les variantes
 * `…ForActor`, internes, le reçoivent du code serveur qui a résolu l'acteur
 * d'une conversation d'assistant (web ou messagerie).
 */

/** Durée du blocage d'une réservation non réglée. */
export const HOLD_DURATION_MS = 15 * 60 * 1000

/**
 * Réponse unique à une référence inconnue et à un téléphone qui ne lui
 * correspond pas : distinguer les deux dirait à un tiers qu'une référence
 * existe, et l'aiderait à les énumérer.
 */
export const ACCES_REFUSE = "Référence ou téléphone incorrect"

/**
 * Accès d'un appelant à une vente : son titulaire connecté, ou quiconque
 * donne le téléphone de contact. La référence seule ne suffit jamais.
 */
function peutAcceder(
  sale: Doc<"sales">,
  user: Doc<"users"> | null,
  contactPhone: string | undefined
): boolean {
  const estTitulaire =
    user !== null && sale.customerId !== undefined && sale.customerId === user._id
  return estTitulaire || memeTelephone(sale.contactPhone, contactPhone)
}

async function venteParReference(
  ctx: QueryCtx,
  reference: string
): Promise<Doc<"sales"> | null> {
  return await ctx.db
    .query("sales")
    .withIndex("by_number", (q) => q.eq("number", reference))
    .unique()
}

const passengerArg = v.object({
  lastName: v.string(),
  firstName: v.string(),
  gender: v.union(v.literal("M"), v.literal("F")),
  phone: v.optional(v.string()),
  emergencyPhone: v.optional(v.string()),
  birthDate: v.optional(v.string()),
  nationality: v.optional(v.string()),
  documentNumber: v.optional(v.string()),
  discountCode: v.optional(v.string()),
  seatId: v.optional(v.id("seats")),
})

/* ──────────────────────────── Devis public ─────────────────────────────── */

/**
 * Prix d'un trajet, sans rien réserver.
 *
 * Query publique : le site doit pouvoir afficher un prix avant toute
 * identification. Le montant retourné est indicatif — il sera figé à la
 * création de la réservation, et le yield peut l'avoir fait évoluer entre
 * les deux.
 */
export const quote = query({
  args: {
    tripId: v.id("trips"),
    originStationId: v.id("stations"),
    destinationStationId: v.id("stations"),
    serviceClass,
    passengerCount: v.number(),
    discountCodes: v.optional(v.array(v.string())),
    promoCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => ({
    ...(await quoteTrip(ctx, args, "ligne")),
    holdDurationMs: HOLD_DURATION_MS,
  }),
})

/* ────────────────────────── Créer une réservation ──────────────────────── */

const createArgs = {
  tripId: v.id("trips"),
  originStationId: v.id("stations"),
  destinationStationId: v.id("stations"),
  serviceClass,
  passengers: v.array(passengerArg),
  contactPhone: v.string(),
  contactEmail: v.optional(v.string()),
  promoCode: v.optional(v.string()),
}

/**
 * Lecture de l'inventaire et blocage dans la même mutation que l'appelant :
 * `performSale` reste la seule voie d'allocation, ce qui exclut la survente.
 */
async function createBooking(
  ctx: MutationCtx,
  customer: Doc<"users"> | null,
  args: ObjectType<typeof createArgs>
) {
  if (!args.contactPhone.trim()) {
    throw new Error("Un contact téléphonique est obligatoire")
  }
  // Ce numéro ouvre ensuite la réservation sans compte : trop court, il se
  // devinerait.
  if (!telephoneDeContactValide(args.contactPhone)) {
    throw new Error(
      `Téléphone de contact incomplet : indiquez un numéro d'au moins ` +
        `${CHIFFRES_SIGNIFICATIFS_MIN} chiffres, par exemple 077 12 34 56`
    )
  }

  const result = await performSale(
    ctx,
    {
      customer,
      channel: "ligne",
      mode: "hold",
      holdMs: HOLD_DURATION_MS,
      contactPhone: args.contactPhone,
      contactEmail: args.contactEmail,
    },
    {
      tripId: args.tripId,
      originStationId: args.originStationId,
      destinationStationId: args.destinationStationId,
      serviceClass: args.serviceClass,
      passengers: args.passengers,
      method: "airtel_money",
      promoCode: args.promoCode,
    }
  )

  // Le titulaire qui voyage donne ici sa civilité : si son profil n'en
  // portait pas encore, elle le complète et ne lui sera plus demandée.
  const civiliteEnregistree = await completerCiviliteDuTitulaire(
    ctx,
    customer,
    args.passengers
  )

  return {
    ...result,
    reference: result.number,
    holdExpiresAt: Date.now() + HOLD_DURATION_MS,
    civiliteEnregistree,
  }
}

/**
 * Réserve des places pour quinze minutes.
 *
 * Accessible sans compte : le CDC fait de l'espace client une option. Le
 * numéro de téléphone suffit à retrouver la réservation, et le voyageur peut
 * régler en ligne ou au guichet avant expiration.
 */
export const create = mutation({
  args: createArgs,
  handler: async (ctx, args) => {
    // L'identification est facultative : un visiteur peut réserver.
    return await createBooking(ctx, await getUser(ctx), args)
  },
})

/** Variante interne : la réservation est rattachée à l'acteur, s'il existe. */
export const createForActor = internalMutation({
  args: { userId: v.optional(v.id("users")), ...createArgs },
  handler: async (ctx, { userId, ...args }) =>
    await createBooking(ctx, await loadActor(ctx, userId), args),
})

/* ───────────────────────── Régler une réservation ──────────────────────── */

const confirmArgs = {
  reference: v.string(),
  method: paymentMethod,
  payerPhone: v.optional(v.string()),
  cgvVersion: v.optional(v.string()),
  /** Téléphone de contact : preuve d'accès sans compte, comme `cancelHold`. */
  contactPhone: v.optional(v.string()),
}

async function confirmBooking(
  ctx: MutationCtx,
  user: Doc<"users"> | null,
  args: ObjectType<typeof confirmArgs>
) {
  const sale = await venteParReference(ctx, args.reference)
  // Contrôle d'accès avant tout statut : l'état d'une vente ne se lit pas
  // sans en être titulaire ou en connaître le téléphone.
  if (!sale || !peutAcceder(sale, user, args.contactPhone)) {
    throw new Error(ACCES_REFUSE)
  }
  if (sale.status === "confirmee") {
    throw new Error("Réservation déjà réglée")
  }
  if (sale.status !== "en_attente_paiement") {
    throw new Error(`Réservation « ${sale.status} » : règlement impossible`)
  }
  if (sale.priceLockedUntil && sale.priceLockedUntil < Date.now()) {
    throw new Error(
      "Le délai de règlement est dépassé : les places ont été libérées"
    )
  }

  const tickets = await ctx.db
    .query("tickets")
    .withIndex("by_sale", (q) => q.eq("saleId", sale._id))
    .collect()
  if (tickets.length === 0) throw new Error("Réservation sans titre")

  const trip = await ctx.db.get(tickets[0]!.tripId)
  if (!trip) throw new Error("Desserte introuvable")

  // Le blocage devient une vente ferme : masques et compteurs basculent.
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
          heldMask: release(occupancy.heldMask, mask),
          soldMask: occupancy.soldMask | mask,
        })
      }
    }
    await ctx.db.patch(ticket._id, { status: "valide" })

    const counters = (
      await ctx.db
        .query("segmentCounters")
        .withIndex("by_trip_class", (q) =>
          q
            .eq("tripId", ticket.tripId)
            .eq("serviceClass", ticket.serviceClass)
        )
        .collect()
    ).filter(
      (c) =>
        c.segmentIndex >= ticket.fromStopIndex &&
        c.segmentIndex < ticket.toStopIndex
    )
    for (const counter of counters) {
      await ctx.db.patch(counter._id, {
        held: Math.max(0, counter.held - 1),
        sold: counter.sold + 1,
      })
    }
  }

  const day = await currentAccountingDay(ctx)
  await ctx.db.patch(sale._id, {
    status: "confirmee",
    accountingDayId: day._id,
    amounts: { ...sale.amounts, received: sale.amounts.ttc },
    priceLockedUntil: undefined,
    cgvVersion: args.cgvVersion ?? CURRENT_CGV_VERSION,
    cgvAcceptedAt: Date.now(),
  })
  await ctx.db.patch(day._id, {
    totalTtc: day.totalTtc + sale.amounts.ttc,
    totalReceived: day.totalReceived + sale.amounts.ttc,
  })

  const paymentId = await ctx.db.insert("payments", {
    saleId: sale._id,
    method: args.method,
    status: "confirme",
    amountXaf: sale.amounts.ttc,
    payerPhone: args.payerPhone ?? sale.contactPhone,
    settledAt: Date.now(),
    provider: "simule",
  })

  await audit(ctx, {
    actorId: sale.customerId,
    action: "reservation.confirmer",
    entityTable: "sales",
    entityId: sale._id,
    after: {
      reference: sale.number,
      method: args.method,
      ttc: sale.amounts.ttc,
      paymentId,
    },
  })

  if (sale.contactEmail) {
    await ctx.scheduler.runAfter(
      0,
      internal.functions.notifications.sendBookingEmail,
      {
        reference: sale.number,
        contactPhone: sale.contactPhone,
        email: sale.contactEmail,
      }
    )
  }

  return {
    reference: sale.number,
    status: "confirmee" as const,
    tickets: tickets.length,
    amountTtc: sale.amounts.ttc,
    paymentId,
  }
}

/**
 * Confirme une réservation et transforme le blocage en vente ferme.
 *
 * Réservée au titulaire connecté, ou à qui donne le téléphone de contact : la
 * référence seule, lisible sur un écran ou une capture, ne suffit pas à
 * engager un paiement.
 *
 * En attendant le branchement d'un prestataire de paiement, le règlement est
 * enregistré tel quel : le parcours est complet et démontrable, seule
 * l'autorisation bancaire manque.
 */
export const confirm = mutation({
  args: confirmArgs,
  handler: async (ctx, args) =>
    await confirmBooking(ctx, await getUser(ctx), args),
})

/**
 * Variante interne : l'accès est évalué pour l'acteur résolu par l'assistant
 * (outil `pay_booking`), pas pour le jeton de l'appel.
 */
export const confirmForActor = internalMutation({
  args: { userId: v.optional(v.id("users")), ...confirmArgs },
  handler: async (ctx, { userId, ...args }) =>
    await confirmBooking(ctx, await loadActor(ctx, userId), args),
})

/* ──────────────────────────── Consultation ─────────────────────────────── */

async function hydrateBooking(ctx: QueryCtx, sale: Doc<"sales">) {
  const tickets = await ctx.db
    .query("tickets")
    .withIndex("by_sale", (q) => q.eq("saleId", sale._id))
    .collect()
  const trip = tickets[0] ? await ctx.db.get(tickets[0].tripId) : null
  const [origin, destination, payments, adjustments] = await Promise.all([
    tickets[0] ? ctx.db.get(tickets[0].originStationId) : null,
    tickets[0] ? ctx.db.get(tickets[0].destinationStationId) : null,
    ctx.db
      .query("payments")
      .withIndex("by_sale", (q) => q.eq("saleId", sale._id))
      .collect(),
    ctx.db
      .query("sales")
      .withIndex("by_origin", (q) => q.eq("originSaleId", sale._id))
      .collect(),
  ])
  const segment =
    trip && tickets[0]
      ? await horairesDuVoyageur(ctx.db, trip, tickets[0])
      : null
  return {
    sale,
    tickets,
    trip,
    origin,
    destination,
    segment,
    payments,
    adjustments,
  }
}

const referenceArgs = {
  reference: v.string(),
  contactPhone: v.optional(v.string()),
}

/**
 * Sans compte, la référence seule ne suffit pas : le téléphone la double.
 *
 * `null` aussi bien pour une référence inconnue que pour un téléphone qui ne
 * lui correspond pas : la réponse ne dit pas si la référence existe.
 */
async function bookingByReference(
  ctx: QueryCtx,
  user: Doc<"users"> | null,
  args: { reference: string; contactPhone?: string }
) {
  const sale = await venteParReference(ctx, args.reference)
  if (!sale || !peutAcceder(sale, user, args.contactPhone)) return null
  return await hydrateBooking(ctx, sale)
}

/**
 * Réservation et ses titres, retrouvés par référence. `null` si la référence
 * est inconnue ou si le téléphone ne lui correspond pas (même réponse).
 */
export const getByReference = query({
  args: referenceArgs,
  handler: async (ctx, args) =>
    await bookingByReference(ctx, await getUser(ctx), args),
})

export const getByReferenceForActor = internalQuery({
  args: { userId: v.optional(v.id("users")), ...referenceArgs },
  handler: async (ctx, { userId, ...args }) =>
    await bookingByReference(ctx, await loadActor(ctx, userId), args),
})

async function bookingsOf(ctx: QueryCtx, user: Doc<"users">) {
  const sales = await ctx.db
    .query("sales")
    .withIndex("by_customer", (q) => q.eq("customerId", user._id))
    .collect()

  return await Promise.all(
    sales
      .sort((a, b) => b.soldAt - a.soldAt)
      .map(async (sale) => await hydrateBooking(ctx, sale))
  )
}

/** Réservations du voyageur connecté. */
export const listMine = query({
  args: {},
  handler: async (ctx) => await bookingsOf(ctx, await requireUser(ctx)),
})

export const listMineForActor = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) =>
    await bookingsOf(ctx, assertActiveUser(await loadActor(ctx, args.userId))),
})

async function ticketsOf(ctx: QueryCtx, user: Doc<"users">) {
  const sales = await ctx.db
    .query("sales")
    .withIndex("by_customer", (q) => q.eq("customerId", user._id))
    .collect()

  const result = []
  for (const sale of sales.filter((s) => s.status === "confirmee")) {
    const tickets = await ctx.db
      .query("tickets")
      .withIndex("by_sale", (q) => q.eq("saleId", sale._id))
      .collect()
    for (const ticket of tickets.filter((t) => t.status === "valide")) {
      const trip = await ctx.db.get(ticket.tripId)
      const [origin, destination] = await Promise.all([
        ctx.db.get(ticket.originStationId),
        ctx.db.get(ticket.destinationStationId),
      ])
      result.push({
        ticket,
        trip,
        origin,
        destination,
        reference: sale.number,
      })
    }
  }
  return result.sort(
    (a, b) => (a.trip?.departureAt ?? 0) - (b.trip?.departureAt ?? 0)
  )
}

/** Titres valides du voyageur, pour le portefeuille mobile. */
export const myTickets = query({
  args: {},
  handler: async (ctx) => await ticketsOf(ctx, await requireUser(ctx)),
})

export const myTicketsForActor = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) =>
    await ticketsOf(ctx, assertActiveUser(await loadActor(ctx, args.userId))),
})

/* ─────────────────────── Annulation par le voyageur ────────────────────── */

/**
 * Annule une réservation non réglée.
 * Les places retournent immédiatement à la vente.
 */
async function cancelHoldFor(
  ctx: MutationCtx,
  user: Doc<"users"> | null,
  args: { reference: string; contactPhone?: string }
) {
  const sale = await venteParReference(ctx, args.reference)
  if (!sale || !peutAcceder(sale, user, args.contactPhone)) {
    throw new Error(ACCES_REFUSE)
  }
  if (sale.status !== "en_attente_paiement") {
    throw new Error(
      `Réservation « ${sale.status} » : utilisez l'annulation au guichet`
    )
  }

  await releaseHold(ctx, sale, "annulee")
  await audit(ctx, {
    actorId: sale.customerId,
    action: "reservation.annuler",
    entityTable: "sales",
    entityId: sale._id,
    after: { reference: sale.number },
  })
  return { reference: sale.number, status: "annulee" as const }
}

export const cancelHold = mutation({
  args: referenceArgs,
  handler: async (ctx, args) =>
    await cancelHoldFor(ctx, await getUser(ctx), args),
})

export const cancelHoldForActor = internalMutation({
  args: { userId: v.optional(v.id("users")), ...referenceArgs },
  handler: async (ctx, { userId, ...args }) =>
    await cancelHoldFor(ctx, await loadActor(ctx, userId), args),
})

/* ────────────────────── Expiration automatique ─────────────────────────── */

/** Libère les places d'une réservation et clôt la vente. */
async function releaseHold(
  ctx: Parameters<typeof currentAccountingDay>[0],
  sale: Doc<"sales">,
  finalStatus: "expiree" | "annulee"
): Promise<number> {
  const tickets = await ctx.db
    .query("tickets")
    .withIndex("by_sale", (q) => q.eq("saleId", sale._id))
    .collect()

  for (const ticket of tickets) {
    const trip = await ctx.db.get(ticket.tripId)
    if (!trip) continue
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
          heldMask: release(occupancy.heldMask, mask),
        })
      }
    }
    if (ticket.pdfStorageId) await ctx.storage.delete(ticket.pdfStorageId)
    await ctx.db.patch(ticket._id, {
      status: finalStatus === "annulee" ? "annule" : "expire",
      pdfStorageId: undefined,
    })

    const counters = (
      await ctx.db
        .query("segmentCounters")
        .withIndex("by_trip_class", (q) =>
          q.eq("tripId", ticket.tripId).eq("serviceClass", ticket.serviceClass)
        )
        .collect()
    ).filter(
      (c) =>
        c.segmentIndex >= ticket.fromStopIndex &&
        c.segmentIndex < ticket.toStopIndex
    )
    for (const counter of counters) {
      const held = Math.max(0, counter.held - 1)
      await ctx.db.patch(counter._id, {
        held,
        available: counter.capacity - counter.sold - held - counter.reserved,
      })
    }
  }

  if (sale.bundlePdfStorageId) {
    await ctx.storage.delete(sale.bundlePdfStorageId)
  }

  await ctx.db.patch(sale._id, {
    status: finalStatus,
    cancelledAt: Date.now(),
    priceLockedUntil: undefined,
    bundlePdfStorageId: undefined,
  })
  return tickets.length
}

/**
 * Libère les réservations dont le délai de règlement est écoulé.
 * Exécutée par un cron toutes les cinq minutes.
 */
export const expireStaleHolds = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now()
    const pending = await ctx.db
      .query("sales")
      .withIndex("by_status_hold", (q) =>
        q.eq("status", "en_attente_paiement").lt("priceLockedUntil", now)
      )
      .collect()

    let released = 0
    let tickets = 0
    for (const sale of pending) {
      tickets += await releaseHold(ctx, sale, "expiree")
      released += 1
    }
    return { released, tickets }
  },
})
