/**
 * Moteur tarifaire — barème kilométrique officiel SETRAG.
 *
 * Logique métier pure : aucune dépendance à Convex, donc testable
 * unitairement et portable si la plateforme change un jour (clause de
 * réversibilité du cahier des charges).
 *
 * Source des règles : CDC « Projet billettique SETRAG » v1.2, annexe 2
 * « Tarifs ». Le barème lui-même (les taux au kilomètre) est une DONNÉE
 * stockée en base et validée par un circuit d'approbation : il est passé en
 * paramètre, jamais codé en dur ici. Seules les règles de calcul vivent dans
 * ce module.
 */

/* ────────────────────────────── Types du domaine ───────────────────────── */

/** Types de train commercialisés (CDC §7.3). */
export const TRAIN_TYPES = ["EXPRESS", "OMNIBUS", "AUTORAIL", "SPECIAL"] as const
export type TrainType = (typeof TRAIN_TYPES)[number]

/** Classes de service (CDC §7.1.1 : « 2ème classe, 1ère classe, VIP »). */
export const SERVICE_CLASSES = ["DEUXIEME", "PREMIERE", "VIP"] as const
export type ServiceClass = (typeof SERVICE_CLASSES)[number]

/**
 * Base kilométrique : prix au kilomètre pour un couple (type de train,
 * classe), décliné sur les deux paliers de distance de l'annexe 2.
 */
export interface FareBase {
  readonly trainType: TrainType
  readonly serviceClass: ServiceClass
  /** Taux appliqué de 0 à 99 km inclus, en francs CFA par kilomètre. */
  readonly shortDistanceRate: number
  /** Taux appliqué à partir de 100 km, en francs CFA par kilomètre. */
  readonly longDistanceRate: number
}

/** Taux de taxes applicables, paramétrables (CDC §8.5). */
export interface TaxRates {
  /** Taux de TVA en pourcentage, ex. 18 pour 18 %. */
  readonly vatPct: number
  /** Taux de contribution spéciale de solidarité en pourcentage. */
  readonly cssPct: number
}

/**
 * Assiette sur laquelle porte l'arrondi réglementaire.
 *
 * L'annexe 2 impose d'arrondir « le prix du billet » sans préciser s'il
 * s'agit du montant hors taxes ou toutes taxes comprises. Le défaut retenu
 * est `TTC` — c'est le montant que le voyageur paie au guichet, et c'est lui
 * qui doit tomber juste pour le rendu de monnaie en espèces.
 * À confirmer avec la direction financière (point ouvert du plan).
 */
export type RoundingBasis = "HT" | "TTC"

/** Grille tarifaire complète, telle que stockée et approuvée en base. */
export interface FareSchedule {
  readonly bases: readonly FareBase[]
  readonly taxes: TaxRates
  readonly roundingBasis?: RoundingBasis
  /**
   * Table des paliers de distance facturables.
   *
   * L'annexe 2 indique que le prix est obtenu « en multipliant le prix de la
   * base kilométrique par la moyenne de palier de distance », ce qui suppose
   * un regroupement des distances réelles en tranches facturées à leur
   * valeur moyenne. La table de ces tranches n'est pas fournie dans le CDC.
   * Tant qu'elle n'est pas communiquée, la distance réelle est facturée
   * telle quelle (comportement par défaut, table absente).
   */
  readonly distanceBrackets?: readonly DistanceBracket[]
}

/** Tranche de distance facturée à sa valeur moyenne. */
export interface DistanceBracket {
  readonly minKm: number
  readonly maxKm: number
  /** Distance facturée pour toute la tranche. */
  readonly chargeableKm: number
}

/* ─────────────────────────────── Réductions ────────────────────────────── */

/**
 * Réductions de l'annexe 2. Les quatre dernières sont des « tarifs en
 * projet » dont le taux n'est pas encore arrêté par SETRAG : leur valeur est
 * portée par la grille, pas par le code.
 */
