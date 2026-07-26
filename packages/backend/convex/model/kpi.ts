/**
 * Agrégation des indicateurs d'exploitation — logique pure.
 *
 * Deux partis pris structurent ce module.
 *
 * Le premier : les indicateurs sont **pré-agrégés** à la clôture de journée,
 * pas recalculés à l'affichage. Une ligne à 250 000 voyageurs par an produit
 * de l'ordre de 20 000 ventes par mois ; les parcourir à chaque ouverture d'un
 * tableau de bord serait le traitement le plus coûteux du système, pour un
 * résultat qui ne change plus. Les requêtes lisent donc des cumuls journaliers,
 * en O(jours) et non en O(ventes).
 *
 * Le second : le taux de remplissage se mesure en **sièges-kilomètres**, pas
 * en billets vendus. Sur une ligne où un même siège se vend par tronçon, un
 * comptage de billets serait trompeur dans les deux sens — deux billets courts
 * ne remplissent pas un train, un billet de bout en bout ne le remplit pas non
 * plus. Le siège-kilomètre est la mesure du secteur, et c'est la seule qui
 * rende justice au modèle par segments.
 */

/* ══════════════════════════ Cumuls journaliers ═════════════════════════ */

/** Montants d'une agrégation, en francs CFA. */
export interface Amounts {
  readonly ht: number
  readonly vat: number
  readonly css: number
  readonly ttc: number
  readonly received: number
}

export const ZERO_AMOUNTS: Amounts = {
  ht: 0,
  vat: 0,
  css: 0,
  ttc: 0,
  received: 0,
}

/**
 * Cumul d'une tranche d'activité.
 *
 * Le brut et le net sont distingués volontairement : une journée à fort
 * chiffre d'affaires et fort taux d'annulation n'est pas une bonne journée, et
 * un indicateur qui ne montrerait que le brut le laisserait croire.
 */
export interface Metrics {
  readonly salesCount: number
  readonly ticketCount: number
  readonly cancelledCount: number
  readonly refundedCount: number
  /** Ventes fermes, hors annulations et remboursements. */
  readonly gross: Amounts
  /** Montants sortis : annulations et remboursements, en valeur absolue. */
  readonly refunded: Amounts
}

export const ZERO_METRICS: Metrics = {
  salesCount: 0,
  ticketCount: 0,
  cancelledCount: 0,
  refundedCount: 0,
  gross: ZERO_AMOUNTS,
  refunded: ZERO_AMOUNTS,
}

export function addAmounts(a: Amounts, b: Amounts): Amounts {
  return {
    ht: a.ht + b.ht,
    vat: a.vat + b.vat,
    css: a.css + b.css,
    ttc: a.ttc + b.ttc,
    received: a.received + b.received,
  }
}

/** Valeur absolue des montants — les écritures de sortie sont négatives. */
export function absAmounts(a: Amounts): Amounts {
  return {
    ht: Math.abs(a.ht),
    vat: Math.abs(a.vat),
    css: Math.abs(a.css),
    ttc: Math.abs(a.ttc),
    received: Math.abs(a.received),
  }
}

export function addMetrics(a: Metrics, b: Metrics): Metrics {
  return {
    salesCount: a.salesCount + b.salesCount,
    ticketCount: a.ticketCount + b.ticketCount,
    cancelledCount: a.cancelledCount + b.cancelledCount,
    refundedCount: a.refundedCount + b.refundedCount,
    gross: addAmounts(a.gross, b.gross),
    refunded: addAmounts(a.refunded, b.refunded),
  }
}

/** Chiffre d'affaires net : ce qui reste après annulations et remboursements. */
export function netTtc(m: Metrics): number {
  return m.gross.ttc - m.refunded.ttc
}

/**
 * Part du chiffre d'affaires annulée ou remboursée, en pourcentage.
 *
 * Rapportée au brut : c'est la question posée — quelle proportion de ce qui a
 * été vendu est ressortie. Rapportée au net, l'indicateur exploserait à mesure
 * que le net tend vers zéro, ce qui n'aiderait personne.
 */
export function refundRatePct(m: Metrics): number {
  if (m.gross.ttc === 0) return 0
  return round2((m.refunded.ttc / m.gross.ttc) * 100)
}

/** Panier moyen d'une vente ferme. */
export function averageBasketTtc(m: Metrics): number {
  if (m.salesCount === 0) return 0
  return Math.round(m.gross.ttc / m.salesCount)
}

/* ══════════════════════ Ventilation par dimension ══════════════════════ */

/** Ligne agrégée sur une dimension : canal, point de vente, produit, jour. */
export interface Slice<K extends string = string> {
  readonly key: K
  readonly label: string
  readonly metrics: Metrics
}

/** Regroupe des cumuls par clé, en conservant un libellé lisible. */
export function groupBy<T>(
  rows: readonly T[],
  keyOf: (row: T) => { key: string; label: string },
  metricsOf: (row: T) => Metrics,
): Slice[] {
  const buckets = new Map<string, Slice>()
  for (const row of rows) {
    const { key, label } = keyOf(row)
    const existing = buckets.get(key)
    buckets.set(key, {
      key,
      label,
      metrics: addMetrics(existing?.metrics ?? ZERO_METRICS, metricsOf(row)),
    })
  }
  return [...buckets.values()]
}

/** Trie par chiffre d'affaires net décroissant. */
export function byRevenue(slices: readonly Slice[]): Slice[] {
  return [...slices].sort((a, b) => netTtc(b.metrics) - netTtc(a.metrics))
}

