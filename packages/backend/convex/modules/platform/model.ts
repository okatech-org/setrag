import type { Doc, Id } from "../../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../../_generated/server"
import { requireUser } from "../../lib/auth"
import {
  can,
  permissionsFor,
  type Permission,
  type ProtectedResource,
} from "../../model/permissions"
import { currentPlatformEnvironment } from "./environment"
import {
  moduleManifestEntry,
  hasModuleAccessLevel,
  type ModuleAccessLevel,
  type ModuleCode,
  type ModuleManifestEntry,
} from "./catalog"

type DatabaseCtx = QueryCtx | MutationCtx

export type PermissionSource =
  "legacyRole" | "assignment" | "moduleGrant" | null
export type ActivationSource = "user" | "site" | "environment" | "default"
export type ModuleAccessSource = "system" | "grant" | "role" | null

export interface ModuleAccessDecision {
  readonly enabled: boolean
  readonly accessLevel: ModuleAccessLevel | null
  readonly accessSource: ModuleAccessSource
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
  /** Niveau modulaire minimal, pour distinguer usage et configuration. */
  readonly requiredLevel?: ModuleAccessLevel
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

/** Retourne l'override utilisateur/module le plus récent, refus compris. */
export async function latestModuleAccessGrant(
  ctx: DatabaseCtx,
  userId: Id<"users">,
  moduleCode: ModuleCode
): Promise<Doc<"moduleAccessGrants"> | null> {
  return await ctx.db
    .query("moduleAccessGrants")
    .withIndex("by_user_module", (query) =>
      query.eq("userId", userId).eq("moduleCode", moduleCode)
    )
    .order("desc")
    .first()
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

function roleModuleAccessLevel(
  role: Doc<"users">["role"],
  resource: ProtectedResource
): ModuleAccessLevel | null {
  const permissions = permissionsFor(role, resource)
  if (!permissions.includes("consulter")) return null
  return permissions.some((permission) => permission !== "consulter")
    ? "utilisation"
    : "lecture"
}

function highestRoleModuleAccessLevel(
  roles: readonly Doc<"users">["role"][],
  resource: ProtectedResource
): ModuleAccessLevel | null {
  let result: ModuleAccessLevel | null = null
  for (const role of roles) {
    const level = roleModuleAccessLevel(role, resource)
    if (level === "utilisation") return level
    if (level === "lecture") result = level
  }
  return result
}

/**
 * Dérive le niveau modulaire des droits fins existants. Un rôle ne produit
 * jamais le niveau `admin` : ce niveau est une décision explicite du DSI.
 */
async function roleModuleAccessDecision(
  ctx: DatabaseCtx,
  user: Doc<"users">,
  module: ModuleManifestEntry,
  siteId?: Id<"sites">
): Promise<{
  accessLevel: ModuleAccessLevel | null
  permissionSource: PermissionSource
  hasGlobalScope: boolean
  accessibleSiteIds: Id<"sites">[]
}> {
  const legacyLevel = roleModuleAccessLevel(user.role, module.resource)
  if (legacyLevel) {
    return {
      accessLevel: legacyLevel,
      permissionSource: "legacyRole",
      hasGlobalScope: true,
      accessibleSiteIds: [],
    }
  }

  const at = Date.now()
  const assignments = await ctx.db
    .query("userAssignments")
    .withIndex("by_user", (query) => query.eq("userId", user._id))
    .collect()
  const matchingAssignments = assignments.filter(
    (assignment) =>
      isAssignmentEffective(assignment, at) &&
      roleModuleAccessLevel(assignment.role, module.resource) !== null
  )

  if (siteId) {
    const covering: Doc<"userAssignments">[] = []
    for (const assignment of matchingAssignments) {
      if (await assignmentCoversSite(ctx, assignment, siteId)) {
        covering.push(assignment)
      }
    }
    return {
      accessLevel: highestRoleModuleAccessLevel(
        covering.map(({ role }) => role),
        module.resource
      ),
      permissionSource: covering.length > 0 ? "assignment" : null,
      hasGlobalScope: covering.some(
        (assignment) => !assignment.siteId && !assignment.organizationId
      ),
      accessibleSiteIds: covering.length > 0 ? [siteId] : [],
    }
  }

  const globalAssignments = matchingAssignments.filter(
    (assignment) => !assignment.siteId && !assignment.organizationId
  )
  if (globalAssignments.length > 0) {
    return {
      accessLevel: highestRoleModuleAccessLevel(
        globalAssignments.map(({ role }) => role),
        module.resource
      ),
      permissionSource: "assignment",
      hasGlobalScope: true,
      accessibleSiteIds: [],
    }
  }

  const coveredSiteIds = new Set<Id<"sites">>()
  const effectiveScopedRoles: Doc<"users">["role"][] = []
  for (const assignment of matchingAssignments) {
    const covered = await sitesCoveredByAssignment(ctx, assignment)
    if (covered.length === 0) continue
    effectiveScopedRoles.push(assignment.role)
    for (const coveredSiteId of covered) coveredSiteIds.add(coveredSiteId)
  }
  const accessibleSiteIds = [...coveredSiteIds]
  return {
    accessLevel: highestRoleModuleAccessLevel(
      effectiveScopedRoles,
      module.resource
    ),
    permissionSource: accessibleSiteIds.length > 0 ? "assignment" : null,
    hasGlobalScope: false,
    accessibleSiteIds,
  }
}

async function directGrantScopeDecision(
  ctx: DatabaseCtx,
  user: Doc<"users">,
  siteId?: Id<"sites">
): Promise<{
  readonly coversRequestedScope: boolean
  readonly hasGlobalScope: boolean
  readonly accessibleSiteIds: readonly Id<"sites">[]
}> {
  const at = Date.now()
  const assignments = (
    await ctx.db
      .query("userAssignments")
      .withIndex("by_user", (query) => query.eq("userId", user._id))
      .collect()
  ).filter((assignment) => isAssignmentEffective(assignment, at))
  const globalAssignment = assignments.some(
    (assignment) => !assignment.siteId && !assignment.organizationId
  )
  if (globalAssignment || assignments.length === 0) {
    // Sans affectation explicite, le profil historique de l'utilisateur
    // constitue sa portée globale ; le grant ne crée pas cette portée.
    return {
      coversRequestedScope: true,
      hasGlobalScope: true,
      accessibleSiteIds: [],
    }
  }

  if (siteId) {
    for (const assignment of assignments) {
      if (await assignmentCoversSite(ctx, assignment, siteId)) {
        return {
          coversRequestedScope: true,
          hasGlobalScope: false,
          accessibleSiteIds: [siteId],
        }
      }
    }
    return {
      coversRequestedScope: false,
      hasGlobalScope: false,
      accessibleSiteIds: [],
    }
  }

  const coveredSiteIds = new Set<Id<"sites">>()
  for (const assignment of assignments) {
    for (const coveredSiteId of await sitesCoveredByAssignment(
      ctx,
      assignment
    )) {
      coveredSiteIds.add(coveredSiteId)
    }
  }
  const accessibleSiteIds = [...coveredSiteIds]
  return {
    coversRequestedScope: accessibleSiteIds.length > 0,
    hasGlobalScope: false,
    accessibleSiteIds,
  }
}

/** Portée issue des rôles et affectations, indépendamment d'un grant direct. */
export async function moduleRoleScope(
  ctx: DatabaseCtx,
  user: Doc<"users">,
  moduleCode: ModuleCode
): Promise<{
  readonly hasGlobalScope: boolean
  readonly accessibleSiteIds: readonly Id<"sites">[]
}> {
  if (user.role === "admin_it") {
    return { hasGlobalScope: true, accessibleSiteIds: [] }
  }
  const access = await roleModuleAccessDecision(
    ctx,
    user,
    moduleManifestEntry(moduleCode)
  )
  if (access.accessLevel !== null) {
    return {
      hasGlobalScope: access.hasGlobalScope,
      accessibleSiteIds: access.accessibleSiteIds,
    }
  }
  const directGrant = await latestModuleAccessGrant(ctx, user._id, moduleCode)
  if (directGrant) {
    const grantScope = await directGrantScopeDecision(ctx, user)
    return {
      hasGlobalScope: grantScope.hasGlobalScope,
      accessibleSiteIds: grantScope.accessibleSiteIds,
    }
  }
  return {
    hasGlobalScope: access.hasGlobalScope,
    accessibleSiteIds: access.accessibleSiteIds,
  }
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
  const grant =
    user.role === "admin_it"
      ? null
      : await latestModuleAccessGrant(ctx, user._id, moduleCode)
  const roleAccess =
    user.role === "admin_it"
      ? null
      : await roleModuleAccessDecision(ctx, user, module, siteId)
  const grantScope =
    grant && roleAccess?.accessLevel === null
      ? await directGrantScopeDecision(ctx, user, siteId)
      : null
  const accessLevel: ModuleAccessLevel | null =
    user.role === "admin_it"
      ? "admin"
      : grant
        ? (grant.accessLevel ?? null)
        : (roleAccess?.accessLevel ?? null)
  const accessSource: ModuleAccessSource =
    user.role === "admin_it"
      ? "system"
      : grant
        ? "grant"
        : accessLevel
          ? "role"
          : null
  const permissionSource: PermissionSource =
    roleAccess?.permissionSource ?? null
  const hasGlobalScope =
    user.role === "admin_it"
      ? true
      : (grantScope?.hasGlobalScope ?? roleAccess?.hasGlobalScope ?? false)
  const accessibleSiteIds =
    user.role === "admin_it"
      ? []
      : (grantScope?.accessibleSiteIds ?? roleAccess?.accessibleSiteIds ?? [])
  const scopeGranted =
    user.role === "admin_it"
      ? true
      : grantScope
        ? grantScope.coversRequestedScope
        : (roleAccess?.accessLevel ?? null) !== null
  const activations =
    siteId ||
    hasGlobalScope ||
    !accessLevel ||
    !scopeGranted ||
    accessibleSiteIds.length === 0
      ? [await activationDecision(ctx, user._id, module, siteId)]
      : await Promise.all(
          accessibleSiteIds.map((accessibleSiteId) =>
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
  const enabledSiteIds = hasGlobalScope
    ? accessibleSiteIds
    : accessibleSiteIds.filter((_site, index) => activations[index]?.enabled)
  return {
    enabled: activation.enabled,
    accessLevel,
    accessSource,
    permissionGranted: accessLevel !== null && scopeGranted,
    canAccess: activation.enabled && accessLevel !== null && scopeGranted,
    activationSource: activation.source,
    permissionSource,
    hasGlobalScope,
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
  const moduleAccess = await evaluateModuleAccess(
    ctx,
    user,
    input.moduleCode,
    input.siteId
  )
  const requiredModuleLevel: ModuleAccessLevel =
    input.requiredLevel ??
    (input.permission === "consulter" ? "lecture" : "utilisation")
  if (
    !hasModuleAccessLevel(moduleAccess.accessLevel, requiredModuleLevel) ||
    !moduleAccess.permissionGranted
  ) {
    throw new Error(
      input.permission === "consulter"
        ? `Accès refusé : aucune affectation ni attribution n'accorde le module « ${input.moduleCode} »`
        : `Accès refusé : aucune affectation ou attribution avec le niveau « ${moduleAccess.accessLevel ?? "aucun"} » ne permet pas l'action « ${input.permission} » sur le module « ${input.moduleCode} »`
    )
  }
  if (!moduleAccess.enabled) {
    throw new Error(`Module désactivé : ${input.moduleCode}`)
  }

  const module = moduleManifestEntry(input.moduleCode)
  if (
    moduleAccess.accessSource === "grant" &&
    input.resource === module.resource
  ) {
    return {
      user,
      permissionSource: "moduleGrant",
      activationSource: moduleAccess.activationSource,
      hasGlobalScope: moduleAccess.hasGlobalScope,
      accessibleSiteIds: moduleAccess.accessibleSiteIds,
    }
  }

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

  return {
    user,
    permissionSource: permission.source,
    activationSource: moduleAccess.activationSource,
    hasGlobalScope: permission.hasGlobalScope,
    accessibleSiteIds: permission.hasGlobalScope
      ? permission.accessibleSiteIds
      : permission.accessibleSiteIds.filter((permissionSiteId) =>
          moduleAccess.accessibleSiteIds.includes(permissionSiteId)
        ),
  }
}
