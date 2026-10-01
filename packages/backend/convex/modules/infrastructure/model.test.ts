import { describe, expect, it } from "vitest"

import { capacitesInfra } from "./acces"
import {
  ajouterMois,
  anomalieEnRetard,
  avancement,
  bornesJourLibreville,
  circulationImpactee,
  echeanceAnomalie,
  erreurPlagePk,
  erreurSituation,
  erreurVitesseLtv,
  gareMajeure,
  HEURE,
  interventionsEnConflit,
  JOUR,
  maintenanceEnRetard,
  partBetonPonderee,
  periodeValide,
  perteTempsLtvMinutes,
  plagesSeChevauchent,
  sectionDuPk,
  statutJalon,
  surveillanceIqoa,
  transitionChantierPermise,
  typeTraverseDepuisPart,
} from "./model"

describe("anomalies", () => {
  it("déduit l'échéance de la gravité", () => {
    const t = 1_000_000
    expect(echeanceAnomalie("critique", t)).toBe(t + 24 * HEURE)
    expect(echeanceAnomalie("elevee", t)).toBe(t + 7 * JOUR)
    expect(echeanceAnomalie("moyenne", t)).toBe(t + 30 * JOUR)
    expect(echeanceAnomalie("faible", t)).toBe(t + 90 * JOUR)
  })

  it("n'est en retard que si elle n'est pas traitée", () => {
    expect(anomalieEnRetard({ statut: "signalee", echeanceLe: 10 }, 20)).toBe(true)
    expect(anomalieEnRetard({ statut: "traitee", echeanceLe: 10 }, 20)).toBe(false)
    expect(anomalieEnRetard({ statut: "prise_en_charge", echeanceLe: 30 }, 20)).toBe(false)
  })
})

describe("points kilométriques", () => {
  const sections = [
    { pkDebut: 0, pkFin: 35 },
    { pkDebut: 35, pkFin: 57 },
  ]

  it("trouve la section d'un PK, début inclus, fin exclue sauf au terminus", () => {
    expect(sectionDuPk(sections, 0)).toBe(sections[0])
    expect(sectionDuPk(sections, 35)).toBe(sections[1])
    expect(sectionDuPk(sections, 57)).toBe(sections[1])
    expect(sectionDuPk(sections, 58)).toBeNull()
  })

  it("valide une plage PK", () => {
    expect(erreurPlagePk(0, 669)).toBeNull()
    expect(erreurPlagePk(-1, 3)).toMatch(/négatif/)
    expect(erreurPlagePk(10, 10)).toMatch(/strictement inférieur/)
    expect(erreurPlagePk(600, 670)).toMatch(/669/)
  })

  it("détecte les chevauchements, bornes dans un ordre quelconque", () => {
    expect(plagesSeChevauchent({ debut: 10, fin: 12 }, { debut: 11, fin: 13 })).toBe(true)
    expect(plagesSeChevauchent({ debut: 10, fin: 12 }, { debut: 12, fin: 14 })).toBe(false)
    expect(plagesSeChevauchent({ debut: 57, fin: 0 }, { debut: 10, fin: 12 })).toBe(true)
  })

  it("pondère la part béton par la longueur", () => {
    expect(
      partBetonPonderee([
        { pkDebut: 0, pkFin: 10, partBetonPct: 100 },
        { pkDebut: 10, pkFin: 40, partBetonPct: 0 },
      ])
    ).toBe(25)
    expect(typeTraverseDepuisPart(100)).toBe("beton_bibloc")
    expect(typeTraverseDepuisPart(0)).toBe("bois")
    expect(typeTraverseDepuisPart(40)).toBe("mixte")
  })

  it("reconnaît les gares majeures", () => {
    expect(gareMajeure({ code: "XXX", name: "Lastourville" })).toBe(true)
    expect(gareMajeure({ code: "NDJ", name: "Ndjolé" })).toBe(true)
    expect(gareMajeure({ code: "AYE", name: "Ayem" })).toBe(false)
  })
})

describe("limitations temporaires de vitesse", () => {
  it("calcule la perte de temps avec la pénalité de freinage", () => {
    expect(
      perteTempsLtvMinutes({ longueurKm: 2, vitesseKmh: 40, vitesseNominaleKmh: 80 })
    ).toBe(2.5)
    expect(
      perteTempsLtvMinutes({ longueurKm: 2, vitesseKmh: 80, vitesseNominaleKmh: 80 })
    ).toBe(0)
  })

  it("refuse une vitesse trop basse ou non limitative", () => {
    expect(erreurVitesseLtv(40, 80)).toBeNull()
    expect(erreurVitesseLtv(80, 80)).toMatch(/inférieure à la vitesse nominale/)
    expect(erreurVitesseLtv(5, 80)).toMatch(/10 km\/h/)
  })
})

describe("ouvrages d'art", () => {
  it("dérive la surveillance de la cotation IQOA", () => {
    expect(surveillanceIqoa("3U")).toEqual({ surveillanceRenforcee: true, periodiciteMois: 3 })
    expect(surveillanceIqoa("3")).toEqual({ surveillanceRenforcee: true, periodiciteMois: 6 })
    expect(surveillanceIqoa("2E")).toEqual({ surveillanceRenforcee: true, periodiciteMois: 12 })
    expect(surveillanceIqoa("2")).toEqual({ surveillanceRenforcee: false, periodiciteMois: 36 })
    expect(surveillanceIqoa("1", "visite_annuelle")).toEqual({
      surveillanceRenforcee: false,
      periodiciteMois: 12,
    })
  })

  it("ajoute des mois calendaires", () => {
    expect(new Date(ajouterMois(Date.UTC(2026, 0, 15), 6)).toISOString()).toBe(
      "2026-07-15T00:00:00.000Z"
    )
  })
})

