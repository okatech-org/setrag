/**
 * Règles métier pures du module GMAO : échéances préventives, cycle de vie
 * d'un ordre de travail, aptitude au départ, indicateurs de fiabilité.
 *
 * Aucune dépendance à la base : chaque règle se teste sans Convex.
 */

export type Famille = "locomotive" | "voiture" | "wagon"
export type StatutEquipement = "en_service" | "immobilise" | "en_atelier" | "reforme"
export type StatutOt =
  | "demande"
  | "planifie"
  | "en_cours"
  | "travaux_termines"
  | "cloture"
  | "annule"
export type Priorite = "urgente" | "haute" | "normale" | "basse"
export type GraviteDefaut = "mineur" | "majeur" | "bloquant"
export type Aptitude = "apte" | "apte_sous_reserve" | "inapte"
export type StatutAchat =
  | "soumise"
  | "validee"
  | "commandee"
  | "recue"
  | "refusee"
  | "annulee"

export const JOUR_MS = 86_400_000
export const HEURE_MS = 3_600_000

/* ------------------------------------------------------------ Libellés */

export const LIBELLES_FAMILLE: Record<Famille, string> = {
  locomotive: "Locomotive",
  voiture: "Voiture voyageurs",
  wagon: "Wagon",
}

export const LIBELLES_STATUT_EQUIPEMENT: Record<StatutEquipement, string> = {
  en_service: "En service",
  immobilise: "Immobilisé",
  en_atelier: "En atelier",
  reforme: "Réformé",
}

export const LIBELLES_STATUT_OT: Record<StatutOt, string> = {
  demande: "Demandé",
  planifie: "Planifié",
  en_cours: "En cours",
  travaux_termines: "Travaux terminés",
  cloture: "Clôturé",
  annule: "Annulé",
}

export const LIBELLES_PRIORITE: Record<Priorite, string> = {
  urgente: "Urgente",
  haute: "Haute",
  normale: "Normale",
  basse: "Basse",
}

export const LIBELLES_APTITUDE: Record<Aptitude, string> = {
  apte: "Apte au départ",
  apte_sous_reserve: "Apte sous réserve",
  inapte: "Inapte — départ bloqué",
}

export const LIBELLES_STATUT_ACHAT: Record<StatutAchat, string> = {
  soumise: "À valider",
  validee: "Validée",
  commandee: "Commandée",
  recue: "Reçue",
  refusee: "Refusée",
  annulee: "Annulée",
}

/* ------------------------------------------------------ Saisie contrôlée */

export function texteRequis(valeur: string, libelle: string, max = 500): string {
  const propre = valeur.trim()
  if (!propre) throw new Error(`${libelle} est obligatoire.`)
  if (propre.length > max) {
    throw new Error(`${libelle} dépasse ${max} caractères.`)
  }
  return propre
}

export function texteFacultatif(
  valeur: string | undefined,
  libelle: string,
  max = 2000
): string | undefined {
  if (valeur === undefined) return undefined
  const propre = valeur.trim()
  if (!propre) return undefined
  if (propre.length > max) {
    throw new Error(`${libelle} dépasse ${max} caractères.`)
  }
  return propre
}

export function entierPositif(valeur: number, libelle: string, max = 1_000_000_000): number {
  if (!Number.isFinite(valeur) || !Number.isInteger(valeur) || valeur <= 0) {
    throw new Error(`${libelle} doit être un entier strictement positif.`)
  }
  if (valeur > max) throw new Error(`${libelle} est hors limite.`)
  return valeur
}

export function nombrePositifOuNul(valeur: number, libelle: string, max = 1e12): number {
  if (!Number.isFinite(valeur) || valeur < 0) {
    throw new Error(`${libelle} doit être un nombre positif.`)
  }
  if (valeur > max) throw new Error(`${libelle} est hors limite.`)
  return valeur
}

/* ------------------------------------------------- Échéances préventives */

export interface PlanSeuils {
  seuilKm?: number
  seuilJours?: number
  alertePct: number
}

