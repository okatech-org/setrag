import { describe, expect, it } from "vitest"

import {
  ajouterJours,
  arriveLendemain,
  dateCourte,
  dateDeService,
  dateLongue,
  dateRelative,
  deGare,
  duree,
  heure,
  jourEtQuantieme,
  minutesEntre,
  prix,
  telephone,
} from "./format"

/** Un instant donné en heure de Libreville (UTC+1, sans heure d'été). */
const libreville = (date: string, heureMinute: string) =>
  Date.parse(`${date}T${heureMinute}:00+01:00`)

describe("dateDeService", () => {
  it("lit la date à Libreville, pas en UTC", () => {
    // 23:30 UTC le 1er octobre : il est déjà 00:30 le 2 à Libreville.
    expect(dateDeService(Date.UTC(2026, 9, 1, 23, 30))).toBe("2026-10-02")
    expect(dateDeService(Date.UTC(2026, 9, 1, 22, 59))).toBe("2026-10-01")
  })

  it("écrit la date au format AAAA-MM-JJ", () => {
    expect(dateDeService(libreville("2026-03-05", "07:40"))).toBe("2026-03-05")
  })
})

describe("ajouterJours", () => {
  it("passe les fins de mois et d'année", () => {
    expect(ajouterJours("2026-02-28", 1)).toBe("2026-03-01")
    expect(ajouterJours("2026-12-31", 1)).toBe("2027-01-01")
  })

  it("tient compte des années bissextiles", () => {
    expect(ajouterJours("2028-02-28", 1)).toBe("2028-02-29")
  })

  it("recule avec un nombre négatif", () => {
    expect(ajouterJours("2026-03-01", -1)).toBe("2026-02-28")
    expect(ajouterJours("2026-10-02", 0)).toBe("2026-10-02")
  })
})

describe("dates lisibles", () => {
  it("écrit la date courte avec une majuscule", () => {
    expect(dateCourte("2026-10-02")).toBe("Ven. 2 oct.")
  })

  it("écrit la date longue en minuscules", () => {
    expect(dateLongue("2026-10-02")).toBe("vendredi 2 octobre")
  })

  it("donne le jour et le quantième pour la bande des jours", () => {
    expect(jourEtQuantieme("2026-10-02")).toBe("Ven. 2")
    expect(jourEtQuantieme("2026-10-04")).toBe("Dim. 4")
  })

  it("ne dépend pas du fuseau pour une date de circulation", () => {
    // Midi à Libreville : aucun fuseau ne fait basculer le jour.
    expect(dateCourte("2026-01-01")).toBe("Jeu. 1 janv.")
  })
})

describe("dateRelative", () => {
  it("dit « Aujourd'hui » et « Demain »", () => {
    expect(dateRelative("2026-10-02", "2026-10-02")).toBe("Aujourd'hui")
    expect(dateRelative("2026-10-03", "2026-10-02")).toBe("Demain")
  })

  it("reconnaît le lendemain d'un changement de mois", () => {
    expect(dateRelative("2026-11-01", "2026-10-31")).toBe("Demain")
  })

  it("donne la date courte au-delà, ou pour la veille", () => {
    expect(dateRelative("2026-10-04", "2026-10-02")).toBe("Dim. 4 oct.")
    expect(dateRelative("2026-10-01", "2026-10-02")).toBe("Jeu. 1 oct.")
  })
})

describe("durées", () => {
  it("compte les minutes entre deux instants, arrondies", () => {
    expect(minutesEntre(0, 90 * 60_000)).toBe(90)
    expect(minutesEntre(0, 89.6 * 60_000)).toBe(90)
    expect(minutesEntre(0, 29 * 1000)).toBe(0)
  })

  it("écrit une durée en heures et minutes", () => {
    expect(duree(45)).toBe("45 min")
    expect(duree(116)).toBe("1 h 56")
    expect(duree(125)).toBe("2 h 05")
    expect(duree(120)).toBe("2 h")
  })
})

describe("arriveLendemain", () => {
  it("compare les dates à Libreville", () => {
    expect(
      arriveLendemain(
        libreville("2026-10-01", "20:00"),
        libreville("2026-10-02", "06:15")
      )
    ).toBe(true)
    expect(
      arriveLendemain(
        libreville("2026-10-01", "07:40"),
        libreville("2026-10-01", "21:10")
      )
    ).toBe(false)
  })

  it("ignore un changement de jour qui n'existe qu'en UTC", () => {
    // Départ 00:30 et arrivée 06:00 le même jour à Libreville, alors que le
    // départ tombe encore la veille en UTC.
    expect(
      arriveLendemain(Date.UTC(2026, 9, 1, 23, 30), Date.UTC(2026, 9, 2, 5, 0))
    ).toBe(false)
  })
})

describe("heure", () => {
  it("affiche l'heure de Libreville sur 24 h", () => {
    expect(heure(libreville("2026-10-02", "07:40"))).toBe("07:40")
    expect(heure(libreville("2026-10-02", "21:05"))).toBe("21:05")
  })
})

describe("prix", () => {
  it("écrit un montant en francs CFA, sans décimales", () => {
    expect(prix(32_500)).toMatch(/^32\s500\sFCFA$/)
    expect(prix(1_234.6)).toMatch(/^1\s235\sFCFA$/)
  })
})

describe("telephone", () => {
  it("groupe un numéro gabonais par deux chiffres", () => {
    expect(telephone("24107123456")).toBe("+241 07 12 34 56")
    expect(telephone("+241 07-12-34-56")).toBe("+241 07 12 34 56")
  })

  it("laisse tel quel un numéro étranger ou incomplet", () => {
    expect(telephone("+33 6 12 34 56 78")).toBe("+33 6 12 34 56 78")
    expect(telephone("0712")).toBe("0712")
  })
})

describe("deGare", () => {
  it("élide devant une voyelle ou un h", () => {
    expect(deGare("Owendo Virié")).toBe("d'Owendo Virié")
    expect(deGare("Ivindo")).toBe("d'Ivindo")
    expect(deGare("Alembé")).toBe("d'Alembé")
    expect(deGare("Hôpital")).toBe("d'Hôpital")
  })

  it("garde « de » devant une consonne", () => {
    expect(deGare("Booué")).toBe("de Booué")
    expect(deGare("Ndjolé")).toBe("de Ndjolé")
    expect(deGare("Franceville")).toBe("de Franceville")
  })
})
