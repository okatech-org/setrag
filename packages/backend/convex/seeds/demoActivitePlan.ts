import { addDays, daysBetween, fromServiceDate, toServiceDate, weekdayOf } from "../model/calendar"
import { seedFromDate, seededRandom, weightedPick } from "./history"

/**
 * Activité de démonstration du portail agent — logique PURE.
 *
 * Tout ce qui se décide ici se décide sans base de données : qui voyage, sur
 * quelle desserte, entre quelles gares, à quel guichet, à quelle heure, par
 * quel moyen, et ce qu'il advient ensuite du billet (annulation, remboursement,
 * duplicata). Le tirage est semé par des clés lisibles (date, numéro de
 * train, point de vente) et jamais par des identifiants Convex : deux
 * exécutions, sur deux déploiements, produisent la même activité.
 *
 * C'est ce qui rend le seed rejouable. Chaque vente planifiée porte une clé
 * stable (`clientSaleId`) ; l'écriture vérifie qu'elle n'existe pas avant de
 * l'enregistrer.
 *
 * Les volumes visent l'exploitation réelle du Transgabonais : environ
 * 250 000 voyageurs par an, soit 500 à 700 billets par jour sur deux trains,
 * avec des pointes le vendredi et le dimanche.
 */

/* ═════════════════════════════ Marqueurs ═══════════════════════════════ */

/** Marque tout ce que ce seed écrit, pour le retrouver et le retirer. */
export const MARQUEUR = "demo-activite"
/** Préfixe des clés d'idempotence (`clientSaleId`, `clientScanId`, `clientId`). */
export const PREFIXE = `${MARQUEUR}|`
/** Borne haute d'un balayage d'index sur le préfixe. */
export const PREFIXE_FIN = `${MARQUEUR}|\uffff`
/** Préfixe des identifiants d'authentification du personnel fabriqué. */
export const PREFIXE_AUTH = `${MARQUEUR}-`

/**
 * Contexte porté par chaque entrée d'audit écrite par le seed.
 *
 * Il ne s'affiche pas dans le journal (le champ `context` est technique) et
 * permet au `reset` de retrouver ses entrées sans toucher aux autres.
 */
export const CONTEXTE_AUDIT = JSON.stringify({ source: MARQUEUR })
/** Entrées qui recensent une création ou une modification à défaire. */
export const CONTEXTE_MANIFESTE = JSON.stringify({
  source: MARQUEUR,
  manifeste: true,
})

/* ═══════════════════════════ Tirage semé ═══════════════════════════════ */

export type Rng = () => number

/** Générateur semé par une suite de composants lisibles. */
export function tirage(...parts: ReadonlyArray<string | number>): Rng {
  return seededRandom(seedFromDate(parts.join("|")))
}

export function entier(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1))
}

export function choisir<T>(rng: Rng, valeurs: readonly T[]): T {
  return valeurs[Math.floor(rng() * valeurs.length)]!
}

export { weightedPick as pondere }

/* ══════════════════════════ Réseau commercial ══════════════════════════ */

/** Gares dotées d'un guichet voyageurs tenu par le seed. */
export const GARES_GUICHET = ["OWE", "NDJ", "BOO", "LTV", "MOA", "FCV"] as const
export type GareGuichet = (typeof GARES_GUICHET)[number]

export function codePointDeVenteGare(gare: string): string {
  return `${gare}-PV`
}

/** Agences accréditées créées par le seed, rattachées à une gare de départ. */
export const AGENCES = [
  {
    code: "AG-LBV-MBT",
    name: "Agence accréditée Libreville — Mont-Bouët",
    type: "agence_accreditee" as const,
    gare: "OWE",
    royaltyPct: 5,
  },
  {
    code: "AGP-LBV-GLS",
    name: "Agence premium Libreville — Glass",
    type: "agence_premium" as const,
    gare: "OWE",
    royaltyPct: 3,
  },
  {
    code: "AG-FCV-POT",
    name: "Agence accréditée Franceville — Potos",
    type: "agence_accreditee" as const,
    gare: "FCV",
    royaltyPct: 5,
  },
] as const

/** Flux de numérotation de la vente en ligne, comme `performSale`. */
export const FLUX_LIGNE = "LIGNE"
/** Code retenu par `sales.refund` quand la vente n'a pas de point de vente. */
export const CODE_SANS_POINT_DE_VENTE = "SYS"

/* ═════════════════════════════ Personnel ═══════════════════════════════ */

export type RolePersonnel =
  | "vendeur_guichet"
  | "vendeur_agence"
  | "controleur_train"
  | "chef_gare"
  | "controleur_recettes"
  | "comptable"
  | "admin_fonctionnel"
  | "chef_vente"

export interface AgentSeed {
  readonly cle: string
  readonly prenom: string
  readonly nom: string
  readonly role: RolePersonnel
  readonly matricule: string
  /** Point de vente de rattachement. */
  readonly pointDeVente?: string
  /** Jour de repos hebdomadaire (0 = dimanche) ; absent : pas de roulement. */
  readonly repos?: number
}

/**
 * Personnel fabriqué pour peupler le réseau commercial.
 *
 * Les personas de connexion (`model/demoPersonas.ts`) viennent s'y ajouter
 * quand ils existent : la personne qui se connecte en « Guichetier » retrouve
 * sa caisse et son historique parmi ceux de ses collègues.
 */
