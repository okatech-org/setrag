import { v } from "convex/values"
import { api, internal } from "../_generated/api"
import {
  action,
  internalMutation,
  internalQuery,
  type ActionCtx,
} from "../_generated/server"
import type { Id } from "../_generated/dataModel"
import { addDays, toServiceDate } from "../model/calendar"
import { getAssistantTools } from "./contracts"
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

export const hasSucceededToolExecution = internalQuery({
  args: {
    conversationId: v.id("assistantConversations"),
    toolName: v.string(),
  },
  handler: async (ctx, args) => {
    const executions = await ctx.db
      .query("assistantToolExecutions")
      .withIndex("by_conversation_and_status", (q) =>
        q.eq("conversationId", args.conversationId).eq("status", "succeeded")
      )
      .collect()
    return executions.some((execution) => execution.toolName === args.toolName)
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

export async function dispatchAssistantTool(
  ctx: ActionCtx,
  name: string,
  rawInput: unknown
): Promise<unknown> {
  const input = asRecord(rawInput)
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
      const results = await ctx.runQuery(api.functions.trips.search, {
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
      })
      return results.map(
        (result: {
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
          availableByClass: Record<string, number>
          hasAvailability: boolean
        }) => ({
          tripId: result.trip._id,
          trainNumber: result.trip.trainNumber,
          trainType: result.trip.trainType,
          serviceDate: result.trip.serviceDate,
          status: result.trip.status,
          departureAt: result.departureAt,
          arrivalAt: result.arrivalAt,
          distanceKm: result.distanceKm,
          availableByClass: result.availableByClass,
          hasAvailability: result.hasAvailability,
        })
      )
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
      const created = await ctx.runMutation(api.functions.bookings.create, {
        tripId,
        originStationId,
        destinationStationId,
        serviceClass,
        passengers,
        contactPhone: requiredString(input, "contactPhone"),
        contactEmail: undefined,
        promoCode: undefined,
      })
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
          originName: originStop.station.name,
          destinationName: destinationStop.station.name,
          available: available ?? 0,
        },
      }
    }
    case "get_booking":
      return await ctx.runQuery(api.functions.bookings.getByReference, {
        reference: requiredString(input, "reference"),
        contactPhone: optionalString(input, "contactPhone"),
      })
    case "list_my_bookings":
      return await ctx.runQuery(api.functions.bookings.listMine, {})
    case "list_my_tickets":
      return await ctx.runQuery(api.functions.bookings.myTickets, {})
    case "pay_booking":
      return await ctx.runMutation(api.functions.bookings.confirm, {
        reference: requiredString(input, "reference"),
        method: oneOf(input, "method", [
          "airtel_money",
          "moov_money",
          "clickpay",
          "visa",
          "mastercard",
        ] as const),
        payerPhone: optionalString(input, "payerPhone"),
      })
    case "cancel_booking":
      return await ctx.runMutation(api.functions.bookings.cancelHold, {
        reference: requiredString(input, "reference"),
        contactPhone: optionalString(input, "contactPhone"),
      })
    case "get_ticket_download_url":
      return await ctx.runAction(api.functions.documents.ticketPdf, {
        ticketId: requiredString(input, "ticketId") as Id<"tickets">,
        contactPhone: optionalString(input, "contactPhone"),
      })
    case "get_my_profile": {
      const profile = await ctx.runQuery(api.functions.customers.me, {})
      if (!profile) return null
      return {
        firstName: profile.user.firstName ?? null,
        lastName: profile.user.lastName ?? null,
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
        api.functions.customers.listSavedPassengers,
        {}
      )
      return passengers.map((passenger) => ({
        firstName: passenger.firstName,
        lastName: passenger.lastName,
        gender: passenger.gender,
        phone: passenger.phone ?? null,
        discountCode: passenger.discountCode ?? null,
      }))
    }
    case "update_my_profile":
      return await ctx.runMutation(api.functions.customers.updateProfile, {
        firstName: optionalString(input, "firstName"),
        lastName: optionalString(input, "lastName"),
        phone: optionalString(input, "phone"),
        email: optionalString(input, "email"),
      })
    case "grant_consent":
      return await ctx.runMutation(api.functions.customers.grantConsent, {
        type: oneOf(input, "consentType", [
          "cgv",
          "donnees",
          "marketing",
        ] as const),
        channel: oneOf(input, "channel", ["web", "mobile"] as const),
      })
    case "revoke_consent":
      return await ctx.runMutation(api.functions.customers.revokeConsent, {
        type: oneOf(input, "consentType", ["donnees", "marketing"] as const),
      })
    default:
      throw new Error(`Outil inconnu : ${name}.`)
  }
}

export async function executeAssistantTool(
  ctx: ActionCtx,
  args: {
    conversationId: Id<"assistantConversations">
    guestKey?: string
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
    const output = await dispatchAssistantTool(ctx, definition.name, args.input)
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
    executeAssistantTool(ctx, args),
})
