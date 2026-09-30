import { describe, expect, it } from "vitest"

import {
  emptyPenaltySummary,
  servicePeriodBounds,
  summarizeIncidents,
  summarizePenalties,
} from "./controlSummary"

describe("synthèse agrégée des contrôles", () => {
  it("compte les incidents et isole les critiques non résolus", () => {
    const summary = summarizeIncidents([
      { category: "securite", severity: "critique", status: "ouvert" },
      { category: "securite", severity: "critique", status: "resolu" },
      { category: "medical", severity: "important", status: "en_cours" },
      { category: "technique", severity: "information", status: "resolu" },
    ])

    expect(summary.total).toBe(4)
    expect(summary.open).toBe(2)
    expect(summary.criticalOpen).toBe(1)
    expect(summary.bySeverity).toEqual({
      information: 1,
      important: 1,
      critique: 2,
    })
    expect(summary.byCategory.medical).toBe(1)
    expect(summary.byStatus).toEqual({ ouvert: 1, en_cours: 1, resolu: 2 })
  })

  it("exclut les procès-verbaux annulés du montant total", () => {
    const summary = summarizePenalties([
      { reason: "sans_titre", status: "emis", amountXaf: 5_000 },
      { reason: "sans_titre", status: "paye", amountXaf: 10_000 },
      { reason: "classe_superieure", status: "conteste", amountXaf: 2_000 },
      { reason: "autre", status: "annule", amountXaf: 3_000 },
    ])

    expect(summary.total).toBe(4)
    expect(summary.amountXaf).toBe(17_000)
    expect(summary.byStatus.annule).toEqual({ count: 1, amountXaf: 3_000 })
    expect(summary.byStatus.paye).toEqual({ count: 1, amountXaf: 10_000 })
    expect(summary.byReason.sans_titre).toBe(2)
  })

  it("rend des zéros explicites quand rien n'est enregistré", () => {
    expect(summarizeIncidents([]).criticalOpen).toBe(0)
    expect(summarizePenalties([])).toEqual(emptyPenaltySummary())
  })

  it("borne la période aux journées locales de Libreville", () => {
    const { start, endExclusive } = servicePeriodBounds(
      "2026-09-01",
      "2026-09-30"
    )
    expect(new Date(start).toISOString()).toBe("2026-08-31T23:00:00.000Z")
    expect(new Date(endExclusive).toISOString()).toBe(
      "2026-09-30T23:00:00.000Z"
    )
    expect(() => servicePeriodBounds("2026-09-30", "2026-09-01")).toThrow(
      "Période invalide"
    )
  })
})
