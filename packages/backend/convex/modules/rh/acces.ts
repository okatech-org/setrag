import type { Doc, Id } from "../../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../../_generated/server"
import { audit } from "../../lib/auth"
import type { AppRole, Permission } from "../../model/permissions"
import { assertCan, isAssignmentEffective, latestModuleAccessGrant } from "../platform/model"

/**
 * Capacités fines du module RH.
 *
 * La matrice générale (`model/permissions.ts`) ouvre le module et dit qui
 * peut y écrire. Le métier RH exige un cloisonnement plus fin : la paie
 * individuelle ne regarde que la paie, le détail médical que le service de
 * santé au travail, et un organisme social ne lit que ses déclarations.
 * Chaque fonction exige donc, après `assertCan`, la capacité métier voulue.
 */
export const CAPACITES_RH = {
  indicateurs: [
    "gestionnaire_paie",
    "planificateur_roulements",
    "medecin_travail",
    "infirmier_travail",
    "admin_fonctionnel",
    "admin_it",
    "direction_generale",
    "responsable_kpi",
    "representant_etat",
    "organisme_social",
  ],
  "dossiers.lire": [
    "gestionnaire_paie",
    "planificateur_roulements",
    "medecin_travail",
    "infirmier_travail",
    "admin_fonctionnel",
    "admin_it",
    "direction_generale",
  ],
  "dossiers.gerer": ["gestionnaire_paie", "admin_fonctionnel"],
  "paie.lire": ["gestionnaire_paie", "admin_fonctionnel"],
  "paie.preparer": ["gestionnaire_paie", "admin_fonctionnel"],
  "paie.valider": ["admin_fonctionnel"],
  "declarations.lire": [
    "gestionnaire_paie",
    "admin_fonctionnel",
    "direction_generale",
    "organisme_social",
  ],
  "declarations.transmettre": ["gestionnaire_paie", "admin_fonctionnel"],
  "roulements.lire": [
    "gestionnaire_paie",
    "planificateur_roulements",
    "admin_fonctionnel",
    "admin_it",
    "direction_generale",
  ],
  "roulements.planifier": ["planificateur_roulements", "admin_fonctionnel"],
  "conges.lire": [
    "gestionnaire_paie",
    "planificateur_roulements",
    "admin_fonctionnel",
    "admin_it",
    "direction_generale",
  ],
  "conges.demander": [
    "gestionnaire_paie",
    "planificateur_roulements",
    "admin_fonctionnel",
  ],
  "conges.valider": [
    "gestionnaire_paie",
    "planificateur_roulements",
    "admin_fonctionnel",
  ],
  "aptitude.lire": [
    "gestionnaire_paie",
    "planificateur_roulements",
    "medecin_travail",
    "infirmier_travail",
    "admin_fonctionnel",
    "admin_it",
    "direction_generale",
  ],
  "medical.detail": ["medecin_travail", "infirmier_travail"],
  "medical.programmer": ["medecin_travail", "infirmier_travail"],
  "medical.prononcer": ["medecin_travail"],
} as const satisfies Record<string, readonly AppRole[]>

export type CapaciteRh = keyof typeof CAPACITES_RH

/** Capacités qu'un grant direct « Admin » ne peut jamais ouvrir. */
const CAPACITES_SECRET_MEDICAL: readonly CapaciteRh[] = [
  "medical.detail",
  "medical.programmer",
  "medical.prononcer",
]

/** Capacités d'écriture : leur absence vaut lecture seule à l'écran. */
export const CAPACITES_ECRITURE_RH: readonly CapaciteRh[] = [
  "dossiers.gerer",
  "paie.preparer",
  "paie.valider",
  "declarations.transmettre",
  "roulements.planifier",
  "conges.demander",
  "conges.valider",
  "medical.programmer",
  "medical.prononcer",
]

/** Pure : capacités ouvertes par un ensemble de rôles. */
export function capacitesRh(
  roles: readonly AppRole[],
  grantAdmin = false
): Set<CapaciteRh> {
  const capacites = new Set<CapaciteRh>()
  for (const [capacite, autorises] of Object.entries(CAPACITES_RH) as [
    CapaciteRh,
    readonly AppRole[],
  ][]) {
    if (roles.some((role) => autorises.includes(role))) capacites.add(capacite)
    else if (grantAdmin && !CAPACITES_SECRET_MEDICAL.includes(capacite)) {
      capacites.add(capacite)
    }
  }
  return capacites
}

export interface AccesRh {
  user: Doc<"users">
  nom: string
  capacites: Set<CapaciteRh>
}

export function nomUtilisateur(user: Doc<"users">): string {
  const nom = [user.firstName, user.lastName].filter(Boolean).join(" ").trim()
  return nom || user.email || user.matricule || "Utilisateur du portail"
}

async function rolesEffectifs(
  ctx: QueryCtx | MutationCtx,
  user: Doc<"users">
): Promise<AppRole[]> {
  const affectations = await ctx.db
    .query("userAssignments")
    .withIndex("by_user", (query) => query.eq("userId", user._id))
    .collect()
  const maintenant = Date.now()
  return [
    user.role,
    ...affectations
      .filter((affectation) => isAssignmentEffective(affectation, maintenant))
      .map((affectation) => affectation.role),
  ]
}

