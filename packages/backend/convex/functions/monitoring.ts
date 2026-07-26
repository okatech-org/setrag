import { v } from "convex/values"
import { internalMutation, query } from "../_generated/server"
import { audit, requirePermission } from "../lib/auth"
import { isUsingDemoKey } from "../lib/signature"
import {
  classifyAccountingDays,
  classifyCashSessions,
  classifyDemoConfiguration,
  classifyOutbox,
  classifyStaleHolds,
  overallSeverity,
  sortFindings,
  type Finding,
} from "../model/supervision"

/**
 * Supervision d'exploitation.
 *
 * Convex signale ce qui échoue. Cet écran signale ce qui n'échoue pas mais
 * s'enlise : un déversement comptable resté en file, une caisse jamais
 * fermée, un cron qui ne tourne plus. Aucune de ces situations ne lève
 * d'erreur ; elles s'installent, et on les découvre à la clôture mensuelle.
 *
 * La requête est réactive : un tableau de bord qui s'y abonne se met à jour
 * tout seul. C'est le mécanisme d'alerte naturel ici — inutile de doubler
 * d'un système de notification tant que personne n'est d'astreinte.
 */

/** Bilan de santé, pour le tableau de bord d'exploitation. */
export const health = query({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, "rapports", "consulter")
    return await collectFindings(ctx)
  },
})

/**
 * Contrôle planifié.
 *
 * Trace un constat dans le journal d'audit quand une anomalie critique
 * apparaît. Le journal sert de mémoire : sans lui, on ne saurait pas depuis
 * quand une situation dure — or c'est exactement la question qu'on se pose en
 * la découvrant.
 */
export const runHealthCheck = internalMutation({
  args: {},
  handler: async (ctx) => {
    const bilan = await collectFindings(ctx)
    const critiques = bilan.findings.filter((f) => f.severity === "critique")

    if (critiques.length > 0) {
      await audit(ctx, {
        action: "supervision.anomalie",
        entityTable: "outboxEvents",
        entityId: "*",
        after: {
          severity: bilan.severity,
          codes: critiques.map((f) => f.code),
          labels: critiques.map((f) => f.label),
        },
      })
    }

    return {
      severity: bilan.severity,
      critical: critiques.length,
      total: bilan.findings.length,
    }
  },
})

/* ───────────────────────────── Collecte ────────────────────────────────── */

type Ctx = Parameters<Parameters<typeof query>[0]["handler"]>[0]

async function collectFindings(ctx: Ctx) {
  const now = Date.now()

  // Chaque lecture est bornée : la supervision ne doit jamais devenir le
  // traitement le plus coûteux du système.
  const [outbox, days, sessions, holds] = await Promise.all([
    ctx.db.query("outboxEvents").withIndex("by_status").take(500),
    ctx.db
      .query("accountingDays")
      .withIndex("by_status", (q) => q.eq("status", "ouverte"))
      .take(100),
    ctx.db
      .query("cashSessions")
      .withIndex("by_status", (q) => q.eq("status", "ouverte"))
      .take(200),
    ctx.db
      .query("sales")
      .withIndex("by_status_hold", (q) =>
        q.eq("status", "en_attente_paiement").lt("priceLockedUntil", now),
      )
      .take(200),
  ])

  const provisionalFares = await ctx.db
    .query("ancillaryFares")
    .filter((q) => q.eq(q.field("isProvisional"), true))
    .take(500)

  const findings: Finding[] = [
    ...classifyOutbox(outbox, now),
    ...classifyAccountingDays(days, now),
    ...classifyCashSessions(sessions, now),
    ...classifyStaleHolds(holds, now),
    ...classifyDemoConfiguration({
      usingDemoSigningKey: isUsingDemoKey(),
      provisionalFareCount: provisionalFares.length,
    }),
  ]

  return {
    checkedAt: now,
    severity: overallSeverity(findings),
    findings: sortFindings(findings),
  }
}

/* ─────────────────────── Détail d'une file bloquée ─────────────────────── */

/** Événements de file les plus anciens, pour comprendre un blocage. */
export const stuckOutboxEvents = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "integrations", "consulter")
    const limite = Math.min(args.limit ?? 20, 100)

    const events = await ctx.db
      .query("outboxEvents")
      .withIndex("by_status", (q) => q.eq("status", "en_attente"))
      .take(200)

    return events
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(0, limite)
      .map((e) => ({
        _id: e._id,
        type: e.type,
        entityId: e.entityId,
        attempts: e.attempts,
        lastError: e.lastError,
        createdAt: e.createdAt,
        waitingForMs: Date.now() - e.createdAt,
      }))
  },
})
