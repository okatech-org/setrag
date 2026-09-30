import { describe, expect, it } from "vitest"

import type { EmbarkedCoach, EmbarkedTicket, LocalScan, Verdict } from "./offline/types"
import { toScanResult } from "./offline/verify"
import { planDeVoiture, progressionParVoiture, titresControles } from "./tournee"

function titre(numero: string, place: string, patch: Partial<EmbarkedTicket> = {}): EmbarkedTicket {
  return {
    _id: numero,
    number: numero,
    passenger: { lastName: "NOM", firstName: "Prénom", gender: "F" },
    serviceClass: "DEUXIEME",
    seatLabel: place,
    coachLabel: "V4",
    fromStopIndex: 0,
    toStopIndex: 4,
    status: "valide",
    ...patch,
  }
}

function controle(numero: string | undefined, verdict: Verdict, a = 0): LocalScan {
  return {
    clientScanId: `${numero}-${a}`,
    tripId: "t",
    ticketNumber: numero,
    result: toScanResult(verdict),
    verdict,
    scannedAt: a,
    offline: true,
    state: "pending",
  }
}

const V4: EmbarkedCoach = {
  label: "V4",
  serviceClass: "DEUXIEME",
  position: 4,
  rowCount: 2,
  columnCount: 2,
  seatCount: 4,
  standingCapacity: 20,
  seats: [
    { label: "1A", row: 1, column: 1 },
    { label: "1B", row: 1, column: 2 },
    { label: "2A", row: 2, column: 1 },
    { label: "2B", row: 2, column: 2 },
  ],
}

describe("Titres contrôlés", () => {
  it("compte les titres distincts, pas les passages", () => {
    const vus = titresControles(
      [controle("B-1", "valide", 1), controle("B-1", "deja_controle", 2), controle("B-2", "hors_segment", 3)],
      []
    )
    expect(vus.size).toBe(2)
  })

  it("n'impute pas à un titre la contrefaçon qui recopie sa référence", () => {
    expect(titresControles([controle("B-1", "contrefait")], []).size).toBe(0)
    const plan = planDeVoiture(V4, [titre("B-1", "1A")], [controle("B-1", "contrefait")])
    expect(plan[0]!.etat).toBe("titre")
  })

  it("compte aussi les titres contrôlés par un autre agent, et ignore les codes illisibles", () => {
    const vus = titresControles([controle(undefined, "illisible")], [titre("B-3", "2A", { status: "utilise" })])
    expect([...vus]).toEqual(["B-3"])
  })
})

describe("Voitures et plan", () => {
  const titres = [
    titre("B-1", "1A"),
    titre("B-2", "1B"),
    titre("B-3", "2A", { status: "rembourse" }),
    titre("B-4", "2B", { coachLabel: "V5" }),
  ]

  it("répartit les titres en cours par voiture, quel que soit le format du repère", () => {
    const voitures = progressionParVoiture([V4], [...titres, titre("B-5", "3A", { coachLabel: "4" })], new Set(["B-1"]))
    expect(voitures[0]).toMatchObject({ titres: 3, controles: 1 })
  })

  it("donne à chaque place l'une des quatre formes", () => {
    const plan = planDeVoiture(V4, titres, [controle("B-1", "valide"), controle("B-2", "expire")])
    expect(plan.map((p) => [p.label, p.etat])).toEqual([
      ["1A", "controle"],
      ["1B", "refus"],
      // Un titre remboursé a rendu sa place.
      ["2A", "libre"],
      // Le titre de 2B voyage en voiture 5.
      ["2B", "libre"],
    ])
  })

  it("montre le dernier verdict d'un titre contrôlé deux fois", () => {
    const plan = planDeVoiture(V4, titres, [controle("B-1", "hors_segment", 1), controle("B-1", "valide", 2)])
    expect(plan[0]!.etat).toBe("controle")
  })
})