export const PERSONNEL: readonly AgentSeed[] = [
  // Owendo — quatre guichets voyageurs.
  { cle: "owe-moussavou", prenom: "Ghislaine", nom: "MOUSSAVOU", role: "vendeur_guichet", matricule: "V-1102", pointDeVente: "OWE-PV", repos: 1 },
  { cle: "owe-ndong-obiang", prenom: "Hervé", nom: "NDONG OBIANG", role: "vendeur_guichet", matricule: "V-1103", pointDeVente: "OWE-PV", repos: 3 },
  { cle: "owe-mba", prenom: "Prisca", nom: "MBA", role: "vendeur_guichet", matricule: "V-1104", pointDeVente: "OWE-PV", repos: 4 },
  { cle: "owe-nze", prenom: "Rodrigue", nom: "NZÉ", role: "vendeur_guichet", matricule: "V-1105", pointDeVente: "OWE-PV", repos: 2 },
  // Ndjolé.
  { cle: "ndj-boussougou", prenom: "Sylvère", nom: "BOUSSOUGOU", role: "vendeur_guichet", matricule: "V-2101", pointDeVente: "NDJ-PV", repos: 2 },
  { cle: "ndj-mintsa", prenom: "Nadège", nom: "MINTSA", role: "vendeur_guichet", matricule: "V-2102", pointDeVente: "NDJ-PV", repos: 4 },
  // Booué.
  { cle: "boo-ella-nguema", prenom: "Aristide", nom: "ELLA NGUEMA", role: "vendeur_guichet", matricule: "V-3101", pointDeVente: "BOO-PV", repos: 1 },
  { cle: "boo-obame", prenom: "Clarisse", nom: "OBAME", role: "vendeur_guichet", matricule: "V-3102", pointDeVente: "BOO-PV", repos: 3 },
  // Lastourville.
  { cle: "ltv-koumba", prenom: "Blaise", nom: "KOUMBA", role: "vendeur_guichet", matricule: "V-4101", pointDeVente: "LTV-PV", repos: 2 },
  { cle: "ltv-mabiala", prenom: "Laurianne", nom: "MABIALA", role: "vendeur_guichet", matricule: "V-4102", pointDeVente: "LTV-PV", repos: 6 },
  // Moanda.
  { cle: "moa-moukagni", prenom: "Fabrice", nom: "MOUKAGNI", role: "vendeur_guichet", matricule: "V-5101", pointDeVente: "MOA-PV", repos: 3 },
  { cle: "moa-ngouoni", prenom: "Gisèle", nom: "NGOUONI", role: "vendeur_guichet", matricule: "V-5102", pointDeVente: "MOA-PV", repos: 1 },
  // Franceville — trois guichets voyageurs.
  { cle: "fcv-oyane", prenom: "Arnaud", nom: "OYANE", role: "vendeur_guichet", matricule: "V-6101", pointDeVente: "FCV-PV", repos: 2 },
  { cle: "fcv-moundounga", prenom: "Chimène", nom: "MOUNDOUNGA", role: "vendeur_guichet", matricule: "V-6102", pointDeVente: "FCV-PV", repos: 4 },
  { cle: "fcv-lekogo", prenom: "Ulrich", nom: "LEKOGO", role: "vendeur_guichet", matricule: "V-6103", pointDeVente: "FCV-PV", repos: 6 },
  // Agences.
  { cle: "ag-mbt-nziengui", prenom: "Estelle", nom: "NZIENGUI", role: "vendeur_agence", matricule: "VA-7101", pointDeVente: "AG-LBV-MBT", repos: 0 },
  { cle: "agp-gls-okouma", prenom: "Mireille", nom: "OKOUMA", role: "vendeur_agence", matricule: "VA-7201", pointDeVente: "AGP-LBV-GLS", repos: 0 },
  { cle: "ag-pot-maganga", prenom: "Brice", nom: "MAGANGA", role: "vendeur_agence", matricule: "VA-7301", pointDeVente: "AG-FCV-POT", repos: 0 },
  // Contrôleurs à bord, rattachés à la gare de prise de service.
  { cle: "ctl-mouele", prenom: "Serge", nom: "MOUELE", role: "controleur_train", matricule: "C-4105", pointDeVente: "OWE-PV" },
  { cle: "ctl-bekale", prenom: "Landry", nom: "BEKALE", role: "controleur_train", matricule: "C-4106", pointDeVente: "OWE-PV" },
  { cle: "ctl-nzamba", prenom: "Franck", nom: "NZAMBA", role: "controleur_train", matricule: "C-4107", pointDeVente: "FCV-PV" },
  { cle: "ctl-minko", prenom: "Steeve", nom: "MINKO", role: "controleur_train", matricule: "C-4108", pointDeVente: "FCV-PV" },
  // Encadrement et fonctions support.
  { cle: "chef-owe-mboumba", prenom: "Jean-Marie", nom: "MBOUMBA", role: "chef_gare", matricule: "G-6101", pointDeVente: "OWE-PV" },
  { cle: "chef-fcv-ondo", prenom: "Pascal", nom: "ONDO", role: "chef_gare", matricule: "G-6102", pointDeVente: "FCV-PV" },
  { cle: "chef-ltv-ivala", prenom: "Célestin", nom: "IVALA", role: "chef_gare", matricule: "G-6103", pointDeVente: "LTV-PV" },
  { cle: "rec-nguema", prenom: "Honorine", nom: "NGUEMA", role: "controleur_recettes", matricule: "R-5102" },
  { cle: "cpt-bekale", prenom: "Sandrine", nom: "BEKALE", role: "comptable", matricule: "K-7102" },
  { cle: "adm-obiang", prenom: "Yannick", nom: "OBIANG", role: "admin_fonctionnel", matricule: "A-0103" },
  { cle: "cv-mintsa", prenom: "Armel", nom: "MINTSA", role: "chef_vente", matricule: "CV-0201" },
]

/** Adresse de messagerie professionnelle d'un agent fabriqué. */
export function emailAgent(agent: Pick<AgentSeed, "prenom" | "nom">): string {
  return `${sansAccent(agent.prenom)}.${sansAccent(agent.nom)}@setrag.ga`
    .toLowerCase()
    .replaceAll(" ", "-")
}

