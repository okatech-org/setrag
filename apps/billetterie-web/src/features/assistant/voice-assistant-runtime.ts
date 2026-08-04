import type { BookingDraft, SearchDraft, SelectedTrip } from "@/lib/ticketing"

const GUEST_KEY_STORAGE = "setrag.ai.guest-key"

export type RealtimeFunctionCall = {
  callId: string
  name: string
  input: unknown
}

export type VoiceStation = {
  id: string
  code: string
  name: string
  province: string
}

export type VoiceTrip = {
  tripId: string
  trainNumber: string
  trainType: "EXPRESS" | "OMNIBUS" | "AUTORAIL" | "SPECIAL"
  serviceDate: string
  status: string
  departureAt: number
  arrivalAt: number
  distanceKm: number
  availableByClass: Record<string, number>
  hasAvailability: boolean
}

export type VoiceJourneyMemory = {
  stations: VoiceStation[]
  searchInput?: {
    originStationId: string
    destinationStationId: string
    serviceDate: string
    passengers: number
  }
  trips: VoiceTrip[]
  quoteInput?: Record<string, unknown>
  quoteOutput?: Record<string, unknown>
}

export type VoiceQuoteSummary = {
  tripId: string
  originStationId?: string
  destinationStationId?: string
  originName?: string
  destinationName?: string
  serviceClass: "DEUXIEME" | "PREMIERE" | "VIP"
  passengerCount: number
  totalTtc: number
}

export type PaymentHandoff = {
  search: SearchDraft
  trip: SelectedTrip
  booking: BookingDraft
}

export function emptyVoiceJourneyMemory(): VoiceJourneyMemory {
  return { stations: [], trips: [] }
}

export function getAssistantGuestKey(): string {
  if (typeof window === "undefined") return ""
  const existing = window.sessionStorage.getItem(GUEST_KEY_STORAGE)
  if (existing) return existing
  const key = `${crypto.randomUUID()}${crypto.randomUUID()}`
  window.sessionStorage.setItem(GUEST_KEY_STORAGE, key)
  return key
}

function recordOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

