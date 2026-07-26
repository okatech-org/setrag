import type { MutationCtx, QueryCtx } from "../_generated/server"
import type { Doc, Id } from "../_generated/dataModel"
import {
  type AppRole,
  type Permission,
  type ProtectedResource,
  can,
} from "../model/permissions"

export type { AppRole, Permission, ProtectedResource }

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
  ctx: QueryCtx | MutationCtx,
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
  ctx: QueryCtx | MutationCtx,
): Promise<Doc<"users">> {
  const user = await getUser(ctx)
  if (!user) throw new Error("Non authentifié")
  if (!user.isActive) throw new Error("Compte désactivé")
  return user
}

/** Exige explicitement l'un des rôles fournis. */
export async function requireRole(
  ctx: QueryCtx | MutationCtx,
  roles: readonly AppRole[],
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
): Promise<Doc<"users">> {
  const user = await requireUser(ctx)
  if (!can(user.role, resource, permission)) {
    throw new Error(
      `Accès refusé : ${user.role} ne peut pas « ${permission} » sur ` +
        `« ${resource} »`,
    )
  }
  return user
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
    action: string
    entityTable: string
    entityId: string
    before?: unknown
    after?: unknown
    metadata?: unknown
    ipAddress?: string
    deviceId?: string
  },
): Promise<void> {
  await ctx.db.insert("auditLogs", {
    actorId: params.actorId,
    action: params.action,
    entityTable: params.entityTable,
    entityId: params.entityId,
    before: serialize(params.before),
    after: serialize(params.after),
    metadata: serialize(params.metadata),
    ipAddress: params.ipAddress,
    deviceId: params.deviceId,
    createdAt: Date.now(),
  })
}

function serialize(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined
  return typeof value === "string" ? value : JSON.stringify(value)
}
