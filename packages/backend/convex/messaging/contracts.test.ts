import { describe, expect, it } from "vitest"
import {
  deriveApprovalToken,
  deriveChannelSecret,
  splitMessage,
} from "./contracts"
import { parseTelegramUpdate } from "./telegram"

const SECRET = "messaging-secret-de-test-0123456789-abcdef"

describe("contrats de messagerie multicanale", () => {
  it("dérive une clé de session stable et isolée par canal", () => {
    const first = deriveChannelSecret(SECRET, "telegram", "123")
    const replay = deriveChannelSecret(SECRET, "telegram", "123")
    const other = deriveChannelSecret(SECRET, "whatsapp", "123")

    expect(first).toBe(replay)
    expect(first).not.toBe(other)
    expect(first).toHaveLength(64)
  })

  it("produit des jetons compatibles avec callback_data Telegram", () => {
    const token = deriveApprovalToken(SECRET, "thread-1", "call-1")
    expect(`approve:${token}`.length).toBeLessThanOrEqual(64)
    expect(token).toHaveLength(48)
  })

  it("découpe les textes sans perdre leur contenu", () => {
    const text = `${"Premier paragraphe. ".repeat(15)}\n\n${"Second paragraphe. ".repeat(15)}`
    const chunks = splitMessage(text, 160)

    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.every((chunk) => chunk.length <= 160)).toBe(true)
    expect(chunks.join(" ").replace(/\s+/g, " ").trim()).toBe(
      text.replace(/\s+/g, " ").trim()
    )
  })
})

describe("normalisation Telegram", () => {
  it("normalise un message privé et une commande", () => {
    const message = parseTelegramUpdate({
      update_id: 42,
      message: {
        message_id: 7,
        from: {
          id: 100,
          first_name: "Ada",
          language_code: "fr",
        },
        chat: { id: 100, type: "private" },
        text: "/start",
      },
    })

    expect(message).toMatchObject({
      eventId: "42",
      channel: "telegram",
      externalThreadId: "100",
      externalUserId: "100",
      type: "command",
      text: "/start",
      displayName: "Ada",
      locale: "fr",
    })
  })

  it("normalise le clic sur un bouton", () => {
    const message = parseTelegramUpdate({
      update_id: 43,
      callback_query: {
        id: "callback-1",
        from: { id: 100, first_name: "Ada" },
        data: "approve:opaque",
        message: {
          message_id: 8,
          chat: { id: 100, type: "private" },
        },
      },
    })

    expect(message).toMatchObject({
      type: "action",
      actionToken: "approve:opaque",
      providerInteractionId: "callback-1",
    })
  })
})
