import { v } from "convex/values"

import { mutation } from "../../_generated/server"
import type { MutationCtx } from "../../_generated/server"
import type { Doc, Id } from "../../_generated/dataModel"
import { audit, requirePermission } from "../../lib/auth"
import {
  appRoleValidator,
  moduleCodeValidator,
  organizationTypeValidator,
  platformEnvironmentValidator,
  siteTypeValidator,
} from "./validators"

function normalizedCode(value: string): string {
  const code = value.trim().toUpperCase()
  if (!/^[A-Z0-9][A-Z0-9_-]{1,39}$/.test(code)) {
    throw new Error(
      "Le code doit contenir 2 à 40 lettres, chiffres, tirets ou soulignés."
    )
  }
  return code
}

function requiredText(value: string, label: string, maxLength = 160): string {
  const normalized = value.trim()
  if (normalized.length === 0 || normalized.length > maxLength) {
    throw new Error(
      `${label} doit contenir entre 1 et ${maxLength} caractères.`
    )
  }
  return normalized
}

async function assertOrganizationActive(
  ctx: MutationCtx,
  organizationId: Id<"organizations">
) {
  const organization = await ctx.db.get(organizationId)
  if (!organization || !organization.isActive) {
    throw new Error("Organisation introuvable ou inactive.")
  }
  return organization
}

async function organizationContains(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  ancestorId: Id<"organizations">
): Promise<boolean> {
  let cursor: Id<"organizations"> | undefined = organizationId
  const visited = new Set<string>()
  while (cursor && !visited.has(cursor)) {
    if (cursor === ancestorId) return true
    visited.add(cursor)
    const organization: Doc<"organizations"> | null = await ctx.db.get(cursor)
    cursor = organization?.parentOrganizationId
  }
  return false
}

export const createOrganization = mutation({
  args: {
    code: v.string(),
    name: v.string(),
    type: organizationTypeValidator,
    parentOrganizationId: v.optional(v.id("organizations")),
  },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "parametrage", "creer")
    const code = normalizedCode(args.code)
    const existing = await ctx.db
      .query("organizations")
      .withIndex("by_code", (query) => query.eq("code", code))
      .unique()
    if (existing) throw new Error(`L'organisation ${code} existe déjà.`)
    if (args.parentOrganizationId) {
      await assertOrganizationActive(ctx, args.parentOrganizationId)
    }

    const now = Date.now()
    const values = {
      code,
      name: requiredText(args.name, "Le nom"),
      type: args.type,
      parentOrganizationId: args.parentOrganizationId,
      isActive: true,
      createdBy: actor._id,
      createdAt: now,
      updatedAt: now,
    }
    const organizationId = await ctx.db.insert("organizations", values)
    await audit(ctx, {
      actorId: actor._id,
      action: "plateforme.organisation.creer",
      entityTable: "organizations",
      entityId: organizationId,
      after: values,
    })
    return organizationId
  },
})

export const createSite = mutation({
  args: {
    code: v.string(),
    name: v.string(),
    type: siteTypeValidator,
    organizationId: v.id("organizations"),
    stationId: v.optional(v.id("stations")),
  },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "parametrage", "creer")
    const code = normalizedCode(args.code)
    const existing = await ctx.db
      .query("sites")
      .withIndex("by_code", (query) => query.eq("code", code))
      .unique()
    if (existing) throw new Error(`Le site ${code} existe déjà.`)
    await assertOrganizationActive(ctx, args.organizationId)
    if (args.stationId && !(await ctx.db.get(args.stationId))) {
      throw new Error("Gare billettique introuvable.")
    }

    const now = Date.now()
    const values = {
      code,
      name: requiredText(args.name, "Le nom"),
      type: args.type,
      organizationId: args.organizationId,
      stationId: args.stationId,
      isActive: true,
      createdBy: actor._id,
      createdAt: now,
      updatedAt: now,
    }
    const siteId = await ctx.db.insert("sites", values)
    await audit(ctx, {
      actorId: actor._id,
      action: "plateforme.site.creer",
      entityTable: "sites",
      entityId: siteId,
      after: values,
    })
    return siteId
  },
})

export const createPosition = mutation({
  args: {
    code: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    organizationId: v.optional(v.id("organizations")),
  },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "parametrage", "creer")
    const code = normalizedCode(args.code)
    const existing = await ctx.db
      .query("positions")
      .withIndex("by_code", (query) => query.eq("code", code))
      .unique()
    if (existing) throw new Error(`Le poste ${code} existe déjà.`)
    if (args.organizationId) {
      await assertOrganizationActive(ctx, args.organizationId)
    }

    const now = Date.now()
    const values = {
      code,
      name: requiredText(args.name, "Le nom"),
      description: args.description
        ? requiredText(args.description, "La description", 500)
        : undefined,
      organizationId: args.organizationId,
      isActive: true,
      createdBy: actor._id,
      createdAt: now,
      updatedAt: now,
    }
    const positionId = await ctx.db.insert("positions", values)
    await audit(ctx, {
      actorId: actor._id,
      action: "plateforme.poste.creer",
      entityTable: "positions",
      entityId: positionId,
      after: values,
    })
    return positionId
  },
})

