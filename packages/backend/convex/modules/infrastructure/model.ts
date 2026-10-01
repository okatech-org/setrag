import type { Infer } from "convex/values"

import type {
  infraBailleurValidator,
  infraCategorieAnomalieValidator,
  infraCategorieEquipementValidator,
  infraCotationValidator,
  infraEtatEquipementValidator,
  infraEtatVoieValidator,
  infraGraviteValidator,
  infraNatureChantierValidator,
  infraStatutAnomalieValidator,
  infraStatutChantierValidator,
  infraStatutInterventionValidator,
  infraStatutLtvValidator,
  infraTypeInspectionValidator,
  infraTypeInterventionValidator,
  infraTypeOuvrageValidator,
  infraTypeTraverseValidator,
} from "./tables"

/**
 * Règles métier pures du module Infrastructures : aucune dépendance à la base,
 * tout se teste sans Convex.
 */

export type Gravite = Infer<typeof infraGraviteValidator>
export type Cotation = Infer<typeof infraCotationValidator>
export type TypeInspection = Infer<typeof infraTypeInspectionValidator>
export type EtatVoie = Infer<typeof infraEtatVoieValidator>
export type TypeTraverse = Infer<typeof infraTypeTraverseValidator>
export type StatutAnomalie = Infer<typeof infraStatutAnomalieValidator>
export type StatutChantier = Infer<typeof infraStatutChantierValidator>
export type StatutIntervention = Infer<typeof infraStatutInterventionValidator>
export type Bailleur = Infer<typeof infraBailleurValidator>
export type CategorieEquipement = Infer<typeof infraCategorieEquipementValidator>

/** Longueur de la ligne Owendo (PK 0) → Franceville (PK 669). */
export const LONGUEUR_LIGNE_KM = 669

export const MINUTE = 60_000
export const HEURE = 60 * MINUTE
export const JOUR = 24 * HEURE

/** Pénalité forfaitaire de freinage et de relance d'une LTV, en minutes. */
export const PENALITE_FREINAGE_MIN = 1

/** Vitesse plancher d'une LTV : en deçà, on interrompt la circulation. */
export const VITESSE_LTV_MIN_KMH = 10

/** Durée maximale d'une plage travaux. */
export const DUREE_MAX_INTERVENTION_MS = 72 * HEURE

/** Tolérance de dépassement des quantités prévues d'un chantier. */
export const TOLERANCE_QUANTITE = 1.1

/* ─────────────────────────── Libellés ─────────────────────────────────── */

export const LIBELLES_GRAVITE: Record<Gravite, string> = {
  faible: "Faible",
  moyenne: "Moyenne",
  elevee: "Élevée",
  critique: "Critique",
}

export const LIBELLES_STATUT_ANOMALIE: Record<StatutAnomalie, string> = {
  signalee: "Signalée",
  prise_en_charge: "Prise en charge",
  traitee: "Traitée, à clore",
  close: "Close",
  rejetee: "Rejetée",
}

export const LIBELLES_CATEGORIE_ANOMALIE: Record<
  Infer<typeof infraCategorieAnomalieValidator>,
  string
> = {
  rail: "Rail",
  traverses: "Traverses",
  ballast: "Ballast",
  geometrie: "Géométrie de la voie",
  talus: "Talus et terrassements",
  ouvrage: "Ouvrage d'art",
  signalisation: "Signalisation",
  passage_niveau: "Passage à niveau",
  telecoms: "Télécommunications",
  vegetation: "Végétation",
  autre: "Autre",
}

export const LIBELLES_ETAT_VOIE: Record<EtatVoie, string> = {
  bon: "Bon",
  moyen: "Moyen",
  degrade: "Dégradé",
  critique: "Critique",
}

export const LIBELLES_TYPE_TRAVERSE: Record<TypeTraverse, string> = {
  bois: "Bois",
  beton_bibloc: "Béton bibloc",
  mixte: "Mixte bois et béton",
}

export const LIBELLES_TYPE_OUVRAGE: Record<
  Infer<typeof infraTypeOuvrageValidator>,
  string