export function sansAccent(texte: string): string {
  return texte.normalize("NFD").replace(/[̀-ͯ]/g, "")
}

/** Vrai si l'agent tient sa caisse ce jour-là (un jour de repos par semaine). */
export function travaille(agent: Pick<AgentSeed, "repos">, date: string): boolean {
  return agent.repos === undefined || weekdayOf(date) !== agent.repos
}

/* ═══════════════════════════ Identités voyageurs ═══════════════════════ */

const NOMS = [
  "MBADINGA", "NZENG", "OBAME", "ONDO", "MOUSSAVOU", "BOUKANDOU", "NGUEMA",
  "MBOUMBA", "OYANE", "IVALA", "MOUELE", "BEKALE", "ELLA", "NDONG", "MINKO",
  "LEKOGO", "MAGANGA", "BOUSSOUGOU", "MABIKA", "NZAMBA", "MBA", "NZÉ",
  "MINTSA", "KOUMBA", "MABIALA", "OBIANG", "MOUNDOUNGA", "NGOUONI",
  "MOUKAGNI", "NZIENGUI", "OKOUMA", "ONANGA", "MAKAYA", "BIYOGHE", "ESSONO",
  "MEYE", "NTOUTOUME", "OVONO", "ALLOGO", "EYEGHE", "MOUITY", "IBINGA",
  "DITENGOU", "MOUSSOUNDA", "BOUANGA", "NDOUMBA", "MOUNGUENGUI", "KOMBILA",
  "NGOMA", "IKAPI", "NDONG OBIANG", "ELLA NGUEMA", "MBA ABESSOLE",
  "NZÉ ONDO", "OBAME NGUEMA", "MOUSSAVOU BOUSSOUGOU",
] as const

const PRENOMS_H = [
  "Paul", "Jean", "Serge", "Landry", "Ulrich", "Steeve", "Franck", "Aristide",
  "Brice", "Rodrigue", "Hervé", "Blaise", "Fabrice", "Arnaud", "Guy-Roger",
  "Jean-Pierre", "Christian", "Stéphane", "Gildas", "Yannick", "Wilfried",
  "Davy", "Loïc", "Anicet", "Omer", "Rufin", "Thierry", "Didier",
] as const

const PRENOMS_F = [
  "Marie", "Sylvie", "Chantal", "Nadège", "Prisca", "Ornella", "Bénédicte",
  "Laurianne", "Gaëlle", "Estelle", "Ghislaine", "Clarisse", "Gisèle",
  "Chimène", "Mireille", "Honorine", "Sandrine", "Nicole", "Pélagie",
  "Rachelle", "Judith", "Flore", "Aurore", "Dorothée", "Bertille",
] as const

const PRENOMS_ENFANTS = [
  "Kévin", "Ryan", "Exaucé", "Emmanuel", "Grâce", "Merveille", "Divine",
  "Précieuse", "Jordan", "Océane", "Christ", "Bénie",
] as const

const NATIONALITES = [
  ["Gabonaise", 88],
  ["Camerounaise", 4],
  ["Congolaise", 3],
  ["Équato-guinéenne", 2],
  ["Française", 1.5],
  ["Sénégalaise", 1],
  ["Béninoise", 0.5],
] as const

export interface VoyageurPlanifie {
  readonly lastName: string
  readonly firstName: string
  readonly gender: "M" | "F"
  readonly phone?: string
  readonly emergencyPhone?: string
  readonly birthDate?: string
  readonly nationality?: string
  readonly documentNumber?: string
  readonly discountCode?: "ENFANT" | "MILITAIRE" | "GROUPE_10_49"
}

/** Numéro mobile gabonais : Airtel en 07, Moov en 06. */
export function telephone(rng: Rng, operateur?: "airtel" | "moov"): string {
  const airtel = operateur ? operateur === "airtel" : rng() < 0.64
  const prefixe = airtel ? choisir(rng, ["74", "76", "77"]) : choisir(rng, ["62", "65", "66"])
  const deux = () => String(entier(rng, 0, 99)).padStart(2, "0")
  return `+241 0${prefixe[0]} ${prefixe[1]}${entier(rng, 0, 9)} ${deux()} ${deux()}`
}

function adulte(rng: Rng, nom?: string): VoyageurPlanifie {
  const homme = rng() < 0.52
  const nationalite = weightedPick(rng, NATIONALITES)
  return {
    lastName: nom ?? choisir(rng, NOMS),
    firstName: choisir(rng, homme ? PRENOMS_H : PRENOMS_F),
    gender: homme ? "M" : "F",
    phone: telephone(rng),
    emergencyPhone: rng() < 0.6 ? telephone(rng) : undefined,
    nationality: nationalite,
    documentNumber:
      rng() < 0.55
        ? nationalite === "Gabonaise"
          ? `CNI ${entier(rng, 100, 999)} ${entier(rng, 100, 999)} ${entier(rng, 100, 999)}`
          : `PASS ${String.fromCharCode(65 + entier(rng, 0, 25))}${entier(rng, 1_000_000, 9_999_999)}`
        : undefined,
  }
}

function enfant(rng: Rng, nom: string, serviceDate: string): VoyageurPlanifie {
  const age = entier(rng, 4, 11)
  const annee = Number(serviceDate.slice(0, 4)) - age - 1
  return {
    lastName: nom,
    firstName: choisir(rng, PRENOMS_ENFANTS),
    gender: rng() < 0.5 ? "M" : "F",
    birthDate: `${annee}-${String(entier(rng, 1, 12)).padStart(2, "0")}-${String(entier(rng, 1, 28)).padStart(2, "0")}`,
    nationality: "Gabonaise",
    discountCode: "ENFANT",
  }
}

