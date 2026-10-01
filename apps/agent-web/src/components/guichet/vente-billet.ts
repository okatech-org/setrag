import { dateCourte, heure, jourDeService, type Classe } from "@/lib/agent-data"
import type { BrouillonVente, VoyageurBrouillon } from "@/lib/sale-draft"

import type { Categorie, Contexte, Desserte, Gare } from "./donnees"

/**
 * Règles du tunnel de vente de billet, sans interface : catégories de
 * voyageurs, composition du groupe, disponibilité d'une classe.
 */

export const MAX_VOYAGEURS = 9

/** Catégories vendues voyageur par voyageur (les tarifs de groupe à part). */
export function categoriesGuichet(categories: readonly Categorie[] | undefined) {
  return (categories ?? []).filter((c) => c.minPassengers === null)
}

const COURTS: Record<string, string> = {
  ENFANT: "Enfants",
  MILITAIRE: "Militaires",
}

/** Libellé d'une catégorie ; « Adulte » pour le plein tarif. */
export function libelleCategorie(code: string, categories: readonly Categorie[] | undefined, forme: "long" | "compteur" = "long") {
  if (!code) return forme === "compteur" ? "Adultes" : "Adulte"
  const categorie = categories?.find((c) => c.code === code)
  if (forme === "compteur") {
    const court = COURTS[code] ?? categorie?.label ?? code
    const age = categorie?.minAge !== null && categorie?.minAge !== undefined && categorie.maxAge !== null ? ` ${categorie.minAge}–${categorie.maxAge} ans` : ""
    return `${court}${age}`
  }
  return categorie?.label ?? code
}

/** Justificatif à vérifier au guichet, écrit en clair. */
export function justificatif(code: string, categories: readonly Categorie[] | undefined) {
  const categorie = categories?.find((c) => c.code === code)
  if (!categorie) return null
  const remise = `−${categorie.ratePct} %`
  if (!categorie.requiresProof) return remise
  if (categorie.minAge !== null || categorie.maxAge !== null) return `${remise} · âge à vérifier sur pièce`
  if (code === "MILITAIRE") return `${remise} · ordre de mission à présenter`
  return `${remise} · justificatif à présenter`
}

/** Ordre de saisie : adultes, puis chaque catégorie dans l'ordre de la grille. */
export function ordreCategories(categories: readonly Categorie[] | undefined) {
  return ["", ...categoriesGuichet(categories).map((c) => c.code)]
}

/**
 * Voyageurs du groupe, recomposés depuis les compteurs : chacun garde sa
 * saisie tant que sa catégorie compte encore assez de voyageurs.
 */
export function voyageursPourComptes(
  comptes: Record<string, number>,
  ordre: readonly string[],
  existants: readonly VoyageurBrouillon[]
): VoyageurBrouillon[] {
  const restants = [...existants]
  const liste: VoyageurBrouillon[] = []
  for (const code of ordre) {
    for (let i = 0; i < (comptes[code] ?? 0); i += 1) {
      const index = restants.findIndex((v) => v.categorie === code)
      if (index >= 0) liste.push(restants.splice(index, 1)[0]!)
      else liste.push({ categorie: code, nom: "", prenom: "", civilite: "M", telephone: "" })
    }
  }
  return liste
}

export function totalVoyageurs(comptes: Record<string, number>) {
  return Object.values(comptes).reduce((total, n) => total + n, 0)
}

/** Comptes par catégorie, relus depuis la liste des voyageurs. */
export function comptesDepuis(voyageurs: readonly VoyageurBrouillon[]) {
  const comptes: Record<string, number> = {}
  for (const v of voyageurs) comptes[v.categorie] = (comptes[v.categorie] ?? 0) + 1
  return comptes
}

/** Brouillon neuf : la gare du guichet au départ, aujourd'hui, un adulte. */
export function brouillonInitial(contexte: Contexte, gares: readonly Gare[]): BrouillonVente {
  const origine = contexte.pointOfSale.stationId ?? gares[0]?._id ?? ""
  const terminus = [...gares].sort((a, b) => b.kilometerPoint - a.kilometerPoint)
  const arrivee = terminus.find((g) => g._id !== origine)?._id ?? ""
  return {
    version: 2,
    origineId: origine,
    arriveeId: arrivee,
    date: jourDeService(),
    comptes: { "": 1 },
    desserte: null,
    voyageurs: [{ categorie: "", nom: "", prenom: "", civilite: "M", telephone: "" }],
    tenue: null,
    imprimer: true,
    conventionne: false,
  }
}

/** La desserte est-elle partie (retard compris) ? */
export function estPartie(desserte: Pick<Desserte, "departAt" | "delayMinutes">, maintenant = Date.now()) {
  return desserte.departAt + desserte.delayMinutes * 60_000 < maintenant
}

/** Une classe se vend-elle au groupe saisi ? Sinon, pourquoi. */
export function etatClasse(desserte: Desserte, classe: Classe, voyageurs: number, maintenant = Date.now()) {
  const offre = desserte.classes[classe]
  if (!offre) return { vendable: false as const, raison: "Pas de voiture" }
  if (desserte.status === "annule") return { vendable: false as const, raison: "Supprimé" }
  if (estPartie(desserte, maintenant)) return { vendable: false as const, raison: "Train parti" }
  if (offre.prixAdulteTtc === null || offre.totalTtc === null) return { vendable: false as const, raison: "Tarif non publié" }
  if (offre.disponibles < voyageurs) {
    return { vendable: false as const, raison: offre.disponibles === 0 ? "Complet" : `${offre.disponibles} place${offre.disponibles > 1 ? "s" : ""} seulement` }
  }
  return { vendable: true as const }
}

/** « Ven. 2 oct. · 07:40 → 19:25 · 2 voyageurs » — la ligne du résumé. */
export function resumeVente(brouillon: BrouillonVente) {
  const n = brouillon.voyageurs.length
  const voyageurs = `${n} voyageur${n > 1 ? "s" : ""}`
  if (!brouillon.desserte) return `${dateCourte(brouillon.date)} · ${voyageurs}`
  const d = brouillon.desserte
  return `${dateCourte(d.serviceDate)} · ${heure(d.departAt)} → ${heure(d.arriveeAt)} · ${voyageurs}`
}

/** La tenue est-elle encore valable pour cette saisie ? */
export function tenueValable(brouillon: BrouillonVente, signature: string, maintenant = Date.now()) {
  return Boolean(brouillon.tenue && brouillon.tenue.signature === signature && brouillon.tenue.finTenue > maintenant)
}