> = {
  pont: "Pont",
  viaduc: "Viaduc",
  tunnel: "Tunnel",
  buse: "Buse",
  dalot: "Dalot",
  mur_soutenement: "Mur de soutènement",
  tranchee: "Tranchée",
}

export const LIBELLES_COTATION: Record<Cotation, string> = {
  "1": "1 — bon état apparent",
  "2": "2 — défauts mineurs",
  "2E": "2E — défauts à surveiller, évolution possible",
  "3": "3 — structure altérée, travaux à programmer",
  "3U": "3U — structure gravement altérée, urgence",
}

export const LIBELLES_TYPE_INSPECTION: Record<TypeInspection, string> = {
  visite_annuelle: "Visite annuelle",
  inspection_detaillee: "Inspection détaillée",
  inspection_exceptionnelle: "Inspection exceptionnelle",
}

export const LIBELLES_CATEGORIE_EQUIPEMENT: Record<CategorieEquipement, string> = {
  signalisation: "Signalisation",
  passage_niveau: "Passage à niveau",
  telecoms: "Télécommunications",
}

export const LIBELLES_ETAT_EQUIPEMENT: Record<
  Infer<typeof infraEtatEquipementValidator>,
  string
> = {
  en_service: "En service",
  degrade: "Dégradé",
  hors_service: "Hors service",
}

export const LIBELLES_STATUT_LTV: Record<Infer<typeof infraStatutLtvValidator>, string> = {
  active: "Active",
  levee: "Levée",
}

export const LIBELLES_NATURE_CHANTIER: Record<
  Infer<typeof infraNatureChantierValidator>,
  string
> = {
  renouvellement_voie: "Renouvellement de voie",
  traverses_beton: "Traverses béton bibloc",
  ballast: "Ballastage",
  ouvrage_art: "Ouvrages d'art",
  stabilisation_talus: "Stabilisation de talus",
  signalisation: "Signalisation",
  telecoms: "Télécommunications",
  assainissement: "Assainissement et drainage",
}

export const LIBELLES_STATUT_CHANTIER: Record<StatutChantier, string> = {
  etude: "En étude",
  en_cours: "En cours",
  suspendu: "Suspendu",
  receptionne: "Réceptionné",
}

export const LIBELLES_BAILLEUR: Record<Bailleur, string> = {
  afd: "AFD",
  sfi: "SFI",
  proparco: "Proparco",
  ue: "Union européenne",
  meridiam: "Meridiam",
  etat: "État gabonais",
  setrag: "SETRAG (fonds propres)",
}

export const LIBELLES_TYPE_INTERVENTION: Record<
  Infer<typeof infraTypeInterventionValidator>,
  string
> = {
  entretien_voie: "Entretien de la voie",
  prn: "Travaux PRN",
  ouvrage: "Ouvrage d'art",
  signalisation: "Signalisation",
  telecoms: "Télécommunications",
  debroussaillage: "Débroussaillage",
}

export const LIBELLES_STATUT_INTERVENTION: Record<StatutIntervention, string> = {
  demandee: "Demandée",
  accordee: "Accordée",
  en_cours: "En cours",
  terminee: "Terminée",
  annulee: "Annulée",
  refusee: "Refusée",
}

export const LIBELLES_STATUT_AVANCEMENT: Record<
  "saisie" | "validee" | "rejetee",
  string
> = {
  saisie: "Saisie, à valider",
  validee: "Validée",
  rejetee: "Rejetée",
}

export type StatutJalon = "atteint" | "a_venir" | "en_retard"

export const LIBELLES_STATUT_JALON: Record<StatutJalon, string> = {
  atteint: "Atteint",
  a_venir: "À venir",
  en_retard: "En retard",
}

/* ─────────────────────────── Anomalies ────────────────────────────────── */

/** Délai de traitement d'une anomalie selon sa gravité. */
export const DELAI_GRAVITE_MS: Record<Gravite, number> = {
  critique: 24 * HEURE,
  elevee: 7 * JOUR,
  moyenne: 30 * JOUR,
  faible: 90 * JOUR,
}

export function echeanceAnomalie(gravite: Gravite, signaleLe: number): number {
  return signaleLe + DELAI_GRAVITE_MS[gravite]
}