export interface Echeance {
  /** Part consommée de l'intervalle : 1 = échéance atteinte. */
  ratio: number
  etat: "a_jour" | "proche" | "echue"
  prochainKm?: number
  kmRestants?: number
  prochaineDate?: number
  joursRestants?: number
  /** Ce qui déclenche en premier : le kilométrage ou le calendrier. */
  declencheur: "km" | "temps"
}

/**
 * Échéance d'un plan pour un engin : le premier des deux seuils atteint
 * (kilométrique ou calendaire) fixe l'état.
 */
export function calculerEcheance(
  plan: PlanSeuils,
  derniereRealisation: { le: number; km: number },
  compteurKm: number,
  maintenant: number
): Echeance {
  let ratioKm = -1
  let ratioTemps = -1
  const resultat: Partial<Echeance> = {}
  if (plan.seuilKm && plan.seuilKm > 0) {
    const parcourus = Math.max(0, compteurKm - derniereRealisation.km)
    ratioKm = parcourus / plan.seuilKm
    resultat.prochainKm = derniereRealisation.km + plan.seuilKm
    resultat.kmRestants = resultat.prochainKm - compteurKm
  }
  if (plan.seuilJours && plan.seuilJours > 0) {
    const ecoules = Math.max(0, maintenant - derniereRealisation.le)
    ratioTemps = ecoules / (plan.seuilJours * JOUR_MS)
    resultat.prochaineDate = derniereRealisation.le + plan.seuilJours * JOUR_MS
    resultat.joursRestants = Math.floor(
      (resultat.prochaineDate - maintenant) / JOUR_MS
    )
  }
  if (ratioKm < 0 && ratioTemps < 0) {
    throw new Error("Un plan préventif doit porter un seuil kilométrique ou calendaire.")
  }
  const ratio = Math.max(ratioKm, ratioTemps)
  const seuilAlerte = 1 - plan.alertePct / 100
  return {
    ...resultat,
    ratio,
    etat: ratio >= 1 ? "echue" : ratio >= seuilAlerte ? "proche" : "a_jour",
    declencheur: ratioKm >= ratioTemps ? "km" : "temps",
  }
}

export function validerSeuilsPlan(plan: {
  seuilKm?: number
  seuilJours?: number
  alertePct: number
  dureeHeures: number
}): void {
  if (!plan.seuilKm && !plan.seuilJours) {
    throw new Error("Indiquez un seuil kilométrique, un seuil calendaire, ou les deux.")
  }
  if (plan.seuilKm !== undefined) entierPositif(plan.seuilKm, "Le seuil kilométrique", 2_000_000)
  if (plan.seuilJours !== undefined) entierPositif(plan.seuilJours, "Le seuil calendaire", 3_650)
  if (!(plan.alertePct >= 1 && plan.alertePct <= 50)) {
    throw new Error("La marge d'alerte doit être comprise entre 1 et 50 %.")
  }
  if (!(plan.dureeHeures > 0 && plan.dureeHeures <= 2_000)) {
    throw new Error("La durée estimée doit être comprise entre 0 et 2 000 heures.")
  }
}

/* ------------------------------------------------- Ordres de travail */

const TRANSITIONS_OT: Record<StatutOt, readonly StatutOt[]> = {
  demande: ["planifie", "annule"],
  planifie: ["planifie", "en_cours", "annule"],
  en_cours: ["travaux_termines"],
  travaux_termines: ["cloture", "en_cours"],
  cloture: [],
  annule: [],
}

export function assertTransitionOt(de: StatutOt, vers: StatutOt): void {
  if (!TRANSITIONS_OT[de].includes(vers)) {
    throw new Error(
      `Transition refusée : un OT « ${LIBELLES_STATUT_OT[de]} » ne peut pas passer à « ${LIBELLES_STATUT_OT[vers]} ».`
    )
  }
}

export const STATUTS_OT_OUVERTS: readonly StatutOt[] = [
  "demande",
  "planifie",
  "en_cours",
  "travaux_termines",
]

export function estOtOuvert(statut: StatutOt): boolean {
  return STATUTS_OT_OUVERTS.includes(statut)
}

