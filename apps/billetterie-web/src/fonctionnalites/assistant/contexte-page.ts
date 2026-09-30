import { dateLongue } from "@/lib/format"
import { libelleVoyageurs, lireRecherche } from "@/lib/recherche"

/**
 * Ce que Ruban voit de la page en cours, en une phrase : le voyageur n'a pas
 * à lui répéter le trajet qu'il regarde. Le backend reçoit ce texte comme une
 * donnée, jamais comme une instruction.
 *
 * Lu au moment de l'envoi, dans l'adresse courante : la coquille n'a pas à
 * s'abonner aux paramètres de chaque page.
 */
/** Une référence de vente plausible : rien d'autre n'entre dans le contexte. */
const REFERENCE = /^[A-Z0-9][A-Z0-9-]{3,39}$/
/** Un numéro de train plausible (« TR-201 »). */
const TRAIN = /^[A-Z0-9-]{1,20}$/
const DATE = /^\d{4}-\d{2}-\d{2}$/

function referenceSure(valeur: string | null): string | null {
  if (!valeur) return null
  let texte = valeur
  try {
    texte = decodeURIComponent(valeur)
  } catch {
    return null
  }
  return REFERENCE.test(texte) ? texte : null
}

/**
 * Seules des données vérifiées entrent dans la phrase : noms de gares du
 * référentiel, références et numéros au format attendu. Une adresse fabriquée
 * ne peut donc pas y glisser un texte de son choix.
 */
export function decrirePage(
  chemin: string,
  parametres: URLSearchParams,
  parCode: (code: string) => { name: string } | undefined
): string {
  const recherche = lireRecherche(parametres)
  const de = recherche ? parCode(recherche.de)?.name : undefined
  const a = recherche ? parCode(recherche.a)?.name : undefined
  const trajet = recherche && de && a ? `${de} → ${a}, ${dateLongue(recherche.le)}, ${libelleVoyageurs(recherche)}` : null
  const reference = referenceSure(parametres.get("ref"))

  if (chemin === "/") return "Page : accueil de la billetterie."
  if (chemin.startsWith("/resultats")) return trajet ? `Page : résultats de recherche. Recherche : ${trajet}.` : "Page : résultats de recherche."
  if (chemin.startsWith("/reservation")) return trajet ? `Page : saisie des voyageurs. Trajet : ${trajet}.` : "Page : saisie des voyageurs."
  if (chemin.startsWith("/paiement")) return reference ? `Page : paiement de la réservation ${reference}.` : "Page : paiement."
  if (chemin.startsWith("/confirmation")) return reference ? `Page : billets émis pour la réservation ${reference}.` : "Page : confirmation."
  if (chemin.startsWith("/billets/")) {
    const ref = referenceSure(chemin.slice("/billets/".length))
    return ref ? `Page : détail de la réservation ${ref}.` : "Page : détail d'une réservation."
  }
  if (chemin.startsWith("/billets")) return "Page : mes billets."
  if (chemin.startsWith("/suivi")) {
    const train = parametres.get("train")
    const date = parametres.get("date")
    return train && date && TRAIN.test(train) && DATE.test(date) ? `Page : suivi du train ${train} du ${dateLongue(date)}.` : "Page : suivi des trains."
  }
  if (chemin.startsWith("/compte")) return "Page : espace compte."
  if (chemin.startsWith("/tarifs")) return "Page : tarifs et réductions."
  if (chemin.startsWith("/bagages")) return "Page : bagages et colis."
  if (chemin.startsWith("/aide")) return "Page : aide."
  return "Page : billetterie SETRAG."
}
