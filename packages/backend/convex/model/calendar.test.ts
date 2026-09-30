import { describe, expect, it } from "vitest"
import {
  DEFAULT_SALE_WINDOW_DAYS,
  LIBREVILLE_UTC_OFFSET_MINUTES,
  addDays,
  daysBetween,
  daysUntilDeparture,
  enumerateServiceDates,
  fromServiceDate,
  isWithinSaleWindow,
  saleWindow,
  toLocalTime,
  toServiceDate,
  weekdayNameOf,
  weekdayOf,
} from "./calendar"

describe("Fuseau de Libreville", () => {
  it("est UTC+1 sans changement d'heure saisonnier", () => {
    expect(LIBREVILLE_UTC_OFFSET_MINUTES).toBe(60)
  })

  it("applique le même décalage en janvier et en juillet", () => {
    // C'est ce qui permet un calcul de date purement arithmétique.
    const janvier = fromServiceDate("2026-01-15", "08:00")
    const juillet = fromServiceDate("2026-07-15", "08:00")
    expect(new Date(janvier).getUTCHours()).toBe(7)
    expect(new Date(juillet).getUTCHours()).toBe(7)
  })
})

describe("toServiceDate / fromServiceDate", () => {
  it("convertit un horodatage en date locale", () => {
    // 14/08/2026 08:00 à Libreville = 07:00 UTC.
    const ts = Date.UTC(2026, 7, 14, 7, 0)
    expect(toServiceDate(ts)).toBe("2026-08-14")
  })

  it("fait la conversion inverse", () => {
    expect(fromServiceDate("2026-08-14", "08:00")).toBe(
      Date.UTC(2026, 7, 14, 7, 0),
    )
  })

  it("est réversible", () => {
    for (const date of ["2026-01-01", "2026-06-15", "2026-12-31"]) {
      expect(toServiceDate(fromServiceDate(date, "12:00"))).toBe(date)
    }
  })

  it("rattache correctement une heure de nuit à sa date locale", () => {
    // 23:30 UTC le 13 août = 00:30 le 14 août à Libreville.
    const ts = Date.UTC(2026, 7, 13, 23, 30)
    expect(toServiceDate(ts)).toBe("2026-08-14")
  })

  it("gère le passage d'année", () => {
    const ts = Date.UTC(2026, 11, 31, 23, 30)
    expect(toServiceDate(ts)).toBe("2027-01-01")
  })

  it("refuse une date mal formée", () => {
    expect(() => fromServiceDate("14/08/2026")).toThrow(/format AAAA-MM-JJ/)
    expect(() => fromServiceDate("2026-8-14")).toThrow(/format AAAA-MM-JJ/)
  })

  it("refuse une date inexistante au calendrier", () => {
    expect(() => fromServiceDate("2026-02-30")).toThrow(/inexistante/)
    expect(() => fromServiceDate("2026-13-01")).toThrow(/inexistante/)
  })

  it("accepte le 29 février d'une année bissextile et refuse celui d'une autre", () => {
    expect(() => fromServiceDate("2028-02-29")).not.toThrow()
    expect(() => fromServiceDate("2026-02-29")).toThrow(/inexistante/)
  })

  it("refuse une heure invalide", () => {
    expect(() => fromServiceDate("2026-08-14", "25:00")).toThrow(/hors bornes/)
    expect(() => fromServiceDate("2026-08-14", "8h00")).toThrow(/format HH:MM/)
  })
})

describe("Jours de la semaine", () => {
  it("identifie correctement le jour", () => {
    // Le 14 août 2026 est un vendredi.
    expect(weekdayOf("2026-08-14")).toBe(5)
    expect(weekdayNameOf("2026-08-14")).toBe("vendredi")
  })

  it("numérote le dimanche à zéro", () => {
    expect(weekdayOf("2026-08-16")).toBe(0)
    expect(weekdayNameOf("2026-08-16")).toBe("dimanche")
  })

  it("progresse d'un jour à l'autre", () => {
    let jour = weekdayOf("2026-08-10")
    for (let i = 1; i <= 7; i += 1) {
      const suivant = weekdayOf(addDays("2026-08-10", i))
      expect(suivant).toBe((jour + 1) % 7)
      jour = suivant
    }
  })
})

describe("addDays / daysBetween", () => {
  it("ajoute et retranche des jours", () => {
    expect(addDays("2026-08-14", 1)).toBe("2026-08-15")
    expect(addDays("2026-08-14", -1)).toBe("2026-08-13")
    expect(addDays("2026-08-14", 0)).toBe("2026-08-14")
  })

  it("franchit les fins de mois et d'année", () => {
    expect(addDays("2026-08-31", 1)).toBe("2026-09-01")
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01")
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29")
  })

  it("compte les jours entre deux dates", () => {
    expect(daysBetween("2026-08-14", "2026-08-21")).toBe(7)
    expect(daysBetween("2026-08-21", "2026-08-14")).toBe(-7)
    expect(daysBetween("2026-08-14", "2026-08-14")).toBe(0)
  })

  it("addDays et daysBetween sont réciproques", () => {
    for (const n of [1, 15, 90, 365]) {
      expect(daysBetween("2026-01-01", addDays("2026-01-01", n))).toBe(n)
    }
  })

  it("refuse un décalage non entier", () => {
    expect(() => addDays("2026-08-14", 1.5)).toThrow(RangeError)
  })
})