/* ═════════════════════════ Desserte à planifier ════════════════════════ */

export type Classe = "DEUXIEME" | "PREMIERE" | "VIP"
export type Canal = "guichet" | "agence" | "ligne" | "bord"
export type Moyen =
  | "especes"
  | "airtel_money"
  | "moov_money"
  | "clickpay"
  | "visa"
  | "mastercard"
  | "en_compte"

export interface ArretPlan {
  readonly code: string
  readonly km: number
  /** Départ de l'arrêt ; absent au terminus. */
  readonly departAt?: number
  readonly arriveeAt?: number
}

export interface DessertePlan {
  /** Clé stable : `AAAA-MM-JJ|TR-201`. */
  readonly cle: string
  readonly serviceDate: string
  readonly trainNumber: string
  readonly trainType: string
  readonly departureAt: number
  readonly arrivalAt: number
  readonly arrets: readonly ArretPlan[]
  /** Places assises par classe. */
  readonly capacites: Partial<Record<Classe, number>>
  /** Suppression de la desserte : plus aucune vente après cet instant. */
  readonly supprimeeA?: number
}

export interface CadrePlan {
  /** Premier jour de la fenêtre d'activité. */
  readonly debut: string
  /** Coefficient de volume, 1 en exploitation normale. */
  readonly echelle: number
  /** Codes des agences disponibles, par gare de départ. */
  readonly agences: Readonly<Record<string, readonly string[]>>
  /** Un client en compte existe : la vente en compte est possible. */
  readonly venteEnCompte: boolean
}

export interface EvenementApresVente {
  readonly a: number
  readonly motif: string
}

export interface VentePlanifiee {
  /** Clé stable, suffixe du `clientSaleId`. */
  readonly cle: string
  readonly desserte: string
  readonly classe: Classe
  readonly de: number
  readonly a: number
  readonly voyageurs: readonly VoyageurPlanifie[]
  readonly canal: Canal
  /** Flux de numérotation : code du point de vente, ou `LIGNE`. */
  readonly flux: string
  readonly venteA: number
  readonly jour: string
  /** Rang du vendeur parmi les caisses ouvertes du flux ce jour-là. */
  readonly vendeur: number
  readonly moyen: Moyen
  readonly contact?: { email: string; phone: string }
  /** Voyageur de démonstration titulaire du compte, en ligne. */
  readonly client?: 0 | 1
  readonly bagage?: { poids: number; pieces: number; description: string }
  readonly taa?: { tonnage: number; vehicule: string }
  readonly annulation?: EvenementApresVente
  readonly remboursement?: EvenementApresVente & {
    penalite: "anticipee" | "tardive" | "suppression"
  }
  readonly duplicata?: EvenementApresVente
}

/* ──────────────────────────── Fréquentation ──────────────────────────── */

/** Pointe du vendredi et du dimanche, creux du mardi et du mercredi. */
const FACTEUR_JOUR = [1.24, 0.93, 0.84, 0.86, 0.92, 1.26, 0.98] as const

const CHARGE_CLASSE: Record<Classe, number> = {
  DEUXIEME: 0.7,
  PREMIERE: 0.62,
  VIP: 0.52,
}

/**
 * Taux d'occupation visé sur le tronçon le plus chargé.
 *
 * L'Omnibus est un peu moins demandé que l'Express ; la dispersion évite que
 * deux trains du même jour affichent un remplissage identique.
 */
export function chargeVisee(desserte: DessertePlan, classe: Classe, rng: Rng): number {
  const jour = FACTEUR_JOUR[weekdayOf(desserte.serviceDate)]!
  const train = desserte.trainType === "EXPRESS" ? 1 : 0.95
  const bruit = 0.9 + rng() * 0.16
  return Math.min(0.97, CHARGE_CLASSE[classe] * jour * train * bruit)
}

/** Poids d'embarquement et de descente par gare. */
const POIDS_MONTEE: Record<string, number> = {
  OWE: 52, FCV: 52, NDJ: 11, BOO: 10, LTV: 10, MOA: 9, NTM: 3, LOP: 2.5,
  IVI: 1.5, OTO: 1.5, MOU: 1.2,
}
const POIDS_DESCENTE: Record<string, number> = {
  OWE: 45, FCV: 45, MOA: 14, LTV: 13, BOO: 11, NDJ: 10, LOP: 3, NTM: 2,
  IVI: 1.5, OTO: 1.2,
}

function tirerTrajet(rng: Rng, arrets: readonly ArretPlan[]): [number, number] {
  const departs = arrets
    .slice(0, -1)
    .map((a, i) => [i, POIDS_MONTEE[a.code] ?? 0.8] as const)
  const de = weightedPick(rng, departs)
  const arrivees = arrets
    .map((a, i) => [i, POIDS_DESCENTE[a.code] ?? 0.8] as const)
    .filter(([i]) => i > de)
  return [de, weightedPick(rng, arrivees)]
}

const TAILLES_GROUPE = [
  [1, 68], [2, 18], [3, 8], [4, 4], [5, 1.5], [6, 0.5],
] as const

/* ──────────────────────────── Canal et moyen ─────────────────────────── */

function tirerCanal(
  rng: Rng,
  classe: Classe,
  gareMontee: string,
  cadre: CadrePlan
): Canal {
  const guichet = (GARES_GUICHET as readonly string[]).includes(gareMontee)
  const agences = (cadre.agences[gareMontee] ?? []).length > 0
  if (!guichet) {
    return weightedPick(rng, [["ligne", 42], ["bord", 58]] as const)
  }
  if (classe === "VIP") {
    return weightedPick(rng, [
      ["guichet", 45], ["agence", agences ? 20 : 0], ["ligne", 35],
    ] as const)
  }
  return weightedPick(rng, [
    ["guichet", 62], ["agence", agences ? 13 : 0], ["ligne", 19], ["bord", 6],
  ] as const)
}

