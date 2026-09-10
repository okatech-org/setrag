import { v } from "convex/values"

import type { Doc, Id } from "../../_generated/dataModel"
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "../../_generated/server"
import { audit } from "../../lib/auth"
import {
  ADMIN_ROLES,
  can,
  type Permission,
  type ProtectedResource,
} from "../../model/permissions"
import {
  resolveApprovalCancellation,
  resolveApprovalDecision,
} from "./approvalModel"
import { moduleManifestEntry } from "./catalog"
import { assertCan, isAssignmentEffective } from "./model"
import { moduleCodeValidator } from "./validators"

const approvalDecisionValidator = v.union(
  v.literal("approuver"),
  v.literal("rejeter")
)

const requestedStepValidator = v.object({
  label: v.string(),
  assignedUserId: v.optional(v.id("users")),
})

const MAX_STEPS = 10
const MAX_LIST_LIMIT = 100

type DatabaseCtx = QueryCtx | MutationCtx

function requiredText(value: string, label: string, maxLength: number): string {
  const normalized = value.trim()
  if (normalized.length === 0 || normalized.length > maxLength) {
    throw new Error(
      `${label} doit contenir entre 1 et ${maxLength} caractères.`
    )
  }
  return normalized
}

function optionalText(
  value: string | undefined,
  label: string,
  maxLength: number
): string | undefined {
  if (value === undefined) return undefined
  return requiredText(value, label, maxLength)
}

function normalizedWorkflowCode(value: string): string {
  const code = value.trim().toUpperCase()
  if (!/^[A-Z0-9][A-Z0-9_.-]{1,79}$/.test(code)) {
    throw new Error(
      "Le code de workflow doit contenir 2 à 80 lettres, chiffres, points, tirets ou soulignés."
    )
  }
  return code
}

async function organizationContains(
  ctx: DatabaseCtx,
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

async function assignmentCoversSite(
  ctx: DatabaseCtx,
  assignment: Doc<"userAssignments">,
  siteId: Id<"sites"> | undefined
): Promise<boolean> {
  if (assignment.siteId) return assignment.siteId === siteId
  if (!assignment.organizationId) return true
  if (!siteId) return false

  const site = await ctx.db.get(siteId)
  if (!site || !site.isActive) return false
  return await organizationContains(
    ctx,
    site.organizationId,
    assignment.organizationId
  )
}

async function effectiveAssignment(
  ctx: DatabaseCtx,
  params: {
    userId: Id<"users">
    resource: ProtectedResource
    permission: Permission
    siteId?: Id<"sites">
  }
): Promise<Doc<"userAssignments"> | undefined> {
  const now = Date.now()
  const assignments = await ctx.db
    .query("userAssignments")
    .withIndex("by_user", (builder) => builder.eq("userId", params.userId))
    .collect()
  assignments.sort(
    (left, right) =>
      right.validFrom - left.validFrom ||
      right._creationTime - left._creationTime
  )

  for (const assignment of assignments) {
    if (!isAssignmentEffective(assignment, now)) continue
    if (!can(assignment.role, params.resource, params.permission)) continue
    if (await assignmentCoversSite(ctx, assignment, params.siteId)) {
      return assignment
    }
  }
  return undefined
}

async function assertSiteActive(
  ctx: DatabaseCtx,
  siteId: Id<"sites"> | undefined
): Promise<void> {
  if (!siteId) return
  const site = await ctx.db.get(siteId)
  if (!site || !site.isActive) {
    throw new Error("Site introuvable ou inactif.")
  }
}

function validLimit(value: number | undefined): number {
  const limit = value ?? 50
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIST_LIMIT) {
    throw new Error(
      `La limite doit être un entier compris entre 1 et ${MAX_LIST_LIMIT}.`
    )
  }
  return limit
}

async function orderedSteps(
  ctx: DatabaseCtx,
  instanceId: Id<"approvalInstances">
) {
  return await ctx.db
    .query("approvalSteps")
    .withIndex("by_instance_sequence", (builder) =>
      builder.eq("instanceId", instanceId)
    )
    .order("asc")
    .collect()
}

async function correlatedAuditLogs(
  ctx: DatabaseCtx,
  correlationId: string
): Promise<Doc<"auditLogs">[]> {
  return await ctx.db
    .query("auditLogs")
    .withIndex("by_correlation", (builder) =>
      builder.eq("correlationId", correlationId)
    )
    .collect()
}

