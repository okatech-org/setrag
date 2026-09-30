import { describe, expect, it } from "vitest"

import { creerCalendrier } from "./calendrier"

const VOYAGE = {
  reference: "V-LIGNE-20260930-000001",
  train: "Express 201",
  origine: "Owendo Virié",
  destination: "Franceville",
  departAt: Date.UTC(2026, 9, 2, 6, 40),
  arriveeAt: Date.UTC(2026, 9, 2, 18, 25),
  billets: 2,
  maintenant: Date.UTC(2026, 8, 30, 9, 0),
}

describe("creerCalendrier", () => {
  const ics = creerCalendrier(VOYAGE)

  it("porte les heures du trajet en UTC et un rappel la veille", () => {
    expect(ics).toContain("DTSTART:20261002T064000Z")
    expect(ics).toContain("DTEND:20261002T182500Z")
    expect(ics).toMatch(/BEGIN:VALARM\r\nACTION:DISPLAY\r\nTRIGGER:-P1D/)
  })

  it("sépare les lignes par CRLF et replie les lignes longues", () => {
    for (const ligne of ics.split("\r\n")) {
      expect(new TextEncoder().encode(ligne).length).toBeLessThanOrEqual(75)
    }
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true)
  })

  it("échappe les virgules et points-virgules des textes", () => {
    const echappe = creerCalendrier({ ...VOYAGE, origine: "Gare A, quai; 1" })
    expect(echappe.replace(/\r\n /g, "")).toContain("Gare A\\, quai\\; 1")
  })
})
