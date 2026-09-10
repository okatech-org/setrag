import { makeFunctionReference } from "convex/server"
import { convexTest } from "convex-test"
import { describe, expect, it } from "vitest"

import type { Id } from "../../_generated/dataModel"
import schema from "../../schema"
import { modules } from "../../test.setup"
import { audit } from "../../lib/auth"
import { previousUtcDayWindow } from "./audit"

const sealWindow = makeFunctionReference<
  "mutation",
  { windowStart: number; windowEnd: number },
  Id<"auditSeals">
>("modules/platform/audit:sealWindow")

const listSeals = makeFunctionReference<"query", { limit?: number }>(
  "modules/platform/audit:listSeals"
)

async function seedUser(
  t: ReturnType<typeof convexTest>,
  authId: string,
  role: "admin_it" | "vendeur_guichet"
) {
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", {
      authId,
      role,
      identitySource: "local",
      isActive: true,
    })
  )
  return { userId, client: t.withIdentity({ subject: authId }) }
}

async function insertAuditLog(
  t: ReturnType<typeof convexTest>,
  createdAt: number,
  action: string
) {
  return await t.run((ctx) =>
    ctx.db.insert("auditLogs", {
      action,
      entityTable: "tests",
      entityId: action,
      result: "succes",
      createdAt,
    })
  )
}

describe("Audit V2", () => {
  it("calcule la journée UTC révolue indépendamment du fuseau du serveur", () => {
    expect(previousUtcDayWindow(Date.UTC(2026, 8, 10, 16, 45))).toEqual({
      windowStart: Date.UTC(2026, 8, 9),
      windowEnd: Date.UTC(2026, 8, 10),
    })
  })

  it("journalise les champs V2 et applique le résultat succès par défaut", async () => {
    const t = convexTest(schema, modules)
    const { userId } = await seedUser(t, "audit-admin", "admin_it")
    const assignmentId = await t.run((ctx) =>
      ctx.db.insert("userAssignments", {
        userId,
        role: "admin_it",
        validFrom: 0,
        isActive: true,
        createdBy: userId,
        createdAt: 0,
        updatedAt: 0,
      })
    )

    await t.run(async (ctx) => {
      await audit(ctx, {
        actorId: userId,
        assignmentId,
        action: "plateforme.test.modifier",
        entityTable: "tests",
        entityId: "TEST-001",
        permission: "modifier",
        reason: "Vérification du journal V2",
        correlationId: "CORR-001",
        causationId: "CAUSE-001",
        classification: "confidentiel",
        context: { canal: "back-office" },
      })
    })

    const log = await t.run((ctx) => ctx.db.query("auditLogs").unique())
    expect(log).toMatchObject({
      actorId: userId,
      assignmentId,
      permission: "modifier",
      reason: "Vérification du journal V2",
      result: "succes",
      correlationId: "CORR-001",
      causationId: "CAUSE-001",
      classification: "confidentiel",
      context: JSON.stringify({ canal: "back-office" }),
    })
  })

  it("scelle une fenêtre de manière idempotente et chaîne la suivante", async () => {
    const t = convexTest(schema, modules)
    await insertAuditLog(t, 100, "audit.premier")

    const firstId = await t.mutation(sealWindow, {
      windowStart: 0,
      windowEnd: 1_000,
    })
    const replayId = await t.mutation(sealWindow, {
      windowStart: 0,
      windowEnd: 1_000,
    })
    expect(replayId).toBe(firstId)

    await insertAuditLog(t, 1_100, "audit.second")
    const secondId = await t.mutation(sealWindow, {
      windowStart: 1_000,
      windowEnd: 2_000,
    })
    const state = await t.run(async (ctx) => ({
      first: await ctx.db.get(firstId),
      second: await ctx.db.get(secondId),
      seals: await ctx.db.query("auditSeals").collect(),
    }))

    expect(state.seals).toHaveLength(2)
    expect(state.first?.sealHash).toMatch(/^[a-f0-9]{64}$/)
    expect(state.second).toMatchObject({
      logCount: 1,
      previousSealHash: state.first?.sealHash,
      algorithm: "sha256",
    })
  })

  it("réserve la lecture de la chaîne aux administrateurs", async () => {
    const t = convexTest(schema, modules)
    const seller = await seedUser(t, "audit-vendeur", "vendeur_guichet")

    await expect(seller.client.query(listSeals, {})).rejects.toThrow(
      "n'est pas autorisé"
    )
  })
})
