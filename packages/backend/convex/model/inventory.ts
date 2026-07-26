/**
 * Inventaire de places par segment — logique pure.
 *
 * Exigence fondatrice du CDC « Projet billettique SETRAG » §7.5 :
 * « cas d'un passager qui achète un billet Owendo-Booué. On doit pouvoir
 * vendre la place libérée. »
 *
 * Une place n'est donc pas « libre » ou « occupée » pour toute la desserte :
 * elle l'est segment par segment. Un trajet Owendo → Booué occupe les
 * segments qui séparent ces deux gares ; la même place reste vendable de
 * Booué à Franceville.
 *
 * Représentation retenue : un MASQUE DE BITS par couple (desserte, place).
 * Le bit i vaut 1 si la place est occupée sur le segment i. Réserver revient
 * à vérifier que `occupation & demande === 0` puis à écrire
 * `occupation | demande` — deux opérations entières, exécutées dans la même
 * mutation Convex, ce qui rend la survente structurellement impossible.
 *
 * Aucune dépendance à Convex : ce module est testable unitairement et reste
 * valable si la plateforme de données change (clause de réversibilité).
 */

/**
 * Nombre maximal de segments représentables.
 *
 * Les opérateurs binaires de JavaScript travaillent sur 32 bits signés :
 * au-delà de 30 bits le masque cesserait d'être fiable. Le Transgabonais
 * compte 22 à 24 gares, soit 21 à 23 segments — la marge est confortable,
 * mais la limite est vérifiée explicitement plutôt que supposée.
 */
export const MAX_SEGMENTS = 30

/** Masque d'occupation d'une place sur une desserte. */
export type SegmentMask = number

/** Trajet exprimé en indices d'arrêts dans la séquence de la desserte. */
export interface StopRange {
  /** Indice de l'arrêt de montée, à partir de 0. */
  readonly fromIndex: number
  /** Indice de l'arrêt de descente, strictement supérieur à `fromIndex`. */
  readonly toIndex: number
}

/* ────────────────────────── Construction du masque ─────────────────────── */

/**
 * Masque des segments parcourus entre deux arrêts.
 *
 * Un trajet de l'arrêt 0 à l'arrêt 3 emprunte les segments 0, 1 et 2 —
 * l'arrêt de descente ne consomme pas de segment supplémentaire, ce qui est
 * exactement ce qui permet à un voyageur montant à Booué de récupérer la
 * place libérée par celui qui y descend.
 */
export function segmentMask(
  range: StopRange,
  segmentCount: number,
): SegmentMask {
  assertSegmentCount(segmentCount)
  const { fromIndex, toIndex } = range
  assertStopIndex(fromIndex, segmentCount, "Arrêt de montée")
  assertStopIndex(toIndex, segmentCount, "Arrêt de descente")
  if (toIndex <= fromIndex) {
    throw new RangeError(
      `Trajet invalide : descente à l'arrêt ${toIndex} avant ou à la montée ` +
        `à l'arrêt ${fromIndex}`,
    )
  }
  let mask = 0
  for (let segment = fromIndex; segment < toIndex; segment += 1) {
    mask |= 1 << segment
  }
  return mask
}

/** Liste des indices de segments occupés dans un masque. */
export function occupiedSegments(
  mask: SegmentMask,
  segmentCount: number,
): number[] {
  assertSegmentCount(segmentCount)
  const segments: number[] = []
  for (let segment = 0; segment < segmentCount; segment += 1) {
    if ((mask & (1 << segment)) !== 0) segments.push(segment)
  }
  return segments
}

/** Nombre de segments occupés — utile pour les statistiques de remplissage. */
export function occupiedSegmentCount(mask: SegmentMask): number {
  let count = 0
  let remaining = mask
  while (remaining !== 0) {
    remaining &= remaining - 1 // efface le bit de poids faible
    count += 1
  }
  return count
}

/** Masque vide : place entièrement libre. */
export const EMPTY_MASK: SegmentMask = 0

/** Masque plein pour une desserte donnée : place indisponible partout. */
export function fullMask(segmentCount: number): SegmentMask {
  assertSegmentCount(segmentCount)
  return segmentCount === 0 ? 0 : (1 << segmentCount) - 1
}

/* ──────────────────────────── Disponibilité ────────────────────────────── */

/**
 * Vrai si la place est libre sur l'intégralité du trajet demandé.
 * C'est le test qui précède toute écriture d'inventaire.
 */
export function isRangeFree(
  occupancy: SegmentMask,
  request: SegmentMask,
): boolean {
  return (occupancy & request) === 0
}

/**
 * Réserve le trajet demandé sur une place.
 *
 * Lève si un seul segment est déjà pris : la vérification et l'écriture
 * étant dans la même mutation Convex, l'atomicité de la transaction interdit
 * qu'une autre vente s'intercale entre les deux.
 */
