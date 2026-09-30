import { describe, expect, it } from "vitest"

import {
  assertDateInPeriod,
  assertNoEffectivePeriodOverlap,
  assertRateBasisPoints,
  assertSafeFcfaAmount,
  assertSeparationOfDuties,
  effectivePeriodsOverlap,
  financePayloadFingerprint,
  isDateEffective,
  normalizeEffectivePeriod,
  normalizeFinanceCode,
  normalizeIsoDate,
  normalizeIsoPeriod,
  normalizeLegalSourceUrl,
  normalizeSyscohadaAccountCode,
  validateJournalLines,
} from "./model"

describe("invariants Finance OHADA/DGI", () => {
  it.each([
    "10",
    "211",
    "3112",
    "401100",
    "521000",
    "601",
    "706",
    "812",
    "9010",
  ])("accepte le compte SYSCOHADA %s des classes 1 à 9", (code) => {
    expect(normalizeSyscohadaAccountCode(` ${code} `)).toBe(code)
  })

  it.each(["01", "1", "A01", "401-1", "", "  "])(
    "refuse le code de compte invalide %j",
    (code) => {
      expect(() => normalizeSyscohadaAccountCode(code)).toThrow("SYSCOHADA")
    }
  )

  it("normalise les identifiants sans introduire de valeur métier", () => {
    expect(normalizeFinanceCode(" dgi-gabon.v1 ", "Le code")).toBe(
      "DGI-GABON.V1"
    )
  })

  it("n'accepte qu'une source légale HTTPS valide", () => {
    expect(normalizeLegalSourceUrl("https://journal-officiel.ga/texte")).toBe(
      "https://journal-officiel.ga/texte"
    )
    expect(() => normalizeLegalSourceUrl("http://example.test/texte")).toThrow(
      "HTTPS"
    )
    expect(() => normalizeLegalSourceUrl("pas-une-url")).toThrow("invalide")
  })

  it("valide uniquement des montants FCFA entiers sûrs", () => {
    expect(assertSafeFcfaAmount(125_000, "Le montant")).toBe(125_000)
    expect(() => assertSafeFcfaAmount(1.5, "Le montant")).toThrow("entier")
    expect(() => assertSafeFcfaAmount(-1, "Le montant")).toThrow("entier")
    expect(() =>
      assertSafeFcfaAmount(Number.MAX_SAFE_INTEGER + 1, "Le montant")
    ).toThrow("entier")
  })

  it("valide les taux explicites en points de base", () => {
    // Exemples documentaires du cadre fourni, jamais des valeurs runtime.
    expect(assertRateBasisPoints(1_800)).toBe(1_800)
    expect(assertRateBasisPoints(100)).toBe(100)
    expect(() => assertRateBasisPoints(10_001)).toThrow("10 000")
    expect(() => assertRateBasisPoints(95.5)).toThrow("entier")
  })

  it("valide strictement les dates et périodes ISO", () => {
    expect(normalizeIsoDate("2028-02-29", "La date")).toBe("2028-02-29")
    expect(() => normalizeIsoDate("2027-02-29", "La date")).toThrow(
      "date civile"
    )
    expect(normalizeIsoPeriod("2026-09")).toBe("2026-09")
    expect(() => normalizeIsoPeriod("2026-13")).toThrow("YYYY-MM")
    expect(() => assertDateInPeriod("2026-10-01", "2026-09")).toThrow(
      "hors de la période"
    )
  })

  it("détecte les chevauchements, y compris sur une borne inclusive", () => {
    const first = normalizeEffectivePeriod("2026-01-01", "2026-12-31")
    const touching = normalizeEffectivePeriod("2026-12-31", "2027-06-30")
    const next = normalizeEffectivePeriod("2027-01-01", "2027-12-31")
    const open = normalizeEffectivePeriod("2028-01-01")

    expect(effectivePeriodsOverlap(first, touching)).toBe(true)
    expect(effectivePeriodsOverlap(first, next)).toBe(false)
    expect(effectivePeriodsOverlap(next, open)).toBe(false)
    expect(isDateEffective("2026-12-31", first)).toBe(true)
    expect(() =>
      assertNoEffectivePeriodOverlap(touching, [first], "La règle")
    ).toThrow("chevauche")
  })

  it("refuse une période d'effet inversée", () => {
    expect(() => normalizeEffectivePeriod("2027-01-01", "2026-12-31")).toThrow(
      "précéder"
    )
  })

  it("impose la séparation entre créateur et validateur", () => {
    expect(() =>
      assertSeparationOfDuties("user-a", "user-a", "du lot")
    ).toThrow("propre validation")
    expect(() =>
      assertSeparationOfDuties("user-a", "user-b", "du lot")
    ).not.toThrow()
  })

  it("normalise et totalise un lot équilibré", () => {
    const result = validateJournalLines([
      {
        accountCode: " 411000 ",
        label: " Client fret ",
        debitFcfa: 118_000,
        creditFcfa: 0,
        thirdPartyRef: " COMILOG ",
      },
      {
        accountCode: "706000",
        label: "Produit fret",
        debitFcfa: 0,
        creditFcfa: 100_000,
      },
      {
        accountCode: "443100",
        label: "Taxe collectée — exemple documentaire",
        debitFcfa: 0,
        creditFcfa: 18_000,
      },
    ])

    expect(result.totalDebitFcfa).toBe(118_000)
    expect(result.totalCreditFcfa).toBe(118_000)
    expect(result.lines[0]).toMatchObject({
      accountCode: "411000",
      label: "Client fret",
      thirdPartyRef: "COMILOG",
    })
  })

  it("refuse les lots déséquilibrés et les lignes à double sens", () => {
    expect(() =>
      validateJournalLines([
        {
          accountCode: "411000",
          label: "Débit",
          debitFcfa: 10,
          creditFcfa: 0,
        },
        {
          accountCode: "706000",
          label: "Crédit",
          debitFcfa: 0,
          creditFcfa: 9,
        },
      ])
    ).toThrow("déséquilibré")
    expect(() =>
      validateJournalLines([
        {
          accountCode: "411000",
          label: "Double sens",
          debitFcfa: 10,
          creditFcfa: 10,
        },
        {
          accountCode: "706000",
          label: "Crédit",
          debitFcfa: 0,
          creditFcfa: 10,
        },
      ])
    ).toThrow("exactement un débit ou un crédit")
  })

  it("refuse un dépassement lors du cumul des lignes", () => {
    expect(() =>
      validateJournalLines([
        {
          accountCode: "411000",
          label: "Débit 1",
          debitFcfa: Number.MAX_SAFE_INTEGER,
          creditFcfa: 0,
        },
        {
          accountCode: "411001",
          label: "Débit 2",
          debitFcfa: 1,
          creditFcfa: 0,
        },
        {
          accountCode: "706000",
          label: "Crédit",
          debitFcfa: 0,
          creditFcfa: Number.MAX_SAFE_INTEGER,
        },
      ])
    ).toThrow("capacité entière sûre")
  })

  it("produit une empreinte logique déterministe", () => {
    const payload = { code: "DGI", version: 2, rates: [100, 1_800] }
    expect(financePayloadFingerprint(payload)).toBe(
      financePayloadFingerprint(payload)
    )
  })
})