const STATUTS_ANOMALIE_OUVERTS: ReadonlySet<StatutAnomalie> = new Set([
  "signalee",
  "prise_en_charge",
  "traitee",
])

/** Ouverte = pas encore close ni rejetée (une anomalie traitée attend sa clôture). */
export function anomalieOuverte(statut: StatutAnomalie): boolean {
  return STATUTS_ANOMALIE_OUVERTS.has(statut)
}

/**
 * En retard : l'échéance est passée sans traitement. Une anomalie traitée
 * n'est plus en retard, même si sa clôture tarde.
 */
export function anomalieEnRetard(
  anomalie: { statut: StatutAnomalie; echeanceLe: number },
  maintenant: number
): boolean {
  return (
    (anomalie.statut === "signalee" || anomalie.statut === "prise_en_charge") &&
    anomalie.echeanceLe < maintenant
  )
}

export const RANG_GRAVITE: Record<Gravite, number> = {
  critique: 0,
  elevee: 1,
  moyenne: 2,
  faible: 3,
}

/* ─────────────────────────── Plages et PK ─────────────────────────────── */

export interface Plage {
  debut: number
  fin: number
}

function normaliser(plage: Plage): Plage {
  return plage.debut <= plage.fin
    ? plage
    : { debut: plage.fin, fin: plage.debut }
}

/**
 * Deux plages se chevauchent si elles partagent une longueur non nulle :
 * [10, 12] et [12, 14] se touchent sans se chevaucher. Bornes dans un ordre
 * quelconque.
 */
export function plagesSeChevauchent(a: Plage, b: Plage): boolean {
  const x = normaliser(a)
  const y = normaliser(b)
  return x.debut < y.fin && y.debut < x.fin
}

/** Même règle pour deux créneaux horaires (début inclus, fin exclue). */
export function creneauxSeChevauchent(a: Plage, b: Plage): boolean {
  return plagesSeChevauchent(a, b)
}

/** Message d'erreur si la plage PK est invalide, sinon `null`. */
export function erreurPlagePk(
  pkDebut: number,
  pkFin: number,
  longueurKm = LONGUEUR_LIGNE_KM
): string | null {
  if (!Number.isFinite(pkDebut) || !Number.isFinite(pkFin)) {
    return "Les points kilométriques doivent être des nombres."
  }
  if (pkDebut < 0) return "Le PK de début ne peut pas être négatif."
  if (pkFin > longueurKm) {
    return `Le PK de fin dépasse la longueur de la ligne (PK ${longueurKm}).`
  }
  if (pkDebut >= pkFin) {
    return "Le PK de début doit être strictement inférieur au PK de fin."
  }
  return null
}

export function assertPlagePk(pkDebut: number, pkFin: number, longueurKm?: number): void {
  const erreur = erreurPlagePk(pkDebut, pkFin, longueurKm)
  if (erreur) throw new Error(erreur)
}

/** Message d'erreur si le PK ponctuel est hors ligne, sinon `null`. */
export function erreurPk(pk: number, longueurKm = LONGUEUR_LIGNE_KM): string | null {
  if (!Number.isFinite(pk)) return "Le point kilométrique doit être un nombre."
  if (pk < 0 || pk > longueurKm) {
    return `Le PK doit être compris entre 0 et ${longueurKm}.`
  }
  return null
}

export function assertPk(pk: number, longueurKm?: number): void {
  const erreur = erreurPk(pk, longueurKm)
  if (erreur) throw new Error(erreur)
}

/**
 * Section qui porte un PK : début inclus, fin exclue, sauf la dernière
 * section qui inclut le terminus.
 */
export function sectionDuPk<T extends { pkDebut: number; pkFin: number }>(
  sections: readonly T[],
  pk: number
): T | null {
  const triees = [...sections].sort((a, b) => a.pkDebut - b.pkDebut)
  const derniere = triees[triees.length - 1]
  for (const section of triees) {
    if (pk >= section.pkDebut && pk < section.pkFin) return section
  }
  if (derniere && pk === derniere.pkFin) return derniere
  return null
}