export function occupy(
  occupancy: SegmentMask,
  request: SegmentMask,
): SegmentMask {
  if (!isRangeFree(occupancy, request)) {
    throw new SeatUnavailableError(occupancy, request)
  }
  return occupancy | request
}

/**
 * Libère le trajet indiqué — annulation, remboursement, expiration d'une
 * réservation en attente de paiement.
 *
 * Volontairement tolérante : libérer un segment déjà libre n'est pas une
 * erreur, ce qui rend l'opération idempotente. Une annulation rejouée après
 * une coupure réseau ne doit pas échouer.
 */
export function release(
  occupancy: SegmentMask,
  request: SegmentMask,
): SegmentMask {
  return occupancy & ~request
}

/** Erreur métier levée lorsqu'une place n'est pas libre sur tout le trajet. */
export class SeatUnavailableError extends Error {
  readonly occupancy: SegmentMask
  readonly request: SegmentMask
  /** Segments en cause, pour un message d'erreur exploitable au guichet. */
  readonly conflictingMask: SegmentMask

  constructor(occupancy: SegmentMask, request: SegmentMask) {
    const conflicting = occupancy & request
    super(
      `Place indisponible : conflit sur le ou les segments ` +
        `${occupiedSegments(conflicting, MAX_SEGMENTS).join(", ")}`,
    )
    this.name = "SeatUnavailableError"
    this.occupancy = occupancy
    this.request = request
    this.conflictingMask = conflicting
  }
}

/* ───────────────────── Sélection d'une place libre ─────────────────────── */

/** Une place et son occupation courante sur la desserte. */
export interface SeatOccupancy<TSeatId = string> {
  readonly seatId: TSeatId
  readonly mask: SegmentMask
}

/**
 * Première place libre sur le trajet demandé.
 *
 * L'ordre de la liste fait foi : c'est à l'appelant de la trier selon la
 * politique d'attribution voulue (places groupées, proximité, etc.).
 */
export function findFreeSeat<TSeatId>(
  seats: readonly SeatOccupancy<TSeatId>[],
  request: SegmentMask,
): SeatOccupancy<TSeatId> | null {
  return seats.find((seat) => isRangeFree(seat.mask, request)) ?? null
}

/**
 * Cherche `count` places libres sur le trajet demandé.
 * Retourne `null` si l'effectif complet ne peut pas être servi : on ne vend
 * jamais un groupe partiellement.
 */
export function findFreeSeats<TSeatId>(
  seats: readonly SeatOccupancy<TSeatId>[],
  request: SegmentMask,
  count: number,
): SeatOccupancy<TSeatId>[] | null {
  if (!Number.isInteger(count) || count <= 0) {
    throw new RangeError(`Nombre de places invalide : ${count}`)
  }
  const free = seats.filter((seat) => isRangeFree(seat.mask, request))
  return free.length >= count ? free.slice(0, count) : null
}

/** Nombre de places libres sur le trajet demandé. */
export function countFreeSeats<TSeatId>(
  seats: readonly SeatOccupancy<TSeatId>[],
  request: SegmentMask,
): number {
  return seats.reduce(
    (total, seat) => (isRangeFree(seat.mask, request) ? total + 1 : total),
    0,
  )
}

/* ──────────────────── Compteurs dénormalisés par segment ───────────────── */

/**
 * Disponibilité par segment, dénormalisée.
 *
 * La recherche d'itinéraire ne peut pas parcourir toutes les places de tous
 * les trains : elle lit ces compteurs, tenus à jour dans la même transaction
 * que l'occupation. L'index du tableau est l'indice du segment.
 */
export type SegmentCounters = readonly number[]

/**
 * Places disponibles pour un trajet : c'est le segment le plus chargé qui
 * commande, puisqu'il faut la place sur toute la longueur du parcours.
 */
export function availableForRange(
  counters: SegmentCounters,
  range: StopRange,
): number {
  const { fromIndex, toIndex } = range
  if (toIndex <= fromIndex) {
    throw new RangeError(
      `Trajet invalide : descente à l'arrêt ${toIndex} avant ou à la ` +
        `montée à l'arrêt ${fromIndex}`,
    )
  }
  if (fromIndex < 0 || toIndex > counters.length) {
    throw new RangeError(
      `Trajet hors desserte : arrêts ${fromIndex} → ${toIndex} pour ` +
        `${counters.length} segment(s)`,
    )
  }
  let minimum = Number.POSITIVE_INFINITY
  for (let segment = fromIndex; segment < toIndex; segment += 1) {
    minimum = Math.min(minimum, counters[segment]!)
  }
  return minimum === Number.POSITIVE_INFINITY ? 0 : minimum
}

