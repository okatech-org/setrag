import { beforeEach, describe, expect, it } from "vitest"

import { DEFAULT_BOOKING, resolveE2EMode, ticketingStorage } from "./ticketing"
import {
  clearPendingTravelerOnboarding,
  readPendingTravelerOnboarding,
  savePendingTravelerOnboarding,
} from "./traveler-onboarding"

describe("stockage privé du parcours voyageur", () => {
  beforeEach(() => window.sessionStorage.clear())

  it("ne réutilise pas le brouillon d'un autre compte", () => {
    ticketingStorage.setBooking(
      {
        ...DEFAULT_BOOKING,
        passengers: [
          {
            ...DEFAULT_BOOKING.passengers[0]!,
            firstName: "Ariane",
            lastName: "Moussavou",
          },
        ],
      },
      "compte-ariane"
    )

    expect(ticketingStorage.getBooking("compte-berny")).toBeNull()
    expect(ticketingStorage.getBooking()).toBeNull()
  })

  it("conserve le brouillon pour son propriétaire", () => {
    ticketingStorage.setBooking(DEFAULT_BOOKING, "compte-berny")
    expect(ticketingStorage.getBooking("compte-berny")).toEqual(DEFAULT_BOOKING)
  })
})

describe("mode de données fictives", () => {
  it("reste désactivé dans un build de production", () => {
    expect(resolveE2EMode("production", "1")).toBe(false)
    expect(resolveE2EMode("development", "1")).toBe(true)
  })
})

describe("informations d'inscription en attente", () => {
  beforeEach(() => clearPendingTravelerOnboarding())

  it("conserve les informations nécessaires au profil après l'OTP", () => {
    savePendingTravelerOnboarding({
      firstName: "Berny",
      lastName: "Itoutou",
      phone: "+24106123456",
      identifier: "berny@example.ga",
    })

    expect(readPendingTravelerOnboarding()).toMatchObject({
      firstName: "Berny",
      lastName: "Itoutou",
      phone: "+24106123456",
      identifier: "berny@example.ga",
    })
  })
})