export const DISCOUNT_CODES = [
  "ENFANT",
  "GROUPE",
  "MILITAIRE",
  "WEEKEND",
  "ETUDIANT",
  "TROISIEME_AGE",
  "PROMOTIONNEL",
] as const
export type DiscountCode = (typeof DISCOUNT_CODES)[number]

export interface Discount {
  readonly code: DiscountCode
  /** Taux de réduction en pourcentage, ex. 50 pour −50 %. */
  readonly ratePct: number
  readonly label: string
}

/** Réduction enfant : 4 à 11 ans inclus, −50 % (annexe 2 §1.1.1.1.2). */
export const CHILD_MIN_AGE = 4
export const CHILD_MAX_AGE = 11
export const CHILD_DISCOUNT_PCT = 50

/** Réduction militaire avec ordre de mission (annexe 2 §1.1.1.1.3). */
export const MILITARY_DISCOUNT_PCT = 10

/** Paliers de réduction pour les billets de groupe (annexe 2 §1.1.1.1.3). */
export const GROUP_DISCOUNT_TIERS = [
  { minPassengers: 10, maxPassengers: 49, ratePct: 30 },
  { minPassengers: 50, maxPassengers: Number.POSITIVE_INFINITY, ratePct: 45 },
] as const

/**
 * Réduction de groupe applicable à un effectif donné.
 * Retourne `null` en dessous du seuil de 10 voyageurs.
 */
export function groupDiscountPct(passengerCount: number): number | null {
  if (!Number.isInteger(passengerCount) || passengerCount < 0) {
    throw new RangeError(
      `Effectif de groupe invalide : ${passengerCount} (entier positif attendu)`,
    )
  }
  const tier = GROUP_DISCOUNT_TIERS.find(
    (t) =>
      passengerCount >= t.minPassengers && passengerCount <= t.maxPassengers,
  )
  return tier ? tier.ratePct : null
}

/** Vrai si l'âge ouvre droit au tarif enfant (4 à 11 ans inclus). */
export function isChildAge(age: number): boolean {
  return age >= CHILD_MIN_AGE && age <= CHILD_MAX_AGE
}

/* ──────────────────────── Arrondis réglementaires ──────────────────────── */

/**
 * Pas d'arrondi imposé par l'annexe 2 §9.8.2, fonction de la distance :
 * 10 F de 0 à 99 km, 50 F de 100 à 299 km, 100 F à partir de 300 km.
 */
export function roundingStep(distanceKm: number): 10 | 50 | 100 {
  assertPositiveDistance(distanceKm)
  if (distanceKm < 100) return 10
  if (distanceKm < 300) return 50
  return 100
}

/**
 * Arrondit au pas réglementaire « le plus proche ».
 *
 * À mi-chemin exact, l'arrondi se fait vers le haut : c'est le comportement
 * de `Math.round` et il évite qu'un demi-pas systématiquement perdu ne creuse
 * la recette sur des centaines de milliers de billets par an.
 */
export function roundFare(amount: number, distanceKm: number): number {
  const step = roundingStep(distanceKm)
  return Math.round(amount / step) * step
}

/* ─────────────────────── Sélection du taux applicable ──────────────────── */

/** Seuil de bascule entre le taux court et le taux long (annexe 2). */
export const LONG_DISTANCE_THRESHOLD_KM = 100

/**
 * Retourne la base kilométrique correspondant au couple demandé.
 * Lève si la grille ne couvre pas la combinaison — une classe non
 * commercialisée sur un type de train ne doit jamais être vendue par défaut.
 */
export function findFareBase(
  schedule: FareSchedule,
  trainType: TrainType,
  serviceClass: ServiceClass,
): FareBase {
  const base = schedule.bases.find(
    (b) => b.trainType === trainType && b.serviceClass === serviceClass,
  )
  if (!base) {
    throw new Error(
      `Aucune base kilométrique pour ${trainType} en classe ${serviceClass}`,
    )
  }
  return base
}

