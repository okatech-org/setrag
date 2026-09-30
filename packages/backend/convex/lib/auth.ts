import type { MutationCtx, QueryCtx } from "../_generated/server"
import type { Doc, Id } from "../_generated/dataModel"
import {
  type AppRole,
  type Permission,
  type ProtectedResource,
  can,
} from "../model/permissions"
import {
  hasModuleAccessLevel,
  type ModuleCode,
  moduleCodeForResource,
  type ModuleAccessLevel,
} from "../modules/platform/catalog"
import { currentPlatformEnvironment } from "../modules/platform/environment"

export type { AppRole, Permission, ProtectedResource }

/**
 * Les référentiels structurants exigent le niveau Admin lorsqu'un grant
 * direct remplace la matrice historique. Les rôles sans override conservent
 * leur comportement RBAC pendant la migration.
 */
const MODULE_CONFIGURATION_RESOURCES = new Set<ProtectedResource>([
  "referentiel",
  "livrets_horaires",
  "tarifs",
  "yield",
  "places",
  "quotas_agences",
  "utilisateurs",
  "parametrage",
  "integrations",
])

/**
 * Un niveau modulaire ne remplace jamais la séparation des tâches sur ces
 * données sensibles. Il agit uniquement comme plafond avant le RBAC fin.
 */
const FINE_PERMISSION_RESOURCES = new Set<ProtectedResource>([
  "ventes",
  "annulations",
  "remboursements",
  "duplicatas",
  "ventes_manuelles",
  "caisse",
  "journee_comptable",
  "journal_comptable",
  "donnees_voyageurs",
  "controles",
  "proces_verbaux",
  "incidents",
])

export type AuditResult = "succes" | "refus" | "echec"
export type AuditClassification =
  "public" | "interne" | "confidentiel" | "restreint"

/**
 * Profil applicatif de l'utilisateur courant, ou `null`.
 *
 * L'identité est lue directement depuis le jeton via `ctx.auth`, dont le
 * `subject` porte l'identifiant Better Auth. Ce choix évite d'appeler le
 * composant Better Auth à chaque requête : une lecture indexée suffit, et la
 * couche d'autorisation reste testable sans avoir à enregistrer le composant
 * dans l'environnement de test.
 */
export async function getUser(
  ctx: QueryCtx | MutationCtx
): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) return null

  return await ctx.db
    .query("users")
    .withIndex("by_authId", (q) => q.eq("authId", identity.subject))
    .unique()
}

/** Comme `getUser`, mais lève si l'appelant n'est pas authentifié ou actif. */
export async function requireUser(
  ctx: QueryCtx | MutationCtx
): Promise<Doc<"users">> {
  return assertActiveUser(await getUser(ctx))
}

/**
 * Même contrat que `requireUser`, appliqué à un profil déjà résolu.
 *
 * Les fonctions internes qui agissent pour un acteur désigné par le serveur
 * (assistant, messagerie) passent par ici : un acteur absent ou désactivé est
 * refusé avec les mêmes messages qu'un appel web.
 */
export function assertActiveUser(user: Doc<"users"> | null): Doc<"users"> {
  if (!user) throw new Error("Non authentifié")
  if (!user.isActive) throw new Error("Compte désactivé")
  return user
}

/**
 * Charge l'acteur désigné par du code serveur de confiance.
 *
 * `undefined` signifie « visiteur » ; un identifiant fourni mais introuvable
 * est une incohérence et lève, plutôt que de rétrograder silencieusement
 * l'appel en visiteur. Un compte désactivé est refusé avec le message de
 * `requireUser` : l'assistant ne doit pas agir pour un compte que le site
 * refuserait. À n'utiliser QUE dans des fonctions internes : une fonction
 * publique qui accepterait un `userId` du client permettrait à n'importe qui
 * d'agir pour n'importe quel compte.
 */
export async function loadActor(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users"> | undefined,
): Promise<Doc<"users"> | null> {
  if (userId === undefined) return null
  const user = await ctx.db.get(userId)
  if (!user) throw new Error("Compte introuvable")
  return assertActiveUser(user)
}

/** Exige explicitement l'un des rôles fournis. */
export async function requireRole(
  ctx: QueryCtx | MutationCtx,
  roles: readonly AppRole[]
): Promise<Doc<"users">> {
  const user = await requireUser(ctx)
  if (!roles.includes(user.role)) {
    throw new Error(`Accès refusé : le rôle ${user.role} n'est pas autorisé`)
  }
  return user
}

/**
 * Exige un droit précis sur une ressource.
 *
 * C'est la voie normale : elle s'appuie sur la matrice de droits fins du
 * CDC §9.1.2 (consulter, créer, modifier, supprimer, valider) plutôt que sur
 * une liste de rôles codée en dur à chaque appel.
 */
export async function requirePermission(
  ctx: QueryCtx | MutationCtx,
  resource: ProtectedResource,
  permission: Permission,
  requiredLevel?: ModuleAccessLevel
): Promise<Doc<"users">> {
  return await assertPermission(
    ctx,
    await getUser(ctx),
    resource,
    permission,
    requiredLevel
  )
}

/**
 * Même contrat que `requirePermission`, appliqué à un profil déjà résolu :
 * les fonctions internes qui agissent pour un acteur désigné par le serveur
 * (assistant, messagerie) passent par ici, avec les mêmes gardes de module
 * qu'un appel web.
 */
