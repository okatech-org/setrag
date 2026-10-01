import type { Doc, Id } from "../../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../../_generated/server"
import { audit } from "../../lib/auth"
import { can, isInternalRole, type AppRole, type Permission } from "../../model/permissions"
import { assertCan, isAssignmentEffective, latestModuleAccessGrant } from "../platform/model"
import { nomUtilisateur } from "../rh/acces"

/**
 * Capacités fines du module Sécurité.
 *
 * Le personnel interne habilité au module lit le registre ; seuls certains
 * profils qualifient, enquêtent, clôturent ou déclarent à l'ARTF. Les
 * parties prenantes externes ne voient que ce qui les concerne : l'auditeur
 * ARTF les dossiers et déclarations, les Eaux et Forêts l'environnement, les
 * bailleurs les indicateurs.
 */
const SPECIFIQUES = {
  "evenement.qualifier": ["inspecteur_securite", "admin_fonctionnel"],
  "enquete.instruire": ["enqueteur_accidents", "inspecteur_securite", "admin_fonctionnel"],
  "enquete.cloturer": ["inspecteur_securite", "admin_fonctionnel"],
  "actions.gerer": ["inspecteur_securite", "enqueteur_accidents", "responsable_environnement", "audit_risques", "admin_fonctionnel"],
  "actions.verifier": ["inspecteur_securite", "audit_risques", "admin_fonctionnel"],
  "inspections.gerer": ["inspecteur_securite", "audit_risques", "responsable_environnement", "admin_fonctionnel"],
  "artf.gerer": ["inspecteur_securite", "admin_fonctionnel"],
  "environnement.gerer": ["responsable_environnement", "inspecteur_securite", "admin_fonctionnel"],
} as const satisfies Record<string, readonly AppRole[]>

export const CAPACITES_SECURITE = [
  "indicateurs",
  "registre.lire",
  "evenement.declarer",
  "artf.lire",
  "environnement.lire",
  ...(Object.keys(SPECIFIQUES) as (keyof typeof SPECIFIQUES)[]),
] as const
export type CapaciteSecurite = (typeof CAPACITES_SECURITE)[number]

export const CAPACITES_ECRITURE_SECURITE: readonly CapaciteSecurite[] = [
  "evenement.declarer",
  ...(Object.keys(SPECIFIQUES) as (keyof typeof SPECIFIQUES)[]),
]

export const LIBELLES_CAPACITES_SECURITE: Record<CapaciteSecurite, string> = {
  indicateurs: "consulter les indicateurs de sécurité",
  "registre.lire": "consulter le registre de sécurité",
  "evenement.declarer": "déclarer un événement de sécurité",
  "artf.lire": "consulter les déclarations ARTF",
  "environnement.lire": "consulter le suivi environnemental",
  "evenement.qualifier": "qualifier un événement",
  "enquete.instruire": "instruire une enquête",
  "enquete.cloturer": "clôturer une enquête",
  "actions.gerer": "gérer les actions correctives",
  "actions.verifier": "vérifier l'efficacité d'une action",
  "inspections.gerer": "gérer les inspections",
  "artf.gerer": "déclarer à l'ARTF",
  "environnement.gerer": "gérer le suivi environnemental",
}

/** Pure : capacités ouvertes par un ensemble de rôles disposant du module. */
export function capacitesSecurite(roles: readonly AppRole[], grantAdmin = false): Set<CapaciteSecurite> {
  const capacites = new Set<CapaciteSecurite>(["indicateurs"])
  for (const role of roles) {
    if (!can(role, "securite", "consulter")) continue
    if (isInternalRole(role)) {
      capacites.add("registre.lire")
      capacites.add("artf.lire")
      capacites.add("environnement.lire")
    }
    if (role === "auditeur_artf") {
      capacites.add("registre.lire")
      capacites.add("artf.lire")
      capacites.add("environnement.lire")
    }
    if (role === "representant_etat") capacites.add("artf.lire")
    if (role === "controleur_eaux_forets") capacites.add("environnement.lire")
    if (can(role, "securite", "creer")) capacites.add("evenement.declarer")
    for (const [capacite, autorises] of Object.entries(SPECIFIQUES) as [CapaciteSecurite, readonly AppRole[]][]) {
      if (autorises.includes(role)) capacites.add(capacite)
    }
  }
  if (grantAdmin) for (const capacite of CAPACITES_SECURITE) capacites.add(capacite)
  return capacites
}