const MOYENS: Record<Canal, ReadonlyArray<readonly [Moyen, number]>> = {
  guichet: [
    ["especes", 70], ["airtel_money", 15], ["moov_money", 8], ["visa", 3],
    ["mastercard", 2], ["en_compte", 2],
  ],
  agence: [
    ["especes", 55], ["airtel_money", 20], ["moov_money", 10], ["visa", 10],
    ["mastercard", 5],
  ],
  ligne: [
    ["airtel_money", 45], ["moov_money", 20], ["clickpay", 10], ["visa", 17],
    ["mastercard", 8],
  ],
  bord: [["especes", 85], ["airtel_money", 10], ["moov_money", 5]],
}

function tirerMoyen(rng: Rng, canal: Canal, gare: string, cadre: CadrePlan): Moyen {
  const moyen = weightedPick(rng, MOYENS[canal])
  if (moyen !== "en_compte") return moyen
  // La vente en compte sert les grands clients conventionnés, présents aux
  // extrémités de la ligne et à Moanda (COMILOG).
  return cadre.venteEnCompte && ["OWE", "MOA", "FCV"].includes(gare)
    ? "en_compte"
    : "especes"
}

/* ──────────────────────────── Anticipation ───────────────────────────── */

const ANTICIPATION: Record<Canal, ReadonlyArray<readonly [number, number]>> = {
  guichet: [[0, 58], [1, 17], [2, 7], [3, 5], [5, 5], [7, 4], [10, 2], [14, 2]],
  agence: [[0, 20], [1, 18], [2, 12], [3, 10], [5, 12], [7, 12], [10, 8], [14, 8]],
  ligne: [[0, 15], [1, 20], [2, 12], [3, 10], [5, 10], [7, 8], [10, 8], [14, 9], [21, 8]],
  bord: [[0, 100]],
}

/** Instant local d'un jour de service, en minutes depuis minuit. */
function instant(date: string, minutes: number): number {
  return fromServiceDate(date, "00:00") + minutes * 60_000
}

/**
 * Instant de la vente.
 *
 * Au guichet, la vente du jour même se fait avant le passage du train à la
 * gare de montée, pendant les heures d'ouverture ; la veille ou avant, elle
 * se répartit sur la journée avec un creux à la mi-journée.
 */
function tirerInstant(
  rng: Rng,
  canal: Canal,
  jour: string,
  desserte: DessertePlan,
  montee: ArretPlan
): number | null {
  const passage = montee.departAt ?? desserte.departureAt
  if (canal === "bord") {
    const t = passage + entier(rng, 6, 45) * 60_000
    return toServiceDate(t) === desserte.serviceDate ? t : null
  }
  const [ouverture, fermeture] =
    canal === "ligne" ? [6 * 60, 23 * 60 + 30] : canal === "agence" ? [8 * 60, 18 * 60] : [6 * 60 + 10, 18 * 60 + 50]
  let debut = instant(jour, ouverture)
  let fin = instant(jour, fermeture)
  if (jour === desserte.serviceDate) {
    const marge = canal === "ligne" ? 60 : 15
    fin = Math.min(fin, passage - marge * 60_000)
  }
  if (fin <= debut) return null
  // Deux pointes : l'ouverture et la fin d'après-midi.
  const u = rng()
  const forme = u < 0.5 ? Math.sqrt(u / 2) : 1 - Math.sqrt((1 - u) / 2)
  const t = debut + Math.floor(forme * (fin - debut))
  debut = t - (t % 60_000)
  return debut + entier(rng, 0, 59) * 1_000
}

/* ─────────────────────────── Après-vente ─────────────────────────────── */

export const MOTIFS_ANNULATION = [
  "Erreur de vente",
  "Erreur de vente — mauvaise date saisie",
  "Erreur de vente — classe non souhaitée",
] as const

/** Motifs repris du paramétrage par défaut (`functions/pilotage.ts`). */
export const MOTIFS_REMBOURSEMENT = [
  ["Changement de programme", 60],
  ["Raison médicale", 18],
  ["Retard de plus de deux heures", 7],
  ["Erreur de vente", 5],
] as const

export const MOTIF_SUPPRESSION =
  "Train supprimé — déraillement d'un train minéralier entre Lastourville et Moanda"

const MOTIFS_DUPLICATA = [
  "Billet perdu",
  "Billet illisible (impression pâle)",
  "Billet abîmé",
] as const

const DESCRIPTIONS_BAGAGE = [
  "Valise", "Sac de voyage", "Carton ficelé", "Glacière", "Sac de riz",
  "Malle en fer", "Régime de bananes plantain", "Bidon de 20 litres",
] as const

const VEHICULES = [
  "Toyota Hilux double cabine", "Toyota Land Cruiser", "Mitsubishi L200",
  "Hyundai Tucson", "Nissan Navara",
] as const

/* ═════════════════════════ Plan d'une desserte ═════════════════════════ */

/**
 * Toutes les ventes d'une desserte, de la première réservation au départ.
 *
 * Le plan simule la charge tronçon par tronçon et s'arrête au taux visé :
 * les trajets courts libèrent des places revendues plus loin, exactement
 * comme l'inventaire par segment le permet au guichet.
 */
