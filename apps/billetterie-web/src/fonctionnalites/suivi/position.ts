/**
 * Position ESTIMÉE d'un train, d'après son horaire et le retard annoncé.
 *
 * Ce n'est pas un relevé : le backend ne publie qu'un retard global par
 * desserte, pas de position. On l'applique à tous les arrêts et l'on place la
 * rame là où l'horaire ainsi décalé la mettrait. L'écran le dit en toutes
 * lettres ; ce module ne fait que le calcul, sans horloge ni réseau, pour être
 * vérifiable.
 */

const MINUTE = 60_000

export type ArretHoraire = {
  arrivalAt?: number | null
  departureAt?: number | null
  kilometerPoint: number
}

export type StatutCirculation =
  "planifie" | "a_lheure" | "retarde" | "annule" | "termine"

export type EtatMarche = "avant-depart" | "en-route" | "arrive" | "supprime"

export type Estimation = {
  etat: EtatMarche
  /**
   * Rang d'arrêt fractionnaire (2,4 : entre le 3e et le 4e arrêt), en route
   * seulement. Toujours strictement entre deux arrêts : la rame ne couvre
   * jamais le point d'une gare.
   */
  rame?: number
  /** Arrêts que le train a quittés, d'après l'estimation. */
  passes: boolean[]
  /** Rang du prochain arrêt, en route. */
  prochain?: number
  /** Point kilométrique estimé, en route. */
  km?: number
}

/** Heure d'arrivée à un arrêt, retard compris (le départ, au terminus d'origine). */
export function arriveeEstimee(
  arret: ArretHoraire,
  retardMinutes: number
): number | null {
  const base = arret.arrivalAt ?? arret.departureAt
  return base == null ? null : base + Math.max(0, retardMinutes) * MINUTE
}

/** Heure de départ d'un arrêt, retard compris (l'arrivée, au terminus). */
export function departEstime(
  arret: ArretHoraire,
  retardMinutes: number
): number | null {
  const base = arret.departureAt ?? arret.arrivalAt
  return base == null ? null : base + Math.max(0, retardMinutes) * MINUTE
}

const borner = (valeur: number, min: number, max: number) =>
  Math.min(Math.max(valeur, min), max)

/** Où en est le train, pour la ligne des arrêts. */
export function estimerPosition(
  arrets: ArretHoraire[],
  retardMinutes: number,
  statut: StatutCirculation,
  maintenant: number
): Estimation {
  const n = arrets.length
  const aucun = arrets.map(() => false)
  const tous = arrets.map(() => true)

  if (statut === "annule") return { etat: "supprime", passes: aucun }
  if (statut === "termine") return { etat: "arrive", passes: tous }
  if (n < 2) return { etat: "avant-depart", passes: aucun }

  const departs = arrets.map((arret) => departEstime(arret, retardMinutes))
  const arrivees = arrets.map((arret) => arriveeEstimee(arret, retardMinutes))
  const premier = departs[0]
  const dernier = arrivees[n - 1]
  if (premier == null || dernier == null || maintenant < premier) {
    return { etat: "avant-depart", passes: aucun }
  }
  if (maintenant >= dernier) return { etat: "arrive", passes: tous }

  // Un arrêt est quitté quand son heure de départ estimée est passée. Le
  // terminus ne l'est jamais : on y arrive.
  const passes = arrets.map(
    (_, i) => i < n - 1 && (departs[i] ?? Infinity) <= maintenant
  )
  const quitte = Math.max(0, passes.lastIndexOf(true))
  const suivant = quitte + 1

  const debut = departs[quitte] ?? premier
  const fin = arrivees[suivant] ?? dernier
  // Arrivé en gare mais pas encore reparti : la rame attend juste avant le
  // point de la gare, sans le couvrir.
  const fraction =
    fin > debut ? borner((maintenant - debut) / (fin - debut), 0, 1) : 1

  const kmDebut = arrets[quitte]!.kilometerPoint
  const kmFin = arrets[suivant]!.kilometerPoint
  return {
    etat: "en-route",
    rame: quitte + borner(fraction, 0.02, 0.98),
    passes,
    prochain: suivant,
    km: kmDebut + (kmFin - kmDebut) * fraction,
  }
}

/**
 * Estimation sans les arrêts, pour la liste des trains du jour : la rame va
 * d'un terminus à l'autre à vitesse constante. Plus grossier que
 * `estimerPosition`, suffisant pour dire « entre Ndjolé et Booué ».
 */
export function estimerKmLineaire(
  trajet: {
    departureAt: number
    arrivalAt: number
    delayMinutes: number
    status: StatutCirculation
  },
  kmDepart: number,
  kmArrivee: number,
  maintenant: number
): { etat: EtatMarche; km?: number } {
  if (trajet.status === "annule") return { etat: "supprime" }
  if (trajet.status === "termine") return { etat: "arrive" }
  const retard = Math.max(0, trajet.delayMinutes) * MINUTE
  const debut = trajet.departureAt + retard
  const fin = trajet.arrivalAt + retard
  if (maintenant < debut) return { etat: "avant-depart" }
  if (maintenant >= fin) return { etat: "arrive" }
  const fraction = fin > debut ? (maintenant - debut) / (fin - debut) : 1
  return { etat: "en-route", km: kmDepart + (kmArrivee - kmDepart) * fraction }
}

/**
 * « entre Lopé et Booué », « à Ndjolé » : la position en mots, d'après les
 * gares de la ligne. Géographiquement juste même si le train ne s'arrête pas
 * dans les gares citées.
 */
export function positionEnMots(
  km: number,
  gares: { nom: string; km: number }[],
  sens: "aller" | "retour"
): string {
  const triees = [...gares].sort((a, b) => a.km - b.km)
  const proche = triees.find((gare) => Math.abs(gare.km - km) < 1.5)
  if (proche) return `à ${proche.nom}`
  const avant = [...triees].reverse().find((gare) => gare.km < km)
  const apres = triees.find((gare) => gare.km > km)
  if (!avant || !apres) return "sur la ligne"
  // Dans le sens de marche : la gare quittée d'abord, la suivante ensuite.
  return sens === "aller"
    ? `entre ${avant.nom} et ${apres.nom}`
    : `entre ${apres.nom} et ${avant.nom}`
}