/** Taux au kilomètre applicable, selon le palier de distance. */
export function ratePerKm(
  schedule: FareSchedule,
  trainType: TrainType,
  serviceClass: ServiceClass,
  distanceKm: number,
): number {
  assertPositiveDistance(distanceKm)
  const base = findFareBase(schedule, trainType, serviceClass)
  return distanceKm < LONG_DISTANCE_THRESHOLD_KM
    ? base.shortDistanceRate
    : base.longDistanceRate
}

/**
 * Distance retenue pour la facturation.
 *
 * Sans table de paliers, c'est la distance réelle. Avec une table, c'est la
 * distance moyenne de la tranche qui contient la distance réelle.
 */
export function chargeableDistance(
  schedule: FareSchedule,
  distanceKm: number,
): number {
  assertPositiveDistance(distanceKm)
  if (!schedule.distanceBrackets || schedule.distanceBrackets.length === 0) {
    return distanceKm
  }
  const bracket = schedule.distanceBrackets.find(
    (b) => distanceKm >= b.minKm && distanceKm <= b.maxKm,
  )
  if (!bracket) {
    throw new Error(
      `Aucune tranche de distance ne couvre ${distanceKm} km dans cette grille`,
    )
  }
  return bracket.chargeableKm
}

/* ───────────────────────────── Calcul du billet ─────────────────────────── */

export interface TicketFareInput {
  readonly schedule: FareSchedule
  readonly trainType: TrainType
  readonly serviceClass: ServiceClass
  /** Distance réelle entre les deux gares, en kilomètres. */
  readonly distanceKm: number
  /** Réduction éventuelle, déjà résolue par l'appelant. */
  readonly discount?: Discount | null
}

/** Décomposition complète d'un prix, conservée sur la vente pour l'audit. */
export interface FareBreakdown {
  /** Distance réelle du trajet. */
  readonly distanceKm: number
  /** Distance effectivement facturée (paliers éventuels). */
  readonly chargeableKm: number
  readonly ratePerKm: number
  /** Montant avant réduction et avant arrondi. */
  readonly grossAmount: number
  readonly discountCode: DiscountCode | null
  readonly discountPct: number
  readonly discountAmount: number
  /** Assiette sur laquelle l'arrondi a porté. */
  readonly roundingBasis: RoundingBasis
  readonly roundingStep: number
  readonly ht: number
  readonly vat: number
  readonly css: number
  readonly ttc: number
}

const DEFAULT_ROUNDING_BASIS: RoundingBasis = "TTC"

/**
 * Calcule le prix d'un billet simple, taxes et arrondi compris.
 *
 * Enchaînement : distance facturable → taux au kilomètre → montant brut →
 * réduction → taxes → arrondi réglementaire. L'arrondi intervient en dernier
 * sur l'assiette configurée, et les autres montants sont recomposés à partir
 * du montant arrondi pour que la ventilation reste exacte au franc près.
 */
export function computeTicketFare(input: TicketFareInput): FareBreakdown {
  const { schedule, trainType, serviceClass, distanceKm, discount } = input
  assertPositiveDistance(distanceKm)

  const chargeableKm = chargeableDistance(schedule, distanceKm)
  const rate = ratePerKm(schedule, trainType, serviceClass, chargeableKm)
  const grossAmount = chargeableKm * rate

  const discountPct = discount?.ratePct ?? 0
  assertPercentage(discountPct, "Taux de réduction")
  const discountAmount = grossAmount * (discountPct / 100)
  const netAmount = grossAmount - discountAmount

  const basis = schedule.roundingBasis ?? DEFAULT_ROUNDING_BASIS
  const step = roundingStep(distanceKm)
  const { vatPct, cssPct } = schedule.taxes
  assertPercentage(vatPct, "Taux de TVA")
  assertPercentage(cssPct, "Taux de CSS")

  const taxMultiplier = 1 + vatPct / 100 + cssPct / 100

  let ht: number
  let ttc: number
  if (basis === "HT") {
    ht = roundFare(netAmount, distanceKm)
    ttc = ht * taxMultiplier
  } else {
    ttc = roundFare(netAmount * taxMultiplier, distanceKm)
    ht = ttc / taxMultiplier
  }

  // Les taxes sont dérivées du hors-taxes puis la TVA absorbe le résidu de
  // centimes, afin que HT + TVA + CSS soit rigoureusement égal au TTC.
  const css = round2(ht * (cssPct / 100))
  const htRounded = round2(ht)
  const ttcRounded = round2(ttc)
  const vat = round2(ttcRounded - htRounded - css)

  return {
    distanceKm,
    chargeableKm,
    ratePerKm: rate,
    grossAmount: round2(grossAmount),
    discountCode: discount?.code ?? null,
    discountPct,
    discountAmount: round2(discountAmount),
    roundingBasis: basis,
    roundingStep: step,
    ht: htRounded,
    vat,
    css,
    ttc: ttcRounded,
  }
}

