import { v } from "convex/values"

import { mutation, query } from "../_generated/server"
import { audit, requirePermission } from "../lib/auth"
import {
  applyTransition,
  assertValidityWindow,
  isEditable,
  periodsOverlap,
} from "../model/approval"
import { serviceClass, trainType } from "../schema"

/**
 * Versions du barème kilométrique.
 *
 * Une version active ou expirée est immuable. Les évolutions passent par une
 * nouvelle grille afin que chaque vente conserve le barème qui lui était
 * opposable au moment de l'émission.
 */

/**
 * Réductions ouvertes au public, telles que la grille active les définit.
 *
 * Le site et l'app en tirent les types de voyageurs (enfant, militaire…) au
 * lieu de les coder en dur : une réduction ajoutée ou retirée par la
 * direction commerciale apparaît ou disparaît sans nouvelle version.
 */
export const publicDiscounts = query({
  args: {},
  handler: async (ctx) => {
    const schedule = await ctx.db
      .query("fareSchedules")
      .withIndex("by_status", (q) => q.eq("status", "actif"))
      .first()
    if (!schedule) return []
    const discounts = await ctx.db
      .query("discounts")
      .withIndex("by_schedule", (q) => q.eq("scheduleId", schedule._id))
      .collect()
    return discounts
      .filter((discount) => discount.isActive)
      .map((discount) => ({
        code: discount.code,
        label: discount.label,
        ratePct: discount.ratePct,
        minAge: discount.minAge ?? null,
        maxAge: discount.maxAge ?? null,
        minPassengers: discount.minPassengers ?? null,
        maxPassengers: discount.maxPassengers ?? null,
        requiresProof: discount.requiresProof,
      }))
      .sort((left, right) => right.ratePct - left.ratePct)
  },
})

export const get = query({
  args: { scheduleId: v.id("fareSchedules") },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "tarifs", "consulter")
    const schedule = await ctx.db.get(args.scheduleId)
    if (!schedule) throw new Error("Grille tarifaire introuvable")
    const [bases, creator, approver] = await Promise.all([
      ctx.db
        .query("fareBases")
        .withIndex("by_schedule", (q) => q.eq("scheduleId", args.scheduleId))
        .collect(),
      ctx.db.get(schedule.createdBy),
      schedule.approvedBy ? ctx.db.get(schedule.approvedBy) : null,
    ])
    bases.sort(
      (left, right) =>
        left.trainType.localeCompare(right.trainType) ||
        left.serviceClass.localeCompare(right.serviceClass)
    )
    return { schedule, bases, creator, approver }
  },
})

export const update = mutation({
  args: {
    scheduleId: v.id("fareSchedules"),
    label: v.string(),
    validFrom: v.number(),
    validUntil: v.number(),
    roundingBasis: v.union(v.literal("HT"), v.literal("TTC")),
    vatPct: v.number(),
    cssPct: v.number(),
  },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "tarifs", "modifier")
    const schedule = await ctx.db.get(args.scheduleId)
    if (!schedule) throw new Error("Grille tarifaire introuvable")
    if (!isEditable(schedule.status)) {
      throw new Error(
        `Grille « ${schedule.status} » : elle n'est plus modifiable`
      )
    }
    assertValidityWindow(args.validFrom, args.validUntil)
    if (!args.label.trim()) throw new Error("Le libellé est obligatoire")
    if (args.vatPct < 0 || args.cssPct < 0) {
      throw new Error("Les taux fiscaux ne peuvent pas être négatifs")
    }
    const status =
      schedule.status === "rejete"
        ? applyTransition(schedule.status, "reprendre")
        : schedule.status
    const after = {
      label: args.label.trim(),
      validFrom: args.validFrom,
      validUntil: args.validUntil,
      roundingBasis: args.roundingBasis,
      vatPct: args.vatPct,
      cssPct: args.cssPct,
      status,
      rejectionReason: undefined,
    }
    await ctx.db.patch(args.scheduleId, after)
    await audit(ctx, {
      actorId: actor._id,
      action: "tarif.grille.modifier",
      entityTable: "fareSchedules",
      entityId: args.scheduleId,
      before: schedule,
      after,
    })
    return args.scheduleId
  },
})

