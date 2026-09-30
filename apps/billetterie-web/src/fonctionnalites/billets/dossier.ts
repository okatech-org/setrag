/**
 * Lecture d'un dossier voyageur : ce qu'il faut en dire à l'écran.
 *
 * Aucune règle commerciale ici — seulement la traduction des états publiés
 * par le backend (`schema.ts`) en mots et en dispositions d'écran.
 */

import type { BilletEtat } from "@workspace/ui/voyage/billet"
import type { StatutBillet } from "@workspace/ui/voyage/statut"

import type { Dossier } from "@/lib/offline/types"

export type { Dossier }
export type Titre = Dossier["tickets"][number]

/** « Alice Essai » */
export function nomVoyageur(titre: Titre): string {
  return `${titre.passenger.firstName} ${titre.passenger.lastName}`.trim()
}

/** « A. Essai » : là où la place manque. */
export function nomCourt(titre: Titre): string {
  const initiale = titre.passenger.firstName.trim().charAt(0)
  return initiale
    ? `${initiale.toUpperCase()}. ${titre.passenger.lastName}`
    : titre.passenger.lastName
}

/** « place 1A », « debout » */
export function placeDe(titre: Titre): string | null {
  if (titre.isStanding) return "debout"
  if (!titre.seatLabel) return null
  return titre.coachLabel
    ? `voiture ${titre.coachLabel}, place ${titre.seatLabel}`
    : `place ${titre.seatLabel}`
}

/** Fin du délai de paiement d'une réservation non réglée. */
export function finDeTenue(dossier: Dossier): number | null {
  return dossier.sale.status === "en_attente_paiement"
    ? (dossier.sale.priceLockedUntil ?? null)
    : null
}

/**
 * Réservation non réglée dont le délai est écoulé : le serveur la clôt par
 * une tâche périodique, l'écran n'attend pas pour le dire.
 */
export function tenueEcoulee(dossier: Dossier, maintenant: number): boolean {
  const fin = finDeTenue(dossier)
  return fin !== null && fin <= maintenant
}

export function aPayer(dossier: Dossier, maintenant: number): boolean {
  return (
    dossier.sale.status === "en_attente_paiement" &&
    !tenueEcoulee(dossier, maintenant)
  )
}

/** Arrivée estimée du train, retard compris. */
export function arriveeEstimee(dossier: Dossier): number | null {
  if (!dossier.trip) return null
  return (
    dossier.trip.arrivalAt + Math.max(0, dossier.trip.delayMinutes) * 60_000
  )
}

/**
 * À venir : un voyage qui peut encore avoir lieu pour ce voyageur — payé ou
 * à payer, train pas encore arrivé. Le reste (voyages faits, réservations
 * annulées ou expirées) relève de l'historique.
 */
export function estAVenir(dossier: Dossier, maintenant: number): boolean {
  const arrivee = arriveeEstimee(dossier)
  if (arrivee === null || arrivee <= maintenant) return false
  if (dossier.trip?.status === "termine") return false
  return dossier.sale.status === "confirmee" || aPayer(dossier, maintenant)
}

export type StatutVente = {
  libelle: string
  ton: "success" | "warning" | "danger" | "info" | "neutral"
  icone: "valide" | "attente" | "annule" | "rembourse" | "fini" | "expire"
}

/** Le mot de chaque état, comme sur la maquette « Mes réservations ». */
export function statutVente(dossier: Dossier, maintenant: number): StatutVente {
  switch (dossier.sale.status) {
    case "confirmee": {
      const arrivee = arriveeEstimee(dossier)
      const fait =
        dossier.trip?.status === "termine" ||
        (arrivee !== null && arrivee <= maintenant)
      return fait
        ? { libelle: "Voyage effectué", ton: "neutral", icone: "fini" }
        : { libelle: "Confirmée", ton: "success", icone: "valide" }
    }
    case "en_attente_paiement":
      return tenueEcoulee(dossier, maintenant)
        ? {
            libelle: "Délai de paiement écoulé",
            ton: "neutral",
            icone: "expire",
          }
        : { libelle: "Paiement en attente", ton: "warning", icone: "attente" }
    case "annulee":
      return { libelle: "Annulée", ton: "danger", icone: "annule" }
    case "remboursee":
      return { libelle: "Remboursée", ton: "info", icone: "rembourse" }
    case "expiree":
      return {
        libelle: "Délai de paiement écoulé",
        ton: "neutral",
        icone: "expire",
      }
    default:
      return { libelle: "Brouillon", ton: "neutral", icone: "attente" }
  }
}

/** Apparence du billet : un titre éteint ne se présente plus au contrôle. */
export function etatBillet(titre: Titre, dossier: Dossier): BilletEtat {
  switch (titre.status as StatutBillet) {
    case "utilise":
      return "utilise"
    case "annule":
    case "rembourse":
      return "annule"
    case "expire":
      return "expire"
    default:
      return (dossier.trip?.delayMinutes ?? 0) > 0 &&
        dossier.trip?.status !== "termine"
        ? "retard"
        : "valide"
  }
}

/**
 * Le code se montre pour un billet valide ou déjà contrôlé. Un billet non
 * réglé a une charge signée, mais il n'est pas encore un titre de transport :
 * le montrer laisserait croire le contraire.
 */
export function codeAffichable(titre: Titre): string | undefined {
  return titre.status === "valide" || titre.status === "utilise"
    ? titre.barcodePayload
    : undefined
}

const MOYENS: Record<string, string> = {
  especes: "espèces",
  airtel_money: "Airtel Money",
  moov_money: "Moov Money",
  clickpay: "ClickPay",
  visa: "carte Visa",
  mastercard: "carte Mastercard",
  en_compte: "compte entreprise",
}

export function libelleMoyen(methode: string): string {
  return MOYENS[methode] ?? methode
}
