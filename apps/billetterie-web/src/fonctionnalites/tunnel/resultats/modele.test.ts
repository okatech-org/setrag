import { describe, expect, it } from "vitest"

import {
  classeParDefaut,
  classesOuvertes,
  filtrer,
  joursEntre,
  prixDes,
  trier,
  type Resultat,
} from "./modele"

/** Libreville est à UTC+1 toute l'année. */
const a = (heureMinute: string) =>
  Date.parse(`2026-10-02T${heureMinute}:00+01:00`)

function resultat(partiel: {
  id: string
  type?: string
  depart: string
  arrivee: string
  statut?: Resultat["trip"]["status"]
  places?: Resultat["availableByClass"]
  prix?: Partial<Record<"DEUXIEME" | "PREMIERE" | "VIP", number>>
}): Resultat {
  const prixParClasse = Object.fromEntries(
    Object.entries(partiel.prix ?? {}).map(([c, total]) => [
      c,
      { totalTtc: total, unitaireTtc: total },
    ])
  )
  const places = partiel.places ?? { DEUXIEME: 50 }
  return {
    trip: {
      _id: partiel.id,
      trainType: partiel.type ?? "EXPRESS",
      status: partiel.statut ?? "planifie",
    },
    departureAt: a(partiel.depart),
    arrivalAt: a(partiel.arrivee),
    availableByClass: places,
    prixParClasse,
    hasAvailability:
      partiel.statut !== "annule" &&
      Object.values(places).some((n) => (n ?? 0) >= 1),
  } as unknown as Resultat
}

describe("résultats de recherche", () => {
  const express = resultat({
    id: "e",
    depart: "08:00",
    arrivee: "19:40",
    places: { DEUXIEME: 40, PREMIERE: 2, VIP: 0 },
    prix: { DEUXIEME: 30_000, PREMIERE: 45_000, VIP: 60_000 },
  })
  const omnibus = resultat({
    id: "o",
    type: "OMNIBUS",
    depart: "17:30",
    arrivee: "23:30",
    prix: { DEUXIEME: 21_000 },
  })
  const supprime = resultat({
    id: "s",
    depart: "10:00",
    arrivee: "20:00",
    statut: "annule",
    prix: { DEUXIEME: 1 },
  })

  it("ne propose que les classes où tout le groupe tient, et un prix « dès » parmi elles", () => {
    expect(classesOuvertes(express, 3)).toEqual(["DEUXIEME"])
    expect(prixDes(express, 3)).toBe(30_000)
    expect(prixDes(express, 1)).toBe(30_000)
    expect(classeParDefaut(express, 2)).toBe("DEUXIEME")
    // Un train supprimé n'a plus de prix, même si le serveur en garde un.
    expect(prixDes(supprime, 1)).toBeNull()
  })

  it("trie par heure, durée ou prix, les trains sans prix en dernier", () => {
    const liste = [omnibus, supprime, express]
    expect(trier(liste, "heure", 1).map((r) => r.trip._id)).toEqual([
      "e",
      "s",
      "o",
    ])
    expect(trier(liste, "duree", 1).map((r) => r.trip._id)).toEqual([
      "o",
      "s",
      "e",
    ])
    expect(trier(liste, "prix", 1).map((r) => r.trip._id)).toEqual([
      "o",
      "e",
      "s",
    ])
  })

  it("filtre par type de train et par créneau, une liste vide ne filtrant rien", () => {
    const liste = [express, omnibus]
    expect(filtrer(liste, { types: [], creneaux: [] })).toHaveLength(2)
    expect(
      filtrer(liste, { types: ["OMNIBUS"], creneaux: [] }).map(
        (r) => r.trip._id
      )
    ).toEqual(["o"])
    expect(
      filtrer(liste, { types: [], creneaux: ["matin"] }).map((r) => r.trip._id)
    ).toEqual(["e"])
  })

  it("compte les jours d'une date à l'autre", () => {
    expect(joursEntre("2026-09-30", "2026-10-31")).toBe(31)
  })
})
