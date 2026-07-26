/**
 * Plans de voiture — génération et validation des places. Logique pure.
 *
 * Le CDC §7.3 décrit l'import d'un plan de sièges par « nombre de rangées,
 * nombre de colonnes et nombre de places assises ». Ce module traduit ce plan
 * en places numérotées, avec la numérotation attendue par les voyageurs :
 * le rang en chiffres, la colonne en lettres — « 12A », « 12B »…
 */

/** Place engendrée par un plan de voiture. */
export interface GeneratedSeat {
  readonly label: string
  readonly row: number
  readonly column: number
}

/** Description d'un plan de voiture, telle qu'importée. */
export interface CoachPlan {
  readonly rowCount: number
  readonly columnCount: number
  /** Nombre de places assises déclaré, à des fins de contrôle. */
  readonly seatCount: number
}

/** Nombre maximal de colonnes représentables par une lettre unique. */
export const MAX_COLUMNS = 26

/**
 * Lettre de colonne, à partir de 1 : 1 → A, 2 → B, 26 → Z.
 * Au-delà de 26 colonnes on refuse plutôt que de produire des libellés
 * illisibles sur un billet imprimé.
 */
export function columnLabel(column: number): string {
  if (!Number.isInteger(column) || column < 1 || column > MAX_COLUMNS) {
    throw new RangeError(
      `Colonne invalide : ${column} (attendu entre 1 et ${MAX_COLUMNS})`,
    )
  }
  return String.fromCharCode(64 + column)
}

/** Libellé d'une place, ex. rang 12 colonne 1 → « 12A ». */
export function seatLabel(row: number, column: number): string {
  if (!Number.isInteger(row) || row < 1) {
    throw new RangeError(`Rangée invalide : ${row} (entier positif attendu)`)
  }
  return `${row}${columnLabel(column)}`
}

/**
 * Vérifie la cohérence d'un plan avant import.
 *
 * Le contrôle le plus important est l'égalité `rangées × colonnes` =
 * `places déclarées` : un écart signale une saisie erronée qui fausserait
 * tout l'inventaire de la desserte.
 */
export function validateCoachPlan(plan: CoachPlan): void {
  const { rowCount, columnCount, seatCount } = plan
  if (!Number.isInteger(rowCount) || rowCount < 1) {
    throw new RangeError(`Nombre de rangées invalide : ${rowCount}`)
  }
  if (!Number.isInteger(columnCount) || columnCount < 1) {
    throw new RangeError(`Nombre de colonnes invalide : ${columnCount}`)
  }
  if (columnCount > MAX_COLUMNS) {
    throw new RangeError(
      `Plan à ${columnCount} colonnes : au-delà de ${MAX_COLUMNS}, la ` +
        `numérotation par lettre n'est plus lisible`,
    )
  }
  if (!Number.isInteger(seatCount) || seatCount < 0) {
    throw new RangeError(`Nombre de places invalide : ${seatCount}`)
  }
  if (rowCount * columnCount !== seatCount) {
    throw new Error(
      `Plan incohérent : ${rowCount} rangées × ${columnCount} colonnes = ` +
        `${rowCount * columnCount} places, mais ${seatCount} déclarée(s)`,
    )
  }
}

/**
 * Engendre les places d'une voiture à partir de son plan.
 * L'ordre est celui de la numérotation : rang par rang, colonne par colonne.
 */
export function generateSeats(plan: CoachPlan): GeneratedSeat[] {
  validateCoachPlan(plan)
  const seats: GeneratedSeat[] = []
  for (let row = 1; row <= plan.rowCount; row += 1) {
    for (let column = 1; column <= plan.columnCount; column += 1) {
      seats.push({ label: seatLabel(row, column), row, column })
    }
  }
  return seats
}

/**
 * Capacité totale d'une composition, par classe de service.
 * Les places debout sont comptées séparément : elles n'ont pas de siège
 * attribué mais consomment bien de l'inventaire sur chaque segment.
 */
export interface CoachCapacity {
  readonly serviceClass: string
  readonly seatCount: number
  readonly standingCapacity: number
}

export function capacityByClass(
  coaches: readonly CoachCapacity[],
): Record<string, { seated: number; standing: number; total: number }> {
  const totals: Record<
    string,
    { seated: number; standing: number; total: number }
  > = {}
  for (const coach of coaches) {
    const entry = totals[coach.serviceClass] ?? {
      seated: 0,
      standing: 0,
      total: 0,
    }
    entry.seated += coach.seatCount
    entry.standing += coach.standingCapacity
    entry.total = entry.seated + entry.standing
    totals[coach.serviceClass] = entry
  }
  return totals
}
