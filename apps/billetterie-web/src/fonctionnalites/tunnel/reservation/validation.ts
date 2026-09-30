import type { Reduction } from "@/fonctionnalites/reference/use-reference"
import { erreurTelephone, lireTelephone } from "@/lib/telephone"

import type { Brouillon } from "./brouillon"

/**
 * Les erreurs du formulaire des voyageurs, champ par champ : chacune dit
 * quoi faire. Clés : identifiants des champs, dans l'ordre de l'écran — le
 * premier en erreur reçoit le focus.
 */

export const idChamp = {
  prenom: (i: number) => `voyageur-${i}-prenom`,
  nom: (i: number) => `voyageur-${i}-nom`,
  sexe: (i: number) => `voyageur-${i}-sexe`,
  naissance: (i: number) => `voyageur-${i}-naissance`,
  urgence: (i: number) => `voyageur-${i}-urgence`,
  telephone: "contact-telephone",
  email: "contact-email",
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/** Âge révolu à une date (AAAA-MM-JJ). */
export function ageLe(naissance: string, date: string): number {
  const [an, mois, jour] = naissance.split("-").map(Number) as [
    number,
    number,
    number,
  ]
  const [anD, moisD, jourD] = date.split("-").map(Number) as [
    number,
    number,
    number,
  ]
  return anD - an - (moisD < mois || (moisD === mois && jourD < jour) ? 1 : 0)
}

export function valider({
  brouillon,
  adultes,
  enfant,
  dateVoyage,
}: {
  brouillon: Brouillon
  adultes: number
  enfant: Reduction | null
  dateVoyage: string
}): Map<string, string> {
  const erreurs = new Map<string, string>()
  brouillon.voyageurs.forEach((v, i) => {
    if (!v.prenom.trim()) erreurs.set(idChamp.prenom(i), "Indiquez le prénom.")
    if (!v.nom.trim()) erreurs.set(idChamp.nom(i), "Indiquez le nom.")
    if (!v.sexe) erreurs.set(idChamp.sexe(i), "Choisissez femme ou homme.")
    if (i >= adultes) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v.naissance)) {
        erreurs.set(
          idChamp.naissance(i),
          "Indiquez la date de naissance : elle justifie le tarif enfant."
        )
      } else if (v.naissance > dateVoyage) {
        erreurs.set(
          idChamp.naissance(i),
          "Cette date de naissance est après le voyage : vérifiez-la."
        )
      } else if (enfant && enfant.minAge !== null && enfant.maxAge !== null) {
        const age = ageLe(v.naissance, dateVoyage)
        if (age < enfant.minAge || age > enfant.maxAge) {
          erreurs.set(
            idChamp.naissance(i),
            `Le tarif enfant vaut de ${enfant.minAge} à ${enfant.maxAge} ans le jour du voyage.${age > enfant.maxAge ? " Au-delà, comptez ce voyageur comme adulte dans la recherche." : ""}`
          )
        }
      }
    }
    if (v.urgence.trim()) {
      const lecture = lireTelephone(v.urgence)
      if (!lecture.ok)
        erreurs.set(idChamp.urgence(i), erreurTelephone(lecture.raison))
    }
  })
  const telephone = lireTelephone(brouillon.telephone)
  if (!telephone.ok) {
    erreurs.set(
      idChamp.telephone,
      telephone.raison === "vide"
        ? "Indiquez un téléphone : il sert à retrouver votre réservation."
        : erreurTelephone(telephone.raison)
    )
  }
  if (brouillon.email.trim() && !EMAIL.test(brouillon.email.trim())) {
    erreurs.set(
      idChamp.email,
      "Adresse à vérifier, par exemple nom@exemple.ga."
    )
  }
  return erreurs
}
