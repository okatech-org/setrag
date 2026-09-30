import { v } from "convex/values"
import { internal } from "../_generated/api"
import { httpAction, internalAction } from "../_generated/server"
import {
  hashLinkToken,
  isUrlButton,
  type InboundMessage,
  type OutboundButton,
} from "./contracts"

type TelegramUser = {
  id: number
  first_name?: string
  last_name?: string
  language_code?: string
}

type TelegramChat = {
  id: number
  type?: string
}

type TelegramUpdate = {
  update_id?: number
  message?: {
    message_id?: number
    from?: TelegramUser
    chat?: TelegramChat
    text?: string
  }
  callback_query?: {
    id?: string
    from?: TelegramUser
    data?: string
    message?: {
      message_id?: number
      chat?: TelegramChat
    }
  }
}

function displayName(user?: TelegramUser): string | undefined {
  if (!user) return undefined
  return (
    [user.first_name, user.last_name].filter(Boolean).join(" ") || undefined
  )
}

function commandFrom(text: string): string | undefined {
  if (!text.startsWith("/")) return undefined
  return text.split(/\s+/, 1)[0]?.split("@", 1)[0]?.toLowerCase()
}

/**
 * Paramètre d'un lien profond `https://t.me/<bot>?start=<jeton>` : Telegram
 * l'envoie au bot sous la forme `/start <jeton>` quand la personne appuie sur
 * « Démarrer ».
 */
function startPayloadFrom(text: string): string | undefined {
  const [command, payload] = text.split(/\s+/, 2)
  if (command?.split("@", 1)[0]?.toLowerCase() !== "/start") return undefined
  return payload ? payload.slice(0, 256) : undefined
}

export function parseTelegramUpdate(
  update: TelegramUpdate
): InboundMessage | null {
  if (!Number.isSafeInteger(update.update_id)) return null
  const eventId = String(update.update_id)

  if (update.callback_query) {
    const callback = update.callback_query
    const chat = callback.message?.chat
    if (!chat || !callback.from || !callback.data) return null
    if (chat.type !== undefined && chat.type !== "private") {
      return {
        eventId,
        channel: "telegram",
        externalThreadId: String(chat.id),
        externalUserId: String(callback.from.id),
        type: "unsupported",
        displayName: displayName(callback.from),
        locale: callback.from.language_code,
        rawPayload: JSON.stringify(update),
      }
    }
    return {
      eventId,
      channel: "telegram",
      externalThreadId: String(chat.id),
      externalUserId: String(callback.from.id),
      type: "action",
      actionToken: callback.data,
      providerInteractionId: callback.id,
      displayName: displayName(callback.from),
      locale: callback.from.language_code,
      rawPayload: JSON.stringify(update),
    }
  }

  if (update.message?.chat && update.message.from) {
    const message = update.message
    const chat = message.chat!
    const from = message.from!
    const text = message.text?.trim()
    const command = text ? commandFrom(text) : undefined
    const isPrivate = chat.type === undefined || chat.type === "private"
    // Le jeton d'un `/start <jeton>` n'est jamais conservé : seule son
    // empreinte part avec l'événement, et le message brut est expurgé.
    const startPayload = text ? startPayloadFrom(text) : undefined
    const stored = startPayload
      ? { ...update, message: { ...message, text: "/start" } }
      : update
    return {
      eventId,
      channel: "telegram",
      externalThreadId: String(chat.id),
      externalUserId: String(from.id),
      type: !isPrivate
        ? "unsupported"
        : command
          ? "command"
          : text
            ? "text"
            : "unsupported",
      text: command ?? text,
      linkTokenHash:
        startPayload && isPrivate ? hashLinkToken(startPayload) : undefined,
      displayName: displayName(from),
      locale: from.language_code,
      rawPayload: JSON.stringify(stored),
    }
  }
  return null
}

function constantTimeEqual(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length)
  let difference = left.length ^ right.length
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0)
  }
  return difference === 0
}

function safeError(error: unknown): string {
  return (
    error instanceof Error ? error.message : "Le traitement Telegram a échoué."
  )
    .replace(/\s+/g, " ")
    .slice(0, 500)
}

