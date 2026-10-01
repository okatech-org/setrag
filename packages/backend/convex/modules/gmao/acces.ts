import type { Doc, Id } from "../../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../../_generated/server"
import { audit } from "../../lib/auth"
import { can, type AppRole } from "../../model/permissions"
import { evaluateModuleAccess, isAssignmentEffective, assertCan } from "../platform/model"

/**
 * Contrôle d'accès du module GMAO.
 *
 * Deux étages :
 * 1. la garde commune `assertCan` (module activé, niveau d'accès, droit
 *    `consulter` / `creer` / `modifier` sur la ressource `gmao`) ;
 * 2. une capacité métier, qui sépare les gestes d'atelier : la matrice fine
 *    ne distingue pas le visiteur de rames du magasinier, alors que le plan
 *    d'implémentation (IAM-002) exige « visiteur, réparateur et remise en
 *    service distincts ».
 *
 * Une capacité est accordée par le rôle principal OU une affectation
 * effective, par le droit `valider` de la matrice (administration
 * fonctionnelle), ou par une attribution directe du module (niveau « admin »
 * pour tout, « utilisation » pour les gestes courants).
 */

export const CAPACITES_GMAO = [
  "ot_demander",
  "ot_planifier",
  "ot_executer",
  "ot_cloturer",
  "visite_signer",
  "compteur_relever",
  "stock_mouvementer",
  "achat_demander",
  "achat_valider",
  "parc_administrer",
  "plan_administrer",
] as const
export type CapaciteGmao = (typeof CAPACITES_GMAO)[number]

export const LIBELLES_CAPACITES_GMAO: Record<CapaciteGmao, string> = {
  ot_demander: "Demander un ordre de travail",
  ot_planifier: "Planifier un ordre de travail",
  ot_executer: "Exécuter un ordre de travail",
  ot_cloturer: "Réceptionner et remettre en service",
  visite_signer: "Signer une visite avant départ",
  compteur_relever: "Relever les compteurs",
  stock_mouvementer: "Mouvementer le stock",
  achat_demander: "Demander un achat",
  achat_valider: "Valider un achat",
  parc_administrer: "Administrer le parc",
  plan_administrer: "Administrer les plans préventifs",
}

/** Capacités de validation : réservées, même à une attribution « utilisation ». */
const CAPACITES_VALIDATION: ReadonlySet<CapaciteGmao> = new Set([
  "ot_cloturer",
  "achat_valider",
  "parc_administrer",
  "plan_administrer",
])

const ATELIER: readonly AppRole[] = [
  "responsable_atelier",
  "ingenieur_atelier",
  "contremaitre_atelier",
]
const ENCADREMENT: readonly AppRole[] = ["responsable_atelier", "ingenieur_atelier"]

const ROLES_PAR_CAPACITE: Readonly<Record<CapaciteGmao, readonly AppRole[]>> = {
  ot_demander: [...ATELIER, "visiteur_rames"],
  ot_planifier: ATELIER,
  ot_executer: ATELIER,
  ot_cloturer: ENCADREMENT,
  visite_signer: ["visiteur_rames", "contremaitre_atelier", "responsable_atelier"],
  compteur_relever: [...ATELIER, "visiteur_rames"],
  stock_mouvementer: ["magasinier", "gestionnaire_stocks", "responsable_atelier"],
  achat_demander: [
    "magasinier",
    "gestionnaire_stocks",
    "responsable_atelier",
    "ingenieur_atelier",
  ],
  achat_valider: ["gestionnaire_stocks", "responsable_atelier"],
  parc_administrer: ENCADREMENT,
  plan_administrer: ENCADREMENT,
}

/** Logique pure : capacités d'un ensemble de rôles et d'un niveau d'attribution. */
export function capacitesGmao(
  roles: readonly AppRole[],
  niveauAttribution: "lecture" | "utilisation" | "admin" | null
): CapaciteGmao[] {
  return CAPACITES_GMAO.filter((capacite) => {
    if (niveauAttribution === "admin") return true
    if (niveauAttribution === "utilisation" && !CAPACITES_VALIDATION.has(capacite)) {
      return true
    }
    return roles.some(
      (role) =>
        ROLES_PAR_CAPACITE[capacite].includes(role) || can(role, "gmao", "valider")
    )
  })
}

export interface AccesGmao {
  user: Doc<"users">
  peutEcrire: boolean
  capacites: CapaciteGmao[]
}