export function planifierDesserte(
  desserte: DessertePlan,
  cadre: CadrePlan
): VentePlanifiee[] {
  const ventes: VentePlanifiee[] = []
  const segments = desserte.arrets.length - 1
  if (segments < 1) return ventes

  for (const classe of ["VIP", "PREMIERE", "DEUXIEME"] as const) {
    const places = desserte.capacites[classe] ?? 0
    if (places === 0) continue
    const rng = tirage(MARQUEUR, desserte.cle, classe)
    const cible = Math.round(places * chargeVisee(desserte, classe, rng) * cadre.echelle)
    const charge = new Array<number>(segments).fill(0)
    let echecs = 0
    let n = 0

    // Un groupe scolaire ou paroissial de temps à autre, en 2de classe.
    const groupe =
      classe === "DEUXIEME" && rng() < 0.05 && cadre.echelle >= 0.5
        ? entier(rng, 10, 16)
        : 0

    while (echecs < 80) {
      const pic = Math.max(...charge)
      if (pic >= cible) break
      const [de, a] = tirerTrajet(rng, desserte.arrets)
      let taille: number = weightedPick(rng, TAILLES_GROUPE)
      if (groupe > 0 && n === 3) taille = groupe
      const occupe = Math.max(...charge.slice(de, a))
      if (occupe + taille > cible) {
        echecs += 1
        continue
      }
      const vente = planifierVente(rng, desserte, cadre, classe, de, a, taille, n)
      n += 1
      if (!vente) continue
      for (let s = de; s < a; s += 1) charge[s]! += taille
      // Vendu avant la fenêtre : la place est prise, mais la vente n'est pas
      // reconstituée — sinon le premier jour de la fenêtre porterait à lui
      // seul trois semaines de ventes anticipées.
      if (vente !== AVANT_FENETRE) ventes.push(vente)
    }
  }
  return ventes
}

/** Vente antérieure à la fenêtre d'activité. */
const AVANT_FENETRE = "avant-fenetre" as const

function planifierVente(
  rng: Rng,
  desserte: DessertePlan,
  cadre: CadrePlan,
  classe: Classe,
  de: number,
  a: number,
  taille: number,
  rang: number
): VentePlanifiee | typeof AVANT_FENETRE | null {
  const montee = desserte.arrets[de]!
  const descente = desserte.arrets[a]!
  let canal = tirerCanal(rng, classe, montee.code, cadre)
  if (taille >= 10) canal = "guichet"
  if (canal === "bord" && taille > 2) canal = "ligne"

  // Anticipation, bornée au début de la fenêtre d'activité.
  let anticipation = weightedPick(rng, ANTICIPATION[canal])
  // Les agences ferment le dimanche : l'achat se fait la veille.
  if (canal === "agence" && weekdayOf(addDays(desserte.serviceDate, -anticipation)) === 0) {
    anticipation += 1
  }
  if (daysBetween(cadre.debut, desserte.serviceDate) < 0) return null
  if (anticipation > daysBetween(cadre.debut, desserte.serviceDate)) return AVANT_FENETRE
  const jour = addDays(desserte.serviceDate, -anticipation)
  if (canal === "agence" && weekdayOf(jour) === 0) canal = "guichet"

  let venteA = tirerInstant(rng, canal, jour, desserte, montee)
  if (venteA === null && canal === "bord") {
    canal = "ligne"
    venteA = tirerInstant(rng, canal, jour, desserte, montee)
  }
  if (venteA === null) return null
  if (desserte.supprimeeA !== undefined && venteA >= desserte.supprimeeA) return null

  const flux =
    canal === "ligne"
      ? FLUX_LIGNE
      : canal === "agence"
        ? choisir(rng, cadre.agences[montee.code] ?? [codePointDeVenteGare(montee.code)])
        : canal === "bord"
          ? desserte.trainNumber === "TR-202"
            ? "FCV-PV"
            : "OWE-PV"
          : codePointDeVenteGare(montee.code)

  // Composition du groupe : une famille partage souvent le même nom.
  const voyageurs: VoyageurPlanifie[] = []
  const chef = adulte(rng)
  if (taille >= 10) {
    for (let i = 0; i < taille; i += 1) {
      voyageurs.push({ ...adulte(rng), discountCode: "GROUPE_10_49" })
    }
  } else {
    const militaire = taille === 1 && chef.gender === "M" && rng() < 0.03
    voyageurs.push(
      militaire
        ? {
            ...chef,
            discountCode: "MILITAIRE",
            documentNumber: `OM ${entier(rng, 1000, 9999)}/MDN/EMG`,
          }
        : chef
    )
    for (let i = 1; i < taille; i += 1) {
      voyageurs.push(
        rng() < 0.45 ? enfant(rng, chef.lastName, desserte.serviceDate) : adulte(rng, rng() < 0.6 ? chef.lastName : undefined)
      )
    }
  }

  const moyen = tirerMoyen(rng, canal, montee.code, cadre)
  const km = Math.abs(descente.km - montee.km)
  const cle = `${desserte.cle}|${classe}|${rang}`
  const depart = montee.departAt ?? desserte.departureAt

  const contact =
    canal === "ligne"
      ? {
          email: `${sansAccent(chef.firstName)}.${sansAccent(chef.lastName)}${entier(rng, 1, 99)}@${choisir(rng, ["gmail.com", "yahoo.fr", "outlook.fr"])}`
            .toLowerCase()
            .replaceAll(" ", ""),
          phone: chef.phone ?? telephone(rng),
        }
      : undefined

  const bagage =
    canal === "guichet" && km > 150 && taille < 10 && rng() < 0.11
      ? { poids: entier(rng, 9, 29), pieces: entier(rng, 1, 2), description: choisir(rng, DESCRIPTIONS_BAGAGE) }
      : undefined

  const taa =
    canal === "guichet" && km > 400 && classe !== "VIP" && ["OWE", "FCV"].includes(montee.code) && rng() < 0.004
      ? { tonnage: entier(rng, 14, 26) / 10, vehicule: choisir(rng, VEHICULES) }
      : undefined

  // Après-vente. Une annulation corrige une erreur au comptoir, dans les
  // minutes qui suivent ; un remboursement intervient plus tard, jamais le
  // jour même de l'achat.
  let annulation: VentePlanifiee["annulation"]
  let remboursement: VentePlanifiee["remboursement"]
  let duplicata: VentePlanifiee["duplicata"]
  const u = rng()
  if ((canal === "guichet" || canal === "agence") && u < 0.014) {
    const t = venteA + entier(rng, 3, 25) * 60_000
    if (t < depart && toServiceDate(t) === jour) {
      annulation = { a: t, motif: choisir(rng, MOTIFS_ANNULATION) }
    }
  } else if (canal !== "bord" && u < 0.045 && taille < 10) {
    // Un jour ouvré entre le lendemain de l'achat et le départ, aux heures
    // d'ouverture du guichet.
    const ecart = daysBetween(jour, desserte.serviceDate)
    if (ecart >= 1) {
      const jourRemboursement = addDays(jour, entier(rng, 1, ecart))
      const t = instant(jourRemboursement, entier(rng, 7 * 60, 18 * 60 + 30))
      if (t > venteA && t < depart - 30 * 60_000) {
        remboursement = {
          a: t,
          motif: weightedPick(rng, MOTIFS_REMBOURSEMENT),
          penalite: "anticipee",
        }
      }
    }
  }
  if (desserte.supprimeeA !== undefined && !annulation && rng() < 0.42) {
    remboursement = {
      a: desserte.supprimeeA + entier(rng, 20, 600) * 60_000,
      motif: MOTIF_SUPPRESSION,
      penalite: "suppression",
    }
  }
  if (!annulation && !remboursement && canal !== "ligne" && canal !== "bord" && rng() < 0.009) {
    const t = venteA + entier(rng, 60, 30 * 60) * 60_000
    if (t < depart) {
      const heure = (t - fromServiceDate(toServiceDate(t), "00:00")) / 3_600_000
      if (heure >= 7 && heure <= 18.5) duplicata = { a: t, motif: choisir(rng, MOTIFS_DUPLICATA) }
    }
  }

  // Un billet annulé ou remboursé n'emporte ni bagage ni véhicule.
  const sansSuite = annulation !== undefined || remboursement !== undefined

  return {
    cle,
    desserte: desserte.cle,
    classe,
    de,
    a,
    voyageurs,
    canal,
    flux,
    venteA,
    jour,
    vendeur: entier(rng, 0, 999),
    moyen,
    contact,
    client: canal === "ligne" && rng() < 0.04 ? (rng() < 0.5 ? 0 : 1) : undefined,
    bagage: sansSuite ? undefined : bagage,
    taa: sansSuite ? undefined : taa,
    annulation,
    remboursement,
    duplicata,
  }
}