/** Sections recoupées par une plage PK. */
export function sectionsRecoupees<T extends { pkDebut: number; pkFin: number }>(
  sections: readonly T[],
  plage: Plage
): T[] {
  return sections.filter((section) =>
    plagesSeChevauchent({ debut: section.pkDebut, fin: section.pkFin }, plage)
  )
}

/** Part de traverses béton pondérée par la longueur des sections, en %. */
export function partBetonPonderee(
  sections: readonly { pkDebut: number; pkFin: number; partBetonPct: number }[]
): number {
  let longueur = 0
  let beton = 0
  for (const section of sections) {
    const l = Math.max(0, section.pkFin - section.pkDebut)
    longueur += l
    beton += l * section.partBetonPct
  }
  return longueur === 0 ? 0 : arrondi(beton / longueur, 1)
}

/** Type de traverse déduit de la part de béton. */
export function typeTraverseDepuisPart(partBetonPct: number): TypeTraverse {
  if (partBetonPct >= 100) return "beton_bibloc"
  if (partBetonPct <= 0) return "bois"
  return "mixte"
}

/* ─────────────────────────── LTV ──────────────────────────────────────── */

/**
 * Perte de temps d'une LTV pour un train, en minutes :
 * longueur × (60 / v − 60 / v_nominale) + 1 min de freinage et relance.
 * Arrondie au dixième.
 */
export function perteTempsLtvMinutes(params: {
  longueurKm: number
  vitesseKmh: number
  vitesseNominaleKmh: number
}): number {
  const { longueurKm, vitesseKmh, vitesseNominaleKmh } = params
  if (longueurKm <= 0 || vitesseKmh <= 0 || vitesseKmh >= vitesseNominaleKmh) {
    return 0
  }
  const perte =
    longueurKm * (60 / vitesseKmh - 60 / vitesseNominaleKmh) + PENALITE_FREINAGE_MIN
  return arrondi(perte, 1)
}

/** Message d'erreur si la vitesse d'une LTV est irrecevable, sinon `null`. */
export function erreurVitesseLtv(
  vitesseKmh: number,
  vitesseNominaleKmh: number
): string | null {
  if (!Number.isFinite(vitesseKmh)) return "La vitesse doit être un nombre."
  if (vitesseKmh < VITESSE_LTV_MIN_KMH) {
    return `Une LTV ne descend pas sous ${VITESSE_LTV_MIN_KMH} km/h : en deçà, demandez une interruption de circulation.`
  }
  if (vitesseKmh >= vitesseNominaleKmh) {
    return `La vitesse limitée (${vitesseKmh} km/h) doit être inférieure à la vitesse nominale de la plage (${vitesseNominaleKmh} km/h).`
  }
  return null
}

/* ─────────────────────────── Ouvrages d'art ───────────────────────────── */

/**
 * Surveillance d'un ouvrage d'après sa cotation IQOA.
 *
 * Règle retenue (simplifiée, à valider avec le service Ouvrages d'art) :
 * - 3U : surveillance renforcée, inspection tous les 3 mois ;
 * - 3  : surveillance renforcée, tous les 6 mois ;
 * - 2E : surveillance renforcée, tous les 12 mois ;
 * - 1 ou 2 : surveillance courante, inspection détaillée tous les 36 mois,
 *   ou 12 mois si la dernière visite était une visite annuelle.
 */
export function surveillanceIqoa(
  cotation: Cotation,
  typeInspection: TypeInspection = "inspection_detaillee"
): { surveillanceRenforcee: boolean; periodiciteMois: number } {
  switch (cotation) {
    case "3U":
      return { surveillanceRenforcee: true, periodiciteMois: 3 }
    case "3":
      return { surveillanceRenforcee: true, periodiciteMois: 6 }
    case "2E":
      return { surveillanceRenforcee: true, periodiciteMois: 12 }
    default:
      return {
        surveillanceRenforcee: false,
        periodiciteMois: typeInspection === "visite_annuelle" ? 12 : 36,
      }
  }
}

/** Ajoute des mois calendaires à un horodatage (UTC). */
export function ajouterMois(horodatage: number, mois: number): number {
  const date = new Date(horodatage)
  date.setUTCMonth(date.getUTCMonth() + mois)
  return date.getTime()
}

