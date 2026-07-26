/**
 * Journal comptable des ventes — logique pure.
 *
 * Le CDC §7.8 impose de déverser le chiffre d'affaires dans SAGE X3 après
 * chaque journée comptable, au format de l'état V65. Ce module construit ces
 * écritures et vérifie leur équilibre : une journée déversée avec un écart
 * fausserait la comptabilité générale, et ce genre d'erreur ne se rattrape
 * pas facilement une fois transmis.
 */

/** Produits voyageurs, tels qu'ils portent un compte analytique distinct. */
export type AccountingProduct =
  | "billet"
  | "bagage"
  | "colis"
  | "taa"
  | "funeraire"

/**
 * Comptes analytiques par produit.
 *
 * Valeurs par défaut, à confirmer avec la direction financière : le CDC
 * mentionne le « compte analytique de l'article » sans fournir le plan
 * comptable. Elles sont surchargeables par le paramétrage.
 */
export const DEFAULT_ANALYTIC_ACCOUNTS: Readonly<
  Record<AccountingProduct, string>
> = {
  billet: "706100",
  bagage: "706200",
  colis: "706300",
  taa: "706400",
  funeraire: "706500",
}

/** Code du journal de ventes dans SAGE. */
export const DEFAULT_JOURNAL_CODE = "VT"

/** Vente telle qu'elle entre dans le journal. */
export interface AccountableSale {
  readonly number: string
  readonly product: AccountingProduct
  readonly kind: "vente" | "annulation" | "remboursement"
  readonly pointOfSaleCode: string
  readonly saleDate: string
  readonly ht: number
  readonly vat: number
  readonly css: number
  readonly ttc: number
}

/** Écriture au format V65 attendu par SAGE X3. */
export interface JournalEntry {
  readonly journalCode: string
  readonly pieceNumber: string
  readonly saleDate: string
  readonly financialSite: string
  readonly pointOfSaleCode: string
  readonly analyticAccount: string
  readonly costCenter?: string
  readonly ht: number
  readonly vat: number
  readonly css: number
  readonly ttc: number
}

export interface JournalOptions {
  readonly financialSite: string
  readonly journalCode?: string
  readonly analyticAccounts?: Readonly<Record<string, string>>
  /** Centre de coût, généralement la gare ou la direction commerciale. */
  readonly costCenter?: string
}

/**
 * Construit les écritures d'une journée.
 *
 * Une écriture par vente : le CDC demande le numéro de pièce au niveau de
 * l'opération (« n° billet voyageur, bagage, colis, TAA, TF »), pas un
 * agrégat. Les annulations et remboursements portent des montants négatifs
 * et viennent donc en déduction par simple addition.
 */
export function buildJournalEntries(
  sales: readonly AccountableSale[],
  options: JournalOptions,
): JournalEntry[] {
  if (!options.financialSite) {
    throw new Error("Site financier obligatoire pour le déversement comptable")
  }
  const accounts = options.analyticAccounts ?? DEFAULT_ANALYTIC_ACCOUNTS
  const journalCode = options.journalCode ?? DEFAULT_JOURNAL_CODE

  return sales.map((sale) => {
    const analyticAccount = accounts[sale.product]
    if (!analyticAccount) {
      throw new Error(
        `Aucun compte analytique pour le produit « ${sale.product} » : ` +
          `déversement impossible`,
      )
    }
    return {
      journalCode,
      pieceNumber: sale.number,
      saleDate: sale.saleDate,
      financialSite: options.financialSite,
      pointOfSaleCode: sale.pointOfSaleCode,
      analyticAccount,
      costCenter: options.costCenter,
      ht: round2(sale.ht),
      vat: round2(sale.vat),
      css: round2(sale.css),
      ttc: round2(sale.ttc),
    }
  })
}

/** Anomalie détectée avant transmission à SAGE. */
export interface JournalAnomaly {
  readonly pieceNumber: string
  readonly reason: string
}

/**
 * Vérifie l'équilibre des écritures avant transmission.
 *
 * Deux contrôles : chaque écriture doit vérifier HT + TVA + CSS = TTC, et le
 * cumul doit correspondre au total attendu de la journée. Le déversement est
 * refusé au premier écart — mieux vaut bloquer une clôture que transmettre
 * un journal faux.
 */
