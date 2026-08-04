"use client"

import {
  CalendarDays,
  Check,
  CircleStop,
  Clock3,
  LoaderCircle,
  Mic,
  MicOff,
  TrainFront,
  UserRound,
  Volume2,
  WalletCards,
} from "lucide-react"
import { usePathname, useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"

import { useAction, useMutation } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"

import {
  completedAssistantTranscript,
  emptyVoiceJourneyMemory,
  getAssistantGuestKey,
  parseRealtimeFunctionCalls,
  realtimeTranscriptEvent,
  rememberSuccessfulVoiceTool,
  type RealtimeFunctionCall,
  type VoiceJourneyMemory,
  type VoiceQuoteSummary,
  type VoiceTrip,
} from "@/features/assistant/voice-assistant-runtime"
import { useTravelerAuth } from "@/hooks/use-traveler-auth"
import { ticketingStorage } from "@/lib/ticketing"

type VoiceStatus =
  | "idle"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "reserved"
  | "error"
  | "ended"

type TranscriptMessage = {
  id: string
  role: "user" | "assistant" | "system"
  text: string
}

type ToolResult =
  | {
      status: "ok"
      output: unknown
      clientAction?: string
      cached: boolean
    }
  | { status: "approval_required"; message?: string }
  | { status: "error"; message: string }

const statusCopy: Record<VoiceStatus, { label: string; description: string }> =
  {
    idle: {
      label: "Prêt",
      description: "L’assistant vous guidera jusqu’à la réservation.",
    },
    connecting: {
      label: "Connexion",
      description: "Ouverture du micro et de la conversation sécurisée…",
    },
    listening: {
      label: "Je vous écoute",
      description: "Dites simplement où vous souhaitez aller.",
    },
    thinking: {
      label: "Recherche",
      description: "Mbolo consulte les gares, horaires et disponibilités.",
    },
    speaking: {
      label: "Mbolo répond",
      description: "Vous pouvez l’interrompre naturellement en parlant.",
    },
    reserved: {
      label: "Trajet réservé",
      description: "Vos places sont bloquées. Passage au paiement…",
    },
    error: {
      label: "Indisponible",
      description: "La conversation vocale n’a pas pu continuer.",
    },
    ended: {
      label: "Conversation terminée",
      description: "Vous pouvez relancer l’assistant à tout moment.",
    },
  }

const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Africa/Libreville",
  weekday: "short",
  day: "numeric",
  month: "short",
})

const timeFormatter = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Africa/Libreville",
  hour: "2-digit",
  minute: "2-digit",
})

const moneyFormatter = new Intl.NumberFormat("fr-FR")

const classLabels: Record<VoiceQuoteSummary["serviceClass"], string> = {
  DEUXIEME: "2de classe",
  PREMIERE: "1re classe",
  VIP: "VIP",
}

function maskPhone(phone: string): string {
  const compact = phone.replace(/\s+/g, "")
  return compact.length <= 4 ? compact : `•••• ${compact.slice(-4)}`
}

function recordOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

const OPEN_VOICE_ASSISTANT_EVENT = "setrag:voice-assistant:open"

/** Bouton local qui ouvre l'unique assistant monté dans le shell global. */
export function VoiceTravelAssistant() {
  return (
    <Button
      type="button"
      variant="secondary"
      size="icon-lg"
      onClick={() =>
        window.dispatchEvent(new Event(OPEN_VOICE_ASSISTANT_EVENT))
      }
      aria-label="Réserver avec l’assistant vocal"
      title="Parler à Mbolo"
    >
      <Mic aria-hidden />
    </Button>
  )
}

/**
 * Hôte persistant de la conversation vocale.
 *
 * Il est monté une seule fois dans SiteShell : les changements de route
 * remplacent les pages enfants sans détruire la connexion WebRTC.
 */
