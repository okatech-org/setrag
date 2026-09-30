/**
 * Période de lecture des sources voyageurs (reporting). Les autres sources de
 * l'espace Direction générale sont des instantanés et ignorent ce réglage.
 */
export const PERIOD_PRESETS = ["30j", "mois", "trimestre", "annee"] as const

export type PeriodPreset = (typeof PERIOD_PRESETS)[number]

/** Aligné sur `reporting.defaultPeriod` : un mois en cours au 2 du mois ne dit rien. */
export const DEFAULT_PERIOD_PRESET: PeriodPreset = "30j"

export const PERIOD_QUERY_PARAM = "periode"

export const PERIOD_OPTIONS: readonly { value: PeriodPreset; label: string }[] =
  [
    { value: "30j", label: "30 jours" },
    { value: "mois", label: "Mois" },
    { value: "trimestre", label: "Trimestre" },
    { value: "annee", label: "Année" },
  ]

const PRESET_LABELS: Readonly<Record<PeriodPreset, string>> = {
  "30j": "30 derniers jours",
  mois: "Mois en cours",
  trimestre: "Trimestre en cours",
  annee: "Année en cours",
}

/** Décalage fixe de Libreville (UTC+1, sans heure d'été), comme `model/calendar.ts`. */
const LIBREVILLE_UTC_OFFSET_MS = 60 * 60 * 1000

const DAY_MONTH_FORMATTER = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
})

export function parsePeriodPreset(
  value: string | null | undefined
): PeriodPreset {
  return (
    PERIOD_PRESETS.find((preset) => preset === value) ?? DEFAULT_PERIOD_PRESET
  )
}

/** Date de service du jour à Libreville, au format `AAAA-MM-JJ`. */
export function todayInLibreville(now: Date = new Date()): string {
  return new Date(now.getTime() + LIBREVILLE_UTC_OFFSET_MS)
    .toISOString()
    .slice(0, 10)
}

/** Midi UTC : aucune dérive de fuseau ne peut changer le jour calendaire. */
function atNoonUtc(date: string) {
  return new Date(`${date}T12:00:00Z`)
}

export function addDays(date: string, days: number): string {
  const shifted = atNoonUtc(date)
  shifted.setUTCDate(shifted.getUTCDate() + days)
  return shifted.toISOString().slice(0, 10)
}

export interface PeriodRange {
  from: string
  to: string
}

export function periodRange(preset: PeriodPreset, today: string): PeriodRange {
  const year = today.slice(0, 4)
  const month = Number(today.slice(5, 7))

  switch (preset) {
    case "30j":
      return { from: addDays(today, -29), to: today }
    case "mois":
      return { from: `${today.slice(0, 8)}01`, to: today }
    case "trimestre": {
      const quarterStart = Math.floor((month - 1) / 3) * 3 + 1
      return {
        from: `${year}-${String(quarterStart).padStart(2, "0")}-01`,
        to: today,
      }
    }
    case "annee":
      return { from: `${year}-01-01`, to: today }
  }
}

/** Nombre de jours couverts, bornes incluses — la longueur de la période de référence. */
export function periodDays({ from, to }: PeriodRange): number {
  const ms = atNoonUtc(to).getTime() - atNoonUtc(from).getTime()
  return Math.round(ms / 86_400_000) + 1
}

export function formatDay(date: string): string {
  return DAY_MONTH_FORMATTER.format(atNoonUtc(date))
}

export function presetLabel(preset: PeriodPreset): string {
  return PRESET_LABELS[preset]
}

/** « 30 derniers jours · 14 août – 12 sept. » */
export function periodLabel(preset: PeriodPreset, range: PeriodRange): string {
  return `${PRESET_LABELS[preset]} · ${formatDay(range.from)} – ${formatDay(range.to)}`
}

/** « vs 30 jours précédents » : le reporting compare à la période précédente de même longueur. */
export function comparisonLabel(range: PeriodRange): string {
  return `vs ${periodDays(range)} jours précédents`
}

/** Chemin conservant la période choisie ; la période par défaut ne s'écrit pas. */
export function periodHref(pathname: string, preset: PeriodPreset): string {
  return preset === DEFAULT_PERIOD_PRESET
    ? pathname
    : `${pathname}?${PERIOD_QUERY_PARAM}=${preset}`
}