/* ═══════════════════════ Colis et transport funéraire ══════════════════ */

export interface ColisPlanifie {
  readonly cle: string
  readonly flux: string
  readonly jour: string
  readonly venteA: number
  readonly vendeur: number
  readonly origine: string
  readonly destination: string
  readonly expediteur: { nom: string; telephone: string; piece?: string }
  readonly destinataire: { nom: string; telephone: string }
  readonly articles: ReadonlyArray<{ description: string; poids: number }>
  readonly valeurDeclaree?: number
  readonly consignes?: readonly string[]
  readonly moyen: Moyen
}

const ARTICLES_COLIS = [
  ["Pièces détachées automobiles", 8, 35],
  ["Vivres (manioc, plantain)", 10, 45],
  ["Documents administratifs", 1, 3],
  ["Carton de médicaments", 3, 12],
  ["Téléviseur 32 pouces", 7, 9],
  ["Sac de riz 25 kg", 25, 25],
  ["Matériel scolaire", 4, 15],
  ["Pagnes et tissus", 2, 8],
  ["Congélateur coffre", 38, 52],
  ["Bouteilles de gaz vides", 12, 30],
] as const

const VOLUME_COLIS: Record<string, number> = {
  OWE: 6, FCV: 5, LTV: 3, MOA: 3, BOO: 2, NDJ: 2,
}

export function planifierColis(gare: string, jour: string, echelle: number): ColisPlanifie[] {
  const rng = tirage(MARQUEUR, "colis", gare, jour)
  const base = (VOLUME_COLIS[gare] ?? 1) * FACTEUR_JOUR[weekdayOf(jour)]! * echelle
  const nombre = Math.max(0, Math.round(base * (0.7 + rng() * 0.6)))
  const destinations = GARES_GUICHET.filter((g) => g !== gare)
  const colis: ColisPlanifie[] = []
  for (let i = 0; i < nombre; i += 1) {
    const expediteur = adulte(rng)
    const destinataire = adulte(rng, rng() < 0.5 ? expediteur.lastName : undefined)
    const articles = Array.from({ length: weightedPick(rng, [[1, 70], [2, 22], [3, 8]] as const) }, () => {
      const [description, min, max] = choisir(rng, ARTICLES_COLIS)
      return { description, poids: entier(rng, min, max) }
    })
    const fragile = articles.some((a) => /Téléviseur|médicaments|Congélateur/.test(a.description))
    colis.push({
      cle: `colis|${jour}|${gare}|${i}`,
      flux: codePointDeVenteGare(gare),
      jour,
      venteA: instant(jour, entier(rng, 7 * 60, 17 * 60 + 30)) + entier(rng, 0, 59) * 1000,
      vendeur: entier(rng, 0, 999),
      origine: gare,
      destination: weightedPick(rng, destinations.map((d) => [d, POIDS_DESCENTE[d] ?? 1] as const)),
      expediteur: {
        nom: `${expediteur.firstName} ${expediteur.lastName}`,
        telephone: expediteur.phone ?? telephone(rng),
        piece: rng() < 0.7 ? `CNI ${entier(rng, 100, 999)} ${entier(rng, 100, 999)} ${entier(rng, 100, 999)}` : undefined,
      },
      destinataire: {
        nom: `${destinataire.firstName} ${destinataire.lastName}`,
        telephone: destinataire.phone ?? telephone(rng),
      },
      articles,
      valeurDeclaree: rng() < 0.35 ? entier(rng, 2, 60) * 5_000 : undefined,
      consignes: fragile ? ["Fragile", "Ne pas gerber"] : undefined,
      moyen: weightedPick(rng, [["especes", 85], ["airtel_money", 10], ["moov_money", 5]] as const),
    })
  }
  return colis
}