function storedDecisionResult(log: Doc<"auditLogs">) {
  if (!log.after) throw new Error("Résultat d'approbation audité illisible.")
  const value = JSON.parse(log.after) as {
    status?: Doc<"approvalInstances">["status"]
    currentStep?: number
  }
  if (!value.status || !Number.isInteger(value.currentStep)) {
    throw new Error("Résultat d'approbation audité incomplet.")
  }
  return {
    status: value.status,
    currentStep: value.currentStep!,
    terminal: value.status !== "en_attente",
  }
}

async function currentStep(
  ctx: DatabaseCtx,
  instance: Doc<"approvalInstances">
) {
  return await ctx.db
    .query("approvalSteps")
    .withIndex("by_instance_sequence", (builder) =>
      builder
        .eq("instanceId", instance._id)
        .eq("sequence", instance.currentStep)
    )
    .unique()
}

async function notifyRequester(
  ctx: MutationCtx,
  instance: Doc<"approvalInstances">,
  status: "approuve" | "rejete",
  correlationId: string,
  now: number
): Promise<void> {
  await ctx.db.insert("notifications", {
    userId: instance.requestedBy,
    channel: "in_app",
    title:
      status === "approuve"
        ? "Demande approuvée"
        : "Demande d'approbation rejetée",
    body:
      status === "approuve"
        ? `Le circuit ${instance.workflowCode} est entièrement approuvé.`
        : `Le circuit ${instance.workflowCode} a été rejeté.`,
    data: JSON.stringify({
      approvalInstanceId: instance._id,
      moduleCode: instance.moduleCode,
      entityType: instance.entityType,
      entityId: instance.entityId,
      status,
      correlationId,
    }),
    sentAt: now,
  })
}

