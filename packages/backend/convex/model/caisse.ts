/**
 * Caisse du guichet — billetage et attendu par moyen de règlement. Logique
 * pure, vérifiable hors de Convex.
 *
 * Le CDC §7.7 impose de rapprocher, caisse par caisse, ce que le système a
 * enregistré et ce que le vendeur a compté. Le rapprochement se fait moyen
 * par moyen : les espèces se comptent au billetage, les paiements mobiles se
 * lisent sur le relevé de l'opérateur, la carte sur les tickets du TPE.
 */

export type MoyenPaiement =
  | "especes"
  | "airtel_money"
  | "moov_money"
  | "clickpay"
  | "visa"
  | "mastercard"
  | "en_compte"

/** Ordre d'affichage des moyens, du plus courant au plus rare. */
export const MOYENS_PAIEMENT: readonly MoyenPaiement[] = [
  "especes",
  "airtel_money",
  "moov_money",
  "visa",
  "mastercard",
  "clickpay",
  "en_compte",
]

/** Moyens réglés hors du guichet, dont la confirmation vient de l'opérateur. */
export const MOYENS_A_DISTANCE: readonly MoyenPaiement[] = [
  "airtel_money",
  "moov_money",
  "clickpay",
]

/** Coupures du franc CFA (BEAC) en circulation, billets puis pièces. */
export const COUPURES_XAF = [
  10_000, 5_000, 2_000, 1_000, 500, 100, 50, 25, 10, 5,
] as const

export interface LigneBilletage {
  readonly denomination: number
  readonly count: number
}

/** Refuse une coupure inconnue ou une quantité qui n'est pas un entier ≥ 0. */
export function validerBilletage(lignes: readonly LigneBilletage[]): void {
  const vues = new Set<number>()
  for (const ligne of lignes) {
    if (!(COUPURES_XAF as readonly number[]).includes(ligne.denomination)) {
      throw new Error(`Coupure inconnue : ${ligne.denomination} XAF`)
    }
    if (!Number.isInteger(ligne.count) || ligne.count < 0) {
      throw new Error(
        `Quantité invalide pour la coupure de ${ligne.denomination} XAF : ` +
          `${ligne.count}`
      )
    }
    if (vues.has(ligne.denomination)) {
      throw new Error(`Coupure de ${ligne.denomination} XAF saisie deux fois`)
    }
    vues.add(ligne.denomination)
  }
}

/** Total d'un billetage, en XAF. */
export function totalBilletage(lignes: readonly LigneBilletage[]): number {
  return lignes.reduce((total, l) => total + l.denomination * l.count, 0)
}

/** Ce qu'une vente apporte au rapprochement : montant perçu et moyen. */
export interface OperationCaisse {
  readonly kind: "vente" | "annulation" | "remboursement"
  readonly status: string
  readonly paymentMethod?: MoyenPaiement
  readonly accountingDayId?: unknown
  readonly amounts: { readonly received: number; readonly ttc: number }
}

/**
 * Une opération compte dans la caisse dès qu'elle est entrée en comptabilité.
 *
 * Une réservation tenue au guichet (places bloquées pendant la saisie ou le
 * paiement mobile) porte déjà la session de caisse, mais aucune journée
 * comptable tant qu'elle n'est pas réglée : elle n'a rien encaissé.
 */
export function compteEnCaisse(operation: OperationCaisse): boolean {
  return (
    operation.accountingDayId !== undefined &&
    operation.status !== "en_attente_paiement" &&
    operation.status !== "expiree"
  )
}

export interface AttenduMoyen {
  method: MoyenPaiement
  /** Montant net perçu : ventes moins annulations et remboursements. */
  amountXaf: number
  /** Nombre d'opérations réglées par ce moyen. */
  count: number
}

/**
 * Attendu par moyen de règlement, hors fonds de caisse.
 *
 * Une vente enregistrée avant l'apparition du moyen sur la vente est comptée
 * en espèces : c'était alors le seul moyen accepté au guichet.
 */
export function attenduParMoyen(
  operations: readonly OperationCaisse[]
): AttenduMoyen[] {
  const parMoyen = new Map<MoyenPaiement, AttenduMoyen>()
  for (const operation of operations) {
    if (!compteEnCaisse(operation)) continue
    const method = operation.paymentMethod ?? "especes"
    const ligne = parMoyen.get(method) ?? { method, amountXaf: 0, count: 0 }
    ligne.amountXaf = arrondi(ligne.amountXaf + operation.amounts.received)
    ligne.count += 1
    parMoyen.set(method, ligne)
  }
  return MOYENS_PAIEMENT.flatMap((method) => {
    const ligne = parMoyen.get(method)
    return ligne ? [ligne] : []
  })
}

/** Écart entre le compté et l'attendu, tous moyens confondus. */
export function ecartCaisse(
  attendu: readonly { amountXaf: number }[],
  compte: readonly { amountXaf: number }[]
): number {
  const somme = (lignes: readonly { amountXaf: number }[]) =>
    lignes.reduce((total, l) => total + l.amountXaf, 0)
  return arrondi(somme(compte) - somme(attendu))
}

function arrondi(valeur: number): number {
  return Math.round((valeur + Number.EPSILON) * 100) / 100
}
