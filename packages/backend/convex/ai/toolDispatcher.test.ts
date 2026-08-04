import { describe, expect, it, vi } from "vitest"
import { api } from "../_generated/api"
import type { ActionCtx } from "../_generated/server"
import { dispatchAssistantTool } from "./tools"

function fakeActionContext(options?: {
  queryResult?: unknown
  mutationResult?: unknown
  actionResult?: unknown
}) {
  const runQuery = vi.fn().mockResolvedValue(options?.queryResult)
  const runMutation = vi.fn().mockResolvedValue(options?.mutationResult)
  const runAction = vi.fn().mockResolvedValue(options?.actionResult)
  return {
    ctx: { runQuery, runMutation, runAction } as unknown as ActionCtx,
    runQuery,
    runMutation,
    runAction,
  }
}

describe("répartition des outils IA vers le domaine", () => {
  it("adapte les gares, recherches et détails de trajet", async () => {
    const stations = fakeActionContext({
      queryResult: [
        {
          _id: "station-1",
          code: "OWE",
          name: "Owendo",
          province: "Estuaire",
          extra: "non exposé",
        },
      ],
    })
    await expect(
      dispatchAssistantTool(stations.ctx, "list_stations", {})
    ).resolves.toEqual([
      {
        id: "station-1",
        code: "OWE",
        name: "Owendo",
        province: "Estuaire",
      },
    ])
    expect(stations.runQuery).toHaveBeenCalledWith(
      api.functions.referential.listStations,
      {}
    )

    const trips = fakeActionContext({
      queryResult: [
        {
          trip: {
            _id: "trip-1",
            trainNumber: "TM-01",
            trainType: "OMNIBUS",
            serviceDate: "2026-07-27",
            status: "PROGRAMME",
            internal: "non exposé",
          },
          departureAt: 100,
          arrivalAt: 200,
          distanceKm: 300,
          availableByClass: { DEUXIEME: 20 },
          hasAvailability: true,
        },
      ],
    })
    const searchInput = {
      originStationId: "station-1",
      destinationStationId: "station-2",
      serviceDate: "2026-07-27",
      passengers: 2,
    }
    await expect(
      dispatchAssistantTool(trips.ctx, "search_trips", searchInput)
    ).resolves.toEqual([
      {
        tripId: "trip-1",
        trainNumber: "TM-01",
        trainType: "OMNIBUS",
        serviceDate: "2026-07-27",
        status: "PROGRAMME",
        departureAt: 100,
        arrivalAt: 200,
        distanceKm: 300,
        availableByClass: { DEUXIEME: 20 },
        hasAvailability: true,
      },
    ])
    expect(trips.runQuery).toHaveBeenCalledWith(api.functions.trips.search, {
      ...searchInput,
    })

    const detail = fakeActionContext({
      queryResult: {
        trip: { _id: "trip-1" },
        stops: [{ sequence: 0 }],
        counters: [
          {
            serviceClass: "DEUXIEME",
            segmentIndex: 0,
            available: 18,
            held: 2,
          },
        ],
      },
    })
    await expect(
      dispatchAssistantTool(detail.ctx, "get_trip", { tripId: "trip-1" })
    ).resolves.toEqual({
      trip: { _id: "trip-1" },
      stops: [{ sequence: 0 }],
      availability: [
        {
          serviceClass: "DEUXIEME",
          segmentIndex: 0,
          available: 18,
        },
      ],
    })
    expect(detail.runQuery).toHaveBeenCalledWith(api.functions.trips.get, {
      tripId: "trip-1",
    })
  })

  it("calcule les dates relatives dans le calendrier de Libreville", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-08-04T23:30:00.000Z"))
    try {
      const trips = fakeActionContext({ queryResult: [] })
      await dispatchAssistantTool(trips.ctx, "search_trips", {
        originStationId: "station-1",
        destinationStationId: "station-2",
        serviceDate: null,
        relativeDaysFromToday: 2,
        passengers: 1,
      })

      expect(trips.runQuery).toHaveBeenCalledWith(api.functions.trips.search, {
        originStationId: "station-1",
        destinationStationId: "station-2",
        serviceDate: "2026-08-07",
        passengers: 1,
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it("transmet correctement devis et consultations de réservations", async () => {
    const quoteResult = { amountTtc: 42_000, currency: "XAF" }
    const quote = fakeActionContext({ queryResult: quoteResult })
    const quoteInput = {
      tripId: "trip-1",
      originStationId: "station-1",
      destinationStationId: "station-2",
      serviceClass: "PREMIERE",
      passengerCount: 2,
      discountCodes: ["FAMILLE"],
      promoCode: "PROMO",
    }
    await expect(
      dispatchAssistantTool(quote.ctx, "quote_booking", quoteInput)
    ).resolves.toBe(quoteResult)
    expect(quote.runQuery).toHaveBeenCalledWith(api.functions.bookings.quote, {
      ...quoteInput,
    })

    const booking = fakeActionContext({
      queryResult: { reference: "SET-1" },
    })
    await dispatchAssistantTool(booking.ctx, "get_booking", {
      reference: " SET-1 ",
      contactPhone: null,
    })
    expect(booking.runQuery).toHaveBeenCalledWith(
      api.functions.bookings.getByReference,
      {
        reference: "SET-1",
        contactPhone: undefined,
      }
    )

    const mine = fakeActionContext({ queryResult: [{ reference: "SET-1" }] })
    await expect(
      dispatchAssistantTool(mine.ctx, "list_my_bookings", {})
    ).resolves.toEqual([{ reference: "SET-1" }])
    expect(mine.runQuery).toHaveBeenCalledWith(
      api.functions.bookings.listMine,
      {}
    )

    const tickets = fakeActionContext({ queryResult: [{ number: "B-1" }] })
    await expect(
      dispatchAssistantTool(tickets.ctx, "list_my_tickets", {})
    ).resolves.toEqual([{ number: "B-1" }])
    expect(tickets.runQuery).toHaveBeenCalledWith(
      api.functions.bookings.myTickets,
      {}
    )
  })

  it("normalise la création, le paiement et l'annulation d'une réservation", async () => {
    const created = {
      reference: "SET-NEW",
      holdExpiresAt: 1_900_000_000_000,
      amounts: { ttc: 35_000 },
    }
    const create = fakeActionContext({
      mutationResult: created,
      queryResult: {
        trip: {
          trainNumber: "TR-201",
          trainType: "EXPRESS",
          serviceDate: "2026-08-07",
          status: "planifie",
          departureAt: 100,
          arrivalAt: 500,
        },
        stops: [
          {
            stationId: "station-1",
            sequence: 0,
            departureAt: 120,
            station: { name: "Owendo" },
          },
          {
            stationId: "station-2",
            sequence: 2,
            arrivalAt: 480,
            station: { name: "Booué" },
          },
        ],
        counters: [
          { serviceClass: "DEUXIEME", segmentIndex: 0, available: 18 },
          { serviceClass: "DEUXIEME", segmentIndex: 1, available: 12 },
        ],
      },
    })
    const createInput = {
      tripId: "trip-1",
      originStationId: "station-1",
      destinationStationId: "station-2",
      serviceClass: "DEUXIEME",
      passengers: [
        {
          lastName: " Moussavou ",
          firstName: " Ariane ",
          gender: "F",
          phone: null,
          emergencyPhone: "",
          birthDate: "1990-01-01",
          nationality: "GA",
          documentNumber: "ID-1",
          discountCode: null,
          seatId: null,
        },
      ],
      contactPhone: " 077000000 ",
      contactEmail: " ariane@example.ga ",
      promoCode: null,
    }
    await expect(
      dispatchAssistantTool(create.ctx, "create_booking", createInput)
    ).resolves.toEqual({
      ...created,
      paymentContext: {
        tripId: "trip-1",
        trainNumber: "TR-201",
        trainType: "EXPRESS",
        serviceDate: "2026-08-07",
        status: "planifie",
        departureAt: 120,
        arrivalAt: 480,
        originName: "Owendo",
        destinationName: "Booué",
        available: 12,
      },
    })
    expect(create.runQuery).toHaveBeenCalledWith(api.functions.trips.get, {
      tripId: "trip-1",
    })
    expect(create.runMutation).toHaveBeenCalledWith(
      api.functions.bookings.create,
      {
        tripId: "trip-1",
        originStationId: "station-1",
        destinationStationId: "station-2",
        serviceClass: "DEUXIEME",
        passengers: [
          {
            lastName: "Moussavou",
            firstName: "Ariane",
            gender: "F",
            phone: undefined,
            emergencyPhone: undefined,
            birthDate: undefined,
            nationality: undefined,
            documentNumber: undefined,
            discountCode: undefined,
            seatId: undefined,
          },
        ],
        contactPhone: "077000000",
        contactEmail: undefined,
        promoCode: undefined,
      }
    )

    const paid = fakeActionContext({
      mutationResult: { reference: "SET-NEW", status: "PAID" },
    })
    await dispatchAssistantTool(paid.ctx, "pay_booking", {
      reference: "SET-NEW",
      method: "airtel_money",
      payerPhone: null,
    })
    expect(paid.runMutation).toHaveBeenCalledWith(
      api.functions.bookings.confirm,
      {
        reference: "SET-NEW",
        method: "airtel_money",
        payerPhone: undefined,
      }
    )

    const cancelled = fakeActionContext({
      mutationResult: { reference: "SET-NEW", status: "CANCELLED" },
    })
    await dispatchAssistantTool(cancelled.ctx, "cancel_booking", {
      reference: "SET-NEW",
      contactPhone: "077000000",
    })
    expect(cancelled.runMutation).toHaveBeenCalledWith(
      api.functions.bookings.cancelHold,
      {
        reference: "SET-NEW",
        contactPhone: "077000000",
      }
    )
  })

  it("route le téléchargement, le profil et les consentements", async () => {
    const download = fakeActionContext({
      actionResult: { url: "https://example.test/ticket.pdf" },
    })
    await expect(
      dispatchAssistantTool(download.ctx, "get_ticket_download_url", {
        ticketId: "ticket-1",
        contactPhone: null,
      })
    ).resolves.toEqual({ url: "https://example.test/ticket.pdf" })
    expect(download.runAction).toHaveBeenCalledWith(
      api.functions.documents.ticketPdf,
      {
        ticketId: "ticket-1",
        contactPhone: undefined,
      }
    )

    const profile = fakeActionContext({
      queryResult: {
        user: {
          _id: "user-1",
          authId: "secret-auth-id",
          firstName: "Berny",
          lastName: "Itoutou",
          phone: "+24106000000",
          email: "berny@example.ga",
        },
        consents: [
          {
            _id: "consent-1",
            type: "marketing",
            channel: "web",
          },
        ],
      },
    })
    await expect(
      dispatchAssistantTool(profile.ctx, "get_my_profile", {})
    ).resolves.toEqual({
      firstName: "Berny",
      lastName: "Itoutou",
      phone: "+24106000000",
      email: "berny@example.ga",
      consents: [{ type: "marketing", channel: "web" }],
    })
    expect(profile.runQuery).toHaveBeenCalledWith(
      api.functions.customers.me,
      {}
    )

    const saved = fakeActionContext({
      queryResult: [
        {
          _id: "passenger-1",
          userId: "user-1",
          firstName: "Berny",
          lastName: "Itoutou",
          gender: "M",
          phone: "+24106000000",
          emergencyPhone: "+24107000000",
          birthDate: "1990-01-01",
          discountCode: undefined,
        },
      ],
    })
    await expect(
      dispatchAssistantTool(saved.ctx, "list_saved_passengers", {})
    ).resolves.toEqual([
      {
        firstName: "Berny",
        lastName: "Itoutou",
        gender: "M",
        phone: "+24106000000",
        discountCode: null,
      },
    ])

    const updated = fakeActionContext({ mutationResult: { updated: true } })
    await dispatchAssistantTool(updated.ctx, "update_my_profile", {
      firstName: " Ariane ",
      lastName: null,
      phone: "",
      email: " ariane@example.ga ",
    })
    expect(updated.runMutation).toHaveBeenCalledWith(
      api.functions.customers.updateProfile,
      {
        firstName: "Ariane",
        lastName: undefined,
        phone: undefined,
        email: "ariane@example.ga",
      }
    )

    const consent = fakeActionContext({ mutationResult: { granted: true } })
    await dispatchAssistantTool(consent.ctx, "grant_consent", {
      consentType: "marketing",
      channel: "mobile",
    })
    expect(consent.runMutation).toHaveBeenCalledWith(
      api.functions.customers.grantConsent,
      {
        type: "marketing",
        channel: "mobile",
      }
    )

    const revoke = fakeActionContext({ mutationResult: { revoked: true } })
    await dispatchAssistantTool(revoke.ctx, "revoke_consent", {
      consentType: "donnees",
    })
    expect(revoke.runMutation).toHaveBeenCalledWith(
      api.functions.customers.revokeConsent,
      {
        type: "donnees",
      }
    )
  })

  it("rejette les entrées invalides avant d'appeler le domaine", async () => {
    const fake = fakeActionContext()
    await expect(
      dispatchAssistantTool(fake.ctx, "search_trips", {
        originStationId: "origin",
        destinationStationId: "destination",
        serviceDate: "2026-07-27",
        passengers: 21,
      })
    ).rejects.toThrow(/passengers/)
    await expect(
      dispatchAssistantTool(fake.ctx, "quote_booking", {
        tripId: "trip-1",
        originStationId: "origin",
        destinationStationId: "destination",
        serviceClass: "ECONOMIQUE",
        passengerCount: 1,
        discountCodes: "INVALIDE",
      })
    ).rejects.toThrow(/codes de réduction/)
    await expect(
      dispatchAssistantTool(fake.ctx, "create_booking", {
        passengers: [],
      })
    ).rejects.toThrow(/Au moins un voyageur/)
    await expect(
      dispatchAssistantTool(fake.ctx, "pay_booking", {
        reference: "SET-1",
        method: "cash",
      })
    ).rejects.toThrow(/method/)
    await expect(
      dispatchAssistantTool(fake.ctx, "outil_inconnu", {})
    ).rejects.toThrow(/Outil inconnu/)
    await expect(
      dispatchAssistantTool(fake.ctx, "list_stations", null)
    ).rejects.toThrow(/Arguments d'outil invalides/)

    expect(fake.runQuery).not.toHaveBeenCalled()
    expect(fake.runMutation).not.toHaveBeenCalled()
    expect(fake.runAction).not.toHaveBeenCalled()
  })
})