export const requestApproval = mutation({
  args: {
    moduleCode: moduleCodeValidator,
    entityType: v.string(),
    entityId: v.string(),
    siteId: v.optional(v.id("sites")),
    workflowCode: v.string(),
    reason: v.string(),
    correlationId: v.string(),
    causationId: v.optional(v.string()),
    steps: v.array(requestedStepValidator),
  },
  handler: async (ctx, args) => {
    const module = moduleManifestEntry(args.moduleCode)
    const access = await assertCan(ctx, {
      moduleCode: args.moduleCode,
      resource: module.resource,
      permission: "modifier",
      siteId: args.siteId,
    })
    await assertSiteActive(ctx, args.siteId)

    const entityType = requiredText(args.entityType, "Le type d'entité", 120)
    const entityId = requiredText(args.entityId, "L'identifiant d'entité", 200)
    const workflowCode = normalizedWorkflowCode(args.workflowCode)
    const reason = requiredText(args.reason, "Le motif", 500)
    const correlationId = requiredText(
      args.correlationId,
      "L'identifiant de corrélation",
      120
    )
    const causationId = optionalText(
      args.causationId,
      "L'identifiant de causalité",
      120
    )
    if (args.steps.length < 1 || args.steps.length > MAX_STEPS) {
      throw new Error(
        `Le circuit doit contenir entre 1 et ${MAX_STEPS} étapes.`
      )
    }
    const steps = args.steps.map((step) => ({
      label: requiredText(step.label, "Le libellé d'étape", 160),
      assignedUserId: step.assignedUserId,
    }))

    const correlated = await ctx.db
      .query("approvalInstances")
      .withIndex("by_correlation", (builder) =>
        builder.eq("correlationId", correlationId)
      )
      .unique()
    if (correlated) {
      const storedSteps = await orderedSteps(ctx, correlated._id)
      const coherent =
        correlated.moduleCode === args.moduleCode &&
        correlated.entityType === entityType &&
        correlated.entityId === entityId &&
        correlated.workflowCode === workflowCode &&
        correlated.requestedBy === access.user._id &&
        correlated.siteId === args.siteId &&
        correlated.reason === reason &&
        correlated.causationId === causationId &&
        storedSteps.length === steps.length &&
        storedSteps.every(
          (step, index) =>
            step.label === steps[index]?.label &&
            step.assignedUserId === steps[index]?.assignedUserId
        )
      if (!coherent) {
        throw new Error(
          "Collision de corrélation avec une autre demande d'approbation."
        )
      }
      return { instanceId: correlated._id, duplicate: true }
    }

    const active = (
      await ctx.db
        .query("approvalInstances")
        .withIndex("by_entity", (builder) =>
          builder
            .eq("moduleCode", args.moduleCode)
            .eq("entityType", entityType)
            .eq("entityId", entityId)
        )
        .collect()
    ).find(
      (candidate) =>
        candidate.workflowCode === workflowCode &&
        candidate.status === "en_attente"
    )
    if (active) {
      throw new Error(
        "Une approbation est déjà en attente pour cette entité et ce workflow."
      )
    }

    const assignedUserIds = new Set(
      steps.flatMap((step) =>
        step.assignedUserId ? [step.assignedUserId] : []
      )
    )
    for (const assignedUserId of assignedUserIds) {
      const assignedUser = await ctx.db.get(assignedUserId)
      if (!assignedUser || !assignedUser.isActive) {
        throw new Error("Un approbateur affecté est introuvable ou inactif.")
      }
    }

    const requesterAssignmentId =
      access.permissionSource === "assignment"
        ? (
            await effectiveAssignment(ctx, {
              userId: access.user._id,
              resource: module.resource,
              permission: "modifier",
              siteId: args.siteId,
            })
          )?._id
        : undefined
    if (access.permissionSource === "assignment" && !requesterAssignmentId) {
      throw new Error("Affectation du demandeur introuvable ou expirée.")
    }

    const now = Date.now()
    const values = {
      moduleCode: args.moduleCode,
      entityType,
      entityId,
      siteId: args.siteId,
      workflowCode,
      status: "en_attente" as const,
      requestedBy: access.user._id,
      requesterAssignmentId,
      currentStep: 1,
      totalSteps: steps.length,
      reason,
      correlationId,
      causationId,
      createdAt: now,
      updatedAt: now,
    }
    const instanceId = await ctx.db.insert("approvalInstances", values)
    for (const [index, step] of steps.entries()) {
      await ctx.db.insert("approvalSteps", {
        instanceId,
        sequence: index + 1,
        label: step.label,
        assignedUserId: step.assignedUserId,
        status: "en_attente",
      })
    }
    await audit(ctx, {
      actorId: access.user._id,
      assignmentId: requesterAssignmentId,
      action: "plateforme.approbation.demander",
      entityTable: "approvalInstances",
      entityId: instanceId,
      permission: "modifier",
      reason,
      result: "succes",
      correlationId,
      causationId,
      classification: "interne",
      after: { ...values, steps },
    })
    return { instanceId, duplicate: false }
  },
})

