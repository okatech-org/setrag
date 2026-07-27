/// <reference types="vite/client" />

import rateLimiterTest from "@convex-dev/rate-limiter/test"
import { convexTest } from "convex-test"
import { describe, expect, it } from "vitest"
import { api, internal } from "../_generated/api"
import schema from "../schema"
import { modules } from "../test.setup"

const GUEST_KEY = "guest-session-key-0123456789-abcdef"

describe("exécutions d'outils IA", () => {
  it("exécute un outil public, journalise son résultat et ressert le cache", async () => {
    const t = convexTest(schema, modules)
    rateLimiterTest.register(t)
    await t.run(async (ctx) => {
      await ctx.db.insert("stations", {
        code: "OWE",
        name: "Owendo",
        province: "Estuaire",
        kilometerPoint: 0,
        isEquipped: true,
        isActive: true,
      })
      await ctx.db.insert("stations", {
        code: "FER",
        name: "Fermée",
        province: "Estuaire",
        kilometerPoint: 10,
        isEquipped: false,
        isActive: false,
      })
    })
    const created = await t.mutation(api.ai.conversations.create, {
      guestKey: GUEST_KEY,
    })
    const args = {
      conversationId: created.conversationId,
      guestKey: GUEST_KEY,
      callId: "call-list-stations",
      name: "list_stations",
      input: {},
    }

    const first = await t.action(api.ai.tools.execute, args)
    const replay = await t.action(api.ai.tools.execute, args)

    expect(first).toMatchObject({
      status: "ok",
      cached: false,
      output: [
        {
          code: "OWE",
          name: "Owendo",
          province: "Estuaire",
        },
      ],
    })
    expect(replay).toMatchObject({
      status: "ok",
      cached: true,
      output: first.status === "ok" ? first.output : undefined,
    })

    const messages = await t.query(api.ai.conversations.listMessages, {
      conversationId: created.conversationId,
      guestKey: GUEST_KEY,
    })
    expect(
      messages.filter((message) => message.toolCallId === "call-list-stations")
    ).toHaveLength(1)
  })

  it("bloque les outils authentifiés pour un invité avant toute exécution", async () => {
    const t = convexTest(schema, modules)
    rateLimiterTest.register(t)
    const created = await t.mutation(api.ai.conversations.create, {
      guestKey: GUEST_KEY,
      assistantId: "tickets",
    })

    const result = await t.action(api.ai.tools.execute, {
      conversationId: created.conversationId,
      guestKey: GUEST_KEY,
      callId: "call-private-tickets",
      name: "list_my_tickets",
      input: {},
    })
    expect(result).toEqual({
      status: "error",
      message:
        "L'action « list_my_tickets » n'est pas disponible dans ce contexte.",
    })
    const executions = await t.run((ctx) =>
      ctx.db.query("assistantToolExecutions").collect()
    )
    expect(executions).toEqual([])
  })

  it("valide les arguments, borne leur taille et mémorise les échecs", async () => {
    const t = convexTest(schema, modules)
    rateLimiterTest.register(t)
    const created = await t.mutation(api.ai.conversations.create, {
      guestKey: GUEST_KEY,
      assistantId: "booking",
    })

    const invalidArgs = {
      conversationId: created.conversationId,
      guestKey: GUEST_KEY,
      callId: "call-invalid-search",
      name: "search_trips",
      input: {
        originStationId: "origin",
        destinationStationId: "destination",
        serviceDate: "2026-07-27",
        passengers: 0,
      },
    }
    const first = await t.action(api.ai.tools.execute, invalidArgs)
    const replay = await t.action(api.ai.tools.execute, invalidArgs)
    expect(first).toMatchObject({
      status: "error",
      message: expect.stringContaining("passengers"),
    })
    expect(replay).toMatchObject({
      status: "error",
      message: first.status === "error" ? first.message : undefined,
    })

    const oversized = await t.action(api.ai.tools.execute, {
      conversationId: created.conversationId,
      guestKey: GUEST_KEY,
      callId: "call-oversized",
      name: "list_stations",
      input: { payload: "x".repeat(32_001) },
    })
    expect(oversized).toEqual({
      status: "error",
      message: "Arguments d'outil trop volumineux.",
    })

    const invalidCallId = await t.action(api.ai.tools.execute, {
      conversationId: created.conversationId,
      guestKey: GUEST_KEY,
      callId: "",
      name: "list_stations",
      input: {},
    })
    expect(invalidCallId).toEqual({
      status: "error",
      message: "Identifiant d'appel invalide.",
    })

    const executions = await t.run((ctx) =>
      ctx.db.query("assistantToolExecutions").collect()
    )
    expect(executions).toHaveLength(1)
    expect(executions[0]).toMatchObject({
      callId: "call-invalid-search",
      status: "failed",
      error: expect.stringContaining("passengers"),
    })
  })

  it("mémorise la confirmation et empêche la substitution d'arguments", async () => {
    const t = convexTest(schema, modules)
    const created = await t.mutation(api.ai.conversations.create, {
      guestKey: GUEST_KEY,
    })
    const pending = await t.mutation(internal.ai.tools.prepareExecution, {
      conversationId: created.conversationId,
      callId: "call-1",
      toolName: "create_booking",
      inputJson: '{"tripId":"trip-1"}',
      requiresApproval: true,
      approved: false,
    })
    expect(pending.execution.status).toBe("approval_required")
    expect(pending.acquired).toBe(false)

    const approved = await t.mutation(internal.ai.tools.prepareExecution, {
      conversationId: created.conversationId,
      callId: "call-1",
      toolName: "create_booking",
      inputJson: '{"tripId":"trip-1"}',
      requiresApproval: true,
      approved: true,
    })
    expect(approved.execution.status).toBe("running")
    expect(approved.acquired).toBe(true)

    await expect(
      t.mutation(internal.ai.tools.prepareExecution, {
        conversationId: created.conversationId,
        callId: "call-1",
        toolName: "create_booking",
        inputJson: '{"tripId":"trip-substitue"}',
        requiresApproval: true,
        approved: true,
      })
    ).rejects.toThrow(/réutilisé/)
  })

  it("ignore une prétendue approbation fournie dès le premier appel", async () => {
    const t = convexTest(schema, modules)
    rateLimiterTest.register(t)
    const created = await t.mutation(api.ai.conversations.create, {
      guestKey: GUEST_KEY,
      assistantId: "booking",
    })

    const result = await t.action(api.ai.tools.execute, {
      conversationId: created.conversationId,
      guestKey: GUEST_KEY,
      callId: "call-forged-approval",
      name: "create_booking",
      input: {
        tripId: "trip-1",
        originStationId: "station-1",
        destinationStationId: "station-2",
        serviceClass: "DEUXIEME",
        passengers: [
          {
            lastName: "Moussavou",
            firstName: "Ariane",
            gender: "F",
          },
        ],
        contactPhone: "077000000",
      },
      approved: true,
    })

    expect(result).toMatchObject({
      status: "approval_required",
      callId: "call-forged-approval",
      toolName: "create_booking",
    })
    const execution = await t.query(internal.ai.tools.getExecution, {
      conversationId: created.conversationId,
      callId: "call-forged-approval",
    })
    expect(execution).toMatchObject({
      status: "approval_required",
    })
    expect(execution).not.toHaveProperty("approvedAt")
  })

  it("n'exécute une action engageante qu'après reprise de l'appel mémorisé", async () => {
    const t = convexTest(schema, modules)
    rateLimiterTest.register(t)
    const created = await t.mutation(api.ai.conversations.create, {
      guestKey: GUEST_KEY,
      assistantId: "booking",
    })
    const pending = await t.action(api.ai.tools.execute, {
      conversationId: created.conversationId,
      guestKey: GUEST_KEY,
      callId: "call-confirmed-later",
      name: "create_booking",
      input: {
        tripId: "trip-1",
        originStationId: "station-1",
        destinationStationId: "station-2",
        serviceClass: "DEUXIEME",
        passengers: [],
        contactPhone: "077000000",
      },
    })
    expect(pending.status).toBe("approval_required")

    const confirmed = await t.action(api.ai.chat.approveToolCall, {
      conversationId: created.conversationId,
      guestKey: GUEST_KEY,
      callId: "call-confirmed-later",
    })
    expect(confirmed).toMatchObject({
      status: "error",
      message: "Au moins un voyageur est obligatoire.",
    })
    const execution = await t.query(internal.ai.tools.getExecution, {
      conversationId: created.conversationId,
      callId: "call-confirmed-later",
    })
    expect(execution).toMatchObject({
      status: "failed",
      approvedAt: expect.any(Number),
      error: "Au moins un voyageur est obligatoire.",
    })
  })

  it("applique la limite d'appels d'outils", async () => {
    const t = convexTest(schema, modules)
    rateLimiterTest.register(t)
    const created = await t.mutation(api.ai.conversations.create, {
      guestKey: GUEST_KEY,
    })

    for (let index = 0; index < 15; index += 1) {
      const result = await t.action(api.ai.tools.execute, {
        conversationId: created.conversationId,
        guestKey: GUEST_KEY,
        callId: `call-rate-${index}`,
        name: "list_stations",
        input: {},
      })
      expect(result.status).toBe("ok")
    }
    const blocked = await t.action(api.ai.tools.execute, {
      conversationId: created.conversationId,
      guestKey: GUEST_KEY,
      callId: "call-rate-blocked",
      name: "list_stations",
      input: {},
    })
    expect(blocked).toMatchObject({
      status: "error",
      message: expect.stringContaining("Trop d'actions successives"),
    })
  })

  it("ressert le résultat réussi d'un appel rejoué", async () => {
    const t = convexTest(schema, modules)
    const created = await t.mutation(api.ai.conversations.create, {
      guestKey: GUEST_KEY,
    })
    const running = await t.mutation(internal.ai.tools.prepareExecution, {
      conversationId: created.conversationId,
      callId: "call-read",
      toolName: "list_stations",
      inputJson: "{}",
      requiresApproval: false,
      approved: false,
    })
    await t.mutation(internal.ai.tools.completeExecution, {
      executionId: running.execution._id,
      succeeded: true,
      outputJson: '{"stations":2}',
    })
    const replayed = await t.mutation(internal.ai.tools.prepareExecution, {
      conversationId: created.conversationId,
      callId: "call-read",
      toolName: "list_stations",
      inputJson: "{}",
      requiresApproval: false,
      approved: false,
    })
    expect(replayed.execution.status).toBe("succeeded")
    expect(replayed.execution.outputJson).toBe('{"stations":2}')
    expect(replayed.acquired).toBe(false)
  })

  it("rend l'approbation et le refus rejouables sans dupliquer l'historique", async () => {
    const t = convexTest(schema, modules)
    rateLimiterTest.register(t)
    const created = await t.mutation(api.ai.conversations.create, {
      guestKey: GUEST_KEY,
    })
    const pending = await t.mutation(internal.ai.tools.prepareExecution, {
      conversationId: created.conversationId,
      callId: "call-approved",
      toolName: "create_booking",
      inputJson: '{"reference":"SET-1"}',
      requiresApproval: true,
      approved: false,
    })
    await t.mutation(internal.ai.tools.completeExecution, {
      executionId: pending.execution._id,
      succeeded: true,
      outputJson: '{"reference":"SET-1"}',
    })

    const first = await t.action(api.ai.chat.approveToolCall, {
      conversationId: created.conversationId,
      guestKey: GUEST_KEY,
      callId: "call-approved",
    })
    const replay = await t.action(api.ai.chat.approveToolCall, {
      conversationId: created.conversationId,
      guestKey: GUEST_KEY,
      callId: "call-approved",
    })
    expect(first.status).toBe("ok")
    expect(replay.status).toBe("ok")

    const messages = await t.query(api.ai.conversations.listMessages, {
      conversationId: created.conversationId,
      guestKey: GUEST_KEY,
    })
    expect(
      messages.filter(
        (message) => message.requestId === "approval:call-approved"
      )
    ).toHaveLength(1)

    await t.mutation(internal.ai.tools.prepareExecution, {
      conversationId: created.conversationId,
      callId: "call-rejected",
      toolName: "cancel_booking",
      inputJson: '{"reference":"SET-2","contactPhone":null}',
      requiresApproval: true,
      approved: false,
    })
    const rejected = await t.action(api.ai.chat.rejectToolCall, {
      conversationId: created.conversationId,
      guestKey: GUEST_KEY,
      callId: "call-rejected",
    })
    const rejectedReplay = await t.action(api.ai.chat.rejectToolCall, {
      conversationId: created.conversationId,
      guestKey: GUEST_KEY,
      callId: "call-rejected",
    })
    expect(rejected.status).toBe("rejected")
    expect(rejectedReplay.status).toBe("rejected")
  })
})
