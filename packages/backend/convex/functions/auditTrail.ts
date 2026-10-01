import { paginationOptsValidator } from "convex/server"
import { v } from "convex/values"

import type { Doc, Id } from "../_generated/dataModel"
import { mutation, query, type QueryCtx } from "../_generated/server"
import { audit, requirePermission } from "../lib/auth"

/**
 * Journal d'audit — consultation, détail et export.
 *
 * Le journal ne s'efface ni ne se modifie : ces fonctions le LISENT. Chaque
 * journée UTC close est scellée par une empreinte chaînée (`auditSeals`,
 * cron quotidien de 00:30 UTC) ; le détail d'une entrée dit si elle est déjà
 * couverte par un scellement. La consultation suit la gouvernance des
 * comptes : droit `utilisateurs / consulter`.
 */

/** Familles d'actions proposées au filtre, rattachées aux tables d'objets. */
export const CATEGORIES_AUDIT = {
  ventes: ["sales", "tickets", "manualTickets", "payments"],
  caisse: ["cashSessions", "accountingDays", "journalEntries", "outboxEvents"],
  places: ["seatBlocks", "agencyQuotas", "seatOccupancy", "trips"],
  referentiels: [
    "trains",
    "coaches",
    "stations",
    "pointsOfSale",
    "timetableBooklets",
    "bookletSchedules",
    "fareSchedules",
    "fareBases",
    "discounts",
    "pricingRules",
    "systemSettings",
  ],
  droits: ["users", "moduleAccessGrants", "moduleActivations", "userAssignments"],
  terrain: ["incidents", "procesVerbaux", "ticketScans"],
} as const

export type CategorieAudit = keyof typeof CATEGORIES_AUDIT

const categorie = v.union(
  v.literal("ventes"),
  v.literal("caisse"),
  v.literal("places"),
  v.literal("referentiels"),
  v.literal("droits"),
  v.literal("terrain")
)

const filtres = {
  depuis: v.optional(v.number()),
  jusqua: v.optional(v.number()),
  acteurId: v.optional(v.id("users")),
  categorie: v.optional(categorie),
  resultat: v.optional(
    v.union(v.literal("succes"), v.literal("refus"), v.literal("echec"))
  ),
  recherche: v.optional(v.string()),
}

interface Filtres {
  depuis?: number
  jusqua?: number
  acteurId?: Id<"users">
  categorie?: CategorieAudit
  resultat?: "succes" | "refus" | "echec"
  recherche?: string
}

function requete(ctx: QueryCtx, args: Filtres) {
  const base = ctx.db
    .query("auditLogs")
    .withIndex("by_createdAt", (q) => {
      const debut = args.depuis !== undefined ? q.gte("createdAt", args.depuis) : q
      return args.jusqua !== undefined ? debut.lt("createdAt", args.jusqua) : debut
    })
    .order("desc")
  return base.filter((q) => {
    const conditions = []
    if (args.acteurId) conditions.push(q.eq(q.field("actorId"), args.acteurId))
    if (args.resultat) {
      // Une entrée sans résultat explicite est un succès (valeur par défaut).
      conditions.push(
        args.resultat === "succes"
          ? q.or(
              q.eq(q.field("result"), "succes"),
              q.eq(q.field("result"), undefined)
            )
          : q.eq(q.field("result"), args.resultat)
      )
    }
    if (args.categorie) {
      conditions.push(
        q.or(
          ...CATEGORIES_AUDIT[args.categorie].map((table) =>
            q.eq(q.field("entityTable"), table)
          )
        )
      )
    }
    return conditions.length > 0 ? q.and(...conditions) : true
  })
}

function normaliser(texte: string) {
  return texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
}

function acteurs(ctx: QueryCtx) {
  const cache = new Map<string, Promise<Doc<"users"> | null>>()
  return (id: Id<"users"> | undefined) => {
    if (!id) return Promise.resolve(null)
    if (!cache.has(id)) cache.set(id, ctx.db.get(id))
    return cache.get(id)!
  }
}

