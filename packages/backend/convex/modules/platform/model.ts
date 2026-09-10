import type { Doc, Id } from "../../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../../_generated/server"
import { requireUser } from "../../lib/auth"
import {
  can,
  type Permission,
  type ProtectedResource,
} from "../../model/permissions"
import { currentPlatformEnvironment } from "./environment"
import {
  moduleManifestEntry,
  type ModuleCode,
  type ModuleManifestEntry,
} from "./catalog"

type DatabaseCtx = QueryCtx | MutationCtx

export type PermissionSource = "legacyRole" | "assignment" | null
export type ActivationSource = "user" | "site" | "environment" | "default"

export interface ModuleAccessDecision {
  readonly enabled: boolean
  readonly permissionGranted: boolean
  readonly canAccess: boolean
  readonly activationSource: ActivationSource
  readonly permissionSource: PermissionSource
  readonly hasGlobalScope: boolean
  readonly accessibleSiteIds: readonly Id<"sites">[]
}

export interface AssertCanInput {
  readonly moduleCode: ModuleCode
  readonly resource: ProtectedResource
  readonly permission: Permission
  readonly siteId?: Id<"sites">
  /** Réservé aux pages d'atterrissage qui ne lisent aucune donnée métier. */
  readonly allowScopedLanding?: boolean
}

export function isAssignmentEffective(
  assignment: Pick<
    Doc<"userAssignments">,
    "isActive" | "validFrom" | "validUntil"
  >,
  at: number
): boolean {
  return (
    assignment.isActive &&
    assignment.validFrom <= at &&
    (assignment.validUntil === undefined || assignment.validUntil > at)
  )
}

function newest(
  activations: readonly Doc<"moduleActivations">[]
): Doc<"moduleActivations"> | undefined {
  return [...activations].sort(
    (left, right) =>
      right.updatedAt - left.updatedAt ||
      right._creationTime - left._creationTime
  )[0]
}

/** Applique la précédence utilisateur > site > environnement > manifeste. */
export function resolveModuleActivation(
  activations: readonly Doc<"moduleActivations">[],
  params: {
    readonly userId: Id<"users">
    readonly siteId?: Id<"sites">
    readonly defaultEnabled: boolean
  }
): { enabled: boolean; source: ActivationSource } {
  const userAtSite = params.siteId
    ? newest(
        activations.filter(
          (activation) =>
            activation.userId === params.userId &&
            activation.siteId === params.siteId
        )
      )
    : undefined
  const userGlobal = newest(
    activations.filter(
      (activation) =>
        activation.userId === params.userId && activation.siteId === undefined
    )
  )
  const userActivation = userAtSite ?? userGlobal
  if (userActivation) {
    return { enabled: userActivation.isEnabled, source: "user" }
  }

  if (params.siteId) {
    const siteActivation = newest(
      activations.filter(
        (activation) =>
          activation.userId === undefined && activation.siteId === params.siteId
      )
    )
    if (siteActivation) {
      return { enabled: siteActivation.isEnabled, source: "site" }
    }
  }

  const environmentActivation = newest(
    activations.filter(
      (activation) =>
        activation.userId === undefined && activation.siteId === undefined
    )
  )
  if (environmentActivation) {
    return {
      enabled: environmentActivation.isEnabled,
      source: "environment",
    }
  }

  return { enabled: params.defaultEnabled, source: "default" }
}

async function isOrganizationWithin(
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
  return await isOrganizationWithin(
    ctx,
    site.organizationId,
    assignment.organizationId
  )
}

async function sitesCoveredByAssignment(
  ctx: DatabaseCtx,
  assignment: Doc<"userAssignments">
): Promise<Id<"sites">[]> {
  if (assignment.siteId) {
    const site = await ctx.db.get(assignment.siteId)
    return site?.isActive ? [assignment.siteId] : []
  }
  if (!assignment.organizationId) return []

  const sites = await ctx.db.query("sites").collect()
  const covered: Id<"sites">[] = []
  for (const site of sites) {
    if (
      site.isActive &&
      (await isOrganizationWithin(
        ctx,
        site.organizationId,
        assignment.organizationId
      ))
    ) {
      covered.push(site._id)
    }
  }
  return covered
}

