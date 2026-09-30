/**
 * Lecture des événements OpenAI Realtime reçus sur le DataChannel.
 *
 * Isolée du composant WebRTC pour être testée seule : un événement mal formé
 * ne doit jamais exécuter un outil avec des arguments devinés.
 */

export type RealtimeFunctionCall = {
  callId: string
  name: string
  input: unknown
}

function recordOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

/**
 * OpenAI Realtime annonce un appel d'outil dès que ses arguments sont prêts.
 * L'exécuter sur cet événement évite d'attendre `response.done`, qui peut
 * arriver après que le modèle a déjà suspendu son tour en attente du résultat.
 */
export function realtimeFunctionCallEvent(
  event: unknown
): RealtimeFunctionCall | undefined {
  const root = recordOf(event)
  if (root.type !== "response.function_call_arguments.done") return undefined
  const callId = stringValue(root.call_id)
  const name = stringValue(root.name)
  if (!callId || !name) return undefined
  try {
    return {
      callId,
      name,
      input:
        typeof root.arguments === "string"
          ? JSON.parse(root.arguments || "{}")
          : (root.arguments ?? {}),
    }
  } catch {
    return { callId, name, input: {} }
  }
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
