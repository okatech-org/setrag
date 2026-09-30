/**
 * Réglages d'affichage du terminal : thème de nuit, son, contraste.
 *
 * Ils vivent dans `localStorage`, pas dans la base embarquée : ils doivent
 * être lus avant le premier rendu (pour ne pas éblouir l'agent la nuit avec
 * un écran clair), valent aussi sur l'écran de connexion, et survivent à la
 * purge de fin de tournée. Aucune donnée personnelle n'y figure.
 */

import { FUSEAU } from "./format"

export type ModeTheme = "auto" | "clair" | "sombre"

export interface Preferences {
  /** `auto` : sombre la nuit, entre `nuitDebut` et `nuitFin`. */
  theme: ModeTheme
  /** Heure de bascule en sombre, « HH:MM », à Libreville. */
  nuitDebut: string
  /** Heure de retour au clair. */
  nuitFin: string
  /** Un son par famille de verdict, en plus de la vibration. */
  son: boolean
  /** Plein soleil : bordures pleines, textes secondaires passés en encre. */
  contraste: boolean
}

export const PREFERENCES_PAR_DEFAUT: Preferences = {
  theme: "auto",
  nuitDebut: "18:30",
  nuitFin: "06:00",
  son: true,
  contraste: false,
}

export const CLE_PREFERENCES = "setrag.controle.preferences"

/**
 * Posé tant qu'un manifeste est embarqué : une tournée est en cours, et le
 * terminal rouvert ne rejoue pas l'animation de démarrage.
 */
export const CLE_EN_TOURNEE = "setrag.controle.en-tournee"

const HEURE = /^([01]\d|2[0-3]):[0-5]\d$/

function lire(): Preferences {
  if (typeof localStorage === "undefined") return PREFERENCES_PAR_DEFAUT
  try {
    const brut = JSON.parse(
      localStorage.getItem(CLE_PREFERENCES) ?? "{}"
    ) as Partial<Preferences>
    return {
      theme:
        brut.theme === "clair" || brut.theme === "sombre" ? brut.theme : "auto",
      nuitDebut: HEURE.test(brut.nuitDebut ?? "")
        ? brut.nuitDebut!
        : PREFERENCES_PAR_DEFAUT.nuitDebut,
      nuitFin: HEURE.test(brut.nuitFin ?? "")
        ? brut.nuitFin!
        : PREFERENCES_PAR_DEFAUT.nuitFin,
      son:
        typeof brut.son === "boolean" ? brut.son : PREFERENCES_PAR_DEFAUT.son,
      contraste: brut.contraste === true,
    }
  } catch {
    return PREFERENCES_PAR_DEFAUT
  }
}

let courantes: Preferences | null = null
const abonnes = new Set<() => void>()

export function preferences(): Preferences {
  courantes ??= lire()
  return courantes
}

export function modifierPreferences(patch: Partial<Preferences>): void {
  courantes = { ...preferences(), ...patch }
  try {
    localStorage.setItem(CLE_PREFERENCES, JSON.stringify(courantes))
  } catch {
    // Stockage plein ou refusé : le réglage vaut pour la séance.
  }
  for (const abonne of abonnes) abonne()
}

export function abonnerPreferences(rappel: () => void): () => void {
  abonnes.add(rappel)
  const surStockage = (event: StorageEvent) => {
    if (event.key !== CLE_PREFERENCES) return
    courantes = lire()
    rappel()
  }
  window.addEventListener("storage", surStockage)
  return () => {
    abonnes.delete(rappel)
    window.removeEventListener("storage", surStockage)
  }
}

function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number) as [number, number]
  return h * 60 + m
}

/** Minutes écoulées depuis minuit, à Libreville. */
export function minutesDuJour(instant: number): number {
  const [h, m] = new Intl.DateTimeFormat("fr-FR", {
    timeZone: FUSEAU,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(instant)
    .split(":")
    .map(Number) as [number, number]
  return (h % 24) * 60 + m
}

/**
 * Fait-il nuit, au sens du réglage ? La plage peut enjamber minuit
 * (18:30 → 06:00) ou non (22:00 → 23:30).
 */
export function estNuit(instant: number, debut: string, fin: string): boolean {
  const ici = minutesDuJour(instant)
  const d = minutes(debut)
  const f = minutes(fin)
  if (d === f) return false
  return d < f ? ici >= d && ici < f : ici >= d || ici < f
}

/** Thème à appliquer, à l'instant dit. */
export function themeVoulu(
  prefs: Preferences,
  instant: number
): "light" | "dark" {
  if (prefs.theme === "clair") return "light"
  if (prefs.theme === "sombre") return "dark"
  return estNuit(instant, prefs.nuitDebut, prefs.nuitFin) ? "dark" : "light"
}
