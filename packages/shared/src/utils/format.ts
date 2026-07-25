import { CURRENCY, TIMEZONE } from "../constants"

/** Formate un montant en francs CFA (pas de décimales). */
export function formatXaf(amount: number, locale = "fr-GA"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: CURRENCY,
    maximumFractionDigits: 0,
  }).format(amount)
}

/** Formate un horodatage sur le fuseau d'exploitation. */
export function formatDateTime(ts: number, locale = "fr-GA"): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: TIMEZONE,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(ts))
}

export function formatTime(ts: number, locale = "fr-GA"): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ts))
}

/**
 * Heure lue en toutes lettres pour les lecteurs d'écran.
 * « 07:42 » → « 7 heures 42 ».
 */
export function spellTime(ts: number, locale = "fr-GA"): string {
  const [hours, minutes] = formatTime(ts, locale).split(":")
  const h = Number(hours)
  const m = Number(minutes)
  const heure = h <= 1 ? "heure" : "heures"
  return m === 0 ? `${h} ${heure}` : `${h} ${heure} ${m}`
}

/** Durée en minutes → « 7 h 45 ». */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")}`
}

/**
 * Référence de réservation lisible : 3 lettres + 5 chiffres (ex. SET-A4F2B1).
 * L'alphabet exclut les caractères ambigus (I, O, 0, 1).
 */
const REFERENCE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

/**
 * `crypto` est global sur les trois cibles (Convex, navigateur, Hermes) mais
 * n'est déclaré ni par la lib React Native ni par `lib: ["ES2022"]` seule.
 */
const webCrypto = globalThis as unknown as {
  crypto: { getRandomValues<T extends ArrayBufferView>(array: T): T }
}

export function generateReference(prefix = "SET", length = 6): string {
  let out = ""
  const bytes = new Uint8Array(length)
  webCrypto.crypto.getRandomValues(bytes)
  for (const byte of bytes) {
    out += REFERENCE_ALPHABET[byte % REFERENCE_ALPHABET.length]
  }
  return `${prefix}-${out}`
}