export const upsertBase = mutation({
  args: {
    scheduleId: v.id("fareSchedules"),
    baseId: v.optional(v.id("fareBases")),
    trainType,
    serviceClass,
    shortDistanceRate: v.number(),
    longDistanceRate: v.number(),
  },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "tarifs", "modifier")
    const schedule = await ctx.db.get(args.scheduleId)
    if (!schedule) throw new Error("Grille tarifaire introuvable")
    if (!isEditable(schedule.status)) {
      throw new Error(`Grille « ${schedule.status} » : ses bases sont figées`)
    }
    if (args.shortDistanceRate <= 0 || args.longDistanceRate <= 0) {
      throw new Error(
        "Les taux kilométriques doivent être strictement positifs"
      )
    }

    const existing = args.baseId ? await ctx.db.get(args.baseId) : null
    if (args.baseId && (!existing || existing.scheduleId !== args.scheduleId)) {
      throw new Error("Base tarifaire introuvable dans cette grille")
    }
    const duplicate = await ctx.db
      .query("fareBases")
      .withIndex("by_schedule_train_class", (q) =>
        q
          .eq("scheduleId", args.scheduleId)
          .eq("trainType", args.trainType)
          .eq("serviceClass", args.serviceClass)
      )
      .unique()
    if (duplicate && duplicate._id !== args.baseId) {
      throw new Error(
        `Une base ${args.trainType} / ${args.serviceClass} existe déjà`
      )
    }

    const values = {
      scheduleId: args.scheduleId,
      trainType: args.trainType,
      serviceClass: args.serviceClass,
      shortDistanceRate: args.shortDistanceRate,
      longDistanceRate: args.longDistanceRate,
    }
    const id = existing
      ? (await ctx.db.patch(existing._id, values), existing._id)
      : await ctx.db.insert("fareBases", values)
    if (schedule.status === "rejete") {
      await ctx.db.patch(schedule._id, {
        status: applyTransition(schedule.status, "reprendre"),
        rejectionReason: undefined,
      })
    }
    await audit(ctx, {
      actorId: actor._id,
      action: existing ? "tarif.base.modifier" : "tarif.base.creer",
      entityTable: "fareBases",
      entityId: id,
      before: existing ?? undefined,
      after: values,
    })
    return id
  },
})

export const removeBase = mutation({
  args: { baseId: v.id("fareBases") },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "tarifs", "supprimer")
    const base = await ctx.db.get(args.baseId)
    if (!base) throw new Error("Base tarifaire introuvable")
    const schedule = await ctx.db.get(base.scheduleId)
    if (!schedule) throw new Error("Grille tarifaire introuvable")
    if (!isEditable(schedule.status)) {
      throw new Error(
        "Une base soumise, active ou historique ne peut pas être supprimée"
      )
    }
    await ctx.db.delete(base._id)
    if (schedule.status === "rejete") {
      await ctx.db.patch(schedule._id, {
        status: applyTransition(schedule.status, "reprendre"),
        rejectionReason: undefined,
      })
    }
    await audit(ctx, {
      actorId: actor._id,
      action: "tarif.base.supprimer",
      entityTable: "fareBases",
      entityId: base._id,
      before: base,
    })
  },
})