/** Un OT est en retard quand sa fin prévue est passée et les travaux non achevés. */
export function estOtEnRetard(
  ot: { statut: StatutOt; finPrevue?: number; demandeLe: number; priorite: Priorite },
  maintenant: number
): boolean {
  if (ot.statut === "planifie" || ot.statut === "en_cours") {
    return ot.finPrevue !== undefined && ot.finPrevue < maintenant
  }
  if (ot.statut === "demande") {
    // Une demande non planifiée dans son délai de prise en compte.
    return maintenant - ot.demandeLe > delaiPriseEnCompteMs(ot.priorite)
  }
  return false
}

export function delaiPriseEnCompteMs(priorite: Priorite): number {
  switch (priorite) {
    case "urgente":
      return 4 * HEURE_MS
    case "haute":
      return 2 * JOUR_MS
    case "normale":
      return 7 * JOUR_MS
    case "basse":
      return 30 * JOUR_MS
  }
}

export function coutTotalOt(ot: {
  coutMainOeuvreFcfa: number
  coutPiecesFcfa: number
  coutExterneFcfa: number
}): number {
  return ot.coutMainOeuvreFcfa + ot.coutPiecesFcfa + ot.coutExterneFcfa
}

export function validerHeures(heures: number): number {
  if (!Number.isFinite(heures) || heures <= 0 || heures > 16) {
    throw new Error("Une saisie de temps est comprise entre 0 et 16 heures par intervenant et par jour.")
  }
  if (Math.round(heures * 4) !== heures * 4) {
    throw new Error("Les heures se saisissent au quart d'heure (0,25).")
  }
  return heures
}

/* -------------------------------------------------- Visite avant départ */

export interface ControleType {
  code: string
  libelle: string
  familles: readonly Famille[]
}

/** Check-list réglementaire de la visite avant départ. */
export const CONTROLES_VISITE: readonly ControleType[] = [
  { code: "FREIN_ESSAI", libelle: "Essai de frein complet (serrage et desserrage)", familles: ["locomotive", "voiture", "wagon"] },
  { code: "CONDUITE_GENERALE", libelle: "Étanchéité de la conduite générale et des boyaux", familles: ["locomotive", "voiture", "wagon"] },
  { code: "ATTELAGES", libelle: "Attelages, tampons et chaînes de sécurité", familles: ["locomotive", "voiture", "wagon"] },
  { code: "ESSIEUX", libelle: "Boîtes d'essieux : échauffement et graissage", familles: ["locomotive", "voiture", "wagon"] },
  { code: "ROUES", libelle: "Roues et bandages : méplats, boudins, fissures", familles: ["locomotive", "voiture", "wagon"] },
  { code: "SUSPENSION", libelle: "Suspension, ressorts et bogies", familles: ["locomotive", "voiture", "wagon"] },
  { code: "CHARGEMENT", libelle: "Chargement, portes de trémie et ranchers", familles: ["wagon"] },
  { code: "PORTES_VOYAGEURS", libelle: "Portes, intercirculations et équipements voyageurs", familles: ["voiture"] },
  { code: "TRACTION", libelle: "Niveaux, fuites et essais de traction", familles: ["locomotive"] },
  { code: "SECURITE_CABINE", libelle: "Veille automatique, radio sol-train, avertisseurs", familles: ["locomotive"] },
  { code: "SIGNAL_QUEUE", libelle: "Signal de fin de convoi", familles: ["locomotive", "voiture", "wagon"] },
]

export function controlesPourFamilles(familles: readonly Famille[]) {
  return CONTROLES_VISITE.filter((controle) =>
    controle.familles.some((famille) => familles.includes(famille))
  ).map((controle) => ({
    code: controle.code,
    libelle: controle.libelle,
    resultat: "ok" as "ok" | "defaut" | "non_applicable",
  }))
}

/** Aptitude la plus favorable que les défauts autorisent. */
export function aptitudeMaximale(defauts: readonly { gravite: GraviteDefaut }[]): Aptitude {
  if (defauts.some((defaut) => defaut.gravite === "bloquant")) return "inapte"
  if (defauts.some((defaut) => defaut.gravite === "majeur")) return "apte_sous_reserve"
  return "apte"
}

const RANG_APTITUDE: Record<Aptitude, number> = {
  apte: 2,
  apte_sous_reserve: 1,
  inapte: 0,
}

