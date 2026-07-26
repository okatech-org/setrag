/**
 * Ventes — numérotation et ventilation fiscale. Logique pure.
 *
 * Le CDC §7.1.1 impose une identification unique par opération et interdit
 * les doublons ; le §7.8 impose une ventilation HT / TVA / CSS / TTC sur
 * chaque pièce comptable. Ces deux règles sont ici, hors de Convex, pour
 * pouvoir être vérifiées exhaustivement.
 */

/** Préfixes de numérotation par nature d'opération. */
export const NUMBER_PREFIXES = {
  vente: "V",
  billet: "B",
  /** Étiquette de bagage. */
  bagage: "G",
  /** Numéro d'expédition d'un colis express. */
  colis: "C",
  /** Vignette apposée sur un article de colis. */
  vignette: "E",
  taa: "A",
  funeraire: "F",
  annulation: "X",
  remboursement: "R",
} as const
export type NumberKind = keyof typeof NUMBER_PREFIXES

/**
 * Clé de séquence : une par point de vente, journée et nature d'opération.
 *
 * Ce découpage garantit la continuité exigée pour le contrôle des recettes
 * tout en évitant qu'un compteur unique ne devienne un point de contention
 * entre les 27 guichets du réseau.
 */
export function sequenceKey(
  pointOfSaleCode: string,
  serviceDate: string,
  kind: NumberKind,
): string {
  if (!pointOfSaleCode) {
    throw new Error("Code de point de vente obligatoire pour la numérotation")
  }
  return `${pointOfSaleCode}:${serviceDate}:${kind}`
}

/** Numéro d'opération lisible, ex. « B-OWE-PV-20260814-000042 ». */
export function formatNumber(
  kind: NumberKind,
  pointOfSaleCode: string,
  serviceDate: string,
  sequence: number,
): string {
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new RangeError(`Numéro de séquence invalide : ${sequence}`)
  }
  const compact = serviceDate.replaceAll("-", "")
  const padded = String(sequence).padStart(6, "0")
  return `${NUMBER_PREFIXES[kind]}-${pointOfSaleCode}-${compact}-${padded}`
}

/** Montants d'une opération, tels que stockés sur la vente. */
export interface Amounts {
  readonly ht: number
  readonly vat: number
  readonly css: number
  readonly ttc: number
  readonly received: number
}

/**
 * Ventile un montant TTC en hors-taxes, TVA et CSS.
 *
 * La TVA absorbe le résidu d'arrondi pour que l'identité
 * `HT + TVA + CSS = TTC` soit exacte au centime — c'est elle qui fait foi
 * dans le journal comptable déversé vers SAGE.
 */
export function splitTaxes(
  ttc: number,
  vatPct: number,
  cssPct: number,
): Omit<Amounts, "received"> {
  if (!Number.isFinite(ttc) || ttc < 0) {
    throw new RangeError(`Montant TTC invalide : ${ttc}`)
  }
  for (const [label, value] of [
    ["TVA", vatPct],
    ["CSS", cssPct],
  ] as const) {
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      throw new RangeError(`Taux de ${label} invalide : ${value}`)
    }
  }

  const multiplier = 1 + vatPct / 100 + cssPct / 100
  const ht = round2(ttc / multiplier)
  const css = round2(ht * (cssPct / 100))
  const ttcRounded = round2(ttc)
  const vat = round2(ttcRounded - ht - css)
  return { ht, vat, css, ttc: ttcRounded }
}

/** Construit les montants d'une vente à partir du TTC et du montant perçu. */
export function buildAmounts(
  ttc: number,
  vatPct: number,
  cssPct: number,
  received: number,
): Amounts {
  if (!Number.isFinite(received) || received < 0) {
    throw new RangeError(`Montant perçu invalide : ${received}`)
  }
  return { ...splitTaxes(ttc, vatPct, cssPct), received }
}

/** Additionne plusieurs ventilations, pour une vente à plusieurs titres. */
export function sumAmounts(parts: readonly Amounts[]): Amounts {
  return parts.reduce<Amounts>(
    (total, part) => ({
      ht: round2(total.ht + part.ht),
      vat: round2(total.vat + part.vat),
      css: round2(total.css + part.css),
      ttc: round2(total.ttc + part.ttc),
      received: round2(total.received + part.received),
    }),
    { ht: 0, vat: 0, css: 0, ttc: 0, received: 0 },
  )
}

/**
 * Inverse le signe d'une ventilation.
 *
 * Les annulations et remboursements sont enregistrés en montants négatifs :
 * ils viennent ainsi en déduction des ventes dans les états de caisse et le
 * journal comptable par simple addition. Le CDC cite explicitement le fait
 * que « les remboursements et annulations ne viennent pas en déduction des
 * ventes dans les états » comme un défaut de l'existant.
 */
export function negateAmounts(amounts: Amounts): Amounts {
  return {
    ht: -amounts.ht,
    vat: -amounts.vat,
    css: -amounts.css,
    ttc: -amounts.ttc,
    received: -amounts.received,
  }
}

/** Reste à payer sur une opération. */
export function outstanding(amounts: Amounts): number {
  return round2(Math.max(0, amounts.ttc - amounts.received))
}

/** Vrai si l'opération est intégralement réglée. */
export function isFullyPaid(amounts: Amounts): boolean {
  return outstanding(amounts) === 0
}

/** Monnaie à rendre sur un règlement en espèces. */
export function changeDue(ttc: number, tendered: number): number {
  if (!Number.isFinite(tendered) || tendered < 0) {
    throw new RangeError(`Montant remis invalide : ${tendered}`)
  }
  if (tendered < ttc) {
    throw new Error(
      `Règlement insuffisant : ${tendered} remis pour ${ttc} dus`,
    )
  }
  return round2(tendered - ttc)
}

/**
 * Montant remboursable après application de la pénalité.
 * Le taux vient du paramétrage, jamais du code : le CDC §8.5 en fait un
 * paramètre d'exploitation.
 */
export function refundAmount(paidTtc: number, penaltyPct: number): number {
  if (!Number.isFinite(paidTtc) || paidTtc < 0) {
    throw new RangeError(`Montant payé invalide : ${paidTtc}`)
  }
  if (!Number.isFinite(penaltyPct) || penaltyPct < 0 || penaltyPct > 100) {
    throw new RangeError(`Taux de pénalité invalide : ${penaltyPct}`)
  }
  return round2(paidTtc * (1 - penaltyPct / 100))
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}
