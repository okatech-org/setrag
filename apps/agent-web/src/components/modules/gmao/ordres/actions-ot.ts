import type { CapaciteGmao, DossierOt } from "../commun"

/**
 * Actions proposées sur un OT selon son statut et les capacités de l'agent.
 * Le serveur vérifie tout de nouveau ; l'écran n'affiche que ce qui a une
 * chance d'aboutir, et une seule action principale : la prochaine étape.
 */

export type StatutOt = DossierOt["ot"]["statut"]

export type ActionOt =
  | "planifier"
  | "replanifier"
  | "modifier"
  | "demarrer"
  | "saisir_temps"
  | "consommer"
  | "retourner"
  | "cout_externe"
  | "demander_achat"
  | "terminer"
  | "refuser_reception"
  | "cloturer"
  | "annuler"

export interface PlanActionsOt {
  /** Prochaine étape du cycle de vie, seul bouton `primary` de l'écran. */
  principale: ActionOt | null
  /** Autres actions possibles, en `secondary` ou `ghost`. */
  autres: ActionOt[]
  /** L'agent a déclaré la fin des travaux : la remise en service revient à un autre. */
  separationTaches: boolean
}

export const LIBELLES_ACTIONS_OT: Record<ActionOt, string> = {
  planifier: "Planifier",
  replanifier: "Replanifier",
  modifier: "Modifier la demande",
  demarrer: "Démarrer les travaux",
  saisir_temps: "Saisir du temps",
  consommer: "Consommer une pièce",
  retourner: "Retourner une pièce",
  cout_externe: "Ajouter une prestation externe",
  demander_achat: "Demander l'achat d'une pièce",
  terminer: "Déclarer les travaux terminés",
  refuser_reception: "Refuser la réception",
  cloturer: "Remettre en service",
  annuler: "Annuler l'OT",
}

/** Étapes du cycle de vie, dans l'ordre. */
export const ETAPES_OT = ["Demandé", "Planifié", "En cours", "En réception", "Clôturé"] as const

export function etapeOt(statut: StatutOt) {
  switch (statut) {
    case "demande":
      return 0
    case "planifie":
      return 1
    case "en_cours":
      return 2
    case "travaux_termines":
      return 3
    case "cloture":
      return 4
    case "annule":
      return -1
  }
}

/** Ce qui est attendu à l'étape courante, écrit pour l'agent. */
export const PROCHAINE_ETAPE_OT: Record<StatutOt, string> = {
  demande: "Planifier l'intervention : atelier, équipe et créneau.",
  planifie: "Démarrer les travaux à l'arrivée de l'engin en atelier.",
  en_cours: "Saisir le temps et les pièces, puis déclarer les travaux terminés avec un compte rendu.",
  travaux_termines: "Réception par un autre agent que le réparateur : remise en service ou refus motivé.",
  cloture: "OT clôturé : l'engin a été réceptionné.",
  annule: "OT annulé avant démarrage.",
}

export function actionsOt({
  statut,
  peut,
  termineParMoi,
  piecesRetournables,
}: {
  statut: StatutOt
  peut: (capacite: CapaciteGmao) => boolean
  termineParMoi: boolean
  /** Des pièces consommées sur l'OT peuvent revenir en magasin. */
  piecesRetournables: boolean
}): PlanActionsOt {
  const autres: ActionOt[] = []
  const ajouter = (action: ActionOt, autorise: boolean) => {
    if (autorise) autres.push(action)
  }
  const pieces = peut("ot_executer") || peut("stock_mouvementer")

  switch (statut) {
    case "demande":
      ajouter("modifier", peut("ot_planifier"))
      ajouter("annuler", peut("ot_planifier"))
      return { principale: peut("ot_planifier") ? "planifier" : null, autres, separationTaches: false }
    case "planifie":
      ajouter("replanifier", peut("ot_planifier"))
      ajouter("modifier", peut("ot_planifier"))
      ajouter("annuler", peut("ot_planifier"))
      return { principale: peut("ot_executer") ? "demarrer" : null, autres, separationTaches: false }
    case "en_cours":
      ajouter("saisir_temps", peut("ot_executer"))
      ajouter("consommer", pieces)
      ajouter("retourner", pieces && piecesRetournables)
      ajouter("cout_externe", peut("ot_planifier"))
      ajouter("demander_achat", peut("achat_demander"))
      return { principale: peut("ot_executer") ? "terminer" : null, autres, separationTaches: false }
    case "travaux_termines": {
      const separationTaches = peut("ot_cloturer") && termineParMoi
      ajouter("refuser_reception", peut("ot_cloturer"))
      ajouter("retourner", pieces && piecesRetournables)
      ajouter("cout_externe", peut("ot_planifier"))
      ajouter("demander_achat", peut("achat_demander"))
      return { principale: peut("ot_cloturer") && !termineParMoi ? "cloturer" : null, autres, separationTaches }
    }
    case "cloture":
    case "annule":
      return { principale: null, autres, separationTaches: false }
  }
}

/** Quantité nette consommée par article sur l'OT (sorties moins retours). */
export function piecesNettes(pieces: DossierOt["pieces"]) {
  const parArticle = new Map<string, { articleId: string; reference: string; designation: string; unite: string; quantite: number }>()
  for (const piece of pieces) {
    const courant = parArticle.get(piece.articleId) ?? {
      articleId: piece.articleId,
      reference: piece.reference,
      designation: piece.designation,
      unite: piece.unite,
      quantite: 0,
    }
    courant.quantite += piece.sens === "sortie" ? piece.quantite : piece.sens === "entree" ? -piece.quantite : 0
    parArticle.set(piece.articleId, courant)
  }
  return [...parArticle.values()]
    .map((ligne) => ({ ...ligne, quantite: Math.round(ligne.quantite * 100) / 100 }))
    .filter((ligne) => ligne.quantite > 0)
}