/**
 * Le visiteur peut être plus sévère que les défauts relevés, jamais plus
 * indulgent : un défaut bloquant interdit l'aptitude.
 */
export function assertAptitudeAdmise(
  prononcee: Aptitude,
  defauts: readonly { gravite: GraviteDefaut }[]
): void {
  const maximale = aptitudeMaximale(defauts)
  if (RANG_APTITUDE[prononcee] > RANG_APTITUDE[maximale]) {
    throw new Error(
      `Aptitude refusée : les défauts relevés imposent au mieux « ${LIBELLES_APTITUDE[maximale]} ».`
    )
  }
}

export interface DecisionDepart {
  autorise: boolean
  motifs: string[]
  aptitude: Aptitude | null
}

/**
 * Décision de départ d'un convoi : il faut une visite signée, apte ou apte
 * sous réserve, et aucun engin du convoi indisponible.
 */
export function deciderDepart(
  visite: { statut: "en_cours" | "signee"; aptitude?: Aptitude } | null,
  engins: readonly { numero: string; statut: StatutEquipement }[]
): DecisionDepart {
  const motifs: string[] = []
  if (!visite) motifs.push("Aucune visite technique avant départ.")
  else if (visite.statut !== "signee") motifs.push("La visite avant départ n'est pas signée.")
  else if (visite.aptitude === "inapte") motifs.push("Le visiteur de rames a déclaré le convoi inapte.")
  for (const engin of engins) {
    if (engin.statut !== "en_service") {
      motifs.push(`${engin.numero} est ${LIBELLES_STATUT_EQUIPEMENT[engin.statut].toLowerCase()}.`)
    }
  }
  return {
    autorise: motifs.length === 0,
    motifs,
    aptitude: visite?.aptitude ?? null,
  }
}

export function prioriteDefaut(gravite: GraviteDefaut): Priorite {
  return gravite === "bloquant" ? "urgente" : gravite === "majeur" ? "haute" : "normale"
}

/* ------------------------------------------------------------ Stock */

export function sousSeuil(stock: { quantite: number; seuilReappro: number }): boolean {
  return stock.quantite <= stock.seuilReappro
}

/* ------------------------------------------------------ Indicateurs */

/** Part du parc utile (hors réformés) effectivement en service. */
export function disponibilite(
  engins: readonly { statut: StatutEquipement }[]
): { utiles: number; enService: number; taux: number } {
  const utiles = engins.filter((engin) => engin.statut !== "reforme").length
  const enService = engins.filter((engin) => engin.statut === "en_service").length
  return { utiles, enService, taux: utiles === 0 ? 0 : enService / utiles }
}

/**
 * Fiabilité sur une fenêtre : MTBF en jours d'exploitation par défaillance
 * (OT correctifs), MTTR en heures de réparation par OT correctif clôturé.
 */
export function fiabilite(
  params: {
    enginsUtiles: number
    fenetreJours: number
    correctifs: readonly { debutReel?: number; finReelle?: number; statut: StatutOt }[]
  }
): { defaillances: number; mtbfJours: number | null; mttrHeures: number | null } {
  const defaillances = params.correctifs.filter((ot) => ot.statut !== "annule").length
  const repares = params.correctifs.filter(
    (ot) =>
      ot.statut === "cloture" &&
      ot.debutReel !== undefined &&
      ot.finReelle !== undefined &&
      ot.finReelle >= ot.debutReel
  )
  const heuresReparation = repares.reduce(
    (total, ot) => total + (ot.finReelle! - ot.debutReel!) / HEURE_MS,
    0
  )
  const joursExploitation =
    params.enginsUtiles * params.fenetreJours - heuresReparation / 24
  return {
    defaillances,
    mtbfJours:
      defaillances === 0 ? null : Math.round((joursExploitation / defaillances) * 10) / 10,
    mttrHeures:
      repares.length === 0
        ? null
        : Math.round((heuresReparation / repares.length) * 10) / 10,
  }
}

/** Date AAAA-MM-JJ à Libreville. */
export function jourService(horodatage: number): string {
  return new Intl.DateTimeFormat("fr-CA", { timeZone: "Africa/Libreville" }).format(horodatage)
}