export const COTATIONS_GRAVES: ReadonlySet<Cotation> = new Set(["3", "3U"])

/* ─────────────────────────── Équipements ──────────────────────────────── */

export function prochaineMaintenance(
  derniereMaintenanceLe: number | undefined,
  periodiciteJours: number
): number | null {
  if (derniereMaintenanceLe === undefined) return null
  return derniereMaintenanceLe + periodiciteJours * JOUR
}

/** Maintenance en retard : dernière maintenance + périodicité dépassée, ou jamais faite. */
export function maintenanceEnRetard(
  derniereMaintenanceLe: number | undefined,
  periodiciteJours: number,
  maintenant: number
): boolean {
  const prochaine = prochaineMaintenance(derniereMaintenanceLe, periodiciteJours)
  return prochaine === null || prochaine < maintenant
}

/* ─────────────────────────── PRN ──────────────────────────────────────── */

export interface SituationAvancement {
  statut: "saisie" | "validee" | "rejetee"
  quantite: number
  montantTravauxFcfa: number
  montantPayeFcfa: number
}

export interface Avancement {
  quantiteRealisee: number
  engageFcfa: number
  payeFcfa: number
  avancementPhysiquePct: number
  avancementFinancierPct: number
}

/**
 * Avancement d'un chantier ou d'un lot, sur les seules situations validées :
 * physique = Σ quantités / prévu ; financier = Σ payé / budget ;
 * engagé = Σ montants de travaux.
 */
export function avancement(
  prevu: { quantitePrevue: number; budgetFcfa: number },
  situations: readonly SituationAvancement[]
): Avancement {
  let quantiteRealisee = 0
  let engageFcfa = 0
  let payeFcfa = 0
  for (const situation of situations) {
    if (situation.statut !== "validee") continue
    quantiteRealisee += situation.quantite
    engageFcfa += situation.montantTravauxFcfa
    payeFcfa += situation.montantPayeFcfa
  }
  return {
    quantiteRealisee,
    engageFcfa,
    payeFcfa,
    avancementPhysiquePct: pourcentage(quantiteRealisee, prevu.quantitePrevue),
    avancementFinancierPct: pourcentage(payeFcfa, prevu.budgetFcfa),
  }
}

/**
 * Contrôle d'une nouvelle situation : le cumul validé plus la saisie ne
 * dépasse pas 110 % du prévu, et le payé cumulé ne dépasse pas le budget.
 */
export function erreurSituation(params: {
  quantitePrevue: number
  budgetFcfa: number
  quantiteValidee: number
  payeValide: number
  quantite: number
  montantPayeFcfa: number
  unite: string
  portee: string
}): string | null {
  const plafond = params.quantitePrevue * TOLERANCE_QUANTITE
  if (params.quantiteValidee + params.quantite > plafond + 1e-9) {
    return `Le cumul (${formatNombre(params.quantiteValidee + params.quantite)} ${params.unite}) dépasserait 110 % de la quantité prévue pour ${params.portee} (${formatNombre(params.quantitePrevue)} ${params.unite}).`
  }
  if (params.payeValide + params.montantPayeFcfa > params.budgetFcfa) {
    return `Le payé cumulé (${formatNombre(params.payeValide + params.montantPayeFcfa)} XAF) dépasserait le budget de ${params.portee} (${formatNombre(params.budgetFcfa)} XAF).`
  }
  return null
}

/** Statut d'un jalon : atteint, à venir, ou en retard si la date prévue est passée. */
export function statutJalon(
  jalon: { prevuLe: number; atteintLe?: number },
  maintenant: number
): StatutJalon {
  if (jalon.atteintLe !== undefined) return "atteint"
  return jalon.prevuLe < maintenant ? "en_retard" : "a_venir"
}

const TRANSITIONS_CHANTIER: Record<StatutChantier, readonly StatutChantier[]> = {
  etude: ["en_cours"],
  en_cours: ["suspendu", "receptionne"],
  suspendu: ["en_cours"],
  receptionne: [],
}

