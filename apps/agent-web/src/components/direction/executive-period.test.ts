import { describe, expect, it } from "vitest"

import {
  comparisonLabel,
  parsePeriodPreset,
  periodDays,
  periodHref,
  periodLabel,
  periodRange,
  todayInLibreville,
} from "./executive-period"

describe("période de l’espace Direction générale", () => {
  it("retombe sur 30 jours pour toute valeur inconnue", () => {
    expect(parsePeriodPreset(null)).toBe("30j")
    expect(parsePeriodPreset("semaine")).toBe("30j")
    expect(parsePeriodPreset("trimestre")).toBe("trimestre")
  })

  it("calcule la date de service à Libreville (UTC+1)", () => {
    expect(todayInLibreville(new Date("2026-09-10T23:30:00Z"))).toBe(
      "2026-09-11"
    )
    expect(todayInLibreville(new Date("2026-09-10T22:30:00Z"))).toBe(
      "2026-09-10"
    )
  })

  it("borne chaque preset sur le jour courant", () => {
    expect(periodRange("30j", "2026-09-12")).toEqual({
      from: "2026-08-14",
      to: "2026-09-12",
    })
    expect(periodRange("mois", "2026-09-12")).toEqual({
      from: "2026-09-01",
      to: "2026-09-12",
    })
    expect(periodRange("trimestre", "2026-09-12")).toEqual({
      from: "2026-07-01",
      to: "2026-09-12",
    })
    expect(periodRange("annee", "2026-09-12")).toEqual({
      from: "2026-01-01",
      to: "2026-09-12",
    })
  })

  it("nomme la période et sa référence", () => {
    const range = periodRange("30j", "2026-09-12")
    expect(periodDays(range)).toBe(30)
    expect(comparisonLabel(range)).toBe("vs 30 jours précédents")
    expect(periodLabel("30j", range)).toBe(
      "30 derniers jours · 14 août – 12 sept."
    )
  })

  it("n’écrit la période dans l’URL que hors valeur par défaut", () => {
    expect(periodHref("/direction", "30j")).toBe("/direction")
    expect(periodHref("/direction/finances", "annee")).toBe(
      "/direction/finances?periode=annee"
    )
  })
})
