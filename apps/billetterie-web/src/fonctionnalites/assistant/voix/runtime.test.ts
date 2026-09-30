import { beforeEach, describe, expect, it, vi } from "vitest"

import { cleInvite } from "../cle-invite"
import {
  completedAssistantTranscript,
  parseRealtimeFunctionCalls,
  realtimeFunctionCallEvent,
  realtimeTranscriptEvent,
} from "./runtime"

describe("contrat du client vocal Realtime", () => {
  beforeEach(() => {
    window.sessionStorage.clear()
  })

  it("crée un secret invité stable sans le placer dans l'URL", () => {
    vi.spyOn(crypto, "randomUUID")
      .mockReturnValueOnce("11111111-1111-4111-8111-111111111111")
      .mockReturnValueOnce("22222222-2222-4222-8222-222222222222")

    const first = cleInvite()
    const second = cleInvite()

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
})