async function telegramRequest(
  method: string,
  body: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN n'est pas configuré.")
  const response = await fetch(
    `https://api.telegram.org/bot${token}/${method}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  )
  const payload = (await response.json()) as {
    ok?: boolean
    description?: string
    result?: Record<string, unknown>
  }
  if (!response.ok || payload.ok !== true) {
    throw new Error(
      `Telegram ${method} (${response.status}) : ${
        payload.description ?? "réponse invalide"
      }`
    )
  }
  return payload.result ?? {}
}

type TelegramInlineButton =
  | { text: string; callback_data: string }
  | { text: string; url: string }

/**
 * Clavier en ligne : les boutons de rappel vont par deux (« Confirmer » à
 * côté d'« Annuler ») ; un bouton lien occupe sa propre ligne, sous les
 * autres, pour ne jamais être confondu avec une confirmation.
 */
export function telegramInlineKeyboard(
  buttons: OutboundButton[]
): TelegramInlineButton[][] {
  const callbacks = buttons.filter(
    (button): button is { label: string; data: string } => !isUrlButton(button)
  )
  const links = buttons.filter(isUrlButton)
  const rows: TelegramInlineButton[][] = []
  for (let index = 0; index < callbacks.length; index += 2) {
    rows.push(
      callbacks.slice(index, index + 2).map((button) => ({
        text: button.label,
        callback_data: button.data,
      }))
    )
  }
  for (const link of links) rows.push([{ text: link.label, url: link.url }])
  return rows
}

export const webhook = httpAction(async (ctx, request) => {
  const configuredSecret = process.env.TELEGRAM_WEBHOOK_SECRET ?? ""
  const receivedSecret =
    request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? ""
  if (
    !configuredSecret ||
    !constantTimeEqual(configuredSecret, receivedSecret)
  ) {
    return new Response("Unauthorized", { status: 401 })
  }

  const body = await request.text()
  if (body.length > 100_000) {
    return new Response("Payload too large", { status: 413 })
  }

  let update: TelegramUpdate
  try {
    update = JSON.parse(body) as TelegramUpdate
  } catch {
    return new Response("Invalid JSON", { status: 400 })
  }
  const message = parseTelegramUpdate(update)
  if (!message) return new Response("OK")

  const ingested = await ctx.runMutation(internal.messaging.core.ingestEvent, {
    channel: message.channel,
    externalEventId: message.eventId,
    externalThreadId: message.externalThreadId,
    externalUserId: message.externalUserId,
    type: message.type,
    text: message.text,
    actionToken: message.actionToken,
    linkTokenHash: message.linkTokenHash,
    providerInteractionId: message.providerInteractionId,
    displayName: message.displayName,
    locale: message.locale,
    rawPayload: message.rawPayload,
  })
  if (!ingested.duplicate) {
    if (message.providerInteractionId) {
      await ctx.scheduler.runAfter(
        0,
        internal.messaging.telegram.acknowledgeCallback,
        { callbackQueryId: message.providerInteractionId }
      )
    }
    await ctx.scheduler.runAfter(
      0,
      internal.messaging.orchestrator.processEvent,
      { eventId: ingested.eventId }
    )
  }
  return new Response("OK")
})

export const acknowledgeCallback = internalAction({
  args: { callbackQueryId: v.string() },
  handler: async (_, args): Promise<{ acknowledged: boolean }> => {
    try {
      await telegramRequest("answerCallbackQuery", {
        callback_query_id: args.callbackQueryId,
      })
      return { acknowledged: true }
    } catch {
      return { acknowledged: false }
    }
  },
})

export const flushThread = internalAction({
  args: { threadId: v.id("messagingThreads") },
  handler: async (ctx, args): Promise<{ flushed: number; error?: string }> => {
    for (let sent = 0; sent < 10; sent += 1) {
      const outbox = await ctx.runMutation(
        internal.messaging.core.claimNextOutbox,
        args
      )
      if (!outbox) return { flushed: sent }
      const thread = await ctx.runQuery(internal.messaging.core.getThread, {
        threadId: args.threadId,
      })
      if (!thread) throw new Error("Conversation Telegram introuvable.")

      try {
        const result =
          outbox.kind === "document"
            ? await telegramRequest("sendDocument", {
                chat_id: thread.externalThreadId,
                document: outbox.documentUrl,
                caption: outbox.text,
              })
            : await telegramRequest("sendMessage", {
                chat_id: thread.externalThreadId,
                text: outbox.text,
                reply_markup:
                  outbox.buttons && outbox.buttons.length > 0
                    ? { inline_keyboard: telegramInlineKeyboard(outbox.buttons) }
                    : undefined,
              })
        await ctx.runMutation(internal.messaging.core.markOutboxSent, {
          outboxId: outbox._id,
          providerMessageId:
            typeof result.message_id === "number"
              ? String(result.message_id)
              : undefined,
        })
      } catch (error) {
        const delay = Math.min(
          5 * 60_000,
          1_000 * 2 ** Math.max(0, outbox.attempts - 1)
        )
        const failed = await ctx.runMutation(
          internal.messaging.core.markOutboxFailed,
          {
            outboxId: outbox._id,
            error: safeError(error),
            nextAttemptAt: Date.now() + delay,
          }
        )
        if (failed.retry) {
          await ctx.scheduler.runAfter(
            delay,
            internal.messaging.telegram.flushThread,
            args
          )
        }
        return { flushed: sent, error: safeError(error) }
      }
    }
    await ctx.scheduler.runAfter(
      0,
      internal.messaging.telegram.flushThread,
      args
    )
    return { flushed: 10 }
  },
})
