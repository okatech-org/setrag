import { describe, expect, it } from "vitest"
import {
  ASSISTANT_PROFILES,
  ASSISTANT_TOOLS,
  buildAssistantInstructions,
  getAssistantTools,
} from "./contracts"

describe("contrats des assistants voyageurs", () => {
  it("garde une surface d'outils compacte et sans doublon", () => {
    const names = ASSISTANT_TOOLS.map((tool) => tool.name)
    expect(new Set(names).size).toBe(names.length)
    expect(names.length).toBeLessThan(20)
  })

  it("retire les outils authentifiés d'une session invitée", () => {
    const guest = getAssistantTools("concierge", false)
    const authenticated = getAssistantTools("concierge", true)

    expect(guest.some((tool) => tool.name === "list_my_tickets")).toBe(false)
    expect(authenticated.some((tool) => tool.name === "list_my_tickets")).toBe(
      true
    )
    expect(guest.some((tool) => tool.name === "create_booking")).toBe(true)
  })

  it("limite chaque spécialiste à son domaine", () => {
    expect(ASSISTANT_PROFILES.booking.toolNames).toContain("search_trips")
    expect(ASSISTANT_PROFILES.booking.toolNames).toContain("get_my_profile")
    expect(ASSISTANT_PROFILES.booking.toolNames).toContain(
      "list_saved_passengers"
    )
    expect(ASSISTANT_PROFILES.booking.toolNames).not.toContain(
      "update_my_profile"
    )
    expect(ASSISTANT_PROFILES.booking.toolNames).not.toContain("pay_booking")
    expect(ASSISTANT_PROFILES.account.toolNames).toContain("grant_consent")
    expect(ASSISTANT_PROFILES.account.toolNames).not.toContain("pay_booking")
  })

  it("ne référence que des outils existants et des schémas JSON stricts", () => {
    const known = new Set(ASSISTANT_TOOLS.map((tool) => tool.name))
    for (const profile of Object.values(ASSISTANT_PROFILES)) {
      expect(profile.toolNames.every((name) => known.has(name))).toBe(true)
    }
    for (const tool of ASSISTANT_TOOLS) {
      expect(tool.parameters.type).toBe("object")
      expect(tool.parameters.additionalProperties).toBe(false)
      expect(
        tool.parameters.required.every((name) =>
          Object.prototype.hasOwnProperty.call(tool.parameters.properties, name)
        )
      ).toBe(true)
    }
  })

  it("impose une approbation à toutes les actions engageantes", () => {
    const consequential = [
      "create_booking",
      "pay_booking",
      "cancel_booking",
      "update_my_profile",
      "grant_consent",
      "revoke_consent",
    ]
    for (const name of consequential) {
      expect(
        ASSISTANT_TOOLS.find((tool) => tool.name === name)?.requiresApproval
      ).toBe(true)
    }
  })

  it("n'expose au modèle que les informations réellement demandées au voyageur", () => {
    const booking = ASSISTANT_TOOLS.find(
      (tool) => tool.name === "create_booking"
    )!
    const passenger = (
      booking.parameters.properties.passengers as {
        items: { properties: Record<string, unknown> }
      }
    ).items

    expect(Object.keys(passenger.properties)).toEqual([
      "lastName",
      "firstName",
      "gender",
      "discountCode",
    ])
    expect(passenger.properties).not.toHaveProperty("birthDate")
    expect(passenger.properties).not.toHaveProperty("seatId")
    expect(booking.parameters.properties).not.toHaveProperty("contactEmail")
    expect(booking.parameters.properties).not.toHaveProperty("promoCode")
  })

  it("encode les frontières de confirmation dans le prompt", () => {
    const prompt = buildAssistantInstructions(
      "concierge",
      "2026-07-26T12:00:00.000Z"
    )
    expect(prompt).toContain("confirmation explicite")
    expect(prompt).toContain("Ndendé")
    expect(prompt).toContain("Africa/Libreville")
    expect(prompt).toContain("code OTP")
    expect(prompt).toContain("ne les prononce jamais")
    expect(prompt).toContain("attribuées automatiquement")
  })
})
