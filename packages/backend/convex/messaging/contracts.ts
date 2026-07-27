import { hmac } from "@noble/hashes/hmac"
import { sha256 } from "@noble/hashes/sha256"
import { bytesToHex } from "@noble/hashes/utils"
import { v } from "convex/values"

export const channelValidator = v.union(
  v.literal("telegram"),
  v.literal("whatsapp"),
  v.literal("messenger"),
  v.literal("apple_messages")
)

export type MessagingChannel =
  "telegram" | "whatsapp" | "messenger" | "apple_messages"

export type InboundMessage = {
  eventId: string
  channel: MessagingChannel
  externalThreadId: string
  externalUserId: string
  type: "text" | "action" | "command" | "unsupported"
  text?: string
  actionToken?: string
  providerInteractionId?: string
  displayName?: string
  locale?: string
  rawPayload?: string
}

export type OutboundButton = {
  label: string
  data: string
}

export const CHANNEL_CAPABILITIES: Record<
  MessagingChannel,
  {
    buttons: boolean
    documents: boolean
    proactiveTemplates: boolean
    maxTextLength: number
  }
> = {
  telegram: {
    buttons: true,
    documents: true,
    proactiveTemplates: false,
    maxTextLength: 4_000,
  },
  whatsapp: {
    buttons: true,
    documents: true,
    proactiveTemplates: true,
    maxTextLength: 4_000,
  },
  messenger: {
    buttons: true,
    documents: true,
    proactiveTemplates: false,
    maxTextLength: 2_000,
  },
  apple_messages: {
    buttons: true,
    documents: true,
    proactiveTemplates: false,
    maxTextLength: 4_000,
  },
}

export function deriveChannelSecret(
  secret: string,
  channel: MessagingChannel,
  externalThreadId: string
): string {
  if (secret.length < 32) {
    throw new Error(
      "MESSAGING_SESSION_SECRET doit contenir au moins 32 caractères."
    )
  }
  const material = new TextEncoder().encode(`${channel}:${externalThreadId}`)
  return bytesToHex(hmac(sha256, new TextEncoder().encode(secret), material))
}

export function deriveApprovalToken(
  secret: string,
  threadId: string,
  callId: string
): string {
  const material = new TextEncoder().encode(`approval:${threadId}:${callId}`)
  // 24 octets encodés en hex donnent 48 caractères, sous la limite Telegram
  // de 64 octets même avec le préfixe de décision.
  return bytesToHex(
    hmac(sha256, new TextEncoder().encode(secret), material)
  ).slice(0, 48)
}

export function splitMessage(text: string, maxLength: number): string[] {
  const clean = text.trim()
  if (!clean) return []
  if (clean.length <= maxLength) return [clean]

  const chunks: string[] = []
  let remaining = clean
  while (remaining.length > maxLength) {
    const window = remaining.slice(0, maxLength + 1)
    const breakAt = Math.max(
      window.lastIndexOf("\n\n"),
      window.lastIndexOf("\n"),
      window.lastIndexOf(". "),
      window.lastIndexOf(" ")
    )
    const cut = breakAt > maxLength * 0.5 ? breakAt + 1 : maxLength
    chunks.push(remaining.slice(0, cut).trim())
    remaining = remaining.slice(cut).trim()
  }
  if (remaining) chunks.push(remaining)
  return chunks
}