export async function assertPermission(
  ctx: QueryCtx | MutationCtx,
  resolved: Doc<"users"> | null,
  resource: ProtectedResource,
  permission: Permission,
  requiredLevel?: ModuleAccessLevel
): Promise<Doc<"users">> {
  const user = assertActiveUser(resolved)
  const moduleCode = moduleCodeForResource(resource)
  if (moduleCode && !(await isExplicitlyEnabled(ctx, user._id, moduleCode))) {
    throw new Error(`Module désactivé : ${moduleCode}`)
  }
  if (moduleCode && user.role !== "admin_it") {
    const directGrant = await ctx.db
      .query("moduleAccessGrants")
      .withIndex("by_user_module", (query) =>
        query.eq("userId", user._id).eq("moduleCode", moduleCode)
      )
      .order("desc")
      .first()
    if (directGrant) {
      const effectiveRequiredLevel =
        requiredLevel ?? moduleRequiredLevel(resource, permission)
      if (
        !hasModuleAccessLevel(directGrant.accessLevel, effectiveRequiredLevel)
      ) {
        throw new Error(
          `Accès refusé : le niveau « ${directGrant.accessLevel ?? "aucun"} » ` +
            `du module « ${moduleCode} » ne permet pas « ${permission} » sur ` +
            `« ${resource} »`
        )
      }
      if (!FINE_PERMISSION_RESOURCES.has(resource)) return user
    }
  }
  if (!can(user.role, resource, permission)) {
    throw new Error(
      `Accès refusé : ${user.role} ne peut pas « ${permission} » sur ` +
        `« ${resource} »`
    )
  }
  return user
}

function moduleRequiredLevel(
  resource: ProtectedResource,
  permission: Permission
): ModuleAccessLevel {
  if (permission === "consulter") return "lecture"
  return MODULE_CONFIGURATION_RESOURCES.has(resource)
    ? "admin"
    : "utilisation"
}

function newestActivation<
  T extends { updatedAt: number; _creationTime: number },
>(rows: readonly T[]): T | undefined {
  return [...rows].sort(
    (left, right) =>
      right.updatedAt - left.updatedAt ||
      right._creationTime - left._creationTime
  )[0]
}

/**
 * Applique les désactivations persistées aux anciennes fonctions Convex.
 * Sans activation persistée, le comportement historique reste inchangé ;
 * le manifeste continue d'être appliqué par les nouvelles gardes modulaires.
 *
 * Une ancienne fonction ne transporte pas toujours de site. Dans ce cas, une
 * activation utilisateur globale prime, puis au moins un site utilisateur
 * actif suffit, avant l'activation d'environnement.
 */
async function isExplicitlyEnabled(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  moduleCode: ModuleCode
): Promise<boolean> {
  const environment = currentPlatformEnvironment()
  const activations = await ctx.db
    .query("moduleActivations")
    .withIndex("by_environment_module", (query) =>
      query.eq("environment", environment).eq("moduleCode", moduleCode)
    )
    .collect()
  if (activations.length === 0) return true

  const userSiteActivations = activations.filter(
    (activation) =>
      activation.userId === userId && activation.siteId !== undefined
  )
  if (userSiteActivations.length > 0) {
    const newestBySite = new Map<string, (typeof userSiteActivations)[number]>()
    for (const activation of userSiteActivations) {
      const siteKey = String(activation.siteId)
      const current = newestBySite.get(siteKey)
      if (
        !current ||
        activation.updatedAt > current.updatedAt ||
        (activation.updatedAt === current.updatedAt &&
          activation._creationTime > current._creationTime)
      ) {
        newestBySite.set(siteKey, activation)
      }
    }
    return [...newestBySite.values()].some(
      (activation) => activation.isEnabled
    )
  }

  const userGlobal = newestActivation(
    activations.filter(
      (activation) =>
        activation.userId === userId && activation.siteId === undefined
    )
  )
  if (userGlobal) return userGlobal.isEnabled

  const environmentActivation = newestActivation(
    activations.filter(
      (activation) =>
        activation.userId === undefined && activation.siteId === undefined
    )
  )
  return environmentActivation?.isEnabled ?? true
}

/**
 * Journalise une action sensible.
 *
 * Le CDC exige de savoir « qui a fait quoi et quand », y compris pour les
 * consultations de données voyageurs. Les valeurs avant et après sont
 * sérialisées pour rester lisibles dans l'export SIEM.
 */
export async function audit(
  ctx: MutationCtx,
  params: {
    actorId?: Id<"users">
    assignmentId?: Id<"userAssignments">
    action: string
    entityTable: string
    entityId: string
    permission?: Permission
    reason?: string
    result?: AuditResult
    correlationId?: string
    causationId?: string
    classification?: AuditClassification
    before?: unknown
    after?: unknown
    metadata?: unknown
    context?: unknown
    ipAddress?: string
    deviceId?: string
  }
): Promise<void> {
  await ctx.db.insert("auditLogs", {
    actorId: params.actorId,
    assignmentId: params.assignmentId,
    action: params.action,
    entityTable: params.entityTable,
    entityId: params.entityId,
    permission: params.permission,
    reason: params.reason,
    result: params.result ?? "succes",
    correlationId: params.correlationId,
    causationId: params.causationId,
    classification: params.classification,
    before: serialize(params.before),
    after: serialize(params.after),
    metadata: serialize(params.metadata),
    context: serialize(params.context),
    ipAddress: params.ipAddress,
    deviceId: params.deviceId,
    createdAt: Date.now(),
  })
}

function serialize(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined
  return typeof value === "string" ? value : JSON.stringify(value)
}
