import { v } from "convex/values"

import { mutation, query } from "../_generated/server"
import type { MutationCtx } from "../_generated/server"
import type { Doc, Id } from "../_generated/dataModel"
import { audit, requirePermission } from "../lib/auth"
import { role, serviceClass } from "../schema"

const pricingScope = v.union(
  v.literal("reseau"),
  v.literal("ligne"),
  v.literal("desserte")
)
const pricingType = v.union(
  v.literal("remplissage"),
  v.literal("anticipation"),
  v.literal("periode"),
  v.literal("canal"),
  v.literal("promotion")
)

const SELLER_ROLES = new Set<Doc<"users">["role"]>([
  "vendeur_guichet",
  "vendeur_agence",
  "taxateur",
])

export const getPricingRule = query({
  args: { ruleId: v.id("pricingRules") },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "yield", "consulter")
    const rule = await ctx.db.get(args.ruleId)
    if (!rule) return null
    const [trip, creator] = await Promise.all([
      rule.tripId ? ctx.db.get(rule.tripId) : null,
      ctx.db.get(rule.createdBy),
    ])
    return { rule, trip, creator }
  },
})

export const listYieldTripOptions = query({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, "yield", "consulter")
    const trips = await ctx.db
      .query("trips")
      .withIndex("by_departure")
      .order("desc")
      .take(100)
    return await Promise.all(
      trips.map(async (trip) => {
        const [origin, destination] = await Promise.all([
          ctx.db.get(trip.originStationId),
          ctx.db.get(trip.destinationStationId),
        ])
        return {
          id: trip._id,
          label:
            `${trip.trainNumber} · ${trip.serviceDate} · ` +
            `${origin?.name ?? "?"} → ${destination?.name ?? "?"}`,
        }
      })
    )
  },
})

export const updatePricingRule = mutation({
  args: {
    ruleId: v.id("pricingRules"),
    scope: pricingScope,
    tripId: v.optional(v.id("trips")),
    serviceClass: v.optional(serviceClass),
    type: pricingType,
    threshold: v.optional(v.number()),
    modifierPct: v.number(),
    priority: v.number(),
    validFrom: v.optional(v.number()),
    validUntil: v.optional(v.number()),
    floorXaf: v.optional(v.number()),
    capXaf: v.optional(v.number()),
    code: v.string(),
    label: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "yield", "modifier")
    const rule = await ctx.db.get(args.ruleId)
    if (!rule) throw new Error("Règle de yield introuvable.")
    const patch = {
      ...(await validatePricingRule(ctx, args)),
      label: args.label === undefined ? rule.label : validRuleLabel(args.label),
    }
    const duplicate = (await ctx.db.query("pricingRules").collect()).find(
      (candidate) => candidate._id !== rule._id && candidate.code === patch.code
    )
    if (duplicate) throw new Error(`La règle ${patch.code} existe déjà.`)

    await ctx.db.patch(rule._id, patch)
    await audit(ctx, {
      actorId: actor._id,
      action: "yield.regle.modifier",
      entityTable: "pricingRules",
      entityId: rule._id,
      before: rule,
      after: patch,
    })
    return rule._id
  },
})

export const setPricingRuleStatus = mutation({
  args: { ruleId: v.id("pricingRules"), isActive: v.boolean() },
  handler: async (ctx, args) => {
    const actor = await requirePermission(
      ctx,
      "yield",
      args.isActive ? "modifier" : "supprimer"
    )
    const rule = await ctx.db.get(args.ruleId)
    if (!rule) throw new Error("Règle de yield introuvable.")
    if (rule.isActive === args.isActive) return rule._id

    await ctx.db.patch(rule._id, { isActive: args.isActive })
    await audit(ctx, {
      actorId: actor._id,
      action: args.isActive ? "yield.regle.reactiver" : "yield.regle.suspendre",
      entityTable: "pricingRules",
      entityId: rule._id,
      before: { isActive: rule.isActive },
      after: { isActive: args.isActive },
    })
    return rule._id
  },
})

/** Nom lisible d'une règle : 80 caractères au plus, vide accepté. */
export function validRuleLabel(label: string | undefined) {
  const value = label?.trim()
  if (!value) return undefined
  if (value.length > 80) {
    throw new Error("Le nom de la règle ne peut pas dépasser 80 caractères.")
  }
  return value
}

export interface PricingRuleInput {
  scope: Doc<"pricingRules">["scope"]
  tripId?: Id<"trips">
  serviceClass?: Doc<"pricingRules">["serviceClass"]
  type: Doc<"pricingRules">["type"]
  threshold?: number
  modifierPct: number
  priority: number
  validFrom?: number
  validUntil?: number
  floorXaf?: number
  capXaf?: number
  code: string
}

