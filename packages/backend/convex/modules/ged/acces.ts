import type { Doc, Id } from "../../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../../_generated/server"
import { INTERNAL_ROLES, can, isInternalRole, type Permission } from "../../model/permissions"
import type { ModuleAccessLevel } from "../platform/catalog"
import { assertCan, evaluateModuleAccess } from "../platform/model"
import { peutConsulter, peutModifier, type LecteurGed } from "./model"

type Ctx = QueryCtx | MutationCtx

export interface DroitsGed {
  user: Doc<"users">
  lecteur: LecteurGed
  niveau: ModuleAccessLevel | null
  /** Déposer une pièce, enregistrer un courrier, lancer un circuit. */
  peutCreer: boolean
  /** Mettre à jour le registre, archiver. */
  peutGerer: boolean
  /** Gestionnaire documentaire : voit le confidentiel, supervise. */
  gestionnaire: boolean
  /** Éliminer une pièce dont la conservation est échue. */
  peutEliminer: boolean
}

async function essayer(
  ctx: Ctx,
  permission: Permission,
  requiredLevel?: ModuleAccessLevel
): Promise<boolean> {
  try {
    await assertCan(ctx, { moduleCode: "ged", resource: "ged", permission, requiredLevel })
    return true
  } catch {
    return false
  }
}

/**
 * Droits de l'appelant sur le module. Lève si l'appelant ne peut même pas
 * consulter le module (non authentifié, module désactivé, aucun droit).
 */
export async function droitsGed(ctx: Ctx): Promise<DroitsGed> {
  const base = await assertCan(ctx, {
    moduleCode: "ged",
    resource: "ged",
    permission: "consulter",
  })
  const decision = await evaluateModuleAccess(ctx, base.user, "ged")
  // Un niveau attribué par le DSI vaut pour toutes les actions d'usage ; les
  // actions de supervision exigent alors le niveau Admin.
  const niveauSupervision = decision.accessSource === "grant" ? "admin" : undefined
  const [peutCreer, peutGerer, gestionnaire, peutEliminer] = await Promise.all([
    essayer(ctx, "creer"),
    essayer(ctx, "modifier"),
    essayer(ctx, "valider", niveauSupervision),
    essayer(ctx, "supprimer", niveauSupervision),
  ])
  return {
    user: base.user,
    lecteur: { userId: base.user._id, role: base.user.role, gestionnaire },
    niveau: decision.accessLevel,
    peutCreer,
    peutGerer,
    gestionnaire,
    peutEliminer,
  }
}

export async function exigerCreation(ctx: Ctx): Promise<DroitsGed> {
  const droits = await droitsGed(ctx)
  if (!droits.peutCreer) {
    throw new Error("Accès refusé : votre habilitation GED est en lecture seule.")
  }
  return droits
}

export interface ContexteDocument {
  document: Doc<"gedDocuments">
  acces: Doc<"gedAcces">[]
  etapes: Doc<"gedEtapes">[]
  visible: boolean
  modifiable: boolean
}

/** Charge une pièce avec ses accès et ses étapes, et décide de sa visibilité. */
export async function contexteDocument(
  ctx: Ctx,
  droits: DroitsGed,
  documentId: Id<"gedDocuments">
): Promise<ContexteDocument | null> {
  const document = await ctx.db.get(documentId)
  if (!document) return null
  const [acces, etapes] = await Promise.all([
    ctx.db
      .query("gedAcces")
      .withIndex("by_document", (q) => q.eq("documentId", documentId))
      .collect(),
    ctx.db
      .query("gedEtapes")
      .withIndex("by_document", (q) => q.eq("documentId", documentId))
      .collect(),
  ])
  const intervenants = new Set<string>(etapes.map((etape) => etape.assigneId))
  const visible = peutConsulter(document, droits.lecteur, acces, intervenants)
  return {
    document,
    acces,
    etapes,
    visible,
    modifiable: visible && droits.peutCreer && peutModifier(document, droits.lecteur, acces),
  }
}

/** Comme `contexteDocument`, mais lève si la pièce est absente ou fermée. */
export async function documentVisible(
  ctx: Ctx,
  droits: DroitsGed,
  documentId: Id<"gedDocuments">
): Promise<ContexteDocument> {
  const contexte = await contexteDocument(ctx, droits, documentId)
  if (!contexte) throw new Error("Document introuvable.")
  if (!contexte.visible) {
    throw new Error("Accès refusé : ce document est réservé à des personnes désignées.")
  }
  return contexte
}

/**
 * Filtre une liste de pièces selon les droits. Les pièces publiques et
 * internes passent sans lecture supplémentaire ; les autres chargent leurs
 * accès et leurs intervenants.
 */
export async function filtrerVisibles(
  ctx: Ctx,
  droits: DroitsGed,
  documents: readonly Doc<"gedDocuments">[]
): Promise<Doc<"gedDocuments">[]> {
  const visibles: Doc<"gedDocuments">[] = []
  for (const document of documents) {
    if (
      document.classification === "public" ||
      document.classification === "interne" ||
      document.auteurId === droits.user._id
    ) {
      visibles.push(document)
      continue
    }
    const contexte = await contexteDocument(ctx, droits, document._id)
    if (contexte?.visible) visibles.push(document)
  }
  return visibles
}

/** « Prénom Nom » d'un compte, ou un repli lisible. */
export function nomAffiche(user: Doc<"users"> | null | undefined): string {
  if (!user) return "Compte supprimé"
  const nom = [user.firstName, user.lastName].filter(Boolean).join(" ").trim()
  return nom || user.email || user.matricule || "Agent SETRAG"
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

/**
 * Un compte peut-il intervenir dans un circuit ? Actif, interne, et lecteur
 * du module GED par son rôle ou par une attribution directe.
 */
export async function peutIntervenir(ctx: Ctx, user: Doc<"users">): Promise<boolean> {
  if (!user.isActive || !isInternalRole(user.role)) return false
  const grant = await ctx.db
    .query("moduleAccessGrants")
    .withIndex("by_user_module", (q) => q.eq("userId", user._id).eq("moduleCode", "ged"))
    .order("desc")
    .first()
  if (grant) return grant.accessLevel !== undefined
  return can(user.role, "ged", "consulter")
}

/** Incrémente un compteur dans la transaction courante. */
export async function prochainRang(ctx: MutationCtx, cle: string): Promise<number> {
  const compteur = await ctx.db
    .query("gedCompteurs")
    .withIndex("by_cle", (q) => q.eq("cle", cle))
    .unique()
  if (!compteur) {
    await ctx.db.insert("gedCompteurs", { cle, valeur: 1 })
    return 1
  }
  const valeur = compteur.valeur + 1
  await ctx.db.patch(compteur._id, { valeur })
  return valeur
}

/**
 * Agents internes actifs, lus rôle par rôle : la table `users` porte aussi
 * les voyageurs, qu'il ne faut jamais parcourir en entier.
 */
export async function agentsInternes(ctx: Ctx): Promise<Doc<"users">[]> {
  const groupes = await Promise.all(
    INTERNAL_ROLES.map((role) =>
      ctx.db
        .query("users")
        .withIndex("by_role", (q) => q.eq("role", role))
        .collect()
    )
  )
  return groupes.flat().filter((user) => user.isActive)
}