export const submit = mutation({
  args: { scheduleId: v.id("fareSchedules") },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "tarifs", "modifier")
    const schedule = await ctx.db.get(args.scheduleId)
    if (!schedule) throw new Error("Grille tarifaire introuvable")
    const bases = await ctx.db
      .query("fareBases")
      .withIndex("by_schedule", (q) => q.eq("scheduleId", args.scheduleId))
      .collect()
    if (bases.length === 0) {
      throw new Error("Grille vide : ajoutez au moins une base tarifaire")
    }
    const status = applyTransition(schedule.status, "soumettre")
    await ctx.db.patch(schedule._id, {
      status,
      submittedBy: actor._id,
      submittedAt: Date.now(),
    })
    await audit(ctx, {
      actorId: actor._id,
      action: "tarif.grille.soumettre",
      entityTable: "fareSchedules",
      entityId: schedule._id,
      before: { status: schedule.status },
      after: { status, bases: bases.length },
    })
    return status
  },
})

export const approve = mutation({
  args: { scheduleId: v.id("fareSchedules") },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "tarifs", "valider")
    const schedule = await ctx.db.get(args.scheduleId)
    if (!schedule) throw new Error("Grille tarifaire introuvable")
    const status = applyTransition(schedule.status, "valider")
    // Séparation des tâches : qui a rédigé ou soumis une grille ne l'approuve
    // pas. Un prix opposable engage la recette ; il faut deux signatures.
    if (
      schedule.createdBy === actor._id ||
      schedule.submittedBy === actor._id
    ) {
      throw new Error(
        "Séparation des tâches : la grille doit être approuvée par un " +
          "second administrateur, distinct de son auteur."
      )
    }

    const bases = await ctx.db
      .query("fareBases")
      .withIndex("by_schedule", (q) => q.eq("scheduleId", args.scheduleId))
      .collect()
    if (bases.length === 0) throw new Error("Grille vide : activation refusée")

    const activeSchedules = await ctx.db
      .query("fareSchedules")
      .withIndex("by_status", (q) => q.eq("status", "actif"))
      .collect()
    const overlapping = activeSchedules.find((candidate) =>
      periodsOverlap(
        schedule.validFrom,
        schedule.validUntil,
        candidate.validFrom,
        candidate.validUntil
      )
    )
    if (overlapping) {
      throw new Error(
        `Chevauchement avec la grille active « ${overlapping.label} »`
      )
    }
    const approvedAt = Date.now()
    await ctx.db.patch(schedule._id, {
      status,
      approvedBy: actor._id,
      approvedAt,
      rejectionReason: undefined,
    })
    await audit(ctx, {
      actorId: actor._id,
      action: "tarif.grille.activer",
      entityTable: "fareSchedules",
      entityId: schedule._id,
      before: { status: schedule.status },
      after: { status, approvedAt, bases: bases.length },
    })
    return status
  },
})

export const reject = mutation({
  args: { scheduleId: v.id("fareSchedules"), reason: v.string() },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "tarifs", "valider")
    const schedule = await ctx.db.get(args.scheduleId)
    if (!schedule) throw new Error("Grille tarifaire introuvable")
    const reason = args.reason.trim()
    if (!reason) throw new Error("Un motif de rejet est obligatoire")
    const status = applyTransition(schedule.status, "rejeter")
    await ctx.db.patch(schedule._id, { status, rejectionReason: reason })
    await audit(ctx, {
      actorId: actor._id,
      action: "tarif.grille.rejeter",
      entityTable: "fareSchedules",
      entityId: schedule._id,
      before: { status: schedule.status },
      after: { status, reason },
    })
    return status
  },
})

export const expire = mutation({
  args: { scheduleId: v.id("fareSchedules") },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "tarifs", "valider")
    const schedule = await ctx.db.get(args.scheduleId)
    if (!schedule) throw new Error("Grille tarifaire introuvable")
    const status = applyTransition(schedule.status, "expirer")
    await ctx.db.patch(schedule._id, { status })
    await audit(ctx, {
      actorId: actor._id,
      action: "tarif.grille.expirer",
      entityTable: "fareSchedules",
      entityId: schedule._id,
      before: { status: schedule.status },
      after: { status },
    })
    return status
  },
})