async function permissionDecision(
  ctx: DatabaseCtx,
  user: Doc<"users">,
  params: {
    readonly resource: ProtectedResource
    readonly permission: Permission
    readonly siteId?: Id<"sites">
    readonly at: number
    readonly allowScopedLanding?: boolean
  }
): Promise<{
  granted: boolean
  source: PermissionSource
  hasGlobalScope: boolean
  accessibleSiteIds: Id<"sites">[]
}> {
  if (can(user.role, params.resource, params.permission)) {
    return {
      granted: true,
      source: "legacyRole",
      hasGlobalScope: true,
      accessibleSiteIds: [],
    }
  }

  const assignments = await ctx.db
    .query("userAssignments")
    .withIndex("by_user", (query) => query.eq("userId", user._id))
    .collect()
  const matchingAssignments: Doc<"userAssignments">[] = []
  for (const assignment of assignments) {
    if (!isAssignmentEffective(assignment, params.at)) continue
    if (!can(assignment.role, params.resource, params.permission)) continue
    matchingAssignments.push(assignment)
  }

  if (params.siteId) {
    for (const assignment of matchingAssignments) {
      if (await assignmentCoversSite(ctx, assignment, params.siteId)) {
        return {
          granted: true,
          source: "assignment",
          hasGlobalScope: !assignment.siteId && !assignment.organizationId,
          accessibleSiteIds: [params.siteId],
        }
      }
    }
    return {
      granted: false,
      source: null,
      hasGlobalScope: false,
      accessibleSiteIds: [],
    }
  }

  const globalAssignment = matchingAssignments.find(
    (assignment) => !assignment.siteId && !assignment.organizationId
  )
  if (globalAssignment) {
    return {
      granted: true,
      source: "assignment",
      hasGlobalScope: true,
      accessibleSiteIds: [],
    }
  }
  if (!params.allowScopedLanding) {
    return {
      granted: false,
      source: null,
      hasGlobalScope: false,
      accessibleSiteIds: [],
    }
  }

  const coveredSiteIds = new Set<Id<"sites">>()
  for (const assignment of matchingAssignments) {
    for (const coveredSiteId of await sitesCoveredByAssignment(
      ctx,
      assignment
    )) {
      coveredSiteIds.add(coveredSiteId)
    }
  }
  const accessibleSiteIds = [...coveredSiteIds]
  return {
    granted: accessibleSiteIds.length > 0,
    source: accessibleSiteIds.length > 0 ? "assignment" : null,
    hasGlobalScope: false,
    accessibleSiteIds,
  }
}

async function activationDecision(
  ctx: DatabaseCtx,
  userId: Id<"users">,
  module: ModuleManifestEntry,
  siteId?: Id<"sites">
) {
  const environment = currentPlatformEnvironment()
  const activations = await ctx.db
    .query("moduleActivations")
    .withIndex("by_environment_module", (query) =>
      query.eq("environment", environment).eq("moduleCode", module.code)
    )
    .collect()
  return resolveModuleActivation(activations, {
    userId,
    siteId,
    defaultEnabled: module.defaultEnabled,
  })
}

export async function evaluateModuleAccess(
  ctx: DatabaseCtx,
  user: Doc<"users">,
  moduleCode: ModuleCode,
  siteId?: Id<"sites">
): Promise<ModuleAccessDecision> {
  const module = moduleManifestEntry(moduleCode)
  const permission = await permissionDecision(ctx, user, {
    resource: module.resource,
    permission: "consulter",
    siteId,
    at: Date.now(),
    allowScopedLanding: siteId === undefined,
  })
  const activations =
    siteId || permission.hasGlobalScope || !permission.granted
      ? [await activationDecision(ctx, user._id, module, siteId)]
      : await Promise.all(
          permission.accessibleSiteIds.map((accessibleSiteId) =>
            activationDecision(ctx, user._id, module, accessibleSiteId)
          )
        )
  const firstEnabledActivation = activations.find(
    (activation) => activation.enabled
  )
  const activation = firstEnabledActivation ??
    activations[0] ?? {
      enabled: module.defaultEnabled,
      source: "default" as const,
    }
  const enabledSiteIds = permission.hasGlobalScope
    ? permission.accessibleSiteIds
    : permission.accessibleSiteIds.filter(
        (_site, index) => activations[index]?.enabled
      )
  return {
    enabled: activation.enabled,
    permissionGranted: permission.granted,
    canAccess: activation.enabled && permission.granted,
    activationSource: activation.source,
    permissionSource: permission.source,
    hasGlobalScope: permission.hasGlobalScope,
    accessibleSiteIds: enabledSiteIds,
  }
}

/**
 * Garde additive commune : identité active, droit métier, portée, puis activation.
 * Une activation ne participe jamais à la décision de permission métier.
 */
export async function assertCan(
  ctx: DatabaseCtx,
  input: AssertCanInput
): Promise<{
  user: Doc<"users">
  permissionSource: Exclude<PermissionSource, null>
  activationSource: ActivationSource
  hasGlobalScope: boolean
  accessibleSiteIds: readonly Id<"sites">[]
}> {
  const user = await requireUser(ctx)
  const permission = await permissionDecision(ctx, user, {
    resource: input.resource,
    permission: input.permission,
    siteId: input.siteId,
    at: Date.now(),
    allowScopedLanding: input.allowScopedLanding,
  })
  if (!permission.granted || !permission.source) {
    throw new Error(
      `Accès refusé : aucune affectation n'accorde « ${input.permission} » ` +
        `sur « ${input.resource} »`
    )
  }

  const module = moduleManifestEntry(input.moduleCode)
  const activationCandidates =
    input.siteId || permission.hasGlobalScope
      ? [await activationDecision(ctx, user._id, module, input.siteId)]
      : await Promise.all(
          permission.accessibleSiteIds.map((siteId) =>
            activationDecision(ctx, user._id, module, siteId)
          )
        )
  const activation =
    activationCandidates.find((candidate) => candidate.enabled) ??
    activationCandidates[0]
  if (!activation?.enabled) {
    throw new Error(`Module désactivé : ${input.moduleCode}`)
  }

  return {
    user,
    permissionSource: permission.source,
    activationSource: activation.source,
    hasGlobalScope: permission.hasGlobalScope,
    accessibleSiteIds: permission.hasGlobalScope
      ? permission.accessibleSiteIds
      : permission.accessibleSiteIds.filter(
          (_siteId, index) => activationCandidates[index]?.enabled
        ),
  }
}
