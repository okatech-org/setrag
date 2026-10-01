import type { Doc, Id } from "../../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../../_generated/server"
import { audit } from "../../lib/auth"
import { can, type AppRole } from "../../model/permissions"
import { assertCan, evaluateModuleAccess, isAssignmentEffective } from "../platform/model"

/**
 * Contrôle d'accès du module Infrastructures ferroviaires et travaux PRN.
 *
 * Même construction que la GMAO (`modules/gmao/acces.ts`) :
 * 1. la garde commune `assertCan` (module activé, niveau d'accès, droit
 *    `consulter` / `creer` / `modifier` sur la ressource `infrastructure`) ;
 * 2. une capacité métier. La matrice fine accorde la même écriture au
 *    cantonnier et au responsable PRN ; or le cantonnier signale, il ne pose
 *    pas de limitation de vitesse et ne valide pas une situation de travaux.
 *
 * Une capacité est accordée par le rôle principal OU une affectation
 * effective, par le droit `valider` de la matrice (administration
 * fonctionnelle), ou par une attribution directe du module (niveau « admin »
 * pour tout, « utilisation » pour les gestes courants, hors validations).
 *
 * Les validations imposent en plus une séparation des tâches, vérifiée dans
 * chaque mutation : on ne clôt pas l'anomalie qu'on a traitée, on ne valide
 * pas l'inspection qu'on a rédigée, ni la situation qu'on a saisie, ni la
 * plage travaux qu'on a demandée.
 */

export const CAPACITES_INFRA = [
  "anomalie_signaler",
  "anomalie_traiter",
  "anomalie_clore",
  "ltv_gerer",
  "voie_gerer",
  "ouvrage_inspecter",
  "inspection_valider",
  "equipement_signalisation",
  "equipement_telecoms",
  "prn_gerer",
  "prn_avancement_saisir",
  "prn_valider",
  "intervention_demander",
  "intervention_accorder",
] as const
export type CapaciteInfra = (typeof CAPACITES_INFRA)[number]

export const LIBELLES_CAPACITES_INFRA: Record<CapaciteInfra, string> = {
  anomalie_signaler: "Signaler une anomalie",
  anomalie_traiter: "Prendre en charge et traiter une anomalie",
  anomalie_clore: "Clore une anomalie traitée",
  ltv_gerer: "Poser, modifier ou lever une limitation de vitesse",
  voie_gerer: "Mettre à jour l'état de la voie",
  ouvrage_inspecter: "Inventorier et inspecter les ouvrages d'art",
  inspection_valider: "Valider une inspection d'ouvrage",
  equipement_signalisation: "Gérer la signalisation et les passages à niveau",
  equipement_telecoms: "Gérer les télécommunications",
  prn_gerer: "Gérer les chantiers du PRN",
  prn_avancement_saisir: "Saisir l'avancement d'un chantier",
  prn_valider: "Valider une situation d'avancement",
  intervention_demander: "Demander une plage travaux",
  intervention_accorder: "Accorder une plage travaux",
}

/** Capacités de validation : réservées, même à une attribution « utilisation ». */
const CAPACITES_VALIDATION: ReadonlySet<CapaciteInfra> = new Set([
  "anomalie_clore",
  "inspection_valider",
  "prn_gerer",
  "prn_valider",
  "intervention_accorder",
])

/** Parties prenantes du financement : lecture du rapport bailleurs. */
export const ROLES_PARTENAIRES: readonly AppRole[] = [
  "representant_meridiam",
  "bailleur_fonds",
]

const TECHNICIENS: readonly AppRole[] = [
  "agent_voie",
  "technicien_signalisation",
  "technicien_telecoms",
  "agent_ouvrages_ponts",
  "responsable_prn",
]

const ROLES_PAR_CAPACITE: Readonly<Record<CapaciteInfra, readonly AppRole[]>> = {
  anomalie_signaler: [...TECHNICIENS, "cantonnier"],
  anomalie_traiter: TECHNICIENS,
  anomalie_clore: ["agent_voie", "responsable_prn"],
  ltv_gerer: ["agent_voie", "agent_ouvrages_ponts", "responsable_prn"],
  voie_gerer: ["agent_voie", "responsable_prn"],
  ouvrage_inspecter: ["agent_ouvrages_ponts", "responsable_prn"],
  inspection_valider: ["agent_ouvrages_ponts", "responsable_prn"],
  equipement_signalisation: ["technicien_signalisation", "responsable_prn"],
  equipement_telecoms: ["technicien_telecoms", "responsable_prn"],
  prn_gerer: ["responsable_prn"],
  prn_avancement_saisir: ["responsable_prn", "agent_voie"],
  prn_valider: ["responsable_prn"],
  intervention_demander: TECHNICIENS,
  intervention_accorder: ["responsable_prn"],
}

