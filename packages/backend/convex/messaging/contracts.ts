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
  /** Empreinte du jeton d'un `/start <jeton>` (liaison depuis le site). */
  linkTokenHash?: string
  providerInteractionId?: string
  displayName?: string
  locale?: string
  rawPayload?: string
}

/**
 * Bouton d'un message sortant. `data` revient au webhook (rappel opaque de
 * moins de 64 octets) ; `url` est ouvert par le client de messagerie.
 */
export type OutboundButton =
  | { label: string; data: string }
  | { label: string; url: string }

export function isUrlButton(
  button: OutboundButton
): button is { label: string; url: string } {
  return "url" in button
}

export const CHANNEL_CAPABILITIES: Record<
  MessagingChannel,
  {
    buttons: boolean
    /**
     * Le canal sait afficher un bouton qui ouvre un lien. Sinon, le lien est
     * écrit dans le texte du message.
     */
    urlButtons: boolean
    documents: boolean
    proactiveTemplates: boolean
    maxTextLength: number
  }
> = {
  telegram: {
    buttons: true,
    urlButtons: true,
    documents: true,
    proactiveTemplates: false,
    maxTextLength: 4_000,
  },
  whatsapp: {
    buttons: true,
    // Message interactif « cta_url » : un seul lien, sans bouton de réponse
    // dans le même message. L'adaptateur devra scinder si besoin.
    urlButtons: true,
    documents: true,
    proactiveTemplates: true,
    maxTextLength: 4_000,
  },
  messenger: {
    buttons: true,
    urlButtons: true,
    documents: true,
    proactiveTemplates: false,
    maxTextLength: 2_000,
  },
  apple_messages: {
    buttons: true,
    urlButtons: false,
    documents: true,
    proactiveTemplates: false,
    maxTextLength: 4_000,
  },
}

/* ─────────────────────── Liaison à un compte SETRAG ──────────────────────── */

/**
 * Durée de validité d'une demande de liaison émise depuis le site : le temps
 * d'ouvrir Telegram et d'appuyer sur « Démarrer ».
 */
export const LINK_REQUEST_TTL_MS = 10 * 60 * 1_000

/** Demandes en cours au plus par compte ; au-delà, les plus anciennes expirent. */
export const MAX_ACTIVE_LINK_REQUESTS = 3

/**
 * Durée de validité des boutons Confirmer/Annuler d'une messagerie. Au-delà,
 * le bouton répond « expiré » ; Ruban relit alors la confirmation comme
 * expirée (`ai/rejeu.ts`) et peut la reproposer.
 */
export const APPROVAL_TTL_MS = 15 * 60 * 1_000

const BASE64_URL =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"

/** Base64url sans remplissage, sans dépendre de `btoa`. */
function base64Url(bytes: Uint8Array): string {
  let out = ""
  for (let index = 0; index < bytes.length; index += 3) {
    const chunk =
      (bytes[index]! << 16) |
      ((bytes[index + 1] ?? 0) << 8) |
      (bytes[index + 2] ?? 0)
    const chars = Math.min(4, Math.ceil(((bytes.length - index) * 8) / 6))
    for (let shift = 0; shift < chars; shift += 1) {
      out += BASE64_URL[(chunk >> (18 - 6 * shift)) & 63]
    }
  }
  return out
}

/**
 * Jeton de liaison : 32 octets aléatoires en base64url, soit 43 caractères
 * `[A-Za-z0-9_-]` — ce que Telegram accepte dans le paramètre `start` d'un
 * lien profond (64 caractères au plus). À générer dans une action : l'aléa
 * des mutations Convex est déterministe. Seule l'empreinte
 * (`hashLinkToken`) est stockée.
 */
export function generateLinkToken(): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(32)))
}

export function isWellFormedLinkToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token)
}

export function hashLinkToken(token: string): string {
  return bytesToHex(sha256(new TextEncoder().encode(`link:${token}`)))
}

/**
 * Origine de la billetterie, déjà utilisée par l'authentification
 * (`SITE_URL`).
 */
export function billetterieOrigin(): string {
  return (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "")
}

/**
 * Page du site d'où l'on relie une messagerie. Le fil n'envoie jamais que
 * cette adresse, sans jeton : c'est le site, connecté, qui émet le jeton.
 */
export function linkSettingsUrl(): string {
  return `${billetterieOrigin()}/compte/messageries`
}

/**
 * Nom du bot Telegram (`TELEGRAM_BOT_USERNAME`, sans « @ »), ou `null` s'il
 * n'est pas configuré ou mal formé : la liaison est alors indisponible.
 */
export function telegramBotUsername(): string | null {
  const raw = process.env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, "")
  return raw && /^[A-Za-z][A-Za-z0-9_]{3,31}$/.test(raw) ? raw : null
}

/** Lien profond qui ouvre le bot et lui envoie `/start <jeton>`. */
export function telegramStartUrl(botUsername: string, token: string): string {
  return `https://t.me/${botUsername}?start=${token}`
}

/**
 * Commandes reconnues aussi sous forme de texte libre, pour les canaux sans
 * menu de commandes et les voyageurs qui n'écrivent pas la barre oblique.
 */
const TEXT_COMMANDS: Record<string, string> = {
  connexion: "/connexion",
  "se connecter": "/connexion",
  "me connecter": "/connexion",
  "je veux me connecter": "/connexion",
  deconnexion: "/deconnexion",
  "se deconnecter": "/deconnexion",
  "me deconnecter": "/deconnexion",
  "je veux me deconnecter": "/deconnexion",
}

export function commandFromText(text: string): string | undefined {
  const normalized = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  return TEXT_COMMANDS[normalized]
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