export function validateJournal(
  entries: readonly JournalEntry[],
  expectedTotalTtc: number,
  tolerance = 0.01,
): { balanced: boolean; totalTtc: number; anomalies: JournalAnomaly[] } {
  const anomalies: JournalAnomaly[] = []

  for (const entry of entries) {
    const somme = round2(entry.ht + entry.vat + entry.css)
    if (Math.abs(somme - entry.ttc) > tolerance) {
      anomalies.push({
        pieceNumber: entry.pieceNumber,
        reason:
          `Ventilation déséquilibrée : HT ${entry.ht} + TVA ${entry.vat} + ` +
          `CSS ${entry.css} = ${somme}, attendu ${entry.ttc}`,
      })
    }
    if (!entry.analyticAccount) {
      anomalies.push({
        pieceNumber: entry.pieceNumber,
        reason: "Compte analytique manquant",
      })
    }
  }

  const totalTtc = round2(entries.reduce((sum, e) => sum + e.ttc, 0))
  if (Math.abs(totalTtc - expectedTotalTtc) > tolerance) {
    anomalies.push({
      pieceNumber: "*",
      reason:
        `Total du journal (${totalTtc}) différent du total de la journée ` +
        `(${expectedTotalTtc})`,
    })
  }

  return { balanced: anomalies.length === 0, totalTtc, anomalies }
}

/** Récapitulatif par compte analytique, pour le contrôle avant transmission. */
export function summarizeByAccount(
  entries: readonly JournalEntry[],
): Array<{ analyticAccount: string; count: number; ht: number; ttc: number }> {
  const map = new Map<string, { count: number; ht: number; ttc: number }>()
  for (const entry of entries) {
    const current = map.get(entry.analyticAccount) ?? { count: 0, ht: 0, ttc: 0 }
    current.count += 1
    current.ht = round2(current.ht + entry.ht)
    current.ttc = round2(current.ttc + entry.ttc)
    map.set(entry.analyticAccount, current)
  }
  return [...map.entries()]
    .map(([analyticAccount, v]) => ({ analyticAccount, ...v }))
    .sort((a, b) => a.analyticAccount.localeCompare(b.analyticAccount))
}

/**
 * Sérialise le journal au format tabulaire attendu par SAGE.
 *
 * Le CDC fournit le gabarit de l'état V65 mais pas le mode de transport du
 * fichier. Le point-virgule est retenu comme séparateur, usuel dans les
 * imports SAGE francophones ; le format exact reste à confirmer avec la DSI.
 */
export function serializeJournal(entries: readonly JournalEntry[]): string {
  const header = [
    "JOURNAL",
    "PIECE",
    "DATE",
    "SITE",
    "POINT_VENTE",
    "COMPTE_ANALYTIQUE",
    "CENTRE_COUT",
    "HT",
    "TVA",
    "CSS",
    "TTC",
  ].join(";")

  const lines = entries.map((e) =>
    [
      e.journalCode,
      e.pieceNumber,
      e.saleDate,
      e.financialSite,
      e.pointOfSaleCode,
      e.analyticAccount,
      e.costCenter ?? "",
      e.ht.toFixed(2),
      e.vat.toFixed(2),
      e.css.toFixed(2),
      e.ttc.toFixed(2),
    ].join(";"),
  )

  return [header, ...lines].join("\n")
}

/* ─────────────────── Continuité des billets manuels ────────────────────── */

/**
 * Détecte les numéros manquants dans une plage de billets pré-imprimés.
 *
 * Le CDC §7.10 exige que la numérotation reste continue entre le carnet
 * papier et le système. Un trou signale un billet émis mais non ressaisi —
 * exactement le genre d'écart que le contrôle des recettes doit voir.
 */
export function findSequenceGaps(numbers: readonly string[]): {
  prefix: string | null
  min: number | null
  max: number | null
  missing: number[]
} {
  if (numbers.length === 0) {
    return { prefix: null, min: null, max: null, missing: [] }
  }

  const parsed = numbers.map(parsePreprintedNumber)
  const prefixes = new Set(parsed.map((p) => p.prefix))
  if (prefixes.size > 1) {
    throw new Error(
      `Carnets hétérogènes : ${[...prefixes].join(", ")}. La continuité se ` +
        `contrôle carnet par carnet.`,
    )
  }

  const values = parsed.map((p) => p.value).sort((a, b) => a - b)
  const min = values[0]!
  const max = values[values.length - 1]!
  const present = new Set(values)
  const missing: number[] = []
  for (let n = min; n <= max; n += 1) {
    if (!present.has(n)) missing.push(n)
  }

  return { prefix: parsed[0]!.prefix, min, max, missing }
}

/** Décompose un numéro pré-imprimé en préfixe de carnet et valeur. */
export function parsePreprintedNumber(value: string): {
  prefix: string
  value: number
} {
  const match = /^([A-Za-z-]*?)-?(\d+)$/.exec(value.trim())
  if (!match) {
    throw new Error(
      `Numéro pré-imprimé illisible : « ${value} » ` +
        `(format attendu : préfixe suivi de chiffres, ex. PP-0042817)`,
    )
  }
  return {
    prefix: match[1] ?? "",
    value: Number(match[2]),
  }
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}
