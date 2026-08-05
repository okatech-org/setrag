import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  completedAssistantTranscript,
  emptyVoiceJourneyMemory,
  getAssistantGuestKey,
  parseRealtimeFunctionCalls,
  realtimeFunctionCallEvent,
  realtimeTranscriptEvent,
  rememberSuccessfulVoiceTool,
} from "./voice-assistant-runtime"

describe("contrat du client vocal Realtime", () => {
  beforeEach(() => {
    window.sessionStorage.clear()
  })

  it("crée un secret invité stable sans le placer dans l'URL", () => {
    vi.spyOn(crypto, "randomUUID")
      .mockReturnValueOnce("11111111-1111-4111-8111-111111111111")
      .mockReturnValueOnce("22222222-2222-4222-8222-222222222222")

    const first = getAssistantGuestKey()
    const second = getAssistantGuestKey()

    expect(first).toBe(
      "11111111-1111-4111-8111-11111111111122222222-2222-4222-8222-222222222222"
    )
    expect(second).toBe(first)
    expect(window.location.href).not.toContain(first)
  })

  it("extrait un appel dès que ses arguments Realtime sont terminés", () => {
    expect(
      realtimeFunctionCallEvent({
        type: "response.function_call_arguments.done",
        call_id: "call-search",
        name: "search_trips",
        arguments:
          '{"originStationId":"owe","destinationStationId":"boo","serviceDate":"2026-08-02","passengers":2}',
      })
    ).toEqual({
      callId: "call-search",
      name: "search_trips",
      input: {
        originStationId: "owe",
        destinationStationId: "boo",
        serviceDate: "2026-08-02",
        passengers: 2,
      },
    })
  })

  it("extrait tous les appels de fonction d'une réponse terminée", () => {
    expect(
      parseRealtimeFunctionCalls({
        type: "response.done",
        response: {
          output: [
            {
              type: "function_call",
              call_id: "call-stations",
              name: "list_stations",
              arguments: "{}",
            },
            {
              type: "function_call",
              call_id: "call-search",
              name: "search_trips",
              arguments:
                '{"originStationId":"owe","destinationStationId":"boo","serviceDate":"2026-08-02","passengers":2}',
            },
          ],
        },
      })
    ).toEqual([
      { callId: "call-stations", name: "list_stations", input: {} },
      {
        callId: "call-search",
        name: "search_trips",
        input: {
          originStationId: "owe",
          destinationStationId: "boo",
          serviceDate: "2026-08-02",
          passengers: 2,
        },
      },
    ])
  })

  it("neutralise des arguments JSON invalides sans exécuter de code", () => {
    expect(
      parseRealtimeFunctionCalls({
        type: "response.done",
        response: {
          output: [
            {
              type: "function_call",
              call_id: "call-invalid",
              name: "search_trips",
              arguments: "{",
            },
          ],
        },
      })
    ).toEqual([{ callId: "call-invalid", name: "search_trips", input: {} }])
  })

  it("normalise les transcriptions utilisateur et assistant", () => {
    expect(
      realtimeTranscriptEvent({
        type: "conversation.item.input_audio_transcription.completed",
        item_id: "user-1",
        transcript: "Je veux aller à Booué demain.",
      })
    ).toEqual({
      role: "user",
      mode: "completed",
      id: "user-1",
      text: "Je veux aller à Booué demain.",
    })
    expect(
      realtimeTranscriptEvent({
        type: "response.output_audio_transcript.delta",
        item_id: "assistant-1",
        delta: "Très bien, ",
      })
    ).toEqual({
      role: "assistant",
      mode: "delta",
      id: "assistant-1",
      text: "Très bien, ",
    })
    expect(
      completedAssistantTranscript({
        type: "response.done",
        response: {
          id: "response-1",
          output: [
            {
              type: "message",
              role: "assistant",
              content: [
                { type: "audio", transcript: "À quelle heure préférez-vous ?" },
              ],
            },
          ],
        },
      })
    ).toEqual({
      id: "response-1",
      text: "À quelle heure préférez-vous ?",
    })
  })

  it("synchronise une recherche vocale avec le formulaire et ses résultats", () => {
    const memory = emptyVoiceJourneyMemory()
    rememberSuccessfulVoiceTool(memory, "list_stations", {}, [
      { id: "owe", code: "OWE", name: "Owendo", province: "Estuaire" },
      { id: "boo", code: "BOO", name: "Booué", province: "Ogooué-Ivindo" },
    ])
    const effect = rememberSuccessfulVoiceTool(
      memory,
      "search_trips",
      {
        originStationId: "owe",
        destinationStationId: "boo",
        serviceDate: "2026-08-02",
        passengers: 2,
      },
      [
        {
          tripId: "trip-1",
          trainNumber: "TR-201",
          trainType: "EXPRESS",
          serviceDate: "2026-08-02",
          status: "a_lheure",
          departureAt: 1_785_658_200_000,
          arrivalAt: 1_785_676_200_000,
          distanceKm: 335,
          availableByClass: { DEUXIEME: 18 },
          hasAvailability: true,
        },
      ]
    )

    expect(effect.search).toEqual({
      originId: "owe",
      destinationId: "boo",
      serviceDate: "2026-08-02",
      adults: 2,
      children: 0,
    })
    expect(effect.trips?.[0]).toMatchObject({
      tripId: "trip-1",
      trainNumber: "TR-201",
    })
  })

  it("reprend la date relative calculée par le backend", () => {
    const memory = emptyVoiceJourneyMemory()
    const effect = rememberSuccessfulVoiceTool(
      memory,
      "search_trips",
      {
        originStationId: "owe",
        destinationStationId: "boo",
        serviceDate: null,
        relativeDaysFromToday: 2,
        passengers: 1,
      },
      [
        {
          tripId: "trip-relative",
          trainNumber: "TR-202",
          trainType: "EXPRESS",
          serviceDate: "2026-08-07",
          status: "a_lheure",
          departureAt: 1_786_090_200_000,
          arrivalAt: 1_786_102_200_000,
          distanceKm: 335,
          availableByClass: { DEUXIEME: 18 },
          hasAvailability: true,
        },
      ]
    )

    expect(effect.search?.serviceDate).toBe("2026-08-07")
  })

  it("prépare le paiement après une réservation vocale confirmée", () => {
    const memory = emptyVoiceJourneyMemory()
    rememberSuccessfulVoiceTool(memory, "list_stations", {}, [
      { id: "owe", code: "OWE", name: "Owendo", province: "Estuaire" },
      { id: "boo", code: "BOO", name: "Booué", province: "Ogooué-Ivindo" },
    ])
    rememberSuccessfulVoiceTool(
      memory,
      "search_trips",
      {
        originStationId: "owe",
        destinationStationId: "boo",
        serviceDate: "2026-08-02",
        passengers: 2,
      },
      [
        {
          tripId: "trip-1",
          trainNumber: "TR-201",
          trainType: "EXPRESS",
          serviceDate: "2026-08-02",
          status: "a_lheure",
          departureAt: 1_785_658_200_000,
          arrivalAt: 1_785_676_200_000,
          distanceKm: 335,
          availableByClass: { DEUXIEME: 18 },
          hasAvailability: true,
        },
      ]
    )
    const quoteEffect = rememberSuccessfulVoiceTool(
      memory,
      "quote_booking",
      {
        tripId: "trip-1",
        originStationId: "owe",
        destinationStationId: "boo",
        serviceClass: "DEUXIEME",
        passengerCount: 2,
      },
      { totalTtc: 50_000 }
    )
    expect(quoteEffect.quote).toEqual({
      tripId: "trip-1",
      originStationId: "owe",
      destinationStationId: "boo",
      originName: "Owendo",
      destinationName: "Booué",
      serviceClass: "DEUXIEME",
      passengerCount: 2,
      totalTtc: 50_000,
    })

    const effect = rememberSuccessfulVoiceTool(
      memory,
      "create_booking",
      {
        tripId: "trip-1",
        originStationId: "owe",
        destinationStationId: "boo",
        serviceClass: "DEUXIEME",
        passengers: [
          {
            firstName: "Ariane",
            lastName: "Moussavou",
            gender: "F",
            discountCode: null,
          },
          {
            firstName: "Noah",
            lastName: "Moussavou",
            gender: "M",
            discountCode: "ENFANT",
          },
        ],
        contactPhone: "+24106000000",
        contactEmail: "ariane@example.ga",
      },
      {
        reference: "V-LIGNE-20260802-000001",
        holdExpiresAt: 1_785_650_000_000,
        amounts: { ttc: 50_000 },
      }
    )

    expect(effect.handoff).toEqual({
      search: {
        originId: "owe",
        destinationId: "boo",
        serviceDate: "2026-08-02",
        adults: 1,
        children: 1,
      },
      trip: expect.objectContaining({
        tripId: "trip-1",
        originName: "Owendo",
        destinationName: "Booué",
        passengers: 2,
        priceXaf: 25_000,
      }),
      booking: {
        reference: "V-LIGNE-20260802-000001",
        holdExpiresAt: 1_785_650_000_000,
        contactPhone: "+24106000000",
        contactEmail: "ariane@example.ga",
        serviceClass: "DEUXIEME",
        passengers: [
          {
            firstName: "Ariane",
            lastName: "Moussavou",
            gender: "F",
            emergencyPhone: undefined,
            discountCode: undefined,
            seatId: undefined,
          },
          {
            firstName: "Noah",
            lastName: "Moussavou",
            gender: "M",
            emergencyPhone: undefined,
            discountCode: "ENFANT",
            seatId: undefined,
          },
        ],
      },
    })
  })

  it("prépare le paiement avec la réponse autonome de la réservation", () => {
    const memory = emptyVoiceJourneyMemory()
    const effect = rememberSuccessfulVoiceTool(
      memory,
      "create_booking",
      {
        tripId: "trip-1",
        originStationId: "owe",
        destinationStationId: "boo",
        serviceClass: "DEUXIEME",
        passengers: [
          {
            firstName: "Ariane",
            lastName: "Moussavou",
            gender: "F",
            discountCode: null,
          },
        ],
        contactPhone: "+24106000000",
      },
      {
        reference: "V-LIGNE-20260807-000001",
        holdExpiresAt: 1_900_000_000_000,
        amounts: { ttc: 35_000 },
        paymentContext: {
          tripId: "trip-1",
          trainNumber: "TR-201",
          trainType: "EXPRESS",
          serviceDate: "2026-08-07",
          status: "planifie",
          departureAt: 1_786_090_200_000,
          arrivalAt: 1_786_102_200_000,
          originName: "Owendo",
          destinationName: "Booué",
          available: 18,
        },
      }
    )

    expect(effect.handoff).toMatchObject({
      search: {
        originId: "owe",
        destinationId: "boo",
        serviceDate: "2026-08-07",
      },
      trip: {
        tripId: "trip-1",
        originName: "Owendo",
        destinationName: "Booué",
      },
      booking: { reference: "V-LIGNE-20260807-000001" },
    })
  })
})
