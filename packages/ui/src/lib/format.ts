/**
 * Formatage des chiffres affichés par les composants du design system.
 * Les montants et les heures sortent en mono (cf. `.tabular`) pour s'aligner
 * d'une ligne à l'autre dans les listes de résultats.
 */

export const DEFAULT_CURRENCY = "XAF"
export const DEFAULT_LOCALE = "fr-GA"

/** Montant sans décimales — le franc CFA n'a pas de subdivision d'usage. */
export function formatPrice(
  amount: number,
  { currency = DEFAULT_CURRENCY, locale = DEFAULT_LOCALE } = {}
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount)
}

/** Heure « 07:42 » sur le fuseau donné. */
export function formatTime(
  value: number | Date,
  { locale = DEFAULT_LOCALE, timeZone = "Africa/Libreville" } = {}
): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(value)
}

/** Durée en minutes → « 1 h 56 », « 45 min ». */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")}`
}

/**
 * Heure lue en toutes lettres pour les lecteurs d'écran.
 * « 07:42 » → « 7 heures 42 ».
 */
export function spellTime(value: number | Date, locale = DEFAULT_LOCALE): string {
  const [hours, minutes] = formatTime(value, { locale }).split(":")
  const h = Number(hours)
  const m = Number(minutes)
  const heure = h <= 1 ? "heure" : "heures"
  return m === 0 ? `${h} ${heure}` : `${h} ${heure} ${m}`
}
