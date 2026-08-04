import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  VoiceTravelAssistant,
  VoiceTravelAssistantHost,
} from "./voice-travel-assistant"
import { ticketingStorage } from "@/lib/ticketing"

const {
  createConversation,
  executeVoiceTool,
  mintVoiceToken,
  pathnameState,
  push,
  updateVoiceSession,
} = vi.hoisted(() => ({
  createConversation: vi.fn(),
  executeVoiceTool: vi.fn(),
  mintVoiceToken: vi.fn(),
  pathnameState: { value: "/" },
  push: vi.fn(),
  updateVoiceSession: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  usePathname: () => pathnameState.value,
  useRouter: () => ({ push }),
}))

vi.mock("@workspace/api/hooks", () => ({
  useAuth: () => ({
    isAuthenticated: true,
    isLoading: false,
    user: {
      id: "traveler-1",
      name: "Ariane Moussavou",
      email: "ariane@example.ga",
    },
  }),
  useQuery: () => ({
    user: {
      firstName: "Ariane",
      lastName: "Moussavou",
      phone: "+24106000000",
      email: "ariane@example.ga",
    },
    consents: [],
  }),
  useMutation: () => createConversation,
  useAction: (reference: Record<PropertyKey, unknown>) => {
    const name = reference[Symbol.for("functionName")]
    if (name === "ai/realtime:mintVoiceToken") return mintVoiceToken
    if (name === "ai/realtime:executeVoiceTool") return executeVoiceTool
    if (name === "ai/realtime:updateVoiceSession") return updateVoiceSession
    throw new Error(`Action inattendue : ${String(name)}`)
  },
}))

class FakeDataChannel {
  readyState: RTCDataChannelState = "connecting"
  sent: unknown[] = []
  listeners = new Map<string, Array<(event: Event) => void>>()

  addEventListener(type: string, listener: (event: Event) => void) {
    const listeners = this.listeners.get(type) ?? []
    listeners.push(listener)
    this.listeners.set(type, listeners)
  }

  send(data: string) {
    this.sent.push(JSON.parse(data))
  }

  close() {
    this.readyState = "closed"
  }

  emit(type: string, event: Event) {
    for (const listener of this.listeners.get(type) ?? []) listener(event)
  }
}

class FakePeerConnection {
  channel = new FakeDataChannel()
  connectionState: RTCPeerConnectionState = "new"
  ontrack: RTCPeerConnection["ontrack"] = null
  onconnectionstatechange: RTCPeerConnection["onconnectionstatechange"] = null

  addTrack() {}

  createDataChannel() {
    return this.channel as unknown as RTCDataChannel
  }

  async createOffer() {
    return { type: "offer" as const, sdp: "offer-sdp" }
  }

  async setLocalDescription() {}

  async setRemoteDescription() {
    this.connectionState = "connected"
    this.channel.readyState = "open"
    this.channel.emit("open", new Event("open"))
  }

  close() {
    this.connectionState = "closed"
  }
}

let peer: FakePeerConnection
const stopTrack = vi.fn()
const getUserMedia = vi.fn()