/**
 * Retient les N premiers et agrège le reste sous « autres ».
 *
 * Tronquer sans le dire ferait lire un graphique comme s'il montrait tout.
 * La ligne « autres » garde le total juste.
 */
export function topWithRest(
  slices: readonly Slice[],
  n: number,
  restLabel = "Autres",
): Slice[] {
  const triés = byRevenue(slices)
  if (triés.length <= n) return triés
  const tête = triés.slice(0, n)
  const reste = triés.slice(n)
  return [
    ...tête,
    {
      key: "__autres__",
      label: `${restLabel} (${reste.length})`,
      metrics: reste.reduce((t, s) => addMetrics(t, s.metrics), ZERO_METRICS),
    },
  ]
}

/* ═══════════════════════ Comparaison de périodes ═══════════════════════ */

export interface Variation {
  readonly current: number
  readonly previous: number
  readonly delta: number
  /** Variation relative en pourcentage, `null` si la base est nulle. */
  readonly pct: number | null
}

/**
 * Compare deux périodes.
 *
 * `pct` vaut `null` quand la période de référence est à zéro. Renvoyer 100 %
 * ou l'infini laisserait afficher une croissance spectaculaire là où il n'y a
 * qu'une absence d'historique — c'est au tableau de bord de dire « pas de
 * référence », pas au calcul d'inventer un nombre.
 */
export function compare(current: number, previous: number): Variation {
  return {
    current,
    previous,
    delta: current - previous,
    pct: previous === 0 ? null : round2(((current - previous) / previous) * 100),
  }
}

/* ═══════════════════════ Taux de remplissage ═══════════════════════════ */

/** Compteur d'un tronçon, tel que l'inventaire le tient. */
export interface SegmentLoad {
  readonly segmentIndex: number
  readonly capacity: number
  readonly sold: number
  /** Longueur du tronçon en kilomètres. */
  readonly lengthKm: number
}

export interface LoadFactor {
  readonly seatKmOffered: number
  readonly seatKmSold: number
  /** Taux de remplissage en sièges-kilomètres, en pourcentage. */
  readonly pct: number
  /** Tronçon le plus chargé — celui qui limite la vente. */
  readonly peakSegmentIndex: number | null
  readonly peakPct: number
}

/**
 * Taux de remplissage d'une desserte, en sièges-kilomètres.
 *
 * Le tronçon de pointe est rendu à part : c'est lui qui borne la vente, et
 * c'est là qu'il faut ajouter des places. Un train à 60 % de remplissage moyen
 * dont un tronçon est à 100 % refuse déjà des voyageurs.
 */
export function loadFactor(segments: readonly SegmentLoad[]): LoadFactor {
  let offered = 0
  let sold = 0
  let peakSegmentIndex: number | null = null
  let peakPct = 0

  for (const s of segments) {
    offered += s.capacity * s.lengthKm
    sold += s.sold * s.lengthKm
    const pct = s.capacity === 0 ? 0 : (s.sold / s.capacity) * 100
    if (pct > peakPct) {
      peakPct = pct
      peakSegmentIndex = s.segmentIndex
    }
  }

  return {
    seatKmOffered: Math.round(offered),
    seatKmSold: Math.round(sold),
    pct: offered === 0 ? 0 : round2((sold / offered) * 100),
    peakSegmentIndex,
    peakPct: round2(peakPct),
  }
}

/** Cumule le remplissage de plusieurs dessertes. */
export function aggregateLoadFactor(
  factors: readonly Pick<LoadFactor, "seatKmOffered" | "seatKmSold">[],
): { seatKmOffered: number; seatKmSold: number; pct: number } {
  const offered = factors.reduce((t, f) => t + f.seatKmOffered, 0)
  const sold = factors.reduce((t, f) => t + f.seatKmSold, 0)
  return {
    seatKmOffered: offered,
    seatKmSold: sold,
    pct: offered === 0 ? 0 : round2((sold / offered) * 100),
  }
}

/* ════════════════════════ Écarts de caisse ═════════════════════════════ */

export interface VarianceSummary {
  readonly sessionCount: number
  readonly withVarianceCount: number
  /** Somme des écarts, signe compris : les manquants compensent les excédents. */
  readonly netXaf: number
  /** Somme des valeurs absolues : l'ampleur réelle des écarts. */
  readonly grossXaf: number
  readonly worstXaf: number
}

/**
 * Synthèse des écarts de caisse.
 *
 * Le net et le brut sont donnés ensemble parce qu'ils ne disent pas la même
 * chose : un net nul avec un brut élevé signale des erreurs de comptage qui se
 * compensent, ce qu'un seul des deux chiffres masquerait complètement.
 */
export function summarizeVariances(
  sessions: readonly { varianceXaf?: number }[],
): VarianceSummary {
  const écarts = sessions
    .map((s) => s.varianceXaf ?? 0)
    .filter((v) => v !== 0)

  return {
    sessionCount: sessions.length,
    withVarianceCount: écarts.length,
    netXaf: écarts.reduce((t, v) => t + v, 0),
    grossXaf: écarts.reduce((t, v) => t + Math.abs(v), 0),
    worstXaf: écarts.reduce(
      (pire, v) => (Math.abs(v) > Math.abs(pire) ? v : pire),
      0,
    ),
  }
}

/* ─────────────────────────────── Utilitaires ───────────────────────────── */

/** Arrondi à deux décimales — suffisant pour un pourcentage affiché. */
export function round2(value: number): number {
  return Math.round(value * 100) / 100
}
