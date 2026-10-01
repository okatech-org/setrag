import { useEffect, useState } from "react"

export type Classe = "DEUXIEME" | "PREMIERE" | "VIP"

export const CLASSES: Classe[] = ["DEUXIEME", "PREMIERE", "VIP"]

const LIBELLES_CLASSE: Record<Classe, { court: string; long: string }> = {
  DEUXIEME: { court: "2e", long: "2e classe" },
  PREMIERE: { court: "1re", long: "1re classe" },
  VIP: { court: "VIP", long: "VIP" },
}

export const classeCourte = (classe: Classe) => LIBELLES_CLASSE[classe].court
export const classeLongue = (classe: Classe) => LIBELLES_CLASSE[classe].long

const TYPES_TRAIN: Record<string, string> = {
  EXPRESS: "Express",
  OMNIBUS: "Omnibus",
  AUTORAIL: "Autorail",
  SPECIAL: "Spécial",
}

/** « Express 201 » */
export function nomTrain(type: string, numero: string) {
  return `${TYPES_TRAIN[type] ?? "Train"} ${numero}`
}

export type StatutDesserte = { ton: "ok" | "retard" | "annule"; libelle: string }

/** Statut lisible d'une desserte : toujours un mot, jamais la couleur seule. */
export function statutDesserte(trip: { status: string; delayMinutes: number }): StatutDesserte {
  if (trip.status === "annule") return { ton: "annule", libelle: "Supprimé" }
  if (trip.delayMinutes > 0) return { ton: "retard", libelle: `+${trip.delayMinutes} min` }
  return { ton: "ok", libelle: "À l'heure" }
}

/** Heure courante, rafraîchie à intervalle régulier — comptes à rebours, billets à venir. */
export function useMaintenant(intervalle = 1000) {
  const [maintenant, setMaintenant] = useState(() => Date.now())

  useEffect(() => {
    const minuterie = setInterval(() => setMaintenant(Date.now()), intervalle)
    return () => clearInterval(minuterie)
  }, [intervalle])

  return maintenant
}

/** Gares majeures de la ligne, en gras sur la voie (charte, `GARES_MAJEURES`). */
export const GARES_MAJEURES = new Set(["OWE", "NDJ", "BOO", "LTV", "FCV"])

/** Trajet proposé à la première ouverture : la ligne entière. */
export const DEPART_PAR_DEFAUT = "OWE"
export const ARRIVEE_PAR_DEFAUT = "FCV"

/** Recherche tolérante : sans accents ni majuscules. */
export function simplifier(texte: string) {
  return texte.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr")
}