export function isExplicitBookingAuthorization(transcript: string): boolean {
  const normalized = transcript
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
    .replace(/[’']/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  if (!normalized) return false
  if (
    /\b(non|annule|annuler|stop|arrete|refuse)\b/.test(normalized) ||
    /\bne\b.{0,40}\bpas\b/.test(normalized)
  ) {
    return false
  }
  return (
    /\boui\b/.test(normalized) ||
    /\bje confirme\b/.test(normalized) ||
    /\bvas y\b/.test(normalized) ||
    /\b(fais|faites|lance|cree|valide)\b.{0,30}\breservation\b/.test(
      normalized
    ) ||
    /\breserv(e|ez)\b/.test(normalized)
  )
}

export function parseRealtimeFunctionCalls(
  event: unknown
): RealtimeFunctionCall[] {
  const root = recordOf(event)
  if (root.type !== "response.done") return []
  const response = recordOf(root.response)
  const output = Array.isArray(response.output) ? response.output : []

  return output.flatMap((rawItem) => {
    const item = recordOf(rawItem)
    if (item.type !== "function_call") return []
    const callId = stringValue(item.call_id)
    const name = stringValue(item.name)
    if (!callId || !name) return []
    try {
      return [
        {
          callId,
          name,
          input:
            typeof item.arguments === "string"
              ? JSON.parse(item.arguments || "{}")
              : (item.arguments ?? {}),
        },
      ]
    } catch {
      return [{ callId, name, input: {} }]
    }
  })
}

export function realtimeTranscriptEvent(event: unknown):
  | {
      role: "user" | "assistant"
      mode: "delta" | "completed"
      id: string
      text: string
    }
  | undefined {
  const root = recordOf(event)
  const type = stringValue(root.type)
  if (!type) return undefined

  if (
    type === "conversation.item.input_audio_transcription.completed" ||
    type === "input_audio_transcription.completed"
  ) {
    const text = stringValue(root.transcript)
    if (!text) return undefined
    return {
      role: "user",
      mode: "completed",
      id:
        stringValue(root.item_id) ??
        stringValue(root.event_id) ??
        crypto.randomUUID(),
      text,
    }
  }

  if (
    type === "response.output_audio_transcript.delta" ||
    type === "response.audio_transcript.delta"
  ) {
    const text = typeof root.delta === "string" ? root.delta : undefined
    if (!text) return undefined
    return {
      role: "assistant",
      mode: "delta",
      id:
        stringValue(root.item_id) ??
        stringValue(root.response_id) ??
        "assistant-stream",
      text,
    }
  }

  if (
    type === "response.output_audio_transcript.done" ||
    type === "response.audio_transcript.done"
  ) {
    const text = stringValue(root.transcript)
    if (!text) return undefined
    return {
      role: "assistant",
      mode: "completed",
      id:
        stringValue(root.item_id) ??
        stringValue(root.response_id) ??
        "assistant-stream",
      text,
    }
  }

  return undefined
}

export function completedAssistantTranscript(
  event: unknown
): { id: string; text: string } | undefined {
  const root = recordOf(event)
  if (root.type !== "response.done") return undefined
  const response = recordOf(root.response)
  const output = Array.isArray(response.output) ? response.output : []
  const texts: string[] = []

  for (const rawItem of output) {
    const item = recordOf(rawItem)
    if (item.type !== "message" || item.role !== "assistant") continue
    const content = Array.isArray(item.content) ? item.content : []
    for (const rawPart of content) {
      const part = recordOf(rawPart)
      const text = stringValue(part.transcript) ?? stringValue(part.text)
      if (text) texts.push(text)
    }
  }
  const text = texts.join(" ").trim()
  if (!text) return undefined
  return {
    id:
      stringValue(response.id) ??
      stringValue(root.event_id) ??
      "assistant-completed",
    text,
  }
}

export function rememberSuccessfulVoiceTool(
  memory: VoiceJourneyMemory,
  toolName: string,
  inputValue: unknown,
  outputValue: unknown
): {
  search?: SearchDraft
  trips?: VoiceTrip[]
  quote?: VoiceQuoteSummary
  handoff?: PaymentHandoff
} {
  const input = recordOf(inputValue)
  const output = outputValue

  if (toolName === "list_stations" && Array.isArray(output)) {
    memory.stations = output.flatMap((rawStation) => {
      const station = recordOf(rawStation)
      const id = stringValue(station.id)
      const code = stringValue(station.code)
      const name = stringValue(station.name)
      if (!id || !code || !name) return []
      return [
        {
          id,
          code,
          name,
          province: stringValue(station.province) ?? "",
        },
      ]
    })
  }

  if (toolName === "search_trips") {
    const originStationId = stringValue(input.originStationId)
    const destinationStationId = stringValue(input.destinationStationId)
    if (Array.isArray(output)) {
      memory.trips = output.flatMap(parseVoiceTrip)
    }
    const serviceDate =
      stringValue(input.serviceDate) ?? memory.trips?.[0]?.serviceDate
    const passengers = numberValue(input.passengers)
    if (originStationId && destinationStationId && serviceDate && passengers) {
      memory.searchInput = {
        originStationId,
        destinationStationId,
        serviceDate,
        passengers,
      }
    }
    if (memory.searchInput) {
      return {
        search: {
          originId: memory.searchInput.originStationId,
          destinationId: memory.searchInput.destinationStationId,
          serviceDate: memory.searchInput.serviceDate,
          adults: memory.searchInput.passengers,
          children: 0,
        },
        trips: memory.trips,
      }
    }
  }

  if (toolName === "quote_booking") {
    memory.quoteInput = input
    memory.quoteOutput = recordOf(output)
    const tripId = stringValue(input.tripId)
    const serviceClass = stringValue(input.serviceClass)
    const passengerCount = numberValue(input.passengerCount)
    const totalTtc = numberValue(memory.quoteOutput.totalTtc)
    if (
      tripId &&
      ["DEUXIEME", "PREMIERE", "VIP"].includes(serviceClass ?? "") &&
      passengerCount !== undefined &&
      totalTtc !== undefined
    ) {
      return {
        quote: {
          tripId,
          originStationId: stringValue(input.originStationId),
          destinationStationId: stringValue(input.destinationStationId),
          originName: memory.stations.find(
            (station) => station.id === stringValue(input.originStationId)
          )?.name,
          destinationName: memory.stations.find(
            (station) => station.id === stringValue(input.destinationStationId)
          )?.name,
          serviceClass: serviceClass as VoiceQuoteSummary["serviceClass"],
          passengerCount,
          totalTtc,
        },
      }
    }
  }

  if (toolName === "create_booking") {
    return {
      handoff: buildPaymentHandoff(memory, input, recordOf(output)),
    }
  }

  return {}
}

function parseVoiceTrip(value: unknown): VoiceTrip[] {
  const trip = recordOf(value)
  const tripId = stringValue(trip.tripId)
  const trainNumber = stringValue(trip.trainNumber)
  const trainType = stringValue(trip.trainType)
  const serviceDate = stringValue(trip.serviceDate)
  const departureAt = numberValue(trip.departureAt)
  const arrivalAt = numberValue(trip.arrivalAt)
  if (
    !tripId ||
    !trainNumber ||
    !["EXPRESS", "OMNIBUS", "AUTORAIL", "SPECIAL"].includes(trainType ?? "") ||
    !serviceDate ||
    departureAt === undefined ||
    arrivalAt === undefined
  ) {
    return []
  }
  return [
    {
      tripId,
      trainNumber,
      trainType: trainType as VoiceTrip["trainType"],
      serviceDate,
      status: stringValue(trip.status) ?? "planifie",
      departureAt,
      arrivalAt,
      distanceKm: numberValue(trip.distanceKm) ?? 0,
      availableByClass: recordOf(trip.availableByClass) as Record<
        string,
        number
      >,
      hasAvailability: trip.hasAvailability !== false,
    },
  ]
}

function buildPaymentHandoff(
  memory: VoiceJourneyMemory,
  input: Record<string, unknown>,
  output: Record<string, unknown>
): PaymentHandoff | undefined {
  const reference = stringValue(output.reference)
  const tripId = stringValue(input.tripId)
  const originId = stringValue(input.originStationId)
  const destinationId = stringValue(input.destinationStationId)
  const serviceClass = stringValue(input.serviceClass)
  const rawPassengers = Array.isArray(input.passengers) ? input.passengers : []
  const paymentContext = recordOf(output.paymentContext)
  const contextTrip = parseVoiceTrip({
    ...paymentContext,
    availableByClass: {
      [serviceClass ?? "DEUXIEME"]: numberValue(paymentContext.available) ?? 0,
    },
    hasAvailability: true,
  })[0]
  const trip =
    memory.trips.find((candidate) => candidate.tripId === tripId) ?? contextTrip
  if (
    !reference ||
    !trip ||
    !originId ||
    !destinationId ||
    !["DEUXIEME", "PREMIERE", "VIP"].includes(serviceClass ?? "") ||
    rawPassengers.length === 0
  ) {
    return undefined
  }

  const passengers = rawPassengers.map((rawPassenger) => {
    const passenger = recordOf(rawPassenger)
    return {
      firstName: stringValue(passenger.firstName) ?? "",
      lastName: stringValue(passenger.lastName) ?? "",
      gender: passenger.gender === "M" ? ("M" as const) : ("F" as const),
      emergencyPhone: stringValue(passenger.emergencyPhone),
      discountCode: stringValue(passenger.discountCode),
      seatId: stringValue(passenger.seatId),
    }
  })
  const children = passengers.filter(
    (passenger) => passenger.discountCode === "ENFANT"
  ).length
  const adults = Math.max(1, passengers.length - children)
  const search: SearchDraft = {
    originId,
    destinationId,
    serviceDate: trip.serviceDate,
    adults,
    children,
  }

  const amountRecord = recordOf(output.amounts)
  const totalTtc =
    numberValue(output.amountTtc) ??
    numberValue(amountRecord.ttc) ??
    numberValue(memory.quoteOutput?.totalTtc)
  const factor =
    serviceClass === "VIP" ? 1.9 : serviceClass === "PREMIERE" ? 1.45 : 1
  const priceXaf = totalTtc
    ? Math.max(0, Math.round(totalTtc / passengers.length / factor))
    : 0
  const origin = memory.stations.find((station) => station.id === originId)
  const destination = memory.stations.find(
    (station) => station.id === destinationId
  )
  const availability = Object.values(trip.availableByClass).filter(
    (value): value is number => typeof value === "number"
  )

  return {
    search,
    trip: {
      tripId: trip.tripId,
      trainNumber: trip.trainNumber,
      trainType: trip.trainType,
      departureAt: trip.departureAt,
      arrivalAt: trip.arrivalAt,
      originId,
      destinationId,
      originName:
        origin?.name ??
        stringValue(paymentContext.originName) ??
        "Gare de départ",
      destinationName:
        destination?.name ??
        stringValue(paymentContext.destinationName) ??
        "Gare d’arrivée",
      passengers: passengers.length,
      priceXaf,
      available:
        numberValue(paymentContext.available) ?? Math.max(...availability, 0),
    },
    booking: {
      reference,
      holdExpiresAt: numberValue(output.holdExpiresAt),
      contactPhone: stringValue(input.contactPhone) ?? "",
      contactEmail: stringValue(input.contactEmail),
      serviceClass: serviceClass as BookingDraft["serviceClass"],
      passengers,
    },
  }
}