describe("VoiceTravelAssistant", () => {
  beforeEach(() => {
    window.sessionStorage.clear()
    pathnameState.value = "/"
    push.mockReset()
    stopTrack.mockReset()
    createConversation.mockReset().mockResolvedValue({
      conversationId: "conversation-1",
    })
    mintVoiceToken.mockReset().mockResolvedValue({
      available: true,
      provider: "openai",
      transport: "webrtc",
      model: "gpt-realtime-test",
      voice: "marin",
      token: "ephemeral-test-token",
      expiresAt: null,
      url: "https://api.openai.test/v1/realtime/calls",
      sessionId: "provider-session-1",
      voiceSessionId: "voice-session-1",
      tools: [],
    })
    executeVoiceTool.mockReset()
    updateVoiceSession.mockReset().mockResolvedValue({ updated: true })

    peer = new FakePeerConnection()
    function MockRTCPeerConnection() {
      return peer
    }
    vi.stubGlobal("RTCPeerConnection", vi.fn(MockRTCPeerConnection))
    getUserMedia.mockReset().mockResolvedValue({
      getAudioTracks: () => [{ enabled: true, stop: stopTrack }],
      getTracks: () => [{ enabled: true, stop: stopTrack }],
    })
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    })
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("answer-sdp", { status: 200 }))
    )
  })

  it("ouvre une session WebRTC avec un secret éphémère et démarre l'accueil", async () => {
    render(
      <>
        <VoiceTravelAssistantHost />
        <VoiceTravelAssistant />
      </>
    )
    fireEvent.click(
      screen.getByRole("button", {
        name: "Réserver avec l’assistant vocal",
      })
    )

    await waitFor(() => expect(mintVoiceToken).toHaveBeenCalledTimes(1))
    expect(createConversation).toHaveBeenCalledWith(
      expect.objectContaining({ assistantId: "booking" })
    )
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    })
    expect(fetch).toHaveBeenCalledWith(
      "https://api.openai.test/v1/realtime/calls",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer ephemeral-test-token",
          "Content-Type": "application/sdp",
        },
        body: "offer-sdp",
      })
    )
    expect(peer.channel.sent).toContainEqual({
      type: "response.create",
      response: {
        instructions:
          "Dis seulement : « Bonjour, je suis Mbolo. Où souhaitez-vous aller ? »",
      },
    })
    expect(updateVoiceSession).toHaveBeenCalledWith(
      expect.objectContaining({ status: "connected" })
    )
    expect(
      screen.getByRole("complementary", { name: "Assistant vocal Mbolo" })
    ).toBeInTheDocument()
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("exécute une recherche demandée par le modèle et affiche les horaires", async () => {
    executeVoiceTool.mockResolvedValue({
      status: "ok",
      executionId: "execution-1",
      cached: false,
      clientAction: "show_trip_results",
      output: [
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
      ],
    })
    render(
      <>
        <VoiceTravelAssistantHost />
        <VoiceTravelAssistant />
      </>
    )
    fireEvent.click(
      screen.getByRole("button", {
        name: "Réserver avec l’assistant vocal",
      })
    )
    await waitFor(() => expect(peer.channel.readyState).toBe("open"))

    await act(async () => {
      peer.channel.emit(
        "message",
        new MessageEvent("message", {
          data: JSON.stringify({
            type: "response.done",
            response: {
              id: "response-search",
              output: [
                {
                  type: "function_call",
                  call_id: "call-search",
                  name: "search_trips",
                  arguments:
                    '{"originStationId":"owe","destinationStationId":"boo","serviceDate":"2026-08-02","passengers":1}',
                },
              ],
            },
          }),
        })
      )
    })

    await waitFor(() =>
      expect(executeVoiceTool).toHaveBeenCalledWith({
        conversationId: "conversation-1",
        guestKey: expect.any(String),
        callId: "call-search",
        name: "search_trips",
        input: {
          originStationId: "owe",
          destinationStationId: "boo",
          serviceDate: "2026-08-02",
          passengers: 1,
        },
      })
    )
    expect(ticketingStorage.getSearch()).toEqual({
      originId: "owe",
      destinationId: "boo",
      serviceDate: "2026-08-02",
      adults: 1,
      children: 0,
    })
    expect(await screen.findByText("1 train disponible")).toBeInTheDocument()
    expect(peer.channel.sent).toContainEqual({
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: "call-search",
        output: expect.stringContaining('"status":"ok"'),
      },
    })
  })

  it("affiche le voyageur, les horaires et le devis sans confirmation visuelle", async () => {
    executeVoiceTool.mockImplementation(({ name }: { name: string }) => {
      if (name === "list_stations") {
        return Promise.resolve({
          status: "ok",
          cached: false,
          output: [
            { id: "owe", code: "OWE", name: "Owendo", province: "Estuaire" },
            {
              id: "boo",
              code: "BOO",
              name: "Booué",
              province: "Ogooué-Ivindo",
            },
          ],
        })
      }
      if (name === "search_trips") {
        return Promise.resolve({
          status: "ok",
          cached: false,
          output: [
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
          ],
        })
      }
      return Promise.resolve({
        status: "ok",
        cached: false,
        output: { totalTtc: 50_000 },
      })
    })
    render(
      <>
        <VoiceTravelAssistantHost />
        <VoiceTravelAssistant />
      </>
    )
    fireEvent.click(
      screen.getByRole("button", {
        name: "Réserver avec l’assistant vocal",
      })
    )
    await waitFor(() => expect(peer.channel.readyState).toBe("open"))

    for (const call of [
      {
        call_id: "call-stations",
        name: "list_stations",
        arguments: "{}",
      },
      {
        call_id: "call-search",
        name: "search_trips",
        arguments:
          '{"originStationId":"owe","destinationStationId":"boo","serviceDate":"2026-08-02","passengers":1}',
      },
      {
        call_id: "call-quote",
        name: "quote_booking",
        arguments:
          '{"tripId":"trip-1","originStationId":"owe","destinationStationId":"boo","serviceClass":"DEUXIEME","passengerCount":1,"discountCodes":null}',
      },
    ]) {
      await act(async () => {
        peer.channel.emit(
          "message",
          new MessageEvent("message", {
            data: JSON.stringify({
              type: "response.done",
              response: {
                id: `response-${call.call_id}`,
                output: [{ type: "function_call", ...call }],
              },
            }),
          })
        )
      })
    }

    expect(
      screen.getByRole("region", { name: "Voyageur retenu" })
    ).toHaveTextContent("Ariane Moussavou")
    expect(
      screen.getByRole("region", { name: "Voyageur retenu" })
    ).toHaveTextContent("•••• 0000")
    const quote = screen.getByRole("region", { name: "Devis du voyage" })
    expect(quote).toHaveTextContent("Owendo → Booué")
    expect(quote).toHaveTextContent("50 000 FCFA")
    expect(quote).toHaveTextContent("2de classe")
    expect(
      within(screen.getByRole("region", { name: "Trains proposés" })).getByText(
        "TR-201"
      )
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Confirmer" })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Refuser" })
    ).not.toBeInTheDocument()
  })

  it("conserve la session lorsque le contenu de la page change", async () => {
    const view = render(
      <>
        <VoiceTravelAssistantHost />
        <VoiceTravelAssistant />
      </>
    )
    fireEvent.click(
      screen.getByRole("button", {
        name: "Réserver avec l’assistant vocal",
      })
    )
    await waitFor(() => expect(peer.channel.readyState).toBe("open"))

    view.rerender(
      <>
        <VoiceTravelAssistantHost />
        <main>Nouvelle page</main>
      </>
    )

    expect(screen.getByText("Nouvelle page")).toBeInTheDocument()
    expect(
      screen.getByRole("complementary", { name: "Assistant vocal Mbolo" })
    ).toBeInTheDocument()
    expect(peer.connectionState).toBe("connected")
    expect(stopTrack).not.toHaveBeenCalled()
  })

  it("reste accessible depuis une page sans formulaire de recherche", () => {
    pathnameState.value = "/reservation"
    render(<VoiceTravelAssistantHost />)

    expect(
      screen.getByRole("button", {
        name: "Réserver avec l’assistant vocal",
      })
    ).toBeInTheDocument()
  })
})
