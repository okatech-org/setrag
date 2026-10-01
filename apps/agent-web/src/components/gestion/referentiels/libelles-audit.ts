import type { EvenementChronologie } from "@/components/charte"

import { agent, heure, jourMois, type PersonneAffichee } from "./format"

/**
 * Libellés du journal d'audit. Le code d'action reste la référence (il part
 * au SIEM) ; l'écran le dit en français.
 */
export const LIBELLES_ACTIONS: Record<string, string> = {
  "livret.creer": "Création du livret",
  "livret.modifier": "Modification du livret",
  "livret.soumettre": "Soumission à validation",
  "livret.rejeter": "Rejet du livret",
  "livret.activer": "Validation et activation",
  "livret.expirer": "Expiration du livret",
  "livret.brouillon.supprimer": "Suppression du brouillon",
  "livret.horaire.ajouter": "Ajout d'une circulation",
  "livret.horaire.modifier": "Modification d'une circulation",
  "livret.horaire.supprimer": "Retrait d'une circulation",
  "desserte.statut": "Changement d'état d'une desserte",
  "tarif.grille.creer": "Création de la grille",
  "tarif.grille.modifier": "Modification des paramètres",
  "tarif.grille.bareme": "Modification du barème",
  "tarif.grille.soumettre": "Soumission de la grille",
  "tarif.grille.activer": "Approbation et activation",
  "tarif.grille.rejeter": "Refus de la grille",
  "tarif.grille.expirer": "Expiration de la grille",
  "tarif.base.creer": "Ajout d'une base kilométrique",
  "tarif.base.modifier": "Modification d'une base",
  "tarif.base.supprimer": "Retrait d'une base",
  "tarif.reduction.creer": "Ajout d'une réduction",
  "tarif.reduction.modifier": "Modification d'une réduction",
  "tarif.reduction.supprimer": "Retrait d'une réduction",
  "yield.regle.creer": "Création de la règle",
  "yield.regle.modifier": "Modification de la règle",
  "yield.regle.suspendre": "Suspension de la règle",
  "yield.regle.reactiver": "Réactivation de la règle",
  "referentiel.train.creer": "Création du train",
  "referentiel.train.modifier": "Modification du train",
  "referentiel.train.activer": "Réactivation du train",
  "referentiel.train.desactiver": "Désactivation du train",
  "referentiel.voiture.creer": "Ajout d'une voiture",
  "referentiel.voiture.modifier": "Modification d'une voiture",
  "referentiel.voiture.supprimer": "Retrait d'une voiture",
  "referentiel.voiture.importer_plan": "Import d'un plan de voiture",
  "referentiel.station.creer": "Création d'une gare",
  "referentiel.station.modifier": "Modification d'une gare",
  "referentiel.point_de_vente.creer": "Création du point de vente",
  "referentiel.point_de_vente.modifier": "Modification du point de vente",
  "referentiel.point_de_vente.suspendre": "Suspension du point de vente",
  "referentiel.point_de_vente.reactiver": "Réactivation du point de vente",
  "place.bloquer": "Blocage de place",
  "place.liberer": "Déblocage de place",
  "quota_agence.creer": "Attribution d'un quota agence",
  "quota_agence.annuler": "Levée d'un quota agence",
  "quota_agence.liberer_echeance": "Libération du quota à échéance",
  "voyageurs.extraction": "Extraction de voyageurs",
  "voyageurs.manifeste.exporter": "Export du manifeste",
  "voyageurs.manifeste.imprimer": "Impression du manifeste",
  "voyageurs.telephone.afficher": "Affichage d'un téléphone",
  "incident.declarer": "Déclaration de l'incident",
  "incident.synchroniser": "Remontée d'incidents du terrain",
  "incident.statut": "Changement d'état",
  "incident.clore": "Clôture de l'incident",
  "pv.synchroniser": "Remontée de procès-verbaux",
  "pv.statut": "Changement d'état du PV",
  "pv.encaisser": "Encaissement du PV",
  "utilisateur.inviter": "Invitation du compte",
  "utilisateur.modifier": "Modification du compte",
  "utilisateur.suspendre": "Suspension du compte",
  "utilisateur.reactiver": "Réactivation du compte",
  "annuaire.synchroniser": "Synchronisation de l'annuaire",
  "audit.exporter": "Export du journal d'audit",
  "parametrage.enregistrer": "Modification du paramétrage",
  "integrations.rejouer_echecs": "Relance des intégrations",
  "integrations.demander_reprise": "Demande de reprise des intégrations",
}

export function libelleAction(action: string) {
  const connu = LIBELLES_ACTIONS[action]
  if (connu) return connu
  const texte = action.replaceAll(".", " · ").replaceAll("_", " ")
  return texte.charAt(0).toUpperCase() + texte.slice(1)
}

export interface EntreeHistorique {
  id: string
  action: string
  createdAt: number
  acteur: PersonneAffichee | null
  reason?: string
  result?: string
  after?: string
  metadata?: string
}

function lire(json: string | undefined): Record<string, unknown> | null {
  if (!json) return null
  try {
    const valeur = JSON.parse(json) as unknown
    return valeur && typeof valeur === "object" && !Array.isArray(valeur) ? (valeur as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** Précision d'une entrée : le motif écrit, sinon la note ou le motif de l'état suivant. */
export function precisionAudit(entree: Pick<EntreeHistorique, "reason" | "after" | "metadata">) {
  if (entree.reason) return entree.reason
  const apres = lire(entree.after)
  for (const cle of ["note", "reason", "motif", "comment"]) {
    const valeur = apres?.[cle]
    if (typeof valeur === "string" && valeur.trim()) return valeur
  }
  return undefined
}

export function evenementsHistorique(historique: readonly EntreeHistorique[]): EvenementChronologie[] {
  return historique.map((entree) => {
    const precision = precisionAudit(entree)
    const refus = entree.result && entree.result !== "succes"
    return {
      cle: entree.id,
      heure: jourMois(entree.createdAt),
      titre: `${libelleAction(entree.action)}${refus ? ` · ${entree.result === "refus" ? "refusée" : "en échec"}` : ""}`,
      detail: `${heure(entree.createdAt)} · ${agent(entree.acteur)}${precision ? ` — ${precision}` : ""}`,
    }
  })
}