export interface FunerairePlanifie {
  readonly cle: string
  readonly flux: string
  readonly jour: string
  readonly venteA: number
  readonly destination: string
  readonly famille: string
  readonly tonnage: number
}

/**
 * Transports funéraires : quelques-uns par mois, presque toujours d'Owendo
 * vers le village de la famille, dans l'intérieur du pays.
 */
export function planifierFuneraire(jour: string): FunerairePlanifie | null {
  const rng = tirage(MARQUEUR, "funeraire", jour)
  if (rng() > 0.1) return null
  return {
    cle: `funeraire|${jour}|OWE`,
    flux: "OWE-PV",
    jour,
    venteA: instant(jour, entier(rng, 6 * 60 + 15, 7 * 60 + 20)),
    destination: weightedPick(rng, [["LTV", 3], ["MOA", 3], ["FCV", 2], ["BOO", 2], ["NDJ", 1]] as const),
    famille: `Famille ${choisir(rng, NOMS)}`,
    tonnage: 0.35,
  }
}

/* ═══════════════════════════ Rapprochement ═════════════════════════════ */

export interface EcartPlanifie {
  readonly montant: number
  readonly justification?: string
}

const MANQUES = [-500, -1_000, -1_500, -2_000, -2_500, -3_000, -700, -1_200, -1_800] as const
const EXCEDENTS = [500, 1_000, 250] as const

const JUSTIFICATIONS_MANQUE = [
  "Erreur de rendu de monnaie sur un billet Owendo–Ndjolé",
  "Pièce de 500 XAF refusée à la banque (fausse monnaie)",
  "Rendu arrondi au profit du voyageur faute de pièces de 25 XAF",
  "Billet de 1 000 XAF déchiré retiré de la caisse",
  "Erreur de rendu constatée au billetage de clôture",
] as const

const JUSTIFICATIONS_EXCEDENT = [
  "Monnaie non réclamée par un voyageur pressé",
  "Voyageur parti sans attendre son rendu",
] as const

/** Écart de caisse d'une session : juste dans l'immense majorité des cas. */
export function ecartSession(cleSession: string): EcartPlanifie {
  const rng = tirage(MARQUEUR, "ecart", cleSession)
  const u = rng()
  if (u < 0.075) {
    return { montant: choisir(rng, MANQUES), justification: choisir(rng, JUSTIFICATIONS_MANQUE) }
  }
  if (u < 0.1) {
    return { montant: choisir(rng, EXCEDENTS), justification: choisir(rng, JUSTIFICATIONS_EXCEDENT) }
  }
  return { montant: 0 }
}

/** Coupures de la BEAC en circulation, des billets aux pièces. */
export const COUPURES = [10_000, 5_000, 2_000, 1_000, 500, 100, 50, 25, 10, 5] as const

/**
 * Billetage plausible d'un montant : on garde quelques petites coupures, comme
 * dans un vrai tiroir, plutôt que la décomposition gloutonne minimale.
 */
export function billetage(
  montant: number,
  rng: Rng
): Array<{ denomination: number; count: number }> {
  if (!Number.isInteger(montant) || montant < 0 || montant % 5 !== 0) {
    throw new RangeError(`Montant non représentable en coupures : ${montant}`)
  }
  const lignes = new Map<number, number>()
  let reste = montant
  // Petites coupures d'abord, dans une proportion raisonnable.
  for (const [coupure, maximum] of [[500, 12], [1_000, 15], [2_000, 10], [5_000, 12]] as const) {
    const n = Math.min(entier(rng, 0, maximum), Math.floor(reste / coupure / 3))
    if (n > 0) {
      lignes.set(coupure, n)
      reste -= n * coupure
    }
  }
  for (const coupure of COUPURES) {
    const n = Math.floor(reste / coupure)
    if (n > 0) {
      lignes.set(coupure, (lignes.get(coupure) ?? 0) + n)
      reste -= n * coupure
    }
  }
  return COUPURES.flatMap((d) => {
    const count = lignes.get(d) ?? 0
    return count > 0 ? [{ denomination: d, count }] : []
  })
}

/** Fonds de caisse remis à l'ouverture, selon le poste. */
export function fondsDeCaisse(pointDeVente: string, role: RolePersonnel): number {
  if (role === "controleur_train") return 25_000
  if (pointDeVente.startsWith("AG")) return 20_000
  if (pointDeVente === "OWE-PV" || pointDeVente === "FCV-PV") return 50_000
  return 30_000
}

/* ═════════════════════════════ Divers ══════════════════════════════════ */

/** Dates de la fenêtre, du plus ancien au jour même inclus. */
export function datesFenetre(aujourdhui: string, jours: number): string[] {
  return Array.from({ length: jours + 1 }, (_, i) => addDays(aujourdhui, i - jours))
}

/** Vrai si le montant se règle en coupures BEAC (multiple de 5 XAF). */
export function multipleDeCinq(montant: number): boolean {
  return Number.isInteger(montant) && montant % 5 === 0
}
