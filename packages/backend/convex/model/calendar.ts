/**
 * Calendrier d'exploitation — logique pure.
 *
 * Le Gabon vit à l'heure de l'Afrique de l'Ouest (WAT, UTC+1) et
 * n'applique PAS de changement d'heure saisonnier. C'est une simplification
 * précieuse : une date de service se calcule par un décalage fixe, sans
 * dépendre d'une base de fuseaux horaires ni de l'heure locale du serveur —
 * lequel tourne aux États-Unis.
 *
 * Toutes les dates de service sont exprimées au format `AAAA-MM-JJ` dans le
 * fuseau de Libreville, jamais en UTC : c'est la date que lit l'agent au
 * guichet et qu'imprime le billet.
 */

/** Décalage du fuseau Africa/Libreville, en minutes. Constant toute l'année. */
export const LIBREVILLE_UTC_OFFSET_MINUTES = 60

const MS_PER_MINUTE = 60_000
const MS_PER_DAY = 86_400_000

/** Jours de la semaine, 0 = dimanche, conforme à `Date.getUTCDay()`. */
export const WEEKDAYS = [
  "dimanche",
  "lundi",
  "mardi",
  "mercredi",
  "jeudi",
  "vendredi",
  "samedi",
] as const
export type Weekday = (typeof WEEKDAYS)[number]

/** Date de service au format `AAAA-MM-JJ`. */
export type ServiceDate = string

const SERVICE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** Convertit un horodatage en date de service locale. */
export function toServiceDate(timestamp: number): ServiceDate {
  assertTimestamp(timestamp)
  const local = new Date(timestamp + LIBREVILLE_UTC_OFFSET_MINUTES * MS_PER_MINUTE)
  const year = local.getUTCFullYear()
  const month = String(local.getUTCMonth() + 1).padStart(2, "0")
  const day = String(local.getUTCDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

/**
 * Horodatage d'un instant local, exprimé en date de service et heure locale.
 * `time` est au format `HH:MM`.
 */
export function fromServiceDate(
  date: ServiceDate,
  time: string = "00:00",
): number {
  assertServiceDate(date)
  const { hours, minutes } = parseTime(time)
  const [year, month, day] = date.split("-").map(Number) as [
    number,
    number,
    number,
  ]
  const utc = Date.UTC(year, month - 1, day, hours, minutes)
  return utc - LIBREVILLE_UTC_OFFSET_MINUTES * MS_PER_MINUTE
}

/** Jour de la semaine d'une date de service, 0 = dimanche. */
export function weekdayOf(date: ServiceDate): number {
  assertServiceDate(date)
  const [year, month, day] = date.split("-").map(Number) as [
    number,
    number,
    number,
  ]
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

/** Nom du jour de la semaine, pour l'affichage. */
export function weekdayNameOf(date: ServiceDate): Weekday {
  return WEEKDAYS[weekdayOf(date)]!
}

/** Date de service décalée de `days` jours. */
export function addDays(date: ServiceDate, days: number): ServiceDate {
  assertServiceDate(date)
  if (!Number.isInteger(days)) {
    throw new RangeError(`Décalage en jours invalide : ${days}`)
  }
  return toServiceDate(fromServiceDate(date, "12:00") + days * MS_PER_DAY)
}

/** Nombre de jours entre deux dates de service. */
export function daysBetween(from: ServiceDate, to: ServiceDate): number {
  const a = fromServiceDate(from, "12:00")
  const b = fromServiceDate(to, "12:00")
  return Math.round((b - a) / MS_PER_DAY)
}

/**
 * Énumère les dates de circulation d'une desserte sur une période.
 *
 * `daysOfWeek` est la liste des jours où le train circule (0 = dimanche).
 * Une liste vide signifie « tous les jours », ce qui évite d'avoir à
 * énumérer les sept valeurs pour un train quotidien.
 */
export function enumerateServiceDates(
  from: ServiceDate,
  until: ServiceDate,
  daysOfWeek: readonly number[] = [],
): ServiceDate[] {
  assertServiceDate(from)
  assertServiceDate(until)
  for (const day of daysOfWeek) {
    if (!Number.isInteger(day) || day < 0 || day > 6) {
      throw new RangeError(
        `Jour de semaine invalide : ${day} (attendu entre 0 et 6)`,
      )
    }
  }
  if (daysBetween(from, until) < 0) {
    throw new Error(
      `Période invalide : ${until} précède ${from}`,
    )
  }

  const dates: ServiceDate[] = []
  const total = daysBetween(from, until)
  for (let offset = 0; offset <= total; offset += 1) {
    const date = addDays(from, offset)
    if (daysOfWeek.length === 0 || daysOfWeek.includes(weekdayOf(date))) {
      dates.push(date)
    }
  }
  return dates
}

/**
 * Fenêtre de mise en vente.
 *
 * Le CDC hésite entre un et trois mois (commentaires du §7.9.2). La durée est
 * donc un paramètre, avec le mois comme valeur par défaut — la règle de
 * validité actuelle des billets.
 */
export const DEFAULT_SALE_WINDOW_DAYS = 31

export function saleWindow(
  today: ServiceDate,
  windowDays: number = DEFAULT_SALE_WINDOW_DAYS,
): { from: ServiceDate; until: ServiceDate } {
  if (!Number.isInteger(windowDays) || windowDays < 1) {
    throw new RangeError(`Fenêtre de vente invalide : ${windowDays} jour(s)`)
  }
  return { from: today, until: addDays(today, windowDays) }
}

/** Vrai si une date de service tombe dans la fenêtre de vente ouverte. */
export function isWithinSaleWindow(
  serviceDate: ServiceDate,
  today: ServiceDate,
  windowDays: number = DEFAULT_SALE_WINDOW_DAYS,
): boolean {
  const window = saleWindow(today, windowDays)
  return (
    daysBetween(window.from, serviceDate) >= 0 &&
    daysBetween(serviceDate, window.until) >= 0
  )
}

/**
 * Nombre de jours entre l'instant courant et le départ — assiette de la
 * règle tarifaire d'anticipation.
 */
export function daysUntilDeparture(departureAt: number, now: number): number {
  assertTimestamp(departureAt)
  assertTimestamp(now)
  return Math.floor((departureAt - now) / MS_PER_DAY)
}

/* ─────────────────────────────── Utilitaires ───────────────────────────── */

function parseTime(time: string): { hours: number; minutes: number } {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time)
  if (!match) {
    throw new RangeError(`Heure invalide : « ${time} » (format HH:MM attendu)`)
  }
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) {
    throw new RangeError(`Heure hors bornes : « ${time} »`)
  }
  return { hours, minutes }
}

function assertServiceDate(date: string): void {
  if (!SERVICE_DATE_PATTERN.test(date)) {
    throw new RangeError(
      `Date de service invalide : « ${date} » (format AAAA-MM-JJ attendu)`,
    )
  }
  const [year, month, day] = date.split("-").map(Number) as [
    number,
    number,
    number,
  ]
  const rebuilt = new Date(Date.UTC(year, month - 1, day))
  if (
    rebuilt.getUTCFullYear() !== year ||
    rebuilt.getUTCMonth() !== month - 1 ||
    rebuilt.getUTCDate() !== day
  ) {
    throw new RangeError(`Date inexistante au calendrier : « ${date} »`)
  }
}

function assertTimestamp(value: number): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`Horodatage invalide : ${value}`)
  }
}
