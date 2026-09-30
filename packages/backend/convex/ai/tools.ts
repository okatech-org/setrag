import { v } from "convex/values"
import { api, internal } from "../_generated/api"
import {
  action,
  internalMutation,
  internalQuery,
  type ActionCtx,
} from "../_generated/server"
import type { Doc, Id } from "../_generated/dataModel"
import { addDays, toLocalTime, toServiceDate } from "../model/calendar"
import { CATEGORIES_NOTE } from "../model/memoire"
import { getAssistantTools } from "./contracts"
import type { ConversationActor } from "./conversations"
import { assistantRateLimiter } from "./rateLimiter"

export type ToolExecutionResult =
  | {
      status: "ok"
      executionId: Id<"assistantToolExecutions">
      output: unknown
      clientAction?: string
      cached: boolean
    }
  | {
      status: "approval_required"
      executionId: Id<"assistantToolExecutions">
      callId: string
      toolName: string
      input: unknown
      label: string
    }
  | {
      status: "error"
      executionId?: Id<"assistantToolExecutions">
      message: string
    }

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Arguments d'outil invalides.")
  }
  return value as Record<string, unknown>
}

function requiredString(input: Record<string, unknown>, key: string): string {
  const value = input[key]
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Le champ « ${key} » est obligatoire.`)
  }
  return value.trim()
}

function optionalString(
  input: Record<string, unknown>,
  key: string
): string | undefined {
  const value = input[key]
  if (value === null || value === undefined || value === "") return undefined
  if (typeof value !== "string") {
    throw new Error(`Le champ « ${key} » doit être une chaîne.`)
  }
  return value.trim() || undefined
}

function requiredInteger(
  input: Record<string, unknown>,
  key: string,
  min: number,
  max: number
): number {
  const value = input[key]
  if (
    !Number.isInteger(value) ||
    (value as number) < min ||
    (value as number) > max
  ) {
    throw new Error(
      `Le champ « ${key} » doit être compris entre ${min} et ${max}.`
    )
  }
  return value as number
}

function optionalInteger(
  input: Record<string, unknown>,
  key: string,
  min: number,
  max: number
): number | null {
  const value = input[key]
  if (value === null || value === undefined) return null
  if (
    !Number.isInteger(value) ||
    (value as number) < min ||
    (value as number) > max
  ) {
    throw new Error(
      `Le champ « ${key} » doit être un entier entre ${min} et ${max}.`
    )
  }
  return value as number
}

function oneOf<T extends string>(
  input: Record<string, unknown>,
  key: string,
  values: readonly T[]
): T {
  const value = input[key]
  if (typeof value !== "string" || !values.includes(value as T)) {
    throw new Error(`Valeur invalide pour « ${key} ».`)
  }
  return value as T
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue)
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalValue(item)])
    )
  }
  return value
}

export function canonicalToolInput(value: unknown): string {
  const json = JSON.stringify(canonicalValue(value ?? {}))
  if (json.length > 32_000) {
    throw new Error("Arguments d'outil trop volumineux.")
  }
  return json
}

function boundedJson(value: unknown): string {
  return canonicalToolInput(value)
}

function safeError(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : "L'action n'a pas pu être exécutée."
  return message.replace(/\s+/g, " ").trim().slice(0, 500)
}

export const getExecution = internalQuery({
  args: {
    conversationId: v.id("assistantConversations"),
    callId: v.string(),
  },
  handler: async (ctx, args) =>
    ctx.db
      .query("assistantToolExecutions")
      .withIndex("by_conversation_and_call_id", (q) =>
        q.eq("conversationId", args.conversationId).eq("callId", args.callId)
      )
      .unique(),
})

export const findSucceededExecution = internalQuery({
  args: {
    conversationId: v.id("assistantConversations"),
    toolName: v.string(),
    inputJson: v.string(),
  },
  handler: async (ctx, args) => {
    const executions = await ctx.db
      .query("assistantToolExecutions")
      .withIndex("by_conversation_and_status", (q) =>
        q.eq("conversationId", args.conversationId).eq("status", "succeeded")
      )
      .collect()
    return (
      executions.find(
        (execution) =>
          execution.toolName === args.toolName &&
          execution.inputJson === args.inputJson
      ) ?? null
    )
  },
})

export const prepareExecution = internalMutation({
  args: {
    conversationId: v.id("assistantConversations"),
    callId: v.string(),
    toolName: v.string(),
    inputJson: v.string(),
    requiresApproval: v.boolean(),
    approved: v.boolean(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("assistantToolExecutions")
      .withIndex("by_conversation_and_call_id", (q) =>
        q.eq("conversationId", args.conversationId).eq("callId", args.callId)
      )
      .unique()
    if (existing) {
      if (
        existing.toolName !== args.toolName ||
        existing.inputJson !== args.inputJson
      ) {
        throw new Error(
          "Un identifiant d'appel a été réutilisé avec d'autres arguments."
        )
      }
      if (existing.status === "approval_required" && args.approved) {
        await ctx.db.patch(existing._id, {
          status: "running",
          approvedAt: Date.now(),
        })
        return {
          execution: { ...existing, status: "running" as const },
          acquired: true,
        }
      }
      return { execution: existing, acquired: false }
    }

    // Un booléen envoyé sur le premier appel ne constitue jamais une preuve
    // de confirmation. L'approbation ne peut déverrouiller qu'une exécution
    // déjà persistée ci-dessus avec le statut `approval_required`.
    const status = args.requiresApproval
      ? ("approval_required" as const)
      : ("running" as const)
    const executionId = await ctx.db.insert("assistantToolExecutions", {
      conversationId: args.conversationId,
      callId: args.callId,
      toolName: args.toolName,
      inputJson: args.inputJson,
      status,
      requiresApproval: args.requiresApproval,
      approvedAt: undefined,
      createdAt: Date.now(),
    })
    return {
      execution: (await ctx.db.get(executionId))!,
      acquired: status === "running",
    }
  },
})

export const completeExecution = internalMutation({
  args: {
    executionId: v.id("assistantToolExecutions"),
    succeeded: v.boolean(),
    outputJson: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.executionId, {
      status: args.succeeded ? "succeeded" : "failed",
      outputJson: args.outputJson,
      error: args.error,
      completedAt: Date.now(),
    })
  },
})

export const rejectExecution = internalMutation({
  args: {
    conversationId: v.id("assistantConversations"),
    callId: v.string(),
  },
  handler: async (ctx, args) => {
    const execution = await ctx.db
      .query("assistantToolExecutions")
      .withIndex("by_conversation_and_call_id", (q) =>
        q.eq("conversationId", args.conversationId).eq("callId", args.callId)
      )
      .unique()
    if (!execution) throw new Error("Confirmation introuvable.")
    if (execution.status === "rejected") return execution
    if (execution.status !== "approval_required") {
      throw new Error(`Cette action est déjà « ${execution.status} ».`)
    }
    await ctx.db.patch(execution._id, {
      status: "rejected",
      error: "Action annulée par l'utilisateur.",
      completedAt: Date.now(),
    })
    return {
      ...execution,
      status: "rejected" as const,
      error: "Action annulée par l'utilisateur.",
      completedAt: Date.now(),
    }
  },
})

function requireActor(actorId: Id<"users"> | null): Id<"users"> {
  if (!actorId) throw new Error("Connexion requise pour cette action.")
  return actorId
}

/* ──────────────── Projections : ce que le modèle peut lire ──────────────── */

/*
 * Les sorties d'outils partent chez le fournisseur IA et restent dans
 * l'historique de la conversation. Elles ne portent que ce qui sert à
 * répondre et à dessiner les cartes de l'interface : jamais le code-barres
 * signé d'un titre (qui vaut billet), ni pièce d'identité, date de
 * naissance, nationalité, téléphone d'urgence, numéro débité ou e-mail.
 */

type HydratedBooking = {
  sale: Doc<"sales">
  tickets: Doc<"tickets">[]
  trip: Doc<"trips"> | null
  origin: Doc<"stations"> | null
  destination: Doc<"stations"> | null
  segment: { departureAt: number; arrivalAt: number } | null
}

type TicketListItem = {
  ticket: Doc<"tickets">
  trip: Doc<"trips"> | null
  origin: Doc<"stations"> | null
  destination: Doc<"stations"> | null
  reference: string
}

function projectTrip(trip: Doc<"trips"> | null) {
  return trip
    ? {
        trainNumber: trip.trainNumber,
        trainType: trip.trainType,
        serviceDate: trip.serviceDate,
        departureAt: trip.departureAt,
        arrivalAt: trip.arrivalAt,
        status: trip.status,
        delayMinutes: trip.delayMinutes,
      }
    : null
}

function projectStation(station: Doc<"stations"> | null) {
  return station ? { name: station.name } : null
}

function projectSale(sale: Doc<"sales">) {
  return {
    number: sale.number,
    status: sale.status,
    amounts: { ttc: sale.amounts.ttc },
    priceLockedUntil: sale.priceLockedUntil ?? null,
  }
}

function projectTicket(ticket: Doc<"tickets">) {
  return {
    _id: ticket._id,
    passenger: {
      firstName: ticket.passenger.firstName,
      lastName: ticket.passenger.lastName,
    },
    serviceClass: ticket.serviceClass,
    seatLabel: ticket.seatLabel ?? null,
    status: ticket.status,
    unitPriceTtc: ticket.unitPriceTtc,
  }
}

/** Sortie de `get_booking` : le dossier, sans données sensibles. */
export function projectBooking(booking: HydratedBooking | null) {
  if (!booking) return null
  return {
    sale: projectSale(booking.sale),
    tickets: booking.tickets.map(projectTicket),
    trip: projectTrip(booking.trip),
    origin: projectStation(booking.origin),
    destination: projectStation(booking.destination),
    segment: booking.segment,
  }
}

/** Sortie de `list_my_bookings` : une ligne par dossier. */
export function projectBookingSummary(booking: HydratedBooking) {
  return {
    sale: projectSale(booking.sale),
    trip: projectTrip(booking.trip),
    origin: projectStation(booking.origin),
    destination: projectStation(booking.destination),
    segment: booking.segment,
    ticketCount: booking.tickets.length,
  }
}

/** Sortie de `list_my_tickets` : un billet valide, sans son code-barres. */
export function projectTicketListItem(item: TicketListItem) {
  return {
    reference: item.reference,
    ticket: {
      _id: item.ticket._id,
      status: item.ticket.status,
      passenger: {
        firstName: item.ticket.passenger.firstName,
        lastName: item.ticket.passenger.lastName,
      },
      serviceClass: item.ticket.serviceClass,
      coachLabel: item.ticket.coachLabel ?? null,
      seatLabel: item.ticket.seatLabel ?? null,
    },
    trip: projectTrip(item.trip),
    origin: projectStation(item.origin),
    destination: projectStation(item.destination),
  }
}

type SearchTripResult = {
  trip: {
    _id: Id<"trips">
    trainNumber: string
    trainType: string
    serviceDate: string
    status: string
  }
  departureAt: number
  arrivalAt: number
  distanceKm: number
  intermediateStops: number
  availableByClass: Record<string, number>
  prixParClasse: Record<string, { totalTtc: number; unitaireTtc: number }>
  hasAvailability: boolean
}

/**
 * Traduit un appel d'outil vers le domaine billettique.
 *
 * `actor` est l'acteur résolu par `accessContext` pour la conversation —
 * jamais une valeur produite par le modèle ou le client. Les outils qui
 * agissent pour un voyageur appellent les variantes internes `…ForActor` :
 * elles ne dépendent pas du jeton de l'appel, ce qui permet à un fil de
 * messagerie relié à un compte d'agir pour ce compte. La voie de l'acteur
 * (`source`) suit : venu d'une messagerie, il n'hérite d'aucun droit interne.
 */
export async function dispatchAssistantTool(
  ctx: ActionCtx,
  name: string,
  rawInput: unknown,
  actor: ConversationActor | null = null
): Promise<unknown> {
  const input = asRecord(rawInput)
  const actorId = actor?.userId ?? null
  const userId = actorId ?? undefined
  switch (name) {
    case "list_stations": {
      const stations = await ctx.runQuery(
        api.functions.referential.listStations,
        {}
      )
      return stations.map(
        (station: {
          _id: Id<"stations">
          code: string
          name: string
          province: string
        }) => ({
          id: station._id,
          code: station.code,
          name: station.name,
          province: station.province,
        })
      )
    }
    case "search_trips": {
      const relativeDaysFromToday = optionalInteger(
        input,
        "relativeDaysFromToday",
        0,
        365
      )
      const serviceDate =
        relativeDaysFromToday === null
          ? requiredString(input, "serviceDate")
          : addDays(toServiceDate(Date.now()), relativeDaysFromToday)
      const search = {
        originStationId: requiredString(
          input,
          "originStationId"
        ) as Id<"stations">,
        destinationStationId: requiredString(
          input,
          "destinationStationId"
        ) as Id<"stations">,
        serviceDate,
        passengers: requiredInteger(input, "passengers", 1, 20),
      }
      const results = (await ctx.runQuery(
        api.functions.trips.search,
        search
      )) as SearchTripResult[]
      // La recherche est rappelée avec son résultat : l'interface affiche
      // les cartes de trajets sans réinterpréter les arguments du modèle.
      return {
        ...search,
        trips: results.map((result) => ({
          tripId: result.trip._id,
          trainNumber: result.trip.trainNumber,
          trainType: result.trip.trainType,
          serviceDate: result.trip.serviceDate,
          status: result.trip.status,
          // Une desserte supprimée reste listée, marquée, sans prix.
          cancelled: result.trip.status === "annule",
          departureAt: result.departureAt,
          arrivalAt: result.arrivalAt,
          // Heures de Libreville, à annoncer telles quelles : le modèle ne
          // convertit jamais lui-même un horodatage (il se trompait d'une
          // heure en lisant l'UTC).
          departureTime: toLocalTime(result.departureAt),
          arrivalTime: toLocalTime(result.arrivalAt),
          distanceKm: result.distanceKm,
          intermediateStops: result.intermediateStops,
          availableByClass: result.availableByClass,
          prixParClasse: result.prixParClasse,
          hasAvailability: result.hasAvailability,
        })),
      }
    }
    case "get_trip": {
      const result = await ctx.runQuery(api.functions.trips.get, {
        tripId: requiredString(input, "tripId") as Id<"trips">,
      })
      return {
        trip: result.trip,
        stops: result.stops,
        availability: result.counters.map(
          (counter: {
            serviceClass: string
            segmentIndex: number
            available: number
          }) => ({
            serviceClass: counter.serviceClass,
            segmentIndex: counter.segmentIndex,
            available: counter.available,
          })
        ),
      }
    }
    case "quote_booking": {
      const rawCodes = input.discountCodes
      const discountCodes =
        rawCodes === null || rawCodes === undefined
          ? undefined
          : Array.isArray(rawCodes) &&
              rawCodes.every((code) => typeof code === "string")
            ? (rawCodes as string[])
            : (() => {
                throw new Error("Les codes de réduction sont invalides.")
              })()
      return await ctx.runQuery(api.functions.bookings.quote, {
        tripId: requiredString(input, "tripId") as Id<"trips">,
        originStationId: requiredString(
          input,
          "originStationId"
        ) as Id<"stations">,
        destinationStationId: requiredString(
          input,
          "destinationStationId"
        ) as Id<"stations">,
        serviceClass: oneOf(input, "serviceClass", [
          "DEUXIEME",
          "PREMIERE",
          "VIP",
        ] as const),
        passengerCount: requiredInteger(input, "passengerCount", 1, 20),
        discountCodes,
        promoCode: optionalString(input, "promoCode"),
      })
    }
    case "create_booking": {
      if (!Array.isArray(input.passengers) || input.passengers.length < 1) {
        throw new Error("Au moins un voyageur est obligatoire.")
      }
      if (input.passengers.length > 20) {
        throw new Error("Une réservation est limitée à 20 voyageurs.")
      }
      const passengers = input.passengers.map((raw) => {
        const passenger = asRecord(raw)
        return {
          lastName: requiredString(passenger, "lastName"),
          firstName: requiredString(passenger, "firstName"),
          gender: oneOf(passenger, "gender", ["M", "F"] as const),
          phone: undefined,
          emergencyPhone: undefined,
          birthDate: undefined,
          nationality: undefined,
          documentNumber: undefined,
          discountCode: optionalString(passenger, "discountCode"),
          // Le parcours client ne propose pas le choix du siège. Même si un
          // fournisseur envoie une valeur hors schéma, l'inventaire choisit.
          seatId: undefined,
        }
      })
      const tripId = requiredString(input, "tripId") as Id<"trips">
      const originStationId = requiredString(
        input,
        "originStationId"
      ) as Id<"stations">
      const destinationStationId = requiredString(
        input,
        "destinationStationId"
      ) as Id<"stations">
      const serviceClass = oneOf(input, "serviceClass", [
        "DEUXIEME",
        "PREMIERE",
        "VIP",
      ] as const)
      const detail = (await ctx.runQuery(api.functions.trips.get, {
        tripId,
      })) as {
        trip: {
          trainNumber: string
          trainType: string
          serviceDate: string
          status: string
          departureAt: number
          arrivalAt: number
        }
        stops: Array<{
          stationId: Id<"stations">
          sequence: number
          departureAt?: number
          arrivalAt?: number
          station: { name: string } | null
        }>
        counters: Array<{
          serviceClass: string
          segmentIndex: number
          available: number
        }>
      }
      const originStop = detail.stops.find(
        (stop) => stop.stationId === originStationId
      )
      const destinationStop = detail.stops.find(
        (stop) => stop.stationId === destinationStationId
      )
      if (
        !originStop?.station ||
        !destinationStop?.station ||
        destinationStop.sequence <= originStop.sequence
      ) {
        throw new Error("Les gares de cette réservation sont invalides.")
      }
      const available = detail.counters
        .filter(
          (counter) =>
            counter.serviceClass === serviceClass &&
            counter.segmentIndex >= originStop.sequence &&
            counter.segmentIndex < destinationStop.sequence
        )
        .reduce<number | null>(
          (minimum, counter) =>
            minimum === null
              ? counter.available
              : Math.min(minimum, counter.available),
          null
        )
      const created = await ctx.runMutation(
        internal.functions.bookings.createForActor,
        {
          userId,
          tripId,
          originStationId,
          destinationStationId,
          serviceClass,
          passengers,
          contactPhone: requiredString(input, "contactPhone"),
          contactEmail: undefined,
          promoCode: undefined,
        }
      )
      return {
        ...created,
        paymentContext: {
          tripId,
          trainNumber: detail.trip.trainNumber,
          trainType: detail.trip.trainType,
          serviceDate: detail.trip.serviceDate,
          status: detail.trip.status,
          departureAt: originStop.departureAt ?? detail.trip.departureAt,
          arrivalAt: destinationStop.arrivalAt ?? detail.trip.arrivalAt,
          departureTime: toLocalTime(
            originStop.departureAt ?? detail.trip.departureAt
          ),
          arrivalTime: toLocalTime(
            destinationStop.arrivalAt ?? detail.trip.arrivalAt
          ),
          originName: originStop.station.name,
          destinationName: destinationStop.station.name,
          available: available ?? 0,
        },
      }
    }
    case "get_booking":
      return projectBooking(
        (await ctx.runQuery(
          internal.functions.bookings.getByReferenceForActor,
          {
            userId,
            reference: requiredString(input, "reference"),
            contactPhone: optionalString(input, "contactPhone"),
          }
        )) as HydratedBooking | null
      )
    case "list_my_bookings": {
      const bookings = (await ctx.runQuery(
        internal.functions.bookings.listMineForActor,
        { userId: requireActor(actorId) }
      )) as HydratedBooking[]
      return bookings.map(projectBookingSummary)
    }
    case "list_my_tickets": {
      const tickets = (await ctx.runQuery(
        internal.functions.bookings.myTicketsForActor,
        { userId: requireActor(actorId) }
      )) as TicketListItem[]
      return tickets.map(projectTicketListItem)
    }
    case "pay_booking":
      // L'accès est celui de l'acteur (titulaire) ou du téléphone de contact
      // saisi, exactement comme `bookings.confirm` sur le site.
      return await ctx.runMutation(
        internal.functions.bookings.confirmForActor,
        {
          userId,
          reference: requiredString(input, "reference"),
          method: oneOf(input, "method", [
            "airtel_money",
            "moov_money",
            "clickpay",
            "visa",
            "mastercard",
          ] as const),
          payerPhone: optionalString(input, "payerPhone"),
          contactPhone: optionalString(input, "contactPhone"),
        }
      )
    case "cancel_booking":
      return await ctx.runMutation(
        internal.functions.bookings.cancelHoldForActor,
        {
          userId,
          reference: requiredString(input, "reference"),
          contactPhone: optionalString(input, "contactPhone"),
        }
      )
    case "get_ticket_download_url":
      return await ctx.runAction(
        internal.functions.documents.ticketPdfForActor,
        {
          userId,
          source: actor?.source,
          ticketId: requiredString(input, "ticketId") as Id<"tickets">,
          contactPhone: optionalString(input, "contactPhone"),
        }
      )
    case "get_my_profile": {
      const profile = await ctx.runQuery(
        internal.functions.customers.meForActor,
        { userId: requireActor(actorId) }
      )
      if (!profile) return null
      return {
        firstName: profile.user.firstName ?? null,
        lastName: profile.user.lastName ?? null,
        gender: profile.user.gender ?? null,
        phone: profile.user.phone ?? null,
        email: profile.user.email ?? null,
        consents: profile.consents.map((consent) => ({
          type: consent.type,
          channel: consent.channel,
        })),
      }
    }
    case "list_saved_passengers": {
      const passengers = await ctx.runQuery(
        internal.functions.customers.listSavedPassengersForActor,
        { userId: requireActor(actorId) }
      )
      return passengers.map((passenger) => ({
        firstName: passenger.firstName,
        lastName: passenger.lastName,
        gender: passenger.gender,
        phone: passenger.phone ?? null,
        discountCode: passenger.discountCode ?? null,
      }))
    }
    case "update_my_profile": {
      const gender = optionalString(input, "gender")
      if (gender !== undefined && gender !== "M" && gender !== "F") {
        throw new Error("Valeur invalide pour « gender ».")
      }
      return await ctx.runMutation(
        internal.functions.customers.updateProfileForActor,
        {
          userId: requireActor(actorId),
          firstName: optionalString(input, "firstName"),
          lastName: optionalString(input, "lastName"),
          phone: optionalString(input, "phone"),
          email: optionalString(input, "email"),
          gender,
        }
      )
    }
    case "remember":
      // Ce que Ruban retient appartient au compte de l'acteur, jamais à un
      // invité ; le contenu est filtré côté serveur (`model/memoire.ts`).
      return await ctx.runMutation(internal.ai.memory.rememberForActor, {
        userId: requireActor(actorId),
        category: oneOf(input, "category", CATEGORIES_NOTE),
        content: requiredString(input, "content"),
        replacesMemoryId: optionalString(input, "replacesMemoryId"),
        source: actor?.source ?? "session",
      })
    case "forget": {
      const all = input.all === true
      return await ctx.runMutation(internal.ai.memory.forgetForActor, {
        userId: requireActor(actorId),
        memoryId: all ? undefined : requiredString(input, "memoryId"),
        all,
      })
    }
    case "grant_consent":
      return await ctx.runMutation(
        internal.functions.customers.grantConsentForActor,
        {
          userId: requireActor(actorId),
          type: oneOf(input, "consentType", [
            "cgv",
            "donnees",
            "marketing",
          ] as const),
          channel: oneOf(input, "channel", ["web", "mobile"] as const),
        }
      )
    case "revoke_consent":
      return await ctx.runMutation(
        internal.functions.customers.revokeConsentForActor,
        {
          userId: requireActor(actorId),
          type: oneOf(input, "consentType", ["donnees", "marketing"] as const),
        }
      )
    case "request_sign_in": {
      if (actorId) throw new Error("Le voyageur est déjà connecté.")
      // Motif court, affiché tel quel par l'interface : jamais une URL ni
      // une consigne, simplement une raison lisible.
      const reason = requiredString(input, "reason")
        .replace(/\s+/g, " ")
        .slice(0, 160)
      return { reason }
    }
    default:
      throw new Error(`Outil inconnu : ${name}.`)
  }
}

export async function executeAssistantTool(
  ctx: ActionCtx,
  args: {
    conversationId: Id<"assistantConversations">
    guestKey?: string
    /** Fourni uniquement par les variantes internes de la messagerie. */
    messagingThreadId?: Id<"messagingThreads">
    callId: string
    name: string
    input: unknown
    approved?: boolean
  }
): Promise<ToolExecutionResult> {
  if (!args.callId || args.callId.length > 200) {
    return { status: "error", message: "Identifiant d'appel invalide." }
  }
  const access = await ctx.runQuery(internal.ai.conversations.accessContext, {
    conversationId: args.conversationId,
    guestKey: args.guestKey,
    messagingThreadId: args.messagingThreadId,
  })
  const allowed = getAssistantTools(
    access.conversation.assistantId,
    access.isAuthenticated
  )
  const definition = allowed.find((tool) => tool.name === args.name)
  if (!definition) {
    return {
      status: "error",
      message: `L'action « ${args.name} » n'est pas disponible dans ce contexte.`,
    }
  }

  const { ok, retryAfter } = await assistantRateLimiter.limit(ctx, "toolCall", {
    key: access.rateLimitKey,
  })
  if (!ok) {
    return {
      status: "error",
      message: `Trop d'actions successives. Réessayez dans ${Math.ceil((retryAfter ?? 0) / 1_000)} seconde(s).`,
    }
  }

  let inputJson: string
  try {
    inputJson = boundedJson(args.input)
  } catch (error) {
    return { status: "error", message: safeError(error) }
  }
  const prepared = await ctx.runMutation(internal.ai.tools.prepareExecution, {
    conversationId: args.conversationId,
    callId: args.callId,
    toolName: definition.name,
    inputJson,
    requiresApproval: definition.requiresApproval,
    approved: args.approved === true,
  })
  const execution = prepared.execution

  if (execution.status === "succeeded") {
    return {
      status: "ok",
      executionId: execution._id,
      output: execution.outputJson ? JSON.parse(execution.outputJson) : null,
      clientAction: definition.clientAction,
      cached: true,
    }
  }
  if (execution.status === "approval_required") {
    return {
      status: "approval_required",
      executionId: execution._id,
      callId: args.callId,
      toolName: definition.name,
      input: args.input,
      label: definition.label,
    }
  }
  if (execution.status === "failed" || execution.status === "rejected") {
    return {
      status: "error",
      executionId: execution._id,
      message: execution.error ?? "Cette action a déjà échoué.",
    }
  }
  if (!prepared.acquired) {
    return {
      status: "error",
      executionId: execution._id,
      message: "Cette action est déjà en cours de traitement.",
    }
  }

  if (definition.requiresApproval) {
    const budget = await assistantRateLimiter.limit(
      ctx,
      "consequentialAction",
      { key: access.rateLimitKey }
    )
    if (!budget.ok) {
      const message = "Budget quotidien d'actions engageantes atteint."
      await ctx.runMutation(internal.ai.tools.completeExecution, {
        executionId: execution._id,
        succeeded: false,
        error: message,
      })
      return { status: "error", executionId: execution._id, message }
    }
  }

  try {
    const output = await dispatchAssistantTool(
      ctx,
      definition.name,
      args.input,
      access.acteur
    )
    const outputJson = boundedJson(output)
    await ctx.runMutation(internal.ai.tools.completeExecution, {
      executionId: execution._id,
      succeeded: true,
      outputJson,
    })
    await ctx.runMutation(internal.ai.conversations.appendMessage, {
      conversationId: args.conversationId,
      role: "tool",
      content: outputJson,
      toolName: definition.name,
      toolCallId: args.callId,
    })
    return {
      status: "ok",
      executionId: execution._id,
      output,
      clientAction: definition.clientAction,
      cached: false,
    }
  } catch (error) {
    const message = safeError(error)
    await ctx.runMutation(internal.ai.tools.completeExecution, {
      executionId: execution._id,
      succeeded: false,
      error: message,
    })
    return {
      status: "error",
      executionId: execution._id,
      message,
    }
  }
}

export const execute = action({
  args: {
    conversationId: v.id("assistantConversations"),
    guestKey: v.optional(v.string()),
    callId: v.string(),
    name: v.string(),
    input: v.any(),
    approved: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<ToolExecutionResult> =>
    executeAssistantTool(ctx, {
      conversationId: args.conversationId,
      guestKey: args.guestKey,
      callId: args.callId,
      name: args.name,
      input: args.input,
      approved: args.approved,
    }),
})
