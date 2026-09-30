import { VOYAGEURS_MAX } from "./voyage"

/**
 * Une recherche de trajet, telle qu'elle vit dans l'adresse :
 * `/resultats?de=OWE&a=FCV&le=2026-10-02&adultes=1&enfants=1`.
 *
 * L'adresse est la source de vérité — une recherche se partage, se
 * recharge, revient avec le bouton retour. Les gares y sont désignées par
 * leur code, lisible et stable, jamais par un identifiant interne.
 */
export interface Recherche {
  de: string
  a: string
  /** Date de circulation, AAAA-MM-JJ. */
  le: string
  adultes: number
  enfants: number
}

type Lecteur = { get(cle: string): string | null }

const DATE = /^\d{4}-\d{2}-\d{2}$/

function entier(valeur: string | null, defaut: number) {
  const n = Number(valeur ?? defaut)
  return Number.isInteger(n) && n >= 0 ? n : defaut
}

/** Lit une recherche complète dans l'adresse ; `null` si elle est incomplète. */
export function lireRecherche(parametres: Lecteur): Recherche | null {
  const de = parametres.get("de")
  const a = parametres.get("a")
  const le = parametres.get("le")
  if (!de || !a || de === a || !le || !DATE.test(le)) return null
  const adultes = entier(parametres.get("adultes"), 1)
  const enfants = entier(parametres.get("enfants"), 0)
  if (adultes < 1 || adultes + enfants > VOYAGEURS_MAX) return null
  return { de, a, le, adultes, enfants }
}

export function parametresRecherche(recherche: Recherche): Record<string, string> {
  return {
    de: recherche.de,
    a: recherche.a,
    le: recherche.le,
    adultes: String(recherche.adultes),
    enfants: String(recherche.enfants),
  }
}

export function voyageurs(recherche: Pick<Recherche, "adultes" | "enfants">): number {
  return recherche.adultes + recherche.enfants
}

/** « 2 voyageurs », « 1 adulte, 1 enfant » */
export function libelleVoyageurs({ adultes, enfants }: Pick<Recherche, "adultes" | "enfants">): string {
  const parties = [`${adultes} adulte${adultes > 1 ? "s" : ""}`]
  if (enfants > 0) parties.push(`${enfants} enfant${enfants > 1 ? "s" : ""}`)
  return parties.join(", ")
}

/**
 * Réductions du groupe, une par voyageur, adultes d'abord : c'est l'ordre
 * dans lequel le backend chiffre le devis et dans lequel le formulaire des
 * voyageurs les présente.
 */
export function codesReduction(recherche: Pick<Recherche, "adultes" | "enfants">, codeEnfant: string | null): string[] | undefined {
  if (!codeEnfant || recherche.enfants === 0) return undefined
  return [...Array<string>(recherche.adultes).fill(""), ...Array<string>(recherche.enfants).fill(codeEnfant)]
}

const CLE_DERNIERE = "setrag:derniere-recherche"

/** La dernière recherche préremplit l'accueil, comme dans une app. */
export function memoriserRecherche(recherche: Recherche) {
  try {
    window.localStorage.setItem(CLE_DERNIERE, JSON.stringify(recherche))
  } catch {
    // Stockage refusé : l'accueil repartira d'un formulaire vide.
  }
}

export function derniereRecherche(): Recherche | null {
  try {
    return lireRechercheMemorisee(window.localStorage.getItem(CLE_DERNIERE))
  } catch {
    return null
  }
}

/** Relit une recherche mémorisée (texte JSON), ou `null` si elle est illisible. */
export function lireRechercheMemorisee(brut: string | null): Recherche | null {
  if (!brut) return null
  try {
    const valeur = JSON.parse(brut) as Record<string, unknown>
    return lireRecherche({ get: (cle) => (valeur[cle] === undefined ? null : String(valeur[cle])) })
  } catch {
    return null
  }
}

/** Texte brut de la dernière recherche : stable d'un rendu à l'autre. */
export function derniereRechercheBrute(): string | null {
  try {
    return window.localStorage.getItem(CLE_DERNIERE)
  } catch {
    return null
  }
}