/**
 * Sélectionne la réduction la plus favorable au voyageur parmi celles
 * auxquelles il a droit.
 *
 * Le cahier des charges ne dit pas si les réductions se cumulent. Le parti
 * pris — non cumul, meilleure réduction retenue — est le plus sûr
 * commercialement et le plus simple à expliquer au guichet. À faire
 * confirmer par la direction commerciale (point ouvert du plan).
 */
export function bestDiscount(
  eligible: readonly Discount[],
): Discount | null {
  if (eligible.length === 0) return null
  return eligible.reduce((best, d) => (d.ratePct > best.ratePct ? d : best))
}

/* ──────────────────────── Cartes d'abonnement ──────────────────────────── */

/**
 * Coefficients de l'annexe 2 §1.1.1.1.4, par tranche de distance.
 * Le prix de l'abonnement annuel plein tarif vaut le billet simple multiplié
 * par le coefficient de sa tranche.
 *
 * Note : le CDC imprime « 210 à 2019 » pour la tranche de coefficient 77, ce
 * qui est manifestement une coquille pour « 210 à 219 » — la suite des
 * tranches est régulière et 2019 chevaucherait tout le reste de la table.
 * La correction est appliquée ici et signalée comme point à confirmer.
 */
export const SUBSCRIPTION_COEFFICIENTS: ReadonlyArray<{
  readonly minKm: number
  readonly maxKm: number
  readonly coefficient: number
}> = [
  { minKm: 10, maxKm: 14, coefficient: 300 },
  { minKm: 15, maxKm: 19, coefficient: 234 },
  { minKm: 20, maxKm: 24, coefficient: 200 },
  { minKm: 25, maxKm: 29, coefficient: 183 },
  { minKm: 30, maxKm: 34, coefficient: 167 },
  { minKm: 35, maxKm: 39, coefficient: 156 },
  { minKm: 40, maxKm: 44, coefficient: 148 },
  { minKm: 45, maxKm: 49, coefficient: 142 },
  { minKm: 50, maxKm: 54, coefficient: 136 },
  { minKm: 55, maxKm: 59, coefficient: 129 },
  { minKm: 60, maxKm: 64, coefficient: 124 },
  { minKm: 65, maxKm: 69, coefficient: 121 },
  { minKm: 70, maxKm: 74, coefficient: 116 },
  { minKm: 75, maxKm: 79, coefficient: 112 },
  { minKm: 80, maxKm: 84, coefficient: 108 },
  { minKm: 85, maxKm: 109, coefficient: 105 },
  { minKm: 110, maxKm: 119, coefficient: 102 },
  { minKm: 120, maxKm: 129, coefficient: 98 },
  { minKm: 130, maxKm: 139, coefficient: 95 },
  { minKm: 140, maxKm: 149, coefficient: 93 },
  { minKm: 150, maxKm: 159, coefficient: 89 },
  { minKm: 160, maxKm: 169, coefficient: 86 },
  { minKm: 170, maxKm: 179, coefficient: 84 },
  { minKm: 180, maxKm: 189, coefficient: 82 },
  { minKm: 190, maxKm: 199, coefficient: 80 },
  { minKm: 200, maxKm: 209, coefficient: 79 },
  { minKm: 210, maxKm: 219, coefficient: 77 },
  { minKm: 220, maxKm: 229, coefficient: 76 },
  { minKm: 230, maxKm: 239, coefficient: 75 },
  { minKm: 240, maxKm: 249, coefficient: 74 },
  { minKm: 250, maxKm: 259, coefficient: 73 },
  { minKm: 260, maxKm: 399, coefficient: 71 },
  { minKm: 400, maxKm: 449, coefficient: 67 },
  { minKm: 450, maxKm: 499, coefficient: 64 },
  { minKm: 500, maxKm: 549, coefficient: 62 },
  { minKm: 550, maxKm: 599, coefficient: 59 },
  { minKm: 600, maxKm: 649, coefficient: 57 },
  { minKm: 650, maxKm: 699, coefficient: 55 },
  { minKm: 700, maxKm: 749, coefficient: 53 },
  { minKm: 750, maxKm: 799, coefficient: 51 },
  { minKm: 800, maxKm: 849, coefficient: 50 },
  { minKm: 850, maxKm: 899, coefficient: 48 },
  { minKm: 900, maxKm: 949, coefficient: 47 },
  { minKm: 950, maxKm: 999, coefficient: 46 },
]