export function VoiceTravelAssistantHost() {
  const router = useRouter()
  const pathname = usePathname()
  const createConversation = useMutation(api.ai.conversations.create)
  const mintVoiceToken = useAction(api.ai.realtime.mintVoiceToken)
  const executeVoiceTool = useAction(api.ai.realtime.executeVoiceTool)
  const updateVoiceSession = useAction(api.ai.realtime.updateVoiceSession)
  const { profile } = useTravelerAuth()

  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<VoiceStatus>("idle")
  const [messages, setMessages] = useState<TranscriptMessage[]>([])
  const [suggestions, setSuggestions] = useState<VoiceTrip[]>([])
  const [quote, setQuote] = useState<VoiceQuoteSummary>()
  const [error, setError] = useState<string>()
  const [muted, setMuted] = useState(false)
  const [hasMicrophone, setHasMicrophone] = useState(false)

  const peerRef = useRef<RTCPeerConnection | null>(null)
  const channelRef = useRef<RTCDataChannel | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const conversationIdRef = useRef<string | null>(null)
  const voiceSessionIdRef = useRef<string | null>(null)
  const guestKeyRef = useRef("")
  const processedCallsRef = useRef(new Set<string>())
  const journeyRef = useRef<VoiceJourneyMemory>(emptyVoiceJourneyMemory())
  const closingRef = useRef(false)

  const appendMessage = useCallback((next: TranscriptMessage) => {
    setMessages((current) => {
      const index = current.findIndex(
        (message) => message.id === next.id && message.role === next.role
      )
      if (index < 0) return [...current, next]
      const copy = [...current]
      copy[index] = next
      return copy
    })
  }, [])

  const appendDelta = useCallback((id: string, delta: string) => {
    setMessages((current) => {
      const index = current.findIndex(
        (message) => message.id === id && message.role === "assistant"
      )
      if (index < 0) {
        return [...current, { id, role: "assistant", text: delta }]
      }
      const copy = [...current]
      copy[index] = {
        ...copy[index]!,
        text: `${copy[index]!.text}${delta}`,
      }
      return copy
    })
  }, [])

  const sendChannelEvent = useCallback((event: unknown) => {
    const channel = channelRef.current
    if (channel?.readyState !== "open") return false
    channel.send(JSON.stringify(event))
    return true
  }, [])

  const endConnection = useCallback(
    async (finalStatus: "ended" | "failed" = "ended", updateUi = true) => {
      if (closingRef.current) return
      closingRef.current = true
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      setHasMicrophone(false)
      channelRef.current?.close()
      channelRef.current = null
      peerRef.current?.close()
      peerRef.current = null
      if (audioRef.current) audioRef.current.srcObject = null

      const conversationId = conversationIdRef.current
      const voiceSessionId = voiceSessionIdRef.current
      if (conversationId && voiceSessionId) {
        try {
          await updateVoiceSession({
            conversationId: conversationId as never,
            guestKey: guestKeyRef.current || undefined,
            voiceSessionId: voiceSessionId as never,
            status: finalStatus,
          })
        } catch {
          // La fermeture locale reste prioritaire si la télémétrie échoue.
        }
      }
      if (updateUi) setStatus(finalStatus === "failed" ? "error" : "ended")
      closingRef.current = false
    },
    [updateVoiceSession]
  )

  const completeBookingHandoff = useCallback(
    async (
      effectiveCall: RealtimeFunctionCall,
      result: Extract<ToolResult, { status: "ok" }>
    ) => {
      const effect = rememberSuccessfulVoiceTool(
        journeyRef.current,
        effectiveCall.name,
        effectiveCall.input,
        result.output
      )
      if (effect.search) {
        ticketingStorage.setSearch(effect.search)
      }
      if (effect.trips) setSuggestions(effect.trips)
      if (effect.quote) setQuote(effect.quote)
      if (!effect.handoff) return

      ticketingStorage.setSearch(effect.handoff.search)
      ticketingStorage.setTrip(effect.handoff.trip)
      ticketingStorage.setBooking(effect.handoff.booking)
      appendMessage({
        id: `reservation-${effect.handoff.booking.reference}`,
        role: "system",
        text: `Réservation ${effect.handoff.booking.reference} créée. Vos places sont bloquées pendant quinze minutes.`,
      })
      setStatus("reserved")
      await endConnection("ended", false)
      window.setTimeout(() => router.push("/paiement"), 900)
    },
    [appendMessage, endConnection, router]
  )

  const processFunctionCalls = useCallback(
    async (calls: RealtimeFunctionCall[]) => {
      const freshCalls = calls.filter(
        (call) => !processedCallsRef.current.has(call.callId)
      )
      if (freshCalls.length === 0) return
      setStatus("thinking")

      for (const call of freshCalls) {
        processedCallsRef.current.add(call.callId)
        let result: ToolResult
        try {
          result = (await executeVoiceTool({
            conversationId: conversationIdRef.current as never,
            guestKey: guestKeyRef.current || undefined,
            callId: call.callId,
            name: call.name,
            input: call.input,
          })) as ToolResult
        } catch (cause) {
          result = {
            status: "error",
            message:
              cause instanceof Error
                ? cause.message
                : "L’action demandée n’a pas pu être exécutée.",
          }
        }

        if (result.status === "approval_required") {
          setError(
            "Mbolo attend une autorisation vocale claire avant de réserver."
          )
          setStatus("listening")
        }

        if (result.status === "ok") {
          await completeBookingHandoff(call, result)
        }

        sendChannelEvent({
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: call.callId,
            output: JSON.stringify(result),
          },
        })
      }
      sendChannelEvent({ type: "response.create" })
    },
    [completeBookingHandoff, executeVoiceTool, sendChannelEvent]
  )

  const handleServerEvent = useCallback(
    async (rawEvent: MessageEvent<string>) => {
      let event: unknown
      try {
        event = JSON.parse(rawEvent.data)
      } catch {
        return
      }
      const root = recordOf(event)
      const type = root.type
      if (type === "input_audio_buffer.speech_started") setStatus("listening")
      if (type === "input_audio_buffer.speech_stopped") setStatus("thinking")
      if (type === "response.created") setStatus("thinking")
      if (
        type === "response.output_audio.delta" ||
        type === "response.audio.delta"
      ) {
        setStatus("speaking")
      }
      if (type === "error") {
        const message =
          typeof recordOf(root.error).message === "string"
            ? String(recordOf(root.error).message)
            : "OpenAI Realtime a interrompu la conversation."
        setError(message)
        setStatus("error")
        return
      }

      const transcript = realtimeTranscriptEvent(event)
      if (transcript?.mode === "delta") {
        appendDelta(transcript.id, transcript.text)
      } else if (transcript) {
        appendMessage({
          id: transcript.id,
          role: transcript.role,
          text: transcript.text,
        })
      }

      if (type !== "response.done") return
      const completed = completedAssistantTranscript(event)
      if (completed) {
        appendMessage({
          id: completed.id,
          role: "assistant",
          text: completed.text,
        })
      }
      const calls = parseRealtimeFunctionCalls(event)
      if (calls.length > 0) {
        await processFunctionCalls(calls)
      } else if (status !== "reserved") {
        setStatus("listening")
      }
    },
    [appendDelta, appendMessage, processFunctionCalls, status]
  )

  const start = useCallback(async () => {
    if (status === "connecting" || peerRef.current) return
    setError(undefined)
    setMessages([])
    setSuggestions([])
    setQuote(undefined)
    setMuted(false)
    setHasMicrophone(false)
    setStatus("connecting")
    closingRef.current = false
    processedCallsRef.current.clear()
    journeyRef.current = emptyVoiceJourneyMemory()

    try {
      if (
        typeof RTCPeerConnection === "undefined" ||
        !navigator.mediaDevices?.getUserMedia
      ) {
        throw new Error(
          "Ce navigateur ne permet pas encore la conversation vocale."
        )
      }
      const guestKey = getAssistantGuestKey()
      guestKeyRef.current = guestKey
      const conversation = await createConversation({
        guestKey,
        assistantId: "booking",
      })
      conversationIdRef.current = conversation.conversationId

      const grant = await mintVoiceToken({
        conversationId: conversation.conversationId,
        guestKey,
        voice: "marin",
      })
      if (!grant.available) {
        throw new Error(
          grant.reason === "disabled"
            ? "L’assistant vocal est temporairement désactivé."
            : "L’assistant vocal n’est pas encore configuré."
        )
      }
      voiceSessionIdRef.current = grant.voiceSessionId

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      streamRef.current = stream
      setHasMicrophone(true)
      const peer = new RTCPeerConnection()
      peerRef.current = peer
      const track = stream.getAudioTracks()[0]
      if (!track) throw new Error("Aucun microphone n’est disponible.")
      peer.addTrack(track, stream)
      peer.ontrack = (event) => {
        if (audioRef.current) audioRef.current.srcObject = event.streams[0]!
      }
      peer.onconnectionstatechange = () => {
        if (peer.connectionState === "failed") {
          setError("La connexion audio a été interrompue.")
          void endConnection("failed")
        }
      }

      const channel = peer.createDataChannel("oai-events")
      channelRef.current = channel
      channel.addEventListener("message", (event) => {
        void handleServerEvent(event)
      })
      channel.addEventListener("open", () => {
        setStatus("speaking")
        void updateVoiceSession({
          conversationId: conversation.conversationId,
          guestKey,
          voiceSessionId: grant.voiceSessionId,
          status: "connected",
        }).catch(() => undefined)
        channel.send(
          JSON.stringify({
            type: "response.create",
            response: {
              instructions:
                "Dis seulement : « Bonjour, je suis Mbolo. Où souhaitez-vous aller ? »",
            },
          })
        )
      })

      const offer = await peer.createOffer()
      await peer.setLocalDescription(offer)
      const response = await fetch(grant.url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${grant.token}`,
          "Content-Type": "application/sdp",
        },
        body: offer.sdp,
      })
      if (!response.ok) {
        throw new Error(`Connexion vocale refusée (${response.status}).`)
      }
      await peer.setRemoteDescription({
        type: "answer",
        sdp: await response.text(),
      })
    } catch (cause) {
      const message =
        cause instanceof DOMException && cause.name === "NotAllowedError"
          ? "Autorisez l’accès au microphone pour parler avec Mbolo."
          : cause instanceof Error
            ? cause.message
            : "L’assistant vocal n’a pas pu démarrer."
      setError(message)
      setStatus("error")
      await endConnection("failed", false)
    }
  }, [
    createConversation,
    endConnection,
    handleServerEvent,
    mintVoiceToken,
    status,
    updateVoiceSession,
  ])

  useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach((track) => track.stop())
      channelRef.current?.close()
      peerRef.current?.close()
    },
    []
  )

  function toggleMute() {
    const next = !muted
    streamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !next
    })
    setMuted(next)
  }

  const openAssistant = useCallback(() => {
    setOpen(true)
    window.setTimeout(() => void start(), 0)
  }, [start])

  useEffect(() => {
    const open = () => openAssistant()
    window.addEventListener(OPEN_VOICE_ASSISTANT_EVENT, open)
    return () => window.removeEventListener(OPEN_VOICE_ASSISTANT_EVENT, open)
  }, [openAssistant])

  function closeAssistant() {
    setOpen(false)
    void endConnection("ended")
  }

  const copy = statusCopy[status]
  const latestMessage = messages.at(-1)
  const traveler = profile?.user
  const travelerName = [traveler?.firstName, traveler?.lastName]
    .filter(Boolean)
    .join(" ")
  const quotedTrip = quote
    ? suggestions.find((trip) => trip.tripId === quote.tripId)
    : undefined
  const isActive =
    status === "connecting" ||
    status === "listening" ||
    status === "thinking" ||
    status === "speaking"

  return (
    <>
      {!open && pathname !== "/" && (
        <Button
          type="button"
          variant="secondary"
          size="icon-lg"
          className="fixed right-4 bottom-24 z-40 rounded-full shadow-xl md:right-6 md:bottom-6"
          onClick={openAssistant}
          aria-label="Réserver avec l’assistant vocal"
          title="Parler à Mbolo"
        >
          <Mic aria-hidden />
        </Button>
      )}

      {open && (
        <aside
          className="fixed right-4 bottom-4 left-4 z-50 grid max-h-[min(80dvh,680px)] gap-3 overflow-y-auto rounded-2xl border border-white/10 bg-ink p-3 text-ink-inverse shadow-2xl sm:right-6 sm:bottom-6 sm:left-auto sm:w-[min(410px,calc(100vw-3rem))]"
          aria-label="Assistant vocal Mbolo"
          aria-live="polite"
        >
          <div className="flex items-center gap-3">
            <span className="relative grid size-11 shrink-0 place-items-center">
              {isActive && (
                <span
                  className="absolute inset-0 animate-ping rounded-full bg-accent-base/40"
                  aria-hidden
                />
              )}
              <span className="relative grid size-10 place-items-center rounded-full bg-accent-base text-ink-inverse">
                <VoiceStatusIcon status={status} />
              </span>
            </span>

            <span className="grid min-w-0 flex-1 gap-0.5">
              <strong className="text-small">{copy.label}</strong>
              <span className="text-caption truncate text-ink-faint">
                {status === "listening"
                  ? "Mbolo vous écoute…"
                  : copy.description}
              </span>
            </span>

            <Button
              type="button"
              size="icon-sm"
              variant="danger"
              aria-label="Arrêter la conversation vocale"
              onClick={closeAssistant}
            >
              <CircleStop />
            </Button>
          </div>

          {latestMessage?.text && (
            <p className="text-caption line-clamp-2 rounded-lg bg-white/8 px-3 py-2 text-ink-faint">
              <strong className="text-ink-inverse">
                {latestMessage.role === "user" ? "Vous : " : "Mbolo : "}
              </strong>
              {latestMessage.text}
            </p>
          )}

          {(travelerName || traveler?.phone) && (
            <section
              className="flex items-center gap-3 rounded-xl bg-white/8 px-3 py-2"
              aria-label="Voyageur retenu"
            >
              <UserRound className="size-4 shrink-0 text-accent-on-ink" />
              <span className="grid min-w-0 gap-0.5">
                <span className="text-caption text-ink-faint">Voyageur</span>
                {travelerName && (
                  <strong className="text-small truncate">
                    {travelerName}
                  </strong>
                )}
                {traveler?.phone && (
                  <span className="text-caption text-ink-faint">
                    Téléphone enregistré · {maskPhone(traveler.phone)}
                  </span>
                )}
              </span>
            </section>
          )}

          {quote && (
            <section
              className="grid gap-2 rounded-xl bg-surface p-3 text-ink"
              aria-label="Devis du voyage"
            >
              <div className="flex items-start gap-2">
                <TrainFront className="mt-0.5 size-4 shrink-0 text-accent-ink" />
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <strong className="text-small">
                    {[quote.originName, quote.destinationName]
                      .filter(Boolean)
                      .join(" → ") ||
                      quotedTrip?.trainNumber ||
                      "Trajet sélectionné"}
                  </strong>
                  {quotedTrip && (
                    <span className="text-caption flex flex-wrap gap-x-3 gap-y-1 text-ink-muted">
                      <span className="inline-flex items-center gap-1">
                        <CalendarDays className="size-3.5" />
                        {dateFormatter.format(quotedTrip.departureAt)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Clock3 className="size-3.5" />
                        {timeFormatter.format(quotedTrip.departureAt)}
                      </span>
                    </span>
                  )}
                </span>
              </div>
              <div className="flex items-end justify-between gap-3 border-t border-line pt-2">
                <span className="text-caption text-ink-muted">
                  {classLabels[quote.serviceClass]} · {quote.passengerCount}{" "}
                  voyageur{quote.passengerCount > 1 ? "s" : ""}
                </span>
                <strong className="text-body inline-flex items-center gap-1.5 text-accent-ink">
                  <WalletCards className="size-4" />
                  {moneyFormatter.format(quote.totalTtc)} FCFA
                </strong>
              </div>
            </section>
          )}

          {suggestions.length > 0 && (
            <section className="grid gap-2" aria-label="Trains proposés">
              <span className="text-caption text-ink-faint">
                {suggestions.length} train{suggestions.length > 1 ? "s" : ""}{" "}
                disponible{suggestions.length > 1 ? "s" : ""}
              </span>
              {suggestions.slice(0, 3).map((trip) => (
                <div
                  key={trip.tripId}
                  className="flex items-center justify-between gap-3 rounded-lg bg-white/8 px-3 py-2"
                >
                  <strong className="text-small">{trip.trainNumber}</strong>
                  <span className="text-caption text-right text-ink-faint">
                    {dateFormatter.format(trip.departureAt)} ·{" "}
                    {timeFormatter.format(trip.departureAt)}
                  </span>
                </div>
              ))}
            </section>
          )}

          {error && (
            <p className="text-caption rounded-lg bg-danger/15 px-3 py-2 text-ink-inverse">
              {error}
            </p>
          )}

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-ink-inverse hover:bg-white/10"
              aria-label={muted ? "Réactiver le microphone" : "Couper le micro"}
              onClick={toggleMute}
              disabled={!hasMicrophone}
            >
              {muted ? <MicOff /> : <Mic />}
            </Button>
            <span className="text-caption flex min-w-0 flex-1 items-center gap-2 text-ink-faint">
              <Volume2 className="size-4 shrink-0" aria-hidden />
              Parlez naturellement. Le paiement reste entre vos mains.
            </span>
          </div>
          <audio ref={audioRef} autoPlay className="hidden" />
        </aside>
      )}
    </>
  )
}

function VoiceStatusIcon({ status }: { status: VoiceStatus }) {
  if (status === "connecting" || status === "thinking") {
    return <LoaderCircle className="size-5 animate-spin" aria-hidden />
  }
  if (status === "speaking") {
    return <Volume2 className="size-5 text-accent-on-ink" aria-hidden />
  }
  if (status === "reserved") {
    return <Check className="size-5 text-success-ink" aria-hidden />
  }
  if (status === "ended" || status === "error") {
    return <CircleStop className="size-5" aria-hidden />
  }
  return <Mic className="size-5 text-accent-on-ink" aria-hidden />
}
