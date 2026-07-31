/**
 * Formatage des montants et des heures.
 *
 * Les montants et les horaires s'affichent en chiffres tabulaires : c'est une
 * règle SETRAG, et elle a une raison — une colonne de montants qui ne
 * s'aligne pas se relit mal, et un contrôleur relit ses montants à la lumière
 * d'une voiture de nuit.
 */

/** Montant en francs CFA, séparateurs insécables compris. */
export function xaf(amount: number): string {
  return `${new Intl.NumberFormat("fr-FR").format(Math.round(amount))} FCFA`
}

/** Heure au format 24 h, sans secondes. */
export function hhmm(ms: number): string {
  return new Date(ms).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  })
}

/** Date courte : « 14/08 ». */
export function ddmm(ms: number): string {
  return new Date(ms).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
  })
}

/** Date et heure : « 14/08 à 18:20 ». */
export function dayTime(ms: number): string {
  return `${ddmm(ms)} à ${hhmm(ms)}`
}

/** En-tête de tournée : « jeudi 14 août · 18:04 ». */
export function longDayTime(ms: number): string {
  const date = new Date(ms).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  })
  return `${date} · ${hhmm(ms)}`
}

/** Libellés de classe tels qu'ils s'annoncent au voyageur. */
export const CLASS_LABELS: Record<string, string> = {
  DEUXIEME: "2e classe",
  PREMIERE: "1re classe",
  VIP: "VIP",
}

export function classLabel(serviceClass: string): string {
  return CLASS_LABELS[serviceClass] ?? serviceClass
}
