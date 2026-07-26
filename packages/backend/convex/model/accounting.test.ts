import { describe, expect, it } from "vitest"
import {
  DEFAULT_ANALYTIC_ACCOUNTS,
  DEFAULT_JOURNAL_CODE,
  buildJournalEntries,
  findSequenceGaps,
  parsePreprintedNumber,
  serializeJournal,
  summarizeByAccount,
  validateJournal,
  type AccountableSale,
} from "./accounting"

const OPTIONS = { financialSite: "SETRAG", costCenter: "OWE" }

const VENTE_BILLET: AccountableSale = {
  number: "V-OWE-PV-20260814-000001",
  product: "billet",
  kind: "vente",
  pointOfSaleCode: "OWE-PV",
  saleDate: "2026-08-14",
  ht: 23813.56,
  vat: 4286.44,
  css: 0,
  ttc: 28100,
}

const VENTE_BAGAGE: AccountableSale = {
  number: "V-OWE-PV-20260814-000002",
  product: "bagage",
  kind: "vente",
  pointOfSaleCode: "OWE-PV",
  saleDate: "2026-08-14",
  ht: 593.22,
  vat: 106.78,
  css: 0,
  ttc: 700,
}

/** Annulation du billet : montants négatifs, en déduction des ventes. */
const ANNULATION: AccountableSale = {
  number: "X-OWE-PV-20260814-000001",
  product: "billet",
  kind: "annulation",
  pointOfSaleCode: "OWE-PV",
  saleDate: "2026-08-14",
  ht: -23813.56,
  vat: -4286.44,
  css: 0,
  ttc: -28100,
}

describe("Construction du journal V65", () => {
  it("produit une écriture par vente, avec son numéro de pièce", () => {
    const entries = buildJournalEntries([VENTE_BILLET, VENTE_BAGAGE], OPTIONS)
    expect(entries).toHaveLength(2)
    expect(entries[0]?.pieceNumber).toBe(VENTE_BILLET.number)
    expect(entries[0]?.journalCode).toBe(DEFAULT_JOURNAL_CODE)
    expect(entries[0]?.financialSite).toBe("SETRAG")
    expect(entries[0]?.costCenter).toBe("OWE")
  })

  it("affecte le compte analytique du produit", () => {
    const entries = buildJournalEntries([VENTE_BILLET, VENTE_BAGAGE], OPTIONS)
    expect(entries[0]?.analyticAccount).toBe(
      DEFAULT_ANALYTIC_ACCOUNTS.billet,
    )
    expect(entries[1]?.analyticAccount).toBe(
      DEFAULT_ANALYTIC_ACCOUNTS.bagage,
    )
  })

  it("distingue les cinq produits par un compte distinct", () => {
    const comptes = Object.values(DEFAULT_ANALYTIC_ACCOUNTS)
    expect(new Set(comptes).size).toBe(comptes.length)
    expect(comptes).toHaveLength(5)
  })

  it("accepte un plan comptable surchargé par le paramétrage", () => {
    const entries = buildJournalEntries([VENTE_BILLET], {
      ...OPTIONS,
      analyticAccounts: { billet: "999999" },
    })
    expect(entries[0]?.analyticAccount).toBe("999999")
  })

  it("conserve les montants négatifs des annulations", () => {
    const entries = buildJournalEntries([ANNULATION], OPTIONS)
    expect(entries[0]?.ttc).toBe(-28100)
    expect(entries[0]?.ht).toBeLessThan(0)
  })

  it("refuse un produit sans compte analytique", () => {
    expect(() =>
      buildJournalEntries([VENTE_BILLET], {
        ...OPTIONS,
        analyticAccounts: { bagage: "706200" },
      }),
    ).toThrow(/Aucun compte analytique/)
  })

  it("refuse un site financier vide", () => {
    expect(() =>
      buildJournalEntries([VENTE_BILLET], { financialSite: "" }),
    ).toThrow(/Site financier obligatoire/)
  })

  it("accepte une journée sans vente", () => {
    expect(buildJournalEntries([], OPTIONS)).toEqual([])
  })
})

describe("Validation avant transmission", () => {
  it("valide un journal équilibré", () => {
    const entries = buildJournalEntries([VENTE_BILLET, VENTE_BAGAGE], OPTIONS)
    const r = validateJournal(entries, 28800)
    expect(r.balanced).toBe(true)
    expect(r.totalTtc).toBe(28800)
    expect(r.anomalies).toEqual([])
  })

  it("compense correctement une annulation", () => {
    const entries = buildJournalEntries(
      [VENTE_BILLET, VENTE_BAGAGE, ANNULATION],
      OPTIONS,
    )
    const r = validateJournal(entries, 700)
    expect(r.balanced).toBe(true)
    expect(r.totalTtc).toBe(700)
  })

  it("détecte une ventilation fiscale déséquilibrée", () => {
    const entries = buildJournalEntries(
      [{ ...VENTE_BILLET, vat: 1000 }],
      OPTIONS,
    )
    const r = validateJournal(entries, 28100)
    expect(r.balanced).toBe(false)
    expect(r.anomalies[0]?.reason).toContain("Ventilation déséquilibrée")
    expect(r.anomalies[0]?.pieceNumber).toBe(VENTE_BILLET.number)
  })

  it("détecte un écart entre le journal et le total de la journée", () => {
    const entries = buildJournalEntries([VENTE_BILLET], OPTIONS)
    const r = validateJournal(entries, 99999)
    expect(r.balanced).toBe(false)
    expect(r.anomalies.some((a) => a.pieceNumber === "*")).toBe(true)
    expect(r.anomalies[0]?.reason).toContain("différent du total de la journée")
  })

  it("tolère l'arrondi au centime", () => {
    const entries = buildJournalEntries([VENTE_BILLET], OPTIONS)
    expect(validateJournal(entries, 28100.005).balanced).toBe(true)
  })

  it("valide une journée vide", () => {
    const r = validateJournal([], 0)
    expect(r.balanced).toBe(true)
    expect(r.totalTtc).toBe(0)
  })
})