export const decideApproval = mutation({
  args: {
    instanceId: v.id("approvalInstances"),
    decision: approvalDecisionValidator,
    comment: v.optional(v.string()),
    correlationId: v.string(),
    causationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const instance = await ctx.db.get(args.instanceId)
    if (!instance) throw new Error("Approbation introuvable.")
    const module = moduleManifestEntry(instance.moduleCode)
    const access = await assertCan(ctx, {
      moduleCode: instance.moduleCode,
      resource: module.resource,
      permission: "valider",
      siteId: instance.siteId,
    })
    await assertSiteActive(ctx, instance.siteId)
    if (instance.requestedBy === access.user._id) {
      throw new Error("Le demandeur ne peut pas décider sa propre approbation.")
    }
    const correlationId = requiredText(
      args.correlationId,
      "L'identifiant de corrélation",
      120
    )
    const comment = optionalText(args.comment, "Le commentaire", 1_000)
    if (args.decision === "rejeter" && !comment) {
      throw new Error("Un commentaire est obligatoire pour rejeter.")
    }
    const causationId =
      optionalText(args.causationId, "L'identifiant de causalité", 120) ??
      instance.correlationId
    const correlatedLogs = await correlatedAuditLogs(ctx, correlationId)
    const expectedAction = `plateforme.approbation.${args.decision}`
    const replayedDecision = correlatedLogs.find(
      (log) =>
        log.actorId === access.user._id &&
        log.entityTable === "approvalInstances" &&
        log.entityId === instance._id &&
        log.action === expectedAction
    )
    if (replayedDecision) {
      const coherentReplay =
        replayedDecision.causationId === causationId &&
        (comment
          ? replayedDecision.reason === comment
          : replayedDecision.reason?.startsWith("Décision sur l'étape") ===
            true)
      if (!coherentReplay) {
        throw new Error("Collision de corrélation avec une autre décision.")
      }
      return {
        instanceId: instance._id,
        ...storedDecisionResult(replayedDecision),
        duplicate: true,
      }
    }
    if (correlatedLogs.length > 0) {
      throw new Error("Collision de corrélation avec une autre décision.")
    }
    if (instance.status !== "en_attente") {
      throw new Error("Cette approbation est déjà terminée.")
    }

    const step = await currentStep(ctx, instance)
    if (!step || step.status !== "en_attente") {
      throw new Error("Étape courante d'approbation introuvable ou terminée.")
    }
    if (step.assignedUserId && step.assignedUserId !== access.user._id) {
      throw new Error("Cette étape est affectée à un autre approbateur.")
    }

    const decisionAssignmentId =
      access.permissionSource === "assignment"
        ? (
            await effectiveAssignment(ctx, {
              userId: access.user._id,
              resource: module.resource,
              permission: "valider",
              siteId: instance.siteId,
            })
          )?._id
        : undefined
    if (access.permissionSource === "assignment" && !decisionAssignmentId) {
      throw new Error("Affectation de l'approbateur introuvable ou expirée.")
    }

    const transition = resolveApprovalDecision({
      status: instance.status,
      currentStep: instance.currentStep,
      totalSteps: instance.totalSteps,
      decision: args.decision,
    })
    const now = Date.now()
    await ctx.db.patch(step._id, {
      status: transition.stepStatus,
      decidedBy: access.user._id,
      decisionAssignmentId,
      comment,
      decidedAt: now,
    })
    if (transition.ignoreRemaining) {
      const steps = await orderedSteps(ctx, instance._id)
      for (const remaining of steps) {
        if (
          remaining.sequence > instance.currentStep &&
          remaining.status === "en_attente"
        ) {
          await ctx.db.patch(remaining._id, { status: "ignore" })
        }
      }
    }

    const instancePatch = {
      status: transition.instanceStatus,
      currentStep: transition.currentStep,
      updatedAt: now,
      resolvedAt: transition.terminal ? now : undefined,
    }
    await ctx.db.patch(instance._id, instancePatch)
    if (
      transition.instanceStatus === "approuve" ||
      transition.instanceStatus === "rejete"
    ) {
      await notifyRequester(
        ctx,
        instance,
        transition.instanceStatus,
        correlationId,
        now
      )
    }
    await audit(ctx, {
      actorId: access.user._id,
      assignmentId: decisionAssignmentId,
      action: `plateforme.approbation.${args.decision}`,
      entityTable: "approvalInstances",
      entityId: instance._id,
      permission: "valider",
      reason: comment ?? `Décision sur l'étape « ${step.label} » du circuit.`,
      result: "succes",
      correlationId,
      causationId,
      classification: "interne",
      before: {
        status: instance.status,
        currentStep: instance.currentStep,
        stepStatus: step.status,
      },
      after: {
        ...instancePatch,
        stepSequence: step.sequence,
        stepStatus: transition.stepStatus,
      },
    })
    return {
      instanceId: instance._id,
      status: transition.instanceStatus,
      currentStep: transition.currentStep,
      terminal: transition.terminal,
      duplicate: false,
    }
  },
})