describe("enumerateServiceDates — dates de circulation", () => {
  it("énumère tous les jours quand aucun jour n'est précisé", () => {
    const dates = enumerateServiceDates("2026-08-10", "2026-08-16")
    expect(dates).toHaveLength(7)
    expect(dates[0]).toBe("2026-08-10")
    expect(dates[6]).toBe("2026-08-16")
  })

  it("filtre sur les jours de circulation", () => {
    // Lundi et vendredi seulement.
    const dates = enumerateServiceDates("2026-08-10", "2026-08-23", [1, 5])
    expect(dates).toEqual([
      "2026-08-10",
      "2026-08-14",
      "2026-08-17",
      "2026-08-21",
    ])
  })

  it("inclut les deux bornes", () => {
    const dates = enumerateServiceDates("2026-08-14", "2026-08-14")
    expect(dates).toEqual(["2026-08-14"])
  })

  it("produit la bonne volumétrie sur une fenêtre de trois mois", () => {
    // Huit trains par semaine, cadence du CDC : la génération doit rester
    // maîtrisée en nombre de dessertes.
    const dates = enumerateServiceDates("2026-08-01", "2026-10-31", [1, 3, 5])
    expect(dates.length).toBeGreaterThan(35)
    expect(dates.length).toBeLessThan(45)
    for (const date of dates) {
      expect([1, 3, 5]).toContain(weekdayOf(date))
    }
  })

  it("retourne une liste vide si aucun jour ne correspond", () => {
    // Du mardi au jeudi, un train qui ne circule que le dimanche.
    expect(enumerateServiceDates("2026-08-11", "2026-08-13", [0])).toEqual([])
  })

  it("refuse une période inversée", () => {
    expect(() =>
      enumerateServiceDates("2026-08-20", "2026-08-10"),
    ).toThrow(/Période invalide/)
  })

  it("refuse un jour de semaine hors bornes", () => {
    expect(() =>
      enumerateServiceDates("2026-08-10", "2026-08-16", [7]),
    ).toThrow(/Jour de semaine invalide/)
    expect(() =>
      enumerateServiceDates("2026-08-10", "2026-08-16", [-1]),
    ).toThrow(/Jour de semaine invalide/)
  })

  it("franchit un changement d'année sans trou", () => {
    const dates = enumerateServiceDates("2026-12-29", "2027-01-03")
    expect(dates).toEqual([
      "2026-12-29",
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
      "2027-01-03",
    ])
  })
})

describe("Fenêtre de mise en vente", () => {
  it("ouvre un mois par défaut, conformément à la validité actuelle des billets", () => {
    expect(DEFAULT_SALE_WINDOW_DAYS).toBe(31)
    const fenetre = saleWindow("2026-08-14")
    expect(fenetre.from).toBe("2026-08-14")
    expect(fenetre.until).toBe("2026-09-14")
  })

  it("accepte une fenêtre de trois mois, option débattue au CDC", () => {
    const fenetre = saleWindow("2026-08-14", 92)
    expect(daysBetween(fenetre.from, fenetre.until)).toBe(92)
  })

  it("situe une date dans ou hors de la fenêtre", () => {
    expect(isWithinSaleWindow("2026-08-20", "2026-08-14")).toBe(true)
    expect(isWithinSaleWindow("2026-09-14", "2026-08-14")).toBe(true)
    expect(isWithinSaleWindow("2026-09-15", "2026-08-14")).toBe(false)
    expect(isWithinSaleWindow("2026-08-13", "2026-08-14")).toBe(false)
  })

  it("refuse une fenêtre absurde", () => {
    expect(() => saleWindow("2026-08-14", 0)).toThrow(RangeError)
    expect(() => saleWindow("2026-08-14", -5)).toThrow(RangeError)
  })
})

describe("daysUntilDeparture — assiette de la règle d'anticipation", () => {
  it("compte les jours pleins jusqu'au départ", () => {
    const depart = Date.UTC(2026, 7, 14, 7, 0)
    const maintenant = Date.UTC(2026, 6, 24, 7, 0)
    expect(daysUntilDeparture(depart, maintenant)).toBe(21)
  })

  it("retourne zéro le jour même", () => {
    const depart = Date.UTC(2026, 7, 14, 18, 0)
    const maintenant = Date.UTC(2026, 7, 14, 7, 0)
    expect(daysUntilDeparture(depart, maintenant)).toBe(0)
  })

  it("devient négatif après le départ", () => {
    const depart = Date.UTC(2026, 7, 14, 7, 0)
    const maintenant = Date.UTC(2026, 7, 16, 7, 0)
    expect(daysUntilDeparture(depart, maintenant)).toBe(-2)
  })

  it("refuse un horodatage invalide", () => {
    expect(() => daysUntilDeparture(Number.NaN, 0)).toThrow(RangeError)
  })
})

describe("toLocalTime", () => {
  it("donne l'heure de Libreville, pas celle du serveur (UTC+1, sans heure d'été)", () => {
    expect(toLocalTime(Date.parse("2026-10-01T07:00:00Z"))).toBe("08:00")
    expect(toLocalTime(Date.parse("2026-10-01T23:30:00Z"))).toBe("00:30")
    expect(toLocalTime(Date.parse("2026-07-01T16:05:00Z"))).toBe("17:05")
  })
})
