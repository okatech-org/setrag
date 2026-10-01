import type { Id } from "../../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../../_generated/server"
import { requireUser } from "../../lib/auth"
import { isInternalRole } from "../../model/permissions"
import { nomAffiche } from "../ged/acces"
import { estAuditeur, estReferent } from "./model"

export { jourLibreville } from "../ged/model"

type Ctx = QueryCtx | MutationCtx

/** L'espace est ouvert au seul personnel interne actif. */
export async function lecteurEtudes(ctx: Ctx) {
  const user = await requireUser(ctx)
  if (!isInternalRole(user.role)) {
    throw new Error("Accès refusé : l'espace Audit et documents est réservé au personnel SETRAG.")
  }
  return {
    user,
    auditeur: estAuditeur(user.role),
    referent: estReferent(user.role),
  }
}

/** Résout les noms de plusieurs comptes en une passe. */
export async function nomsDe(
  ctx: Ctx,
  ids: readonly (Id<"users"> | undefined)[]
): Promise<Map<string, string>> {
  const uniques = [...new Set(ids.filter((id): id is Id<"users"> => id !== undefined))]
  const users = await Promise.all(uniques.map((id) => ctx.db.get(id)))
  return new Map(uniques.map((id, index) => [id as string, nomAffiche(users[index])]))
}

/** Incrémente un compteur dans la transaction courante. */
export async function prochainRang(ctx: MutationCtx, cle: string): Promise<number> {
  const compteur = await ctx.db
    .query("etudesCompteurs")
    .withIndex("by_cle", (q) => q.eq("cle", cle))
    .unique()
  if (!compteur) {
    await ctx.db.insert("etudesCompteurs", { cle, valeur: 1 })
    return 1
  }
  const valeur = compteur.valeur + 1
  await ctx.db.patch(compteur._id, { valeur })
  return valeur
}
