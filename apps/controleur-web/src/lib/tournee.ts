/**
 * Où en est le contrôle : titres contrôlés, voiture par voiture, place par
 * place.
 *
 * « Contrôlés » compte les TITRES distincts, pas les passages : un voyageur
 * contrôlé deux fois reste un voyageur. Un titre compte dès qu'il a été vu —
 * sur ce terminal, ou par un autre agent (statut « utilisé » du manifeste) —,
 * quel qu'ait été le verdict : un refus est un contrôle.
 */

import { memeVoiture } from "./train"
import type { EmbarkedCoach, EmbarkedTicket, LocalScan } from "./offline/types"
import { FAMILLE_DU_VERDICT } from "./verdicts"

/**
 * Un contrôle dit-il quelque chose du titre dont il porte la référence ?
 *
 * Non pour un code illisible (il n'a identifié personne), ni pour une
 * contrefaçon : un faux peut recopier la référence d'un vrai titre, et ce
 * n'est pas le voyageur légitime qui a été refusé.
 */
function concerneLeTitre(scan: LocalScan): boolean {
  return FAMILLE_DU_VERDICT[scan.verdict] !== "lecture" && scan.verdict !== "contrefait"
}

/** Clé d'un titre contrôlé : numéro de billet, ou carte d'abonnement. */
function cleDuControle(scan: LocalScan): string | undefined {
  if (scan.ticketNumber) return scan.ticketNumber
  return scan.subscriptionId ? `abonnement:${scan.subscriptionId}` : undefined
}

/** Titres distincts contrôlés sur la desserte. */
export function titresControles(
  scans: LocalScan[],
  tickets: EmbarkedTicket[]
): Set<string> {
  const vus = new Set<string>()
  for (const scan of scans) {
    if (!concerneLeTitre(scan)) continue
    const cle = cleDuControle(scan)
    if (cle) vus.add(cle)
  }
  for (const ticket of tickets) {
    if (ticket.status === "utilise") vus.add(ticket.number)
  }
  return vus
}

/** Un titre occupe-t-il encore sa place ? Annulé ou remboursé : non. */
export function titreEnCours(ticket: EmbarkedTicket): boolean {
  return ticket.status === "valide" || ticket.status === "utilise"
}

export interface EtatVoiture {
  voiture: EmbarkedCoach
  /** Titres en cours dans la voiture. */
  titres: number
  /** Parmi eux, ceux déjà contrôlés. */
  controles: number
}

export function progressionParVoiture(
  composition: EmbarkedCoach[],
  tickets: EmbarkedTicket[],
  controles: Set<string>
): EtatVoiture[] {
  return composition.map((voiture) => {
    const siens = tickets.filter(
      (t) => titreEnCours(t) && memeVoiture(t.coachLabel, voiture.label)
    )
    return {
      voiture,
      titres: siens.length,
      controles: siens.filter((t) => controles.has(t.number)).length,
    }
  })
}

/** Les quatre états d'une place sur le plan, chacun avec sa forme. */
export type EtatPlace = "controle" | "titre" | "refus" | "libre"

export const LIBELLE_ETAT_PLACE: Record<EtatPlace, string> = {
  controle: "contrôlé",
  titre: "à contrôler",
  refus: "refusé",
  libre: "sans titre",
}

/** Dernier contrôle de ce terminal pour un titre. */
export function dernierControle(
  scans: LocalScan[],
  numero: string
): LocalScan | undefined {
  let dernier: LocalScan | undefined
  for (const scan of scans) {
    if (scan.ticketNumber !== numero || !concerneLeTitre(scan)) continue
    if (!dernier || scan.scannedAt > dernier.scannedAt) dernier = scan
  }
  return dernier
}

/** État d'un titre, tel que le plan et la liste le montrent. */
export function etatDuTitre(ticket: EmbarkedTicket, scans: LocalScan[]): EtatPlace {
  const dernier = dernierControle(scans, ticket.number)
  if (dernier) {
    const famille = FAMILLE_DU_VERDICT[dernier.verdict]
    if (famille === "refus") return "refus"
    if (famille === "accepte" || dernier.verdict === "deja_controle") return "controle"
    return "titre"
  }
  if (ticket.status === "utilise") return "controle"
  if (!titreEnCours(ticket)) return "libre"
  return "titre"
}

export interface Place {
  label: string
  row: number
  column: number
  etat: EtatPlace
  ticket?: EmbarkedTicket
}

/**
 * Plan d'une voiture : ses places, rangée par rangée, avec l'état de chacune.
 *
 * Seuls les titres en cours occupent une place : un titre remboursé l'a
 * rendue. Les places sans titre sont « sans titre » — personne n'y est
 * attendu, ce qui ne veut pas dire que personne n'y est assis.
 */
export function planDeVoiture(
  voiture: EmbarkedCoach,
  tickets: EmbarkedTicket[],
  scans: LocalScan[]
): Place[] {
  const parPlace = new Map<string, EmbarkedTicket>()
  for (const ticket of tickets) {
    if (!ticket.seatLabel || !memeVoiture(ticket.coachLabel, voiture.label)) continue
    const occupant = parPlace.get(ticket.seatLabel)
    // Deux titres sur une même place (segments successifs) : on garde celui
    // qui est en cours.
    if (!occupant || (!titreEnCours(occupant) && titreEnCours(ticket))) {
      parPlace.set(ticket.seatLabel, ticket)
    }
  }
  return voiture.seats.map((seat) => {
    const ticket = parPlace.get(seat.label)
    return {
      ...seat,
      ticket,
      etat: ticket ? etatDuTitre(ticket, scans) : "libre",
    }
  })
}