describe("équipements", () => {
  it("signale une maintenance en retard ou jamais faite", () => {
    expect(maintenanceEnRetard(undefined, 30, 0)).toBe(true)
    expect(maintenanceEnRetard(0, 30, 31 * JOUR)).toBe(true)
    expect(maintenanceEnRetard(0, 30, 29 * JOUR)).toBe(false)
  })
})

describe("programme PRN", () => {
  const situations = [
    { statut: "validee" as const, quantite: 40, montantTravauxFcfa: 400, montantPayeFcfa: 300 },
    { statut: "saisie" as const, quantite: 30, montantTravauxFcfa: 300, montantPayeFcfa: 0 },
    { statut: "rejetee" as const, quantite: 99, montantTravauxFcfa: 999, montantPayeFcfa: 999 },
  ]

  it("ne compte que les situations validées", () => {
    expect(avancement({ quantitePrevue: 100, budgetFcfa: 1000 }, situations)).toEqual({
      quantiteRealisee: 40,
      engageFcfa: 400,
      payeFcfa: 300,
      avancementPhysiquePct: 40,
      avancementFinancierPct: 30,
    })
  })

  it("refuse un cumul au-delà de 110 % ou un payé au-delà du budget", () => {
    const base = {
      quantitePrevue: 100,
      budgetFcfa: 1000,
      quantiteValidee: 100,
      payeValide: 900,
      unite: "km",
      portee: "le chantier",
    }
    expect(erreurSituation({ ...base, quantite: 10, montantPayeFcfa: 0 })).toBeNull()
    expect(erreurSituation({ ...base, quantite: 11, montantPayeFcfa: 0 })).toMatch(/110 %/)
    expect(erreurSituation({ ...base, quantite: 0, montantPayeFcfa: 101 })).toMatch(/budget/)
  })

  it("donne le statut d'un jalon", () => {
    expect(statutJalon({ prevuLe: 10, atteintLe: 20 }, 30)).toBe("atteint")
    expect(statutJalon({ prevuLe: 10 }, 30)).toBe("en_retard")
    expect(statutJalon({ prevuLe: 40 }, 30)).toBe("a_venir")
  })

  it("contrôle les transitions de chantier", () => {
    expect(transitionChantierPermise("etude", "en_cours")).toBe(true)
    expect(transitionChantierPermise("suspendu", "en_cours")).toBe(true)
    expect(transitionChantierPermise("etude", "receptionne")).toBe(false)
    expect(transitionChantierPermise("receptionne", "en_cours")).toBe(false)
  })

  it("valide le format de période", () => {
    expect(periodeValide("2026-09")).toBe(true)
    expect(periodeValide("2026-13")).toBe(false)
    expect(periodeValide("09/2026")).toBe(false)
  })
})

describe("circulations et plages travaux", () => {
  const train = { pkOrigine: 57, pkDestination: 0, departureAt: 100, arrivalAt: 200 }

  it("retient un train dont le parcours recoupe la plage", () => {
    expect(circulationImpactee(train, { debut: 10, fin: 12 })).toBe(true)
    expect(circulationImpactee(train, { debut: 60, fin: 62 })).toBe(false)
    expect(circulationImpactee(train, { debut: 10, fin: 12 }, { debut: 150, fin: 300 })).toBe(true)
    expect(circulationImpactee(train, { debut: 10, fin: 12 }, { debut: 200, fin: 300 })).toBe(false)
  })

  it("ne voit un conflit que si l'une des plages coupe la voie", () => {
    const a = { pkDebut: 10, pkFin: 15, debutLe: 0, finLe: 10, interruption: true }
    const b = { pkDebut: 12, pkFin: 14, debutLe: 5, finLe: 15, interruption: false }
    expect(interventionsEnConflit(a, b)).toBe(true)
    expect(interventionsEnConflit({ ...a, interruption: false }, b)).toBe(false)
    expect(interventionsEnConflit(a, { ...b, debutLe: 10 })).toBe(false)
  })

  it("borne le jour civil de Libreville (UTC+1)", () => {
    const midiLocal = Date.UTC(2026, 9, 1, 11)
    expect(bornesJourLibreville(midiLocal)).toEqual({
      debut: Date.UTC(2026, 8, 30, 23),
      fin: Date.UTC(2026, 9, 1, 23),
    })
  })
})

describe("capacités", () => {
  it("sépare les gestes selon le rôle", () => {
    expect(capacitesInfra(["cantonnier"], null)).toEqual(["anomalie_signaler"])
    expect(capacitesInfra(["responsable_prn"], null)).toContain("prn_valider")
    expect(capacitesInfra(["agent_voie"], null)).not.toContain("prn_valider")
    expect(capacitesInfra(["bailleur_fonds"], null)).toEqual([])
  })

  it("accorde tout à l'administration fonctionnelle et réserve les validations", () => {
    expect(capacitesInfra(["admin_fonctionnel"], null)).toHaveLength(14)
    const utilisation = capacitesInfra(["bailleur_fonds"], "utilisation")
    expect(utilisation).toContain("ltv_gerer")
    expect(utilisation).not.toContain("anomalie_clore")
    expect(utilisation).not.toContain("intervention_accorder")
  })
})
