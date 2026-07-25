import type { QueryCtx, MutationCtx } from "../_generated/server"
import type { Doc, Id } from "../_generated/dataModel"
import { authComponent } from "../betterAuth/auth"

export const AGENT_ROLES = [
  "agent_guichet",
  "controleur",
  "chef_gare",
  "superviseur",
  "admin",
] as const

export type AppRole = Doc<"users">["role"]

/** Profil applicatif de l'utilisateur courant, ou `null`. */
export async function getUser(
  ctx: QueryCtx | MutationCtx
): Promise<Doc<"users"> | null> {
  const authUser = await authComponent.safeGetAuthUser(ctx)
  if (!authUser) return null

  return await ctx.db
    .query("users")
    .withIndex("by_authId", (q) => q.eq("authId", authUser._id))
    .unique()
}

/** Comme `getUser`, mais lève une erreur si l'appelant n'est pas authentifié. */
export async function requireUser(
  ctx: QueryCtx | MutationCtx
): Promise<Doc<"users">> {
  const user = await getUser(ctx)
  if (!user) throw new Error("Non authentifié")
  if (!user.isActive) throw new Error("Compte désactivé")
  return user
}

/** Exige l'un des rôles fournis. */
export async function requireRole(
  ctx: QueryCtx | MutationCtx,
  roles: readonly AppRole[]
): Promise<Doc<"users">> {
  const user = await requireUser(ctx)
  if (!roles.includes(user.role)) {
    throw new Error(`Accès refusé : rôle ${user.role} non autorisé`)
  }
  return user
}

/** Exige un rôle du portail agent / back-office. */
export async function requireAgent(ctx: QueryCtx | MutationCtx) {
  return requireRole(ctx, AGENT_ROLES)
}

/** Exige le rôle administrateur. */
export async function requireAdmin(ctx: QueryCtx | MutationCtx) {
  return requireRole(ctx, ["admin"])
}

/** Journalise une action sensible du back-office. */
export async function audit(
  ctx: MutationCtx,
  params: {
    actorId?: Id<"users">
    action: string
    entityTable: string
    entityId: string
    metadata?: unknown
  }
) {
  await ctx.db.insert("auditLogs", {
    ...params,
    createdAt: Date.now(),
  })
}
