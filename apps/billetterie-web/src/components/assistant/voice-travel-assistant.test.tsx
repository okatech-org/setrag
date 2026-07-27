import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { VoiceTravelAssistant } from "./voice-travel-assistant"

const {
  createConversation,
  executeVoiceTool,
  mintVoiceToken,
  push,
  rejectToolCall,
  updateVoiceSession,
} = vi.hoisted(() => ({
  createConversation: vi.fn(),
  executeVoiceTool: vi.fn(),
  mintVoiceToken: vi.fn(),
  push: vi.fn(),
  rejectToolCall: vi.fn(),
  updateVoiceSession: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}))

vi.mock("@workspace/api/hooks", () => ({
  useMutation: () => createConversation,
  useAction: (reference: Record<PropertyKey, unknown>) => {
    const name = reference[Symbol.for("functionName")]
    if (name === "ai/realtime:mintVoiceToken") return mintVoiceToken
    if (name === "ai/realtime:executeVoiceTool") return executeVoiceTool
    if (name === "ai/realtime:updateVoiceSession") return updateVoiceSession
    if (name === "ai/chat:rejectToolCall") return rejectToolCall
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
    rejectToolCall.mockReset().mockResolvedValue({ status: "rejected" })

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
    render(<VoiceTravelAssistant />)
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
          "Accueille brièvement le voyageur en français, présente-toi comme Mbolo, puis demande-lui sa destination. Pose une seule question.",
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
    const onSearchChange = vi.fn()
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
    render(<VoiceTravelAssistant onSearchChange={onSearchChange} />)
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
    expect(onSearchChange).toHaveBeenCalledWith({
      originId: "owe",
      destinationId: "boo",
      serviceDate: "2026-08-02",
      adults: 1,
      children: 0,
    })
    expect(await screen.findByText("1 train disponible.")).toBeInTheDocument()
    expect(peer.channel.sent).toContainEqual({
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: "call-search",
        output: expect.stringContaining('"status":"ok"'),
      },
    })
  })
})
