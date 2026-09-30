"use client"

import { useEffect, useState } from "react"

import { chercherParcours } from "@/lib/offline/db"
import type { ParcoursHorsLigne } from "@/lib/offline/types"

/**
 * Parcours enregistré sur l'appareil pour une circulation donnée.
 *
 * Seuls les trains des dossiers du voyageur ont été téléchargés : hors réseau,
 * on ne peut pas suivre n'importe quel train de la ligne, mais on peut suivre
 * le sien — c'est le cas qui compte une fois à bord.
 *
 * `actif` évite d'interroger la base tant que le serveur répond : sa réponse
 * fait autorité, et une lecture locale par frappe de clavier n'apporterait
 * rien.
 */
export function useParcoursLocal(
  trainNumber: string,
  serviceDate: string,
  actif: boolean
): ParcoursHorsLigne | null {
  const numero = trainNumber.trim().toUpperCase()
  const cle = actif && numero && serviceDate ? `${numero}|${serviceDate}` : null

  /**
   * Le résultat est gardé avec la clé qui l'a produit.
   *
   * Ainsi un parcours trouvé pour un train reste invisible dès que le voyageur
   * en saisit un autre, sans avoir à remettre l'état à zéro pendant le rendu :
   * la comparaison de clé suffit, et la lecture asynchrone qui arrive en
   * retard sur une saisie plus récente est ignorée d'elle-même.
   */
  const [resultat, setResultat] = useState<{
    cle: string
    parcours: ParcoursHorsLigne | null
  } | null>(null)

  useEffect(() => {
    if (cle === null) return
    let vivant = true
    const [numeroCherche, dateCherchee] = cle.split("|")
    void chercherParcours(numeroCherche!, dateCherchee!)
      .then((trouve) => {
        if (vivant) setResultat({ cle, parcours: trouve ?? null })
      })
      .catch(() => {
        if (vivant) setResultat({ cle, parcours: null })
      })
    return () => {
      vivant = false
    }
  }, [cle])

  return resultat?.cle === cle ? resultat.parcours : null
}