/**
 * Indice du segment limitant — celui qui plafonne la vente.
 * Utile pour expliquer au guichet pourquoi un trajet est complet.
 */
export function limitingSegment(
  counters: SegmentCounters,
  range: StopRange,
): number {
  const available = availableForRange(counters, range)
  for (let segment = range.fromIndex; segment < range.toIndex; segment += 1) {
    if (counters[segment] === available) return segment
  }
  return range.fromIndex
}

/**
 * Applique une réservation aux compteurs : décrémente chaque segment
 * emprunté du nombre de places vendues.
 *
 * Lève si un segment tombe en dessous de zéro — c'est le garde-fou qui
 * transforme une éventuelle survente en échec de transaction plutôt qu'en
 * incident commercial dans le train.
 */
export function decrementCounters(
  counters: SegmentCounters,
  range: StopRange,
  seats: number,
): number[] {
  assertSeatCount(seats)
  const available = availableForRange(counters, range)
  if (available < seats) {
    throw new SegmentCapacityError(range, seats, available)
  }
  const next = [...counters]
  for (let segment = range.fromIndex; segment < range.toIndex; segment += 1) {
    next[segment] = next[segment]! - seats
  }
  return next
}

/**
 * Restitue des places aux compteurs (annulation, expiration de réservation).
 * Plafonne à la capacité initiale si elle est fournie, pour qu'une double
 * libération ne puisse pas créer de places fantômes.
 */
export function incrementCounters(
  counters: SegmentCounters,
  range: StopRange,
  seats: number,
  capacity?: number,
): number[] {
  assertSeatCount(seats)
  if (range.toIndex <= range.fromIndex) {
    throw new RangeError(
      `Trajet invalide : ${range.fromIndex} → ${range.toIndex}`,
    )
  }
  const next = [...counters]
  for (let segment = range.fromIndex; segment < range.toIndex; segment += 1) {
    const restored = next[segment]! + seats
    next[segment] = capacity === undefined ? restored : Math.min(restored, capacity)
  }
  return next
}

/** Erreur métier levée quand la capacité d'un segment est insuffisante. */
export class SegmentCapacityError extends Error {
  readonly range: StopRange
  readonly requested: number
  readonly available: number

  constructor(range: StopRange, requested: number, available: number) {
    super(
      `Capacité insuffisante entre les arrêts ${range.fromIndex} et ` +
        `${range.toIndex} : ${requested} place(s) demandée(s), ` +
        `${available} disponible(s)`,
    )
    this.name = "SegmentCapacityError"
    this.range = range
    this.requested = requested
    this.available = available
  }
}

/* ────────────────────────── Blocages opérationnels ─────────────────────── */

/**
 * Applique un blocage de places (maintenance, réservation opérationnelle) à
 * un masque d'occupation. Le blocage se comporte exactement comme une vente
 * du point de vue de l'inventaire, mais il est tracé séparément pour le
 * rapport de traçabilité exigé par le CDC §7.5.
 */
export function applyBlock(
  occupancy: SegmentMask,
  blockMask: SegmentMask,
): SegmentMask {
  return occupancy | blockMask
}

/** Retire un blocage sans toucher aux segments vendus. */
export function removeBlock(
  occupancy: SegmentMask,
  blockMask: SegmentMask,
  soldMask: SegmentMask,
): SegmentMask {
  // Un segment vendu reste occupé même si le blocage est levé.
  return (occupancy & ~blockMask) | soldMask
}

/* ─────────────────────────────── Utilitaires ───────────────────────────── */

function assertSegmentCount(segmentCount: number): void {
  if (!Number.isInteger(segmentCount) || segmentCount < 0) {
    throw new RangeError(
      `Nombre de segments invalide : ${segmentCount} (entier positif attendu)`,
    )
  }
  if (segmentCount > MAX_SEGMENTS) {
    throw new RangeError(
      `Desserte de ${segmentCount} segments : au-delà de ${MAX_SEGMENTS}, ` +
        `le masque binaire cesse d'être fiable en JavaScript`,
    )
  }
}

function assertStopIndex(
  index: number,
  segmentCount: number,
  label: string,
): void {
  if (!Number.isInteger(index) || index < 0) {
    throw new RangeError(`${label} invalide : ${index}`)
  }
  // Une desserte à N segments compte N+1 arrêts, indicés de 0 à N.
  if (index > segmentCount) {
    throw new RangeError(
      `${label} hors desserte : arrêt ${index} pour ${segmentCount} segment(s)`,
    )
  }
}

function assertSeatCount(seats: number): void {
  if (!Number.isInteger(seats) || seats <= 0) {
    throw new RangeError(
      `Nombre de places invalide : ${seats} (entier strictement positif attendu)`,
    )
  }
}