export async function validatePricingRule(
  ctx: MutationCtx,
  input: PricingRuleInput
) {
  const code = input.code.trim().toUpperCase()
  if (!/^[A-Z0-9][A-Z0-9_-]{1,39}$/.test(code)) {
    throw new Error(
      "Le code doit contenir 2 à 40 lettres, chiffres, tirets ou soulignés."
    )
  }
  if (
    !Number.isFinite(input.modifierPct) ||
    input.modifierPct < -80 ||
    input.modifierPct > 100
  ) {
    throw new Error("La modulation doit être comprise entre −80 % et 100 %.")
  }
  if (
    !Number.isInteger(input.priority) ||
    input.priority < 1 ||
    input.priority > 10_000
  ) {
    throw new Error(
      "La priorité doit être un entier compris entre 1 et 10 000."
    )
  }
  if (input.threshold !== undefined && !Number.isFinite(input.threshold)) {
    throw new Error("Le seuil doit être un nombre valide.")
  }
  if (
    input.type === "remplissage" &&
    input.threshold !== undefined &&
    (input.threshold < 0 || input.threshold > 100)
  ) {
    throw new Error(
      "Le seuil de remplissage doit être compris entre 0 et 100 %."
    )
  }
  if (
    input.type === "anticipation" &&
    input.threshold !== undefined &&
    (!Number.isInteger(input.threshold) || input.threshold < 0)
  ) {
    throw new Error(
      "Le seuil d’anticipation doit être un nombre entier de jours."
    )
  }
  if (
    input.validFrom !== undefined &&
    input.validUntil !== undefined &&
    input.validUntil <= input.validFrom
  ) {
    throw new Error("La fin de validité doit suivre le début.")
  }
  if (
    [input.floorXaf, input.capXaf].some(
      (value) => value !== undefined && (!Number.isFinite(value) || value < 0)
    )
  ) {
    throw new Error("Les bornes tarifaires doivent être positives.")
  }
  if (
    input.floorXaf !== undefined &&
    input.capXaf !== undefined &&
    input.floorXaf > input.capXaf
  ) {
    throw new Error("Le plancher tarifaire ne peut pas dépasser le plafond.")
  }
  if (input.scope === "desserte" && !input.tripId) {
    throw new Error(
      "Une règle limitée à une desserte doit cibler une desserte."
    )
  }
  if (input.tripId && !(await ctx.db.get(input.tripId))) {
    throw new Error("La desserte ciblée est introuvable.")
  }

  return {
    scope: input.scope,
    tripId: input.scope === "desserte" ? input.tripId : undefined,
    serviceClass: input.serviceClass,
    type: input.type,
    threshold: input.threshold,
    modifierPct: input.modifierPct,
    priority: input.priority,
    validFrom: input.validFrom,
    validUntil: input.validUntil,
    floorXaf: input.floorXaf,
    capXaf: input.capXaf,
    code,
  }
}

export const getManagedUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "utilisateurs", "consulter")
    const user = await ctx.db.get(args.userId)
    if (!user) return null
    const [pointOfSale, cashSessions, sales] = await Promise.all([
      user.pointOfSaleId ? ctx.db.get(user.pointOfSaleId) : null,
      ctx.db
        .query("cashSessions")
        .withIndex("by_seller", (q) => q.eq("sellerId", user._id))
        .collect(),
      ctx.db
        .query("sales")
        .withIndex("by_seller", (q) => q.eq("sellerId", user._id))
        .collect(),
    ])
    return {
      user,
      pointOfSale,
      isSelf: actor._id === user._id,
      dependencies: {
        cashSessions: cashSessions.length,
        openCashSessions: cashSessions.filter(
          (session) => session.status === "ouverte"
        ).length,
        sales: sales.length,
      },
    }
  },
})

export const updateManagedUser = mutation({
  args: {
    userId: v.id("users"),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    role,
    matricule: v.optional(v.string()),
    pointOfSaleId: v.optional(v.id("pointsOfSale")),
  },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "utilisateurs", "modifier")
    const user = await ctx.db.get(args.userId)
    if (!user) throw new Error("Utilisateur introuvable.")
    if (actor._id === user._id && args.role !== user.role) {
      throw new Error("Vous ne pouvez pas modifier votre propre rôle.")
    }
    assertRoleGrantable(actor, args.role, user.role)
    if (user.role === "admin_it" && args.role !== "admin_it") {
      await requireAnotherActiveAdminIt(ctx, user._id)
    }

    const patch = await validateManagedUser(ctx, args)
    await ctx.db.patch(user._id, patch)
    await audit(ctx, {
      actorId: actor._id,
      action: "utilisateur.modifier",
      entityTable: "users",
      entityId: user._id,
      before: user,
      after: patch,
    })
    return user._id
  },
})