/** Logique pure : capacités d'un ensemble de rôles et d'un niveau d'attribution. */
export function capacitesInfra(
  roles: readonly AppRole[],
  niveauAttribution: "lecture" | "utilisation" | "admin" | null
): CapaciteInfra[] {
  return CAPACITES_INFRA.filter((capacite) => {
    if (niveauAttribution === "admin") return true
    if (niveauAttribution === "utilisation" && !CAPACITES_VALIDATION.has(capacite)) {
      return true
    }
    return roles.some(
      (role) =>
        ROLES_PAR_CAPACITE[capacite].includes(role) ||
        can(role, "infrastructure", "valider")
    )
  })
}

export interface AccesInfra {
  user: Doc<"users">
  peutEcrire: boolean
  capacites: CapaciteInfra[]
  /** Représentant Meridiam ou bailleur de fonds : lecture seule. */
  partenaire: boolean
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
export async function lireInfra(ctx: QueryCtx | MutationCtx): Promise<AccesInfra> {
  const { user } = await assertCan(ctx, {
    moduleCode: "infrastructure",
    resource: "infrastructure",
    permission: "consulter",
  })
  const decision = await evaluateModuleAccess(ctx, user, "infrastructure")
  const niveauAttribution =
    user.role === "admin_it"
      ? null
      : decision.accessSource === "grant"
        ? decision.accessLevel
        : null
  const capacites =
    user.role === "admin_it"
      ? []
      : capacitesInfra(await rolesEffectifs(ctx, user), niveauAttribution)
  const peutEcrire =
    (decision.accessLevel === "utilisation" || decision.accessLevel === "admin") &&
    user.role !== "admin_it"
  return {
    user,
    peutEcrire,
    capacites: peutEcrire ? capacites : [],
    partenaire: ROLES_PARTENAIRES.includes(user.role),
  }
}

/**
 * Écriture : garde commune puis capacité métier. Le refus est explicite et
 * nomme le geste manquant.
 */
export async function exigerInfra(
  ctx: MutationCtx,
  capacite: CapaciteInfra,
  permission: "creer" | "modifier" = "modifier"
): Promise<Doc<"users">> {
  const { user } = await assertCan(ctx, {
    moduleCode: "infrastructure",
    resource: "infrastructure",
    permission,
  })
  if (user.role === "admin_it") {
    throw new Error(
      "Accès refusé : l'administration système ne réalise aucun geste sur l'infrastructure."
    )
  }
  const decision = await evaluateModuleAccess(ctx, user, "infrastructure")
  const niveauAttribution =
    decision.accessSource === "grant" ? decision.accessLevel : null
  const capacites = capacitesInfra(await rolesEffectifs(ctx, user), niveauAttribution)
  if (!capacites.includes(capacite)) {
    throw new Error(
      `Accès refusé : votre fonction ne permet pas « ${LIBELLES_CAPACITES_INFRA[capacite]} ».`
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
export async function journaliserInfra(
  ctx: MutationCtx,
  params: {
    entite: Doc<"infraEvenements">["entite"]
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
  await ctx.db.insert("infraEvenements", {
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
    action: `infrastructure.${params.type}`,
    entityTable: params.table,
    entityId: params.entiteId,
    permission: params.permission ?? "modifier",
    reason: params.motif,
    classification: "interne",
    before: params.avant,
    after: params.apres,
  })
}

export type PrefixeNumeroInfra = "AN" | "LTV" | "INS" | "INT"

/** Année civile à Libreville, pour les numéros continus. */
export function anneeLibreville(maintenant: number): string {
  return new Intl.DateTimeFormat("fr-CA", {
    timeZone: "Africa/Libreville",
    year: "numeric",
  }).format(maintenant)
}

/** Numéro continu par année : « AN-2026-0001 ». */
export async function prochainNumero(
  ctx: MutationCtx,
  prefixe: PrefixeNumeroInfra,
  maintenant = Date.now()
): Promise<string> {
  const annee = anneeLibreville(maintenant)
  const key = `infra:${prefixe}:${annee}`
  const existant = await ctx.db
    .query("sequences")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique()
  const valeur = (existant?.value ?? 0) + 1
  if (existant) await ctx.db.patch(existant._id, { value: valeur })
  else await ctx.db.insert("sequences", { key, value: valeur })
  return `${prefixe}-${annee}-${String(valeur).padStart(4, "0")}`
}