/** Formules d'abonnement de l'annexe 2 §1.1.1.1.4. */
export const SUBSCRIPTION_KINDS = [
  "AN",
  "SIX_MOIS",
  "TROIS_MOIS",
  "DEMI_TARIF",
] as const
export type SubscriptionKind = (typeof SUBSCRIPTION_KINDS)[number]

/**
 * Facteur appliqué au prix de l'abonnement annuel plein tarif :
 * 6 mois = −40 %, 3 mois = −60 %, demi-tarif = réduit des deux tiers.
 */
export const SUBSCRIPTION_FACTORS: Readonly<Record<SubscriptionKind, number>> = {
  AN: 1,
  SIX_MOIS: 0.6,
  TROIS_MOIS: 0.4,
  DEMI_TARIF: 1 / 3,
}

/**
 * Coefficient d'abonnement pour une distance donnée.
 * Retourne `null` hors du domaine couvert par la table (moins de 10 km ou
 * 1 000 km et plus) : aucun abonnement n'y est tarifé.
 */
export function subscriptionCoefficient(distanceKm: number): number | null {
  assertPositiveDistance(distanceKm)
  const row = SUBSCRIPTION_COEFFICIENTS.find(
    (r) => distanceKm >= r.minKm && distanceKm <= r.maxKm,
  )
  return row ? row.coefficient : null
}

export interface SubscriptionFareInput {
  readonly schedule: FareSchedule
  readonly trainType: TrainType
  readonly serviceClass: ServiceClass
  readonly distanceKm: number
  readonly kind: SubscriptionKind
}

export interface SubscriptionBreakdown {
  readonly kind: SubscriptionKind
  readonly distanceKm: number
  readonly coefficient: number
  /** Prix du billet simple servant d'assiette. */
  readonly simpleFareTtc: number
  readonly yearlyTtc: number
  readonly ttc: number
}

/**
 * Calcule le prix d'une carte d'abonnement.
 * Lève si la distance sort de la table de coefficients.
 */
export function computeSubscriptionFare(
  input: SubscriptionFareInput,
): SubscriptionBreakdown {
  const { schedule, trainType, serviceClass, distanceKm, kind } = input
  const coefficient = subscriptionCoefficient(distanceKm)
  if (coefficient === null) {
    throw new Error(
      `Aucun coefficient d'abonnement pour ${distanceKm} km ` +
        `(table définie de 10 à 999 km)`,
    )
  }
  const simple = computeTicketFare({
    schedule,
    trainType,
    serviceClass,
    distanceKm,
  })
  const yearlyTtc = roundFare(simple.ttc * coefficient, distanceKm)
  const ttc = roundFare(yearlyTtc * SUBSCRIPTION_FACTORS[kind], distanceKm)
  return {
    kind,
    distanceKm,
    coefficient,
    simpleFareTtc: simple.ttc,
    yearlyTtc,
    ttc,
  }
}

/* ────────────────────────────── Bagages ────────────────────────────────── */