export interface AccesSecurite {
  user: Doc<"users">
  nom: string
  capacites: Set<CapaciteSecurite>
  roles: AppRole[]
}

export async function accesSecurite(
  ctx: QueryCtx | MutationCtx,
  permission: Permission,
  capacite?: CapaciteSecurite
): Promise<AccesSecurite> {
  const acces = await assertCan(ctx, { moduleCode: "securite", resource: "securite", permission })
  const affectations = await ctx.db
    .query("userAssignments")
    .withIndex("by_user", (query) => query.eq("userId", acces.user._id))
    .collect()
  const maintenant = Date.now()
  const roles = [
    acces.user.role,
    ...affectations.filter((a) => isAssignmentEffective(a, maintenant)).map((a) => a.role),
  ]
  const grant =
    acces.permissionSource === "moduleGrant" ? await latestModuleAccessGrant(ctx, acces.user._id, "securite") : null
  const capacites = capacitesSecurite(roles, grant?.accessLevel === "admin")
  if (grant && grant.accessLevel !== "admin") {
    capacites.add("registre.lire")
    capacites.add("artf.lire")
    capacites.add("environnement.lire")
  }
  if (capacite && !capacites.has(capacite)) {
    throw new Error(`Accès refusé : votre profil ne permet pas « ${LIBELLES_CAPACITES_SECURITE[capacite]} ».`)
  }
  return { user: acces.user, nom: nomUtilisateur(acces.user), capacites, roles }
}

export type EntiteJournalSecurite = Doc<"securiteJournal">["entite"]

/** Chronologie du dossier ET journal d'audit, dans la même transaction. */
export async function tracerSecurite(
  ctx: MutationCtx,
  acces: Pick<AccesSecurite, "user" | "nom">,
  params: {
    entite: EntiteJournalSecurite
    entiteId: string
    evenementId?: Id<"securiteEvenements">
    action: string
    libelle: string
    detail?: string
    permission: Permission
    table: string
    avant?: unknown
    apres?: unknown
  }
) {
  await ctx.db.insert("securiteJournal", {
    entite: params.entite,
    entiteId: params.entiteId,
    evenementId: params.evenementId,
    action: params.action,
    libelle: params.libelle,
    detail: params.detail,
    acteurId: acces.user._id,
    acteurNom: acces.nom,
    at: Date.now(),
  })
  await audit(ctx, {
    actorId: acces.user._id,
    action: params.action,
    entityTable: params.table,
    entityId: params.entiteId,
    permission: params.permission,
    classification: "interne",
    before: params.avant,
    after: params.apres,
    reason: params.detail,
  })
}

export async function prochainNumeroSecurite(ctx: MutationCtx, prefixe: string, largeur = 4): Promise<string> {
  const ligne = await ctx.db.query("securiteSequences").withIndex("by_cle", (q) => q.eq("cle", prefixe)).unique()
  const valeur = (ligne?.valeur ?? 0) + 1
  if (ligne) await ctx.db.patch(ligne._id, { valeur })
  else await ctx.db.insert("securiteSequences", { cle: prefixe, valeur })
  return `${prefixe}-${String(valeur).padStart(largeur, "0")}`
}

export async function chronologieSecurite(
  ctx: QueryCtx,
  filtre: { evenementId: Id<"securiteEvenements"> } | { entite: EntiteJournalSecurite; entiteId: string }
) {
  const lignes =
    "evenementId" in filtre
      ? await ctx.db.query("securiteJournal").withIndex("by_evenement", (q) => q.eq("evenementId", filtre.evenementId)).order("desc").take(200)
      : await ctx.db
          .query("securiteJournal")
          .withIndex("by_entite", (q) => q.eq("entite", filtre.entite).eq("entiteId", filtre.entiteId))
          .order("desc")
          .take(200)
  return lignes.map((ligne) => ({
    _id: ligne._id,
    entite: ligne.entite,
    action: ligne.action,
    libelle: ligne.libelle,
    detail: ligne.detail,
    acteurNom: ligne.acteurNom,
    at: ligne.at,
  }))
}
