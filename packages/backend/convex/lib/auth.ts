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
  return assertPermission(await getUser(ctx), resource, permission)
}

/** Même contrat que `requirePermission`, appliqué à un profil déjà résolu. */
export function assertPermission(
  user: Doc<"users"> | null,
  resource: ProtectedResource,
  permission: Permission,
): Doc<"users"> {
  const active = assertActiveUser(user)
  if (!can(active.role, resource, permission)) {
    throw new Error(
      `Accès refusé : ${active.role} ne peut pas « ${permission} » sur ` +
        `« ${resource} »`,
    )
  }
  return active
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