function resumeActeur(user: Doc<"users"> | null) {
  if (!user) return null
  const nom =
    `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() ||
    user.email ||
    user.matricule ||
    "Agent"
  return {
    id: user._id,
    nom,
    court:
      user.firstName && user.lastName
        ? `${user.firstName.trim()[0]}. ${user.lastName.trim()}`
        : nom,
    matricule: user.matricule ?? null,
    role: user.role,
  }
}

/** Entrée prête pour une ligne de tableau (sans les valeurs avant/après). */
async function ligne(
  log: Doc<"auditLogs">,
  acteur: (id: Id<"users"> | undefined) => Promise<Doc<"users"> | null>
) {
  return {
    _id: log._id,
    createdAt: log.createdAt,
    action: log.action,
    entityTable: log.entityTable,
    entityId: log.entityId,
    result: log.result ?? "succes",
    reason: log.reason ?? null,
    deviceId: log.deviceId ?? null,
    classification: log.classification ?? null,
    aDesValeurs: Boolean(log.before || log.after),
    acteur: resumeActeur(await acteur(log.actorId)),
  }
}

function correspond(
  entree: Awaited<ReturnType<typeof ligne>>,
  recherche: string
) {
  const texte = normaliser(
    [
      entree.action,
      entree.entityTable,
      entree.entityId,
      entree.reason ?? "",
      entree.deviceId ?? "",
      entree.acteur?.nom ?? "Système",
      entree.acteur?.matricule ?? "",
    ].join(" ")
  )
  return texte.includes(recherche)
}

export const journal = query({
  args: { paginationOpts: paginationOptsValidator, ...filtres },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "utilisateurs", "consulter")
    const acteur = acteurs(ctx)
    const page = await requete(ctx, args).paginate(args.paginationOpts)
    const recherche = normaliser(args.recherche?.trim() ?? "")
    const lignes = await Promise.all(page.page.map((log) => ligne(log, acteur)))
    return {
      ...page,
      page: recherche ? lignes.filter((l) => correspond(l, recherche)) : lignes,
    }
  },
})

export const entree = query({
  args: { logId: v.id("auditLogs") },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "utilisateurs", "consulter")
    const log = await ctx.db.get(args.logId)
    if (!log) return null
    const acteur = acteurs(ctx)
    const [seal, liees] = await Promise.all([
      ctx.db
        .query("auditSeals")
        .withIndex("by_window_end", (q) => q.gt("windowEnd", log.createdAt))
        .first(),
      ctx.db
        .query("auditLogs")
        .withIndex("by_entity", (q) =>
          q.eq("entityTable", log.entityTable).eq("entityId", log.entityId)
        )
        .order("desc")
        .take(12),
    ])
    return {
      log,
      acteur: resumeActeur(await acteur(log.actorId)),
      scellement:
        seal && seal.windowStart <= log.createdAt
          ? {
              windowStart: seal.windowStart,
              windowEnd: seal.windowEnd,
              sealHash: seal.sealHash,
              previousSealHash: seal.previousSealHash ?? null,
              logCount: seal.logCount,
              sealedAt: seal.sealedAt,
            }
          : null,
      liees: await Promise.all(
        liees
          .filter((autre) => autre._id !== log._id)
          .map((autre) => ligne(autre, acteur))
      ),
    }
  },
})

/** État de la chaîne de scellement : dernier maillon et nombre de journées scellées. */
export const scellement = query({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, "utilisateurs", "consulter")
    const [dernier, recents] = await Promise.all([
      ctx.db.query("auditSeals").withIndex("by_window_end").order("desc").first(),
      ctx.db.query("auditSeals").withIndex("by_window_end").order("desc").take(31),
    ])
    return {
      dernier: dernier
        ? {
            windowStart: dernier.windowStart,
            windowEnd: dernier.windowEnd,
            sealHash: dernier.sealHash,
            logCount: dernier.logCount,
            sealedAt: dernier.sealedAt,
          }
        : null,
      journeesScellees30j: recents.filter(
        (seal) => seal.windowEnd > Date.now() - 31 * 86_400_000
      ).length,
      heureScellementUtc: "00:30",
    }
  },
})

const LIMITE_EXPORT = 5_000

/**
 * Export CSV du journal filtré (au plus 5 000 entrées). Mutation, pour que
 * l'export soit lui-même tracé : qui a sorti quoi du journal.
 */
export const exporterJournal = mutation({
  args: filtres,
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "utilisateurs", "consulter")
    const acteur = acteurs(ctx)
    const logs = await requete(ctx, args).take(LIMITE_EXPORT + 1)
    const recherche = normaliser(args.recherche?.trim() ?? "")
    const lignes = (
      await Promise.all(logs.slice(0, LIMITE_EXPORT).map((log) => ligne(log, acteur)))
    ).filter((l) => !recherche || correspond(l, recherche))
    await audit(ctx, {
      actorId: actor._id,
      action: "audit.exporter",
      entityTable: "auditLogs",
      entityId: "*",
      permission: "consulter",
      classification: "confidentiel",
      metadata: { filtres: args, entrees: lignes.length, tronque: logs.length > LIMITE_EXPORT },
    })
    return { lignes, tronque: logs.length > LIMITE_EXPORT }
  },
})