async function rolesEffectifs(
  ctx: QueryCtx | MutationCtx,
  user: Doc<"users">
): Promise<AppRole[]> {
  const affectations = await ctx.db
    .query("userAssignments")
    .withIndex("by_user", (q) => q.eq("userId", user._id))
    .collect()
  const maintenant = Date.now()
  return [
    user.role,
    ...affectations
      .filter((affectation) => isAssignmentEffective(affectation, maintenant))
      .map((affectation) => affectation.role),
  ]
}

/** Lecture : module activé et accès au moins « lecture ». */
export async function lireGmao(ctx: QueryCtx | MutationCtx): Promise<AccesGmao> {
  const { user } = await assertCan(ctx, {
    moduleCode: "gmao",
    resource: "gmao",
    permission: "consulter",
  })
  const decision = await evaluateModuleAccess(ctx, user, "gmao")
  const niveauAttribution =
    user.role === "admin_it"
      ? null
      : decision.accessSource === "grant"
        ? decision.accessLevel
        : null
  const capacites =
    user.role === "admin_it"
      ? []
      : capacitesGmao(await rolesEffectifs(ctx, user), niveauAttribution)
  const peutEcrire =
    decision.accessLevel === "utilisation" || decision.accessLevel === "admin"
  return {
    user,
    peutEcrire: peutEcrire && user.role !== "admin_it",
    capacites: peutEcrire && user.role !== "admin_it" ? capacites : [],
  }
}

/**
 * Écriture : garde commune puis capacité métier. Le refus est explicite et
 * nomme le geste manquant.
 */
export async function exigerGmao(
  ctx: MutationCtx,
  capacite: CapaciteGmao,
  permission: "creer" | "modifier" = "modifier"
): Promise<Doc<"users">> {
  const { user } = await assertCan(ctx, {
    moduleCode: "gmao",
    resource: "gmao",
    permission,
  })
  if (user.role === "admin_it") {
    throw new Error(
      "Accès refusé : l'administration système ne réalise aucun geste de maintenance."
    )
  }
  const decision = await evaluateModuleAccess(ctx, user, "gmao")
  const niveauAttribution =
    decision.accessSource === "grant" ? decision.accessLevel : null
  const capacites = capacitesGmao(await rolesEffectifs(ctx, user), niveauAttribution)
  if (!capacites.includes(capacite)) {
    throw new Error(
      `Accès refusé : votre fonction ne permet pas « ${LIBELLES_CAPACITES_GMAO[capacite]} ».`
    )
  }
  return user
}

/** Nom affichable d'un agent. */
export function nomAgent(user: Doc<"users"> | null | undefined): string | null {
  if (!user) return null
  const nom = [user.firstName, user.lastName].filter(Boolean).join(" ").trim()
  return nom || user.matricule || user.email || "Agent SETRAG"
}

/**
 * Inscrit un événement dans la chronologie du dossier et dans le journal
 * d'audit. Toute écriture du module passe par ici.
 */
export async function journaliserGmao(
  ctx: MutationCtx,
  params: {
    entite: Doc<"gmaoEvenements">["entite"]
    entiteId: string
    table: string
    type: string
    libelle: string
    detail?: string
    auteurId?: Id<"users">
    avant?: unknown
    apres?: unknown
    permission?: "creer" | "modifier" | "valider" | "supprimer"
    motif?: string
    maintenant?: number
  }
): Promise<void> {
  const creeLe = params.maintenant ?? Date.now()
  await ctx.db.insert("gmaoEvenements", {
    entite: params.entite,
    entiteId: params.entiteId,
    type: params.type,
    libelle: params.libelle,
    detail: params.detail,
    auteurId: params.auteurId,
    creeLe,
  })
  await audit(ctx, {
    actorId: params.auteurId,
    action: `gmao.${params.type}`,
    entityTable: params.table,
    entityId: params.entiteId,
    permission: params.permission ?? "modifier",
    reason: params.motif,
    classification: "interne",
    before: params.avant,
    after: params.apres,
  })
}

/** Numéro continu par année : « OT-2026-0042 ». */
export async function prochainNumero(
  ctx: MutationCtx,
  prefixe: "OT" | "DA" | "VT" | "CF",
  maintenant = Date.now()
): Promise<string> {
  const annee = new Intl.DateTimeFormat("fr-CA", {
    timeZone: "Africa/Libreville",
    year: "numeric",
  }).format(maintenant)
  const key = `gmao:${prefixe}:${annee}`
  const existant = await ctx.db
    .query("sequences")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique()
  const valeur = (existant?.value ?? 0) + 1
  if (existant) await ctx.db.patch(existant._id, { value: valeur })
  else await ctx.db.insert("sequences", { key, value: valeur })
  return `${prefixe}-${annee}-${String(valeur).padStart(4, "0")}`
}