/**
 * Garde du module RH : identité, activation et niveau du module, droit
 * général sur la ressource `rh`, puis capacité métier.
 */
export async function accesRh(
  ctx: QueryCtx | MutationCtx,
  permission: Permission,
  capacite?: CapaciteRh
): Promise<AccesRh> {
  const acces = await assertCan(ctx, {
    moduleCode: "rh",
    resource: "rh",
    permission,
  })
  const grant =
    acces.permissionSource === "moduleGrant"
      ? await latestModuleAccessGrant(ctx, acces.user._id, "rh")
      : null
  const capacites = capacitesRh(
    await rolesEffectifs(ctx, acces.user),
    grant?.accessLevel === "admin"
  )
  if (capacite && !capacites.has(capacite)) {
    throw new Error(
      `Accès refusé : votre profil ne permet pas « ${LIBELLES_CAPACITES_RH[capacite]} ».`
    )
  }
  return { user: acces.user, nom: nomUtilisateur(acces.user), capacites }
}

export const LIBELLES_CAPACITES_RH: Record<CapaciteRh, string> = {
  indicateurs: "consulter les indicateurs RH",
  "dossiers.lire": "consulter les dossiers du personnel",
  "dossiers.gerer": "gérer les dossiers du personnel",
  "paie.lire": "consulter la paie individuelle",
  "paie.preparer": "préparer la paie",
  "paie.valider": "valider la paie",
  "declarations.lire": "consulter les déclarations sociales",
  "declarations.transmettre": "transmettre les déclarations sociales",
  "roulements.lire": "consulter les roulements",
  "roulements.planifier": "planifier les roulements",
  "conges.lire": "consulter les congés",
  "conges.demander": "saisir une demande de congé",
  "conges.valider": "statuer sur un congé",
  "aptitude.lire": "consulter les aptitudes",
  "medical.detail": "consulter le dossier médical",
  "medical.programmer": "programmer une visite médicale",
  "medical.prononcer": "prononcer une aptitude",
}

/* ══════════════════════════ Traçabilité ═════════════════════════════════ */

export type EntiteJournalRh = Doc<"rhJournal">["entite"]

/**
 * Inscrit une action à la chronologie du dossier ET au journal d'audit
 * réglementaire, dans la même transaction.
 */
export async function tracerRh(
  ctx: MutationCtx,
  acces: Pick<AccesRh, "user" | "nom">,
  params: {
    entite: EntiteJournalRh
    entiteId: string
    agentId?: Id<"rhAgents">
    action: string
    libelle: string
    detail?: string
    confidentiel?: boolean
    permission: Permission
    table: string
    avant?: unknown
    apres?: unknown
  }
) {
  const at = Date.now()
  await ctx.db.insert("rhJournal", {
    agentId: params.agentId,
    entite: params.entite,
    entiteId: params.entiteId,
    action: params.action,
    libelle: params.libelle,
    detail: params.detail,
    confidentiel: params.confidentiel ?? false,
    acteurId: acces.user._id,
    acteurNom: acces.nom,
    at,
  })
  await audit(ctx, {
    actorId: acces.user._id,
    action: params.action,
    entityTable: params.table,
    entityId: params.entiteId,
    permission: params.permission,
    classification: params.confidentiel ? "restreint" : "confidentiel",
    // Le détail médical ne quitte jamais sa table, même vers le journal.
    before: params.confidentiel ? undefined : params.avant,
    after: params.confidentiel ? undefined : params.apres,
    reason: params.detail,
  })
}

/** Numérotation continue par clé (« CG-2026 » → CG-2026-0007). */
export async function prochainNumero(
  ctx: MutationCtx,
  prefixe: string,
  largeur = 4
): Promise<string> {
  const ligne = await ctx.db
    .query("rhSequences")
    .withIndex("by_cle", (query) => query.eq("cle", prefixe))
    .unique()
  const valeur = (ligne?.valeur ?? 0) + 1
  if (ligne) await ctx.db.patch(ligne._id, { valeur })
  else await ctx.db.insert("rhSequences", { cle: prefixe, valeur })
  return `${prefixe}-${String(valeur).padStart(largeur, "0")}`
}

/** Chronologie d'un dossier ; les entrées médicales restent au service médical. */
export async function chronologieRh(
  ctx: QueryCtx,
  filtre:
    | { agentId: Id<"rhAgents"> }
    | { entite: EntiteJournalRh; entiteId: string },
  voitMedical: boolean
) {
  const lignes =
    "agentId" in filtre
      ? await ctx.db
          .query("rhJournal")
          .withIndex("by_agent", (query) => query.eq("agentId", filtre.agentId))
          .order("desc")
          .take(200)
      : await ctx.db
          .query("rhJournal")
          .withIndex("by_entite", (query) =>
            query.eq("entite", filtre.entite).eq("entiteId", filtre.entiteId)
          )
          .order("desc")
          .take(200)
  return lignes
    .filter((ligne) => voitMedical || !ligne.confidentiel)
    .map((ligne) => ({
      _id: ligne._id,
      action: ligne.action,
      libelle: ligne.libelle,
      detail: ligne.detail,
      acteurNom: ligne.acteurNom,
      at: ligne.at,
    }))
}