export function transitionChantierPermise(
  de: StatutChantier,
  vers: StatutChantier
): boolean {
  return TRANSITIONS_CHANTIER[de].includes(vers)
}

/** Période d'avancement au format AAAA-MM. */
export function periodeValide(periode: string): boolean {
  const correspondance = /^(\d{4})-(\d{2})$/.exec(periode)
  if (!correspondance) return false
  const mois = Number(correspondance[2])
  return mois >= 1 && mois <= 12
}

/* ─────────────────────────── Circulations impactées ───────────────────── */

export interface Circulation {
  pkOrigine: number
  pkDestination: number
  departureAt: number
  arrivalAt: number
}

/**
 * Un train est impacté si son parcours [PK origine, PK destination] (dans
 * un ordre quelconque) recoupe la plage PK et, quand un créneau est fourni,
 * si son horaire [départ, arrivée] recoupe ce créneau.
 */
export function circulationImpactee(
  circulation: Circulation,
  plage: Plage,
  creneau?: Plage
): boolean {
  const parcours = { debut: circulation.pkOrigine, fin: circulation.pkDestination }
  if (!plagesSeChevauchent(parcours, plage)) return false
  if (!creneau) return true
  return creneauxSeChevauchent(
    { debut: circulation.departureAt, fin: circulation.arrivalAt },
    creneau
  )
}

/** Conflit entre deux plages travaux : même plage, même créneau, et au moins une coupure. */
export function interventionsEnConflit(
  a: { pkDebut: number; pkFin: number; debutLe: number; finLe: number; interruption: boolean },
  b: { pkDebut: number; pkFin: number; debutLe: number; finLe: number; interruption: boolean }
): boolean {
  return (
    (a.interruption || b.interruption) &&
    plagesSeChevauchent({ debut: a.pkDebut, fin: a.pkFin }, { debut: b.pkDebut, fin: b.pkFin }) &&
    creneauxSeChevauchent({ debut: a.debutLe, fin: a.finLe }, { debut: b.debutLe, fin: b.finLe })
  )
}

/* ─────────────────────────── Gares ────────────────────────────────────── */

/** Gares majeures affichées sur le bandeau de ligne. */
export const CODES_GARES_MAJEURES: ReadonlySet<string> = new Set([
  "OWE",
  "NDJ",
  "BOO",
  "LTV",
  "MOA",
  "FCV",
])

const NOMS_GARES_MAJEURES = [
  "owendo",
  "ndjole",
  "booue",
  "lastoursville",
  "lastourville",
  "moanda",
  "franceville",
]

function sansAccents(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
}

export function gareMajeure(gare: { code: string; name: string }): boolean {
  if (CODES_GARES_MAJEURES.has(gare.code)) return true
  const nom = sansAccents(gare.name)
  return NOMS_GARES_MAJEURES.some((majeure) => nom.startsWith(majeure))
}

/* ─────────────────────────── Dates ────────────────────────────────────── */

/** Décalage de Libreville (UTC+1, sans heure d'été). */
const DECALAGE_LIBREVILLE_MS = HEURE

/** Bornes [début, fin) du jour civil à Libreville qui contient l'instant. */
export function bornesJourLibreville(maintenant: number): Plage {
  const local = maintenant + DECALAGE_LIBREVILLE_MS
  const debutLocal = local - (((local % JOUR) + JOUR) % JOUR)
  const debut = debutLocal - DECALAGE_LIBREVILLE_MS
  return { debut, fin: debut + JOUR }
}

/** Période « AAAA-MM » de l'instant, à Libreville. */
export function periodeLibreville(maintenant: number): string {
  const date = new Date(maintenant + DECALAGE_LIBREVILLE_MS)
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`
}

/* ─────────────────────────── Utilitaires ──────────────────────────────── */

export function arrondi(valeur: number, decimales = 0): number {
  const facteur = 10 ** decimales
  return Math.round(valeur * facteur) / facteur
}

export function pourcentage(numerateur: number, denominateur: number): number {
  if (denominateur <= 0) return 0
  return arrondi((numerateur / denominateur) * 100, 1)
}

function formatNombre(valeur: number): string {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(valeur)
}