export const cancelApproval = mutation({
  args: {
    instanceId: v.id("approvalInstances"),
    reason: v.string(),
    correlationId: v.string(),
    causationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const instance = await ctx.db.get(args.instanceId)
    if (!instance) throw new Error("Approbation introuvable.")
    const module = moduleManifestEntry(instance.moduleCode)
    const access = await assertCan(ctx, {
      moduleCode: instance.moduleCode,
      resource: module.resource,
      permission: "modifier",
      siteId: instance.siteId,
    })
    const cancellationAssignment =
      access.permissionSource === "assignment"
        ? await effectiveAssignment(ctx, {
            userId: access.user._id,
            resource: module.resource,
            permission: "modifier",
            siteId: instance.siteId,
          })
        : undefined
    if (access.permissionSource === "assignment" && !cancellationAssignment) {
      throw new Error("Affectation de l'acteur introuvable ou expirée.")
    }
    const isAdministrator =
      ADMIN_ROLES.includes(access.user.role) ||
      (cancellationAssignment !== undefined &&
        ADMIN_ROLES.includes(cancellationAssignment.role))
    if (instance.requestedBy !== access.user._id && !isAdministrator) {
      throw new Error(
        "Seuls le demandeur ou un administrateur peuvent annuler cette approbation."
      )
    }
    const reason = requiredText(args.reason, "Le motif", 500)
    const correlationId = requiredText(
      args.correlationId,
      "L'identifiant de corrélation",
      120
    )
    const causationId =
      optionalText(args.causationId, "L'identifiant de causalité", 120) ??
      instance.correlationId
    const correlatedLogs = await correlatedAuditLogs(ctx, correlationId)
    const replayedCancellation = correlatedLogs.find(
      (log) =>
        log.actorId === access.user._id &&
        log.entityTable === "approvalInstances" &&
        log.entityId === instance._id &&
        log.action === "plateforme.approbation.annuler" &&
        log.reason === reason &&
        log.causationId === causationId
    )
    if (replayedCancellation) {
      return {
        instanceId: instance._id,
        status: "annule" as const,
        duplicate: true,
      }
    }
    if (correlatedLogs.length > 0) {
      throw new Error("Collision de corrélation avec une autre annulation.")
    }
    const status = resolveApprovalCancellation(instance.status)
    const now = Date.now()
    const steps = await orderedSteps(ctx, instance._id)
    for (const step of steps) {
      if (step.status === "en_attente") {
        await ctx.db.patch(step._id, { status: "ignore" })
      }
    }
    const after = {
      status,
      updatedAt: now,
      resolvedAt: now,
    }
    await ctx.db.patch(instance._id, after)
    await audit(ctx, {
      actorId: access.user._id,
      assignmentId: cancellationAssignment?._id,
      action: "plateforme.approbation.annuler",
      entityTable: "approvalInstances",
      entityId: instance._id,
      permission: "modifier",
      reason,
      result: "succes",
      correlationId,
      causationId,
      classification: "interne",
      before: { status: instance.status, currentStep: instance.currentStep },
      after,
    })
    return { instanceId: instance._id, status, duplicate: false }
  },
})

export const getApproval = query({
  args: { instanceId: v.id("approvalInstances") },
  handler: async (ctx, args) => {
    const instance = await ctx.db.get(args.instanceId)
    if (!instance) throw new Error("Approbation introuvable.")
    const module = moduleManifestEntry(instance.moduleCode)
    await assertCan(ctx, {
      moduleCode: instance.moduleCode,
      resource: module.resource,
      permission: "consulter",
      siteId: instance.siteId,
    })
    return { ...instance, steps: await orderedSteps(ctx, instance._id) }
  },
})

export const listPending = query({
  args: {
    moduleCode: moduleCodeValidator,
    siteId: v.optional(v.id("sites")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = validLimit(args.limit)
    const module = moduleManifestEntry(args.moduleCode)
    const access = await assertCan(ctx, {
      moduleCode: args.moduleCode,
      resource: module.resource,
      permission: "consulter",
      siteId: args.siteId,
      allowScopedLanding: args.siteId === undefined,
    })
    await assertSiteActive(ctx, args.siteId)
    if (
      !args.siteId &&
      !access.hasGlobalScope &&
      access.accessibleSiteIds.length !== 1
    ) {
      throw new Error("Précisez un site pour consulter les approbations.")
    }
    const effectiveSiteId =
      args.siteId ??
      (!access.hasGlobalScope ? access.accessibleSiteIds[0] : undefined)
    const instances = await ctx.db
      .query("approvalInstances")
      .withIndex("by_status_created", (builder) =>
        builder.eq("status", "en_attente")
      )
      .filter((builder) => {
        const moduleFilter = builder.eq(
          builder.field("moduleCode"),
          args.moduleCode
        )
        return effectiveSiteId
          ? builder.and(
              moduleFilter,
              builder.eq(builder.field("siteId"), effectiveSiteId)
            )
          : moduleFilter
      })
      .order("desc")
      .take(limit)

    return await Promise.all(
      instances.map(async (instance) => ({
        ...instance,
        step: await currentStep(ctx, instance),
      }))
    )
  },
})