export const setManagedUserStatus = mutation({
  args: { userId: v.id("users"), isActive: v.boolean() },
  handler: async (ctx, args) => {
    const actor = await requirePermission(
      ctx,
      "utilisateurs",
      args.isActive ? "modifier" : "supprimer"
    )
    const user = await ctx.db.get(args.userId)
    if (!user) throw new Error("Utilisateur introuvable.")
    if (user.isActive === args.isActive) return user._id
    if (!args.isActive) {
      if (actor._id === user._id) {
        throw new Error("Vous ne pouvez pas suspendre votre propre compte.")
      }
      if (user.role === "admin_it") {
        await requireAnotherActiveAdminIt(ctx, user._id)
      }
      const openSessions = await ctx.db
        .query("cashSessions")
        .withIndex("by_seller", (q) => q.eq("sellerId", user._id))
        .filter((q) => q.eq(q.field("status"), "ouverte"))
        .collect()
      if (openSessions.length > 0) {
        throw new Error(
          `Suspension impossible : ${openSessions.length} caisse(s) ouverte(s).`
        )
      }
    } else if (SELLER_ROLES.has(user.role)) {
      const pointOfSale = user.pointOfSaleId
        ? await ctx.db.get(user.pointOfSaleId)
        : null
      if (!pointOfSale?.isActive) {
        throw new Error(
          "Rattachez le vendeur à un point de vente actif avant de le réactiver."
        )
      }
    }

    await ctx.db.patch(user._id, { isActive: args.isActive })
    await audit(ctx, {
      actorId: actor._id,
      action: args.isActive ? "utilisateur.reactiver" : "utilisateur.suspendre",
      entityTable: "users",
      entityId: user._id,
      before: { isActive: user.isActive },
      after: { isActive: args.isActive },
    })
    return user._id
  },
})

/**
 * Seul un administrateur technique attribue ou retire le rôle d'administrateur
 * technique : sans ce verrou, un droit de modification des comptes suffirait
 * à s'élever soi-même au sommet de la gouvernance.
 */
export function assertRoleGrantable(
  actor: Doc<"users">,
  nextRole: Doc<"users">["role"],
  currentRole?: Doc<"users">["role"]
) {
  if (
    actor.role !== "admin_it" &&
    (nextRole === "admin_it" || currentRole === "admin_it") &&
    nextRole !== currentRole
  ) {
    throw new Error(
      "Seul un administrateur système attribue ou retire ce rôle."
    )
  }
}

export interface ManagedUserInput {
  userId?: Id<"users">
  email?: string
  phone?: string
  firstName?: string
  lastName?: string
  role: Doc<"users">["role"]
  matricule?: string
  pointOfSaleId?: Id<"pointsOfSale">
}

export async function validateManagedUser(
  ctx: MutationCtx,
  input: ManagedUserInput
) {
  const optional = (value: string | undefined) => value?.trim() || undefined
  const email = optional(input.email)?.toLowerCase()
  const phone = optional(input.phone)?.replace(/[\s.-]/g, "")
  const firstName = optional(input.firstName)
  const lastName = optional(input.lastName)
  const matricule = optional(input.matricule)?.toUpperCase()

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("L’adresse e-mail n’est pas valide.")
  }
  if (phone && !/^\+?[0-9]{7,20}$/.test(phone)) {
    throw new Error("Le numéro de téléphone n’est pas valide.")
  }
  if (firstName && firstName.length > 80) {
    throw new Error("Le prénom ne peut pas dépasser 80 caractères.")
  }
  if (lastName && lastName.length > 80) {
    throw new Error("Le nom ne peut pas dépasser 80 caractères.")
  }
  if (email) {
    const duplicate = (await ctx.db.query("users").collect()).find(
      (candidate) => candidate.email?.trim().toLowerCase() === email
    )
    if (duplicate && duplicate._id !== input.userId) {
      throw new Error("Cette adresse e-mail est déjà utilisée.")
    }
  }
  if (phone) {
    const duplicate = (await ctx.db.query("users").collect()).find(
      (candidate) => candidate.phone?.trim().replace(/[\s.-]/g, "") === phone
    )
    if (duplicate && duplicate._id !== input.userId) {
      throw new Error("Ce numéro de téléphone est déjà utilisé.")
    }
  }

  let pointOfSaleId = input.pointOfSaleId
  if (input.role === "voyageur") pointOfSaleId = undefined
  if (SELLER_ROLES.has(input.role)) {
    if (!pointOfSaleId) {
      throw new Error("Un vendeur doit être rattaché à un point de vente.")
    }
    const pointOfSale = await ctx.db.get(pointOfSaleId)
    if (!pointOfSale?.isActive) {
      throw new Error(
        "Le point de vente sélectionné est suspendu ou introuvable."
      )
    }
  } else if (pointOfSaleId && !(await ctx.db.get(pointOfSaleId))) {
    throw new Error("Le point de vente sélectionné est introuvable.")
  }

  return {
    email,
    phone,
    firstName,
    lastName,
    role: input.role,
    matricule: input.role === "voyageur" ? undefined : matricule,
    pointOfSaleId,
  }
}

async function requireAnotherActiveAdminIt(
  ctx: MutationCtx,
  excludedId: Id<"users">
) {
  const admins = await ctx.db
    .query("users")
    .withIndex("by_role", (q) => q.eq("role", "admin_it"))
    .collect()
  if (
    !admins.some(
      (candidate) => candidate._id !== excludedId && candidate.isActive
    )
  ) {
    throw new Error(
      "Cette action supprimerait le dernier administrateur technique actif."
    )
  }
}
