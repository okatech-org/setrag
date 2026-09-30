import { ecrireSession, lireSession } from "@/lib/stockage-session"

/**
 * Le brouillon des voyageurs, gardé dans l'onglet (sessionStorage) : un
 * retour arrière ou un rechargement ne fait rien perdre, et rien de
 * personnel ne va dans l'adresse. Un seul brouillon, quel que soit le train :
 * changer de train garde les noms déjà saisis.
 */

export type Sexe = "M" | "F"

export interface BrouillonVoyageur {
  prenom: string
  nom: string
  sexe: Sexe | ""
  /** Date de naissance, AAAA-MM-JJ : demandée pour un enfant. */
  naissance: string
  /** Réduction individuelle (militaire…) ; vide : plein tarif. */
  reduction: string
  urgence: string
  /** D'où vient le préremplissage : « moi » ou l'identifiant d'un voyageur enregistré. */
  source?: string
}

export interface Brouillon {
  voyageurs: BrouillonVoyageur[]
  telephone: string
  email: string
  /** Réservation créée depuis ce brouillon, encore en attente de paiement. */
  enCours?: string
}

const CLE = "setrag:brouillon-voyageurs"

export const VOYAGEUR_VIDE: BrouillonVoyageur = {
  prenom: "",
  nom: "",
  sexe: "",
  naissance: "",
  reduction: "",
  urgence: "",
}

function texte(valeur: unknown) {
  return typeof valeur === "string" ? valeur : ""
}

export function lireBrouillon(): Brouillon {
  try {
    const brut = JSON.parse(
      lireSession(CLE) ?? "null"
    ) as Partial<Brouillon> | null
    return {
      voyageurs: Array.isArray(brut?.voyageurs)
        ? brut.voyageurs.map((v: Partial<BrouillonVoyageur>) => ({
            prenom: texte(v.prenom),
            nom: texte(v.nom),
            sexe: v.sexe === "M" || v.sexe === "F" ? v.sexe : "",
            naissance: texte(v.naissance),
            reduction: texte(v.reduction),
            urgence: texte(v.urgence),
            source: typeof v.source === "string" ? v.source : undefined,
          }))
        : [],
      telephone: texte(brut?.telephone),
      email: texte(brut?.email),
      enCours: typeof brut?.enCours === "string" ? brut.enCours : undefined,
    }
  } catch {
    return { voyageurs: [], telephone: "", email: "" }
  }
}

export function sauverBrouillon(brouillon: Brouillon) {
  ecrireSession(CLE, JSON.stringify(brouillon))
}

/** Autant de voyageurs que la recherche en compte : les noms déjà saisis restent en place. */
export function ajuster(brouillon: Brouillon, nombre: number): Brouillon {
  const voyageurs = Array.from(
    { length: nombre },
    (_, i) => brouillon.voyageurs[i] ?? VOYAGEUR_VIDE
  )
  return { ...brouillon, voyageurs }
}

/** La réservation a été payée : il n'y a plus de tenue à relâcher. */
export function oublierReservationEnCours(reference: string) {
  const brouillon = lireBrouillon()
  if (brouillon.enCours === reference)
    sauverBrouillon({ ...brouillon, enCours: undefined })
}
