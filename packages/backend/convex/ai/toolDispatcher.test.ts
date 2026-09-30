import { describe, expect, it, vi } from "vitest"
import { api, internal } from "../_generated/api"
import type { Id } from "../_generated/dataModel"
import type { ActionCtx } from "../_generated/server"
import type { ConversationActor } from "./conversations"
import { dispatchAssistantTool } from "./tools"

/** Acteur résolu par `accessContext` ; jamais une valeur du modèle. */
const ACTOR_ID = "user-actor-1" as Id<"users">
const ACTOR: ConversationActor = { userId: ACTOR_ID, source: "session" }
const MESSAGING_ACTOR: ConversationActor = {
  userId: ACTOR_ID,
  source: "messaging",
}

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

/** Titre tel que stocké, avec tout ce qu'il ne faut jamais montrer au modèle. */
function storedTicket(status: string) {
  return {
    _id: "ticket-1",
    number: "B-1",
    saleId: "sale-1",
    tripId: "trip-1",
    serviceClass: "DEUXIEME",
    coachLabel: "V1",
    seatLabel: "12A",
    status,
    unitPriceTtc: 35_000,
    barcodePayload: "BARCODE-SIGNE",
    barcodeSignature: "SIGNATURE-HEX",
    passenger: {
      firstName: "Ariane",
      lastName: "MOUSSAVOU",
      gender: "F",
      documentNumber: "PIECE-123456",
      birthDate: "1990-01-01",
      nationality: "GA-NATIONALITE",
      phone: "+24166000003",
      emergencyPhone: "+24166000002",
    },
  }
}

const storedTrip = {
  _id: "trip-1",
  trainNumber: "TR-201",
  trainType: "EXPRESS",
  serviceDate: "2026-08-07",
  departureAt: 100,
  arrivalAt: 500,
  status: "planifie",
  delayMinutes: 0,
  segmentCount: 3,
}

/** Dossier hydraté comme le rend `bookings.getByReferenceForActor`. */
function hydratedBooking() {
  return {
    sale: {
      _id: "sale-1",
      number: "SET-1",
      status: "en_attente_paiement",
      contactPhone: "+24166000001",
      contactEmail: "ariane@example.ga",
      amounts: { ht: 35_000, vat: 0, css: 0, ttc: 35_000, received: 0 },
      priceLockedUntil: 1_900_000_000_000,
    },
    tickets: [storedTicket("reserve")],
    trip: storedTrip,
    origin: { _id: "station-1", code: "OWE", name: "Owendo" },
    destination: { _id: "station-2", code: "BOU", name: "Booué" },
    segment: { departureAt: 120, arrivalAt: 480 },
    payments: [{ payerPhone: "+24166000001", method: "airtel_money" }],
    adjustments: [],
  }
}