describe("Récapitulatif par compte", () => {
  it("agrège les écritures par compte analytique", () => {
    const entries = buildJournalEntries(
      [VENTE_BILLET, VENTE_BAGAGE, VENTE_BILLET],
      OPTIONS,
    )
    const recap = summarizeByAccount(entries)
    const billets = recap.find((r) => r.analyticAccount === "706100")
    expect(billets?.count).toBe(2)
    expect(billets?.ttc).toBe(56200)
    expect(recap).toHaveLength(2)
  })

  it("ordonne les comptes pour un état lisible", () => {
    const entries = buildJournalEntries([VENTE_BAGAGE, VENTE_BILLET], OPTIONS)
    const recap = summarizeByAccount(entries)
    expect(recap.map((r) => r.analyticAccount)).toEqual(["706100", "706200"])
  })
})

describe("Sérialisation du fichier SAGE", () => {
  it("produit un en-tête et une ligne par écriture", () => {
    const entries = buildJournalEntries([VENTE_BILLET, VENTE_BAGAGE], OPTIONS)
    const lignes = serializeJournal(entries).split("\n")
    expect(lignes).toHaveLength(3)
    expect(lignes[0]).toContain("JOURNAL;PIECE;DATE")
  })

  it("formate les montants à deux décimales", () => {
    const csv = serializeJournal(buildJournalEntries([VENTE_BILLET], OPTIONS))
    expect(csv).toContain("23813.56;4286.44;0.00;28100.00")
  })

  it("porte le numéro de pièce et le compte analytique", () => {
    const csv = serializeJournal(buildJournalEntries([VENTE_BILLET], OPTIONS))
    expect(csv).toContain("V-OWE-PV-20260814-000001")
    expect(csv).toContain("706100")
    expect(csv).toContain("SETRAG")
  })

  it("gère l'absence de centre de coût", () => {
    const csv = serializeJournal(
      buildJournalEntries([VENTE_BILLET], { financialSite: "SETRAG" }),
    )
    expect(csv).toContain("706100;;")
  })
})

/* ═══════════════ Continuité des billets pré-imprimés ═════════════════════ */

describe("parsePreprintedNumber", () => {
  it("décompose un numéro de carnet", () => {
    expect(parsePreprintedNumber("PP-0042817")).toEqual({
      prefix: "PP",
      value: 42817,
    })
  })

  it("accepte un numéro sans préfixe", () => {
    expect(parsePreprintedNumber("0042817")).toEqual({
      prefix: "",
      value: 42817,
    })
  })

  it("tolère les espaces autour", () => {
    expect(parsePreprintedNumber("  PP-42817 ").value).toBe(42817)
  })

  it("refuse un numéro illisible", () => {
    expect(() => parsePreprintedNumber("carnet bleu")).toThrow(/illisible/)
    expect(() => parsePreprintedNumber("")).toThrow(/illisible/)
  })
})

describe("findSequenceGaps — détection des billets manquants", () => {
  it("ne signale aucun trou sur une séquence continue", () => {
    const r = findSequenceGaps(["PP-001", "PP-002", "PP-003"])
    expect(r.missing).toEqual([])
    expect(r.min).toBe(1)
    expect(r.max).toBe(3)
    expect(r.prefix).toBe("PP")
  })

  it("détecte les numéros manquants", () => {
    const r = findSequenceGaps(["PP-0042810", "PP-0042813", "PP-0042817"])
    expect(r.missing).toEqual([
      42811, 42812, 42814, 42815, 42816,
    ])
  })

  it("ne dépend pas de l'ordre de saisie", () => {
    const a = findSequenceGaps(["PP-003", "PP-001"])
    const b = findSequenceGaps(["PP-001", "PP-003"])
    expect(a.missing).toEqual(b.missing)
    expect(a.missing).toEqual([2])
  })

  it("gère un carnet à un seul billet", () => {
    const r = findSequenceGaps(["PP-100"])
    expect(r.missing).toEqual([])
    expect(r.min).toBe(100)
    expect(r.max).toBe(100)
  })

  it("gère une liste vide", () => {
    expect(findSequenceGaps([])).toEqual({
      prefix: null,
      min: null,
      max: null,
      missing: [],
    })
  })

  it("refuse de mélanger deux carnets", () => {
    expect(() => findSequenceGaps(["PP-001", "QQ-002"])).toThrow(
      /Carnets hétérogènes/,
    )
  })

  it("détecte un trou sur une plage large sans exploser", () => {
    const r = findSequenceGaps(["PP-1", "PP-1000"])
    expect(r.missing).toHaveLength(998)
  })
})