/**
 * Frais d'enregistrement obligatoires (annexe 2 §9.8.3) :
 * 490 F HT de 0 à 190 km, 700 F HT à partir de 200 km.
 *
 * Le CDC laisse un intervalle non couvert entre 190 et 200 km. Le parti pris
 * retenu applique le tarif long dès que la distance dépasse 190 km, ce qui
 * est cohérent avec la progression du barème. À faire confirmer.
 */
export const BAGGAGE_REGISTRATION_SHORT_HT = 490
export const BAGGAGE_REGISTRATION_LONG_HT = 700
export const BAGGAGE_SHORT_DISTANCE_MAX_KM = 190

export function baggageRegistrationFeeHt(distanceKm: number): number {
  assertPositiveDistance(distanceKm)
  return distanceKm <= BAGGAGE_SHORT_DISTANCE_MAX_KM
    ? BAGGAGE_REGISTRATION_SHORT_HT
    : BAGGAGE_REGISTRATION_LONG_HT
}

/** Poids maximal d'un bagage rattaché à un billet voyageur (CDC §7.1.2). */
export const BAGGAGE_MAX_WEIGHT_KG = 30

/* ────────────────────────── Colis express ──────────────────────────────── */

/** Poids unitaire maximal admis au régime colis express (annexe 2 §9.8.4). */
export const PARCEL_MAX_UNIT_WEIGHT_KG = 100

/** Seuil au-delà duquel la tarification passe par fraction de 100 kg. */
export const PARCEL_BULK_THRESHOLD_KG = 500

/** Pas des paliers de poids du barème colis (tranches de 10 kg). */
export const PARCEL_WEIGHT_STEP_KG = 10

/**
 * Les sept zones kilométriques de l'annexe 2 §9.8.4.
 *
 * Note : le CDC imprime « [10 à 199 Km] » pour la deuxième zone, coquille
 * évidente pour « [100 à 199 Km] » puisque la première zone couvre déjà
 * 0 à 99 km. La correction est appliquée et signalée comme point à confirmer.
 */
export const PARCEL_ZONES: ReadonlyArray<{
  readonly zone: number
  readonly minKm: number
  readonly maxKm: number
}> = [
  { zone: 1, minKm: 0, maxKm: 99 },
  { zone: 2, minKm: 100, maxKm: 199 },
  { zone: 3, minKm: 200, maxKm: 299 },
  { zone: 4, minKm: 300, maxKm: 399 },
  { zone: 5, minKm: 400, maxKm: 499 },
  { zone: 6, minKm: 500, maxKm: 599 },
  { zone: 7, minKm: 600, maxKm: 699 },
]

/** Zone tarifaire colis correspondant à une distance. */
export function parcelZone(distanceKm: number): number {
  assertPositiveDistance(distanceKm)
  const zone = PARCEL_ZONES.find(
    (z) => distanceKm >= z.minKm && distanceKm <= z.maxKm,
  )
  if (!zone) {
    throw new Error(
      `Distance ${distanceKm} km hors des zones colis (0 à 699 km)`,
    )
  }
  return zone.zone
}

/**
 * Indice de palier de poids, à partir de 1.
 * Les tranches sont [0-10], [11-20], [21-30]… conformément à l'annexe 2.
 */
export function parcelWeightTier(weightKg: number): number {
  if (!Number.isFinite(weightKg) || weightKg <= 0) {
    throw new RangeError(`Poids de colis invalide : ${weightKg}`)
  }
  return Math.max(1, Math.ceil(weightKg / PARCEL_WEIGHT_STEP_KG))
}

/* ─────────────────────────────── Utilitaires ───────────────────────────── */

function assertPositiveDistance(distanceKm: number): void {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) {
    throw new RangeError(
      `Distance invalide : ${distanceKm} (nombre positif attendu)`,
    )
  }
}

function assertPercentage(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new RangeError(`${label} invalide : ${value} (attendu entre 0 et 100)`)
  }
}

/** Arrondi comptable à deux décimales, sans dérive de virgule flottante. */
function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}