export const createUserAssignment = mutation({
  args: {
    userId: v.id("users"),
    role: appRoleValidator,
    positionId: v.optional(v.id("positions")),
    organizationId: v.optional(v.id("organizations")),
    siteId: v.optional(v.id("sites")),
    validFrom: v.number(),
    validUntil: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "parametrage", "creer")
    if (!(await ctx.db.get(args.userId))) {
      throw new Error("Utilisateur introuvable.")
    }
    if (!Number.isFinite(args.validFrom)) {
      throw new Error("La date de début est invalide.")
    }
    if (
      args.validUntil !== undefined &&
      (!Number.isFinite(args.validUntil) || args.validUntil <= args.validFrom)
    ) {
      throw new Error("La fin de validité doit suivre le début.")
    }
    if (args.organizationId) {
      await assertOrganizationActive(ctx, args.organizationId)
    }
    if (args.positionId) {
      const position = await ctx.db.get(args.positionId)
      if (!position || !position.isActive) {
        throw new Error("Poste introuvable ou inactif.")
      }
    }
    if (args.siteId) {
      const site = await ctx.db.get(args.siteId)
      if (!site || !site.isActive) {
        throw new Error("Site introuvable ou inactif.")
      }
      if (
        args.organizationId &&
        !(await organizationContains(
          ctx,
          site.organizationId,
          args.organizationId
        ))
      ) {
        throw new Error("Le site n'appartient pas à la portée d'organisation.")
      }
    }

    const now = Date.now()
    const values = {
      ...args,
      isActive: true,
      createdBy: actor._id,
      createdAt: now,
      updatedAt: now,
    }
    const assignmentId = await ctx.db.insert("userAssignments", values)
    await audit(ctx, {
      actorId: actor._id,
      action: "plateforme.affectation.creer",
      entityTable: "userAssignments",
      entityId: assignmentId,
      permission: "creer",
      classification: "restreint",
      after: values,
    })
    return assignmentId
  },
})

export const setUserAssignmentStatus = mutation({
  args: {
    assignmentId: v.id("userAssignments"),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "parametrage", "modifier")
    const assignment = await ctx.db.get(args.assignmentId)
    if (!assignment) throw new Error("Affectation introuvable.")
    if (assignment.isActive === args.isActive) return assignment._id

    const after = { isActive: args.isActive, updatedAt: Date.now() }
    await ctx.db.patch(assignment._id, after)
    await audit(ctx, {
      actorId: actor._id,
      action: args.isActive
        ? "plateforme.affectation.reactiver"
        : "plateforme.affectation.suspendre",
      entityTable: "userAssignments",
      entityId: assignment._id,
      permission: "modifier",
      classification: "restreint",
      before: { isActive: assignment.isActive },
      after,
    })
    return assignment._id
  },
})

export const setModuleActivation = mutation({
  args: {
    moduleCode: moduleCodeValidator,
    environment: platformEnvironmentValidator,
    siteId: v.optional(v.id("sites")),
    userId: v.optional(v.id("users")),
    isEnabled: v.boolean(),
    reason: v.string(),
    correlationId: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "parametrage", "modifier")
    const reason = requiredText(args.reason, "Le motif", 500)
    const correlationId = requiredText(
      args.correlationId,
      "L'identifiant de corrélation",
      120
    )
    if (args.siteId) {
      const site = await ctx.db.get(args.siteId)
      if (!site || !site.isActive) {
        throw new Error("Site introuvable ou inactif.")
      }
    }
    if (args.userId && !(await ctx.db.get(args.userId))) {
      throw new Error("Utilisateur introuvable.")
    }

    const candidates = await ctx.db
      .query("moduleActivations")
      .withIndex("by_environment_module", (query) =>
        query
          .eq("environment", args.environment)
          .eq("moduleCode", args.moduleCode)
      )
      .collect()
    const existing = candidates.find(
      (candidate) =>
        candidate.siteId === args.siteId && candidate.userId === args.userId
    )
    const after = {
      moduleCode: args.moduleCode,
      environment: args.environment,
      siteId: args.siteId,
      userId: args.userId,
      isEnabled: args.isEnabled,
      reason,
      correlationId,
      changedBy: actor._id,
      updatedAt: Date.now(),
    }
    const activationId = existing
      ? existing._id
      : await ctx.db.insert("moduleActivations", after)
    if (existing) await ctx.db.patch(existing._id, after)

    await audit(ctx, {
      actorId: actor._id,
      action: "plateforme.module.activation",
      entityTable: "moduleActivations",
      entityId: activationId,
      permission: "modifier",
      reason,
      correlationId,
      classification: "interne",
      before: existing,
      after,
      metadata: { reason, correlationId },
    })
    return activationId
  },
})