/** Élément de `bookings.myTicketsForActor`. */
function ticketListItem() {
  return {
    ticket: storedTicket("valide"),
    trip: storedTrip,
    origin: { _id: "station-1", code: "OWE", name: "Owendo" },
    destination: { _id: "station-2", code: "BOU", name: "Booué" },
    reference: "SET-1",
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
            status: "planifie",
            internal: "non exposé",
          },
          fromIndex: 0,
          toIndex: 3,
          departureAt: 100,
          arrivalAt: 200,
          distanceKm: 300,
          intermediateStops: 2,
          availableByClass: { DEUXIEME: 20 },
          prixParClasse: { DEUXIEME: { totalTtc: 30_000, unitaireTtc: 15_000 } },
          hasAvailability: true,
        },
        {
          trip: {
            _id: "trip-2",
            trainNumber: "TM-03",
            trainType: "EXPRESS",
            serviceDate: "2026-07-27",
            status: "annule",
          },
          fromIndex: 0,
          toIndex: 1,
          departureAt: 300,
          arrivalAt: 400,
          distanceKm: 300,
          intermediateStops: 0,
          availableByClass: { DEUXIEME: 20 },
          prixParClasse: {},
          hasAvailability: false,
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
    ).resolves.toEqual({
      ...searchInput,
      trips: [
        {
          tripId: "trip-1",
          trainNumber: "TM-01",
          trainType: "OMNIBUS",
          serviceDate: "2026-07-27",
          status: "planifie",
          cancelled: false,
          departureAt: 100,
          arrivalAt: 200,
          // Horodatages proches de l'époque : 01:00 à Libreville (UTC+1).
          departureTime: "01:00",
          arrivalTime: "01:00",
          distanceKm: 300,
          intermediateStops: 2,
          availableByClass: { DEUXIEME: 20 },
          prixParClasse: {
            DEUXIEME: { totalTtc: 30_000, unitaireTtc: 15_000 },
          },
          hasAvailability: true,
        },
        {
          tripId: "trip-2",
          trainNumber: "TM-03",
          trainType: "EXPRESS",
          serviceDate: "2026-07-27",
          status: "annule",
          cancelled: true,
          departureAt: 300,
          arrivalAt: 400,
          // Horodatages proches de l'époque : 01:00 à Libreville (UTC+1).
          departureTime: "01:00",
          arrivalTime: "01:00",
          distanceKm: 300,
          intermediateStops: 0,
          availableByClass: { DEUXIEME: 20 },
          prixParClasse: {},
          hasAvailability: false,
        },
      ],
    })
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
      await expect(
        dispatchAssistantTool(trips.ctx, "search_trips", {
          originStationId: "station-1",
          destinationStationId: "station-2",
          serviceDate: null,
          relativeDaysFromToday: 2,
          passengers: 1,
        })
      ).resolves.toEqual({
        originStationId: "station-1",
        destinationStationId: "station-2",
        serviceDate: "2026-08-07",
        passengers: 1,
        trips: [],
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

    const booking = fakeActionContext({ queryResult: null })
    await expect(
      dispatchAssistantTool(booking.ctx, "get_booking", {
        reference: " SET-1 ",
        contactPhone: null,
      })
    ).resolves.toBeNull()
    expect(booking.runQuery).toHaveBeenCalledWith(
      internal.functions.bookings.getByReferenceForActor,
      {
        userId: undefined,
        reference: "SET-1",
        contactPhone: undefined,
      }
    )

    const owned = fakeActionContext({ queryResult: hydratedBooking() })
    await dispatchAssistantTool(
      owned.ctx,
      "get_booking",
      { reference: "SET-1", contactPhone: null },
      ACTOR
    )
    expect(owned.runQuery).toHaveBeenCalledWith(
      internal.functions.bookings.getByReferenceForActor,
      { userId: ACTOR_ID, reference: "SET-1", contactPhone: undefined }
    )

    const mine = fakeActionContext({ queryResult: [hydratedBooking()] })
    await dispatchAssistantTool(mine.ctx, "list_my_bookings", {}, ACTOR)
    expect(mine.runQuery).toHaveBeenCalledWith(
      internal.functions.bookings.listMineForActor,
      { userId: ACTOR_ID }
    )

    const tickets = fakeActionContext({ queryResult: [ticketListItem()] })
    await dispatchAssistantTool(tickets.ctx, "list_my_tickets", {}, ACTOR)
    expect(tickets.runQuery).toHaveBeenCalledWith(
      internal.functions.bookings.myTicketsForActor,
      { userId: ACTOR_ID }
    )
  })

  it("ne transmet au modèle ni code-barres ni donnée personnelle sensible", async () => {
    // Ce que le modèle ne doit jamais lire, où que ce soit dans la sortie.
    const SECRETS = [
      "BARCODE-SIGNE",
      "SIGNATURE-HEX",
      "PIECE-123456",
      "1990-01-01",
      "GA-NATIONALITE",
      "+24166000001",
      "+24166000002",
      "+24166000003",
      "ariane@example.ga",
    ]
    const noSecret = (output: unknown) => {
      const json = JSON.stringify(output)
      for (const secret of SECRETS) expect(json).not.toContain(secret)
    }

    const booking = fakeActionContext({ queryResult: hydratedBooking() })
    const got = await dispatchAssistantTool(
      booking.ctx,
      "get_booking",
      { reference: "SET-1", contactPhone: "+24166000001" },
      ACTOR
    )
    noSecret(got)
    expect(got).toEqual({
      sale: {
        number: "SET-1",
        status: "en_attente_paiement",
        amounts: { ttc: 35_000 },
        priceLockedUntil: 1_900_000_000_000,
      },
      tickets: [
        {
          _id: "ticket-1",
          passenger: { firstName: "Ariane", lastName: "MOUSSAVOU" },
          serviceClass: "DEUXIEME",
          seatLabel: "12A",
          status: "reserve",
          unitPriceTtc: 35_000,
        },
      ],
      trip: {
        trainNumber: "TR-201",
        trainType: "EXPRESS",
        serviceDate: "2026-08-07",
        departureAt: 100,
        arrivalAt: 500,
        status: "planifie",
        delayMinutes: 0,
      },
      origin: { name: "Owendo" },
      destination: { name: "Booué" },
      segment: { departureAt: 120, arrivalAt: 480 },
    })

    const mine = fakeActionContext({ queryResult: [hydratedBooking()] })
    const bookings = await dispatchAssistantTool(
      mine.ctx,
      "list_my_bookings",
      {},
      ACTOR
    )
    noSecret(bookings)
    expect(bookings).toEqual([
      expect.objectContaining({
        sale: expect.objectContaining({
          number: "SET-1",
          status: "en_attente_paiement",
        }),
        trip: expect.objectContaining({
          serviceDate: "2026-08-07",
          departureAt: 100,
        }),
        origin: { name: "Owendo" },
        destination: { name: "Booué" },
        segment: { departureAt: 120, arrivalAt: 480 },
      }),
    ])

    const tickets = fakeActionContext({ queryResult: [ticketListItem()] })
    const list = await dispatchAssistantTool(
      tickets.ctx,
      "list_my_tickets",
      {},
      ACTOR
    )
    noSecret(list)
    expect(list).toEqual([
      {
        reference: "SET-1",
        ticket: {
          _id: "ticket-1",
          status: "valide",
          passenger: { firstName: "Ariane", lastName: "MOUSSAVOU" },
          serviceClass: "DEUXIEME",
          coachLabel: "V1",
          seatLabel: "12A",
        },
        trip: expect.objectContaining({ departureAt: 100 }),
        origin: { name: "Owendo" },
        destination: { name: "Booué" },
      },
    ])
  })

  it("refuse les outils personnels sans acteur, même si le modèle les appelle", async () => {
    for (const name of [
      "list_my_bookings",
      "list_my_tickets",
      "get_my_profile",
      "list_saved_passengers",
    ]) {
      const fake = fakeActionContext()
      await expect(dispatchAssistantTool(fake.ctx, name, {})).rejects.toThrow(
        /Connexion requise/
      )
      expect(fake.runQuery).not.toHaveBeenCalled()
    }
    const update = fakeActionContext()
    await expect(
      dispatchAssistantTool(update.ctx, "update_my_profile", {
        firstName: "Ariane",
      })
    ).rejects.toThrow(/Connexion requise/)
    expect(update.runMutation).not.toHaveBeenCalled()
  })

  it("propose la connexion aux seuls visiteurs, avec un motif borné", async () => {
    const guest = fakeActionContext()
    await expect(
      dispatchAssistantTool(guest.ctx, "request_sign_in", {
        reason: "  retrouver\n vos billets  ",
      })
    ).resolves.toEqual({ reason: "retrouver vos billets" })
    const long = await dispatchAssistantTool(guest.ctx, "request_sign_in", {
      reason: "x".repeat(400),
    })
    expect((long as { reason: string }).reason).toHaveLength(160)
    await expect(
      dispatchAssistantTool(guest.ctx, "request_sign_in", { reason: "" })
    ).rejects.toThrow(/reason/)
    await expect(
      dispatchAssistantTool(
        guest.ctx,
        "request_sign_in",
        { reason: "retrouver vos billets" },
        ACTOR
      )
    ).rejects.toThrow(/déjà connecté/)
    expect(guest.runQuery).not.toHaveBeenCalled()
    expect(guest.runMutation).not.toHaveBeenCalled()
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
      dispatchAssistantTool(create.ctx, "create_booking", createInput, ACTOR)
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
        departureTime: "01:00",
        arrivalTime: "01:00",
        originName: "Owendo",
        destinationName: "Booué",
        available: 12,
      },
    })
    expect(create.runQuery).toHaveBeenCalledWith(api.functions.trips.get, {
      tripId: "trip-1",
    })
    expect(create.runMutation).toHaveBeenCalledWith(
      internal.functions.bookings.createForActor,
      {
        userId: ACTOR_ID,
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
      contactPhone: " 077000000 ",
    })
    // Le paiement passe par la variante interne : l'accès est celui de
    // l'acteur ou du téléphone de contact, jamais la référence seule.
    expect(paid.runMutation).toHaveBeenCalledWith(
      internal.functions.bookings.confirmForActor,
      {
        userId: undefined,
        reference: "SET-NEW",
        method: "airtel_money",
        payerPhone: undefined,
        contactPhone: "077000000",
      }
    )

    const paidByOwner = fakeActionContext({
      mutationResult: { reference: "SET-NEW", status: "confirmee" },
    })
    await dispatchAssistantTool(
      paidByOwner.ctx,
      "pay_booking",
      {
        reference: "SET-NEW",
        method: "moov_money",
        payerPhone: "066000000",
        contactPhone: null,
      },
      MESSAGING_ACTOR
    )
    expect(paidByOwner.runMutation).toHaveBeenCalledWith(
      internal.functions.bookings.confirmForActor,
      {
        userId: ACTOR_ID,
        reference: "SET-NEW",
        method: "moov_money",
        payerPhone: "066000000",
        contactPhone: undefined,
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
      internal.functions.bookings.cancelHoldForActor,
      {
        userId: undefined,
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
      dispatchAssistantTool(
        download.ctx,
        "get_ticket_download_url",
        { ticketId: "ticket-1", contactPhone: null },
        ACTOR
      )
    ).resolves.toEqual({ url: "https://example.test/ticket.pdf" })
    expect(download.runAction).toHaveBeenCalledWith(
      internal.functions.documents.ticketPdfForActor,
      {
        userId: ACTOR_ID,
        source: "session",
        ticketId: "ticket-1",
        contactPhone: undefined,
      }
    )

    // La voie de l'acteur suit jusqu'au contrôle d'accès du billet.
    const fromThread = fakeActionContext({
      actionResult: { url: "https://example.test/ticket.pdf" },
    })
    await dispatchAssistantTool(
      fromThread.ctx,
      "get_ticket_download_url",
      { ticketId: "ticket-1", contactPhone: null },
      MESSAGING_ACTOR
    )
    expect(fromThread.runAction).toHaveBeenCalledWith(
      internal.functions.documents.ticketPdfForActor,
      {
        userId: ACTOR_ID,
        source: "messaging",
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
      dispatchAssistantTool(profile.ctx, "get_my_profile", {}, ACTOR)
    ).resolves.toEqual({
      firstName: "Berny",
      lastName: "Itoutou",
      gender: null,
      phone: "+24106000000",
      email: "berny@example.ga",
      consents: [{ type: "marketing", channel: "web" }],
    })
    expect(profile.runQuery).toHaveBeenCalledWith(
      internal.functions.customers.meForActor,
      { userId: ACTOR_ID }
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
      dispatchAssistantTool(saved.ctx, "list_saved_passengers", {}, ACTOR)
    ).resolves.toEqual([
      {
        firstName: "Berny",
        lastName: "Itoutou",
        gender: "M",
        phone: "+24106000000",
        discountCode: null,
      },
    ])
    expect(saved.runQuery).toHaveBeenCalledWith(
      internal.functions.customers.listSavedPassengersForActor,
      { userId: ACTOR_ID }
    )

    const updated = fakeActionContext({ mutationResult: { updated: true } })
    await dispatchAssistantTool(
      updated.ctx,
      "update_my_profile",
      {
        firstName: " Ariane ",
        lastName: null,
        phone: "",
        email: " ariane@example.ga ",
      },
      ACTOR
    )
    expect(updated.runMutation).toHaveBeenCalledWith(
      internal.functions.customers.updateProfileForActor,
      {
        userId: ACTOR_ID,
        firstName: "Ariane",
        lastName: undefined,
        phone: undefined,
        email: "ariane@example.ga",
      }
    )

    const civilite = fakeActionContext({ mutationResult: null })
    await dispatchAssistantTool(
      civilite.ctx,
      "update_my_profile",
      { firstName: null, lastName: null, phone: null, email: null, gender: "F" },
      ACTOR
    )
    expect(civilite.runMutation).toHaveBeenCalledWith(
      internal.functions.customers.updateProfileForActor,
      expect.objectContaining({ userId: ACTOR_ID, gender: "F" })
    )
    const invalide = fakeActionContext()
    await expect(
      dispatchAssistantTool(
        invalide.ctx,
        "update_my_profile",
        { gender: "Monsieur" },
        ACTOR
      )
    ).rejects.toThrow(/gender/)
    expect(invalide.runMutation).not.toHaveBeenCalled()

    const consent = fakeActionContext({ mutationResult: { granted: true } })
    await dispatchAssistantTool(
      consent.ctx,
      "grant_consent",
      { consentType: "marketing", channel: "mobile" },
      ACTOR
    )
    expect(consent.runMutation).toHaveBeenCalledWith(
      internal.functions.customers.grantConsentForActor,
      {
        userId: ACTOR_ID,
        type: "marketing",
        channel: "mobile",
      }
    )

    const revoke = fakeActionContext({ mutationResult: { revoked: true } })
    await dispatchAssistantTool(
      revoke.ctx,
      "revoke_consent",
      { consentType: "donnees" },
      ACTOR
    )
    expect(revoke.runMutation).toHaveBeenCalledWith(
      internal.functions.customers.revokeConsentForActor,
      {
        userId: ACTOR_ID,
        type: "donnees",
      }
    )
  })

  it("note et oublie pour l'acteur seul, jamais pour un invité", async () => {
    const note = fakeActionContext({
      mutationResult: { action: "noted", memoryId: "m-1" },
    })
    await dispatchAssistantTool(
      note.ctx,
      "remember",
      {
        category: "preference",
        content: " Préfère la 1re classe. ",
        replacesMemoryId: null,
      },
      MESSAGING_ACTOR
    )
    // La voie de l'acteur suit la note : prise depuis une messagerie reliée.
    expect(note.runMutation).toHaveBeenCalledWith(
      internal.ai.memory.rememberForActor,
      {
        userId: ACTOR_ID,
        category: "preference",
        content: "Préfère la 1re classe.",
        replacesMemoryId: undefined,
        source: "messaging",
      }
    )

    const categorie = fakeActionContext()
    await expect(
      dispatchAssistantTool(
        categorie.ctx,
        "remember",
        { category: "sante", content: "x", replacesMemoryId: null },
        ACTOR
      )
    ).rejects.toThrow(/category/)
    expect(categorie.runMutation).not.toHaveBeenCalled()

    const une = fakeActionContext({ mutationResult: { count: 1 } })
    await dispatchAssistantTool(
      une.ctx,
      "forget",
      { memoryId: "m-1", all: false },
      ACTOR
    )
    expect(une.runMutation).toHaveBeenCalledWith(
      internal.ai.memory.forgetForActor,
      { userId: ACTOR_ID, memoryId: "m-1", all: false }
    )
    const toutes = fakeActionContext({ mutationResult: { count: 3 } })
    await dispatchAssistantTool(
      toutes.ctx,
      "forget",
      { memoryId: null, all: true },
      ACTOR
    )
    expect(toutes.runMutation).toHaveBeenCalledWith(
      internal.ai.memory.forgetForActor,
      { userId: ACTOR_ID, memoryId: undefined, all: true }
    )

    for (const [name, input] of [
      ["remember", { category: "preference", content: "Préfère la 1re." }],
      ["forget", { memoryId: null, all: true }],
    ] as const) {
      const invite = fakeActionContext()
      await expect(dispatchAssistantTool(invite.ctx, name, input)).rejects.toThrow(
        /Connexion requise/
      )
      expect(invite.runMutation).not.toHaveBeenCalled()
    }
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
