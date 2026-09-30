import { afterEach, describe, expect, it, vi } from "vitest"
import {
  CHANNEL_CAPABILITIES,
  commandFromText,
  deriveApprovalToken,
  deriveChannelSecret,
  generateLinkToken,
  hashLinkToken,
  isWellFormedLinkToken,
  linkSettingsUrl,
  splitMessage,
  telegramBotUsername,
  telegramStartUrl,
} from "./contracts"
import { parseTelegramUpdate, telegramInlineKeyboard } from "./telegram"

afterEach(() => {
  vi.unstubAllEnvs()
})

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

  it("tire des jetons de liaison aléatoires dont seule l'empreinte est stable", () => {
    const tokens = new Set(Array.from({ length: 50 }, generateLinkToken))
    expect(tokens.size).toBe(50)
    for (const token of tokens) {
      // 32 octets en base64url : 43 caractères, sous la limite de 64 que
      // Telegram impose au paramètre « start », dans l'alphabet qu'il admet.
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
      expect(token.length).toBeLessThanOrEqual(64)
      expect(isWellFormedLinkToken(token)).toBe(true)
    }
    const [token] = tokens
    expect(hashLinkToken(token!)).toBe(hashLinkToken(token!))
    expect(hashLinkToken(token!)).toMatch(/^[a-f0-9]{64}$/)
    expect(hashLinkToken(token!)).not.toContain(token)
    expect(isWellFormedLinkToken("court")).toBe(false)
    expect(isWellFormedLinkToken("a".repeat(64))).toBe(false)
    expect(isWellFormedLinkToken(`${"a".repeat(42)}/`)).toBe(false)
  })

  it("renvoie le fil vers la page du site, sans jeton", () => {
    vi.stubEnv("SITE_URL", "https://billetterie.setrag.ga/")
    expect(linkSettingsUrl()).toBe(
      "https://billetterie.setrag.ga/compte/messageries"
    )
  })

  it("construit le lien profond du bot configuré", () => {
    vi.stubEnv("TELEGRAM_BOT_USERNAME", "@SetragRubanBot")
    expect(telegramBotUsername()).toBe("SetragRubanBot")
    expect(telegramStartUrl("SetragRubanBot", "abc_DEF-123")).toBe(
      "https://t.me/SetragRubanBot?start=abc_DEF-123"
    )
    vi.stubEnv("TELEGRAM_BOT_USERNAME", "")
    expect(telegramBotUsername()).toBeNull()
    vi.stubEnv("TELEGRAM_BOT_USERNAME", "pas un nom")
    expect(telegramBotUsername()).toBeNull()
  })

  it("reconnaît les commandes de liaison écrites en texte libre", () => {
    expect(commandFromText("connexion")).toBe("/connexion")
    expect(commandFromText("  Me connecter !")).toBe("/connexion")
    expect(commandFromText("Déconnexion")).toBe("/deconnexion")
    expect(commandFromText("je veux me déconnecter")).toBe("/deconnexion")
    expect(commandFromText("Je veux me connecter pour voir mes billets")).toBe(
      undefined
    )
    expect(commandFromText("Où sont mes billets ?")).toBeUndefined()
  })

  it("déclare pour chaque canal s'il sait afficher un bouton lien", () => {
    for (const capabilities of Object.values(CHANNEL_CAPABILITIES)) {
      expect(typeof capabilities.urlButtons).toBe("boolean")
    }
    expect(CHANNEL_CAPABILITIES.telegram.urlButtons).toBe(true)
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

  it("normalise les commandes de liaison", () => {
    for (const command of ["/connexion", "/deconnexion@SetragBot"]) {
      const message = parseTelegramUpdate({
        update_id: 44,
        message: {
          from: { id: 100 },
          chat: { id: 100, type: "private" },
          text: command,
        },
      })
      expect(message).toMatchObject({
        type: "command",
        text: command.split("@")[0],
      })
    }
  })

  it("ne garde de /start <jeton> que l'empreinte du jeton", () => {
    const token = generateLinkToken()
    const message = parseTelegramUpdate({
      update_id: 45,
      message: {
        from: { id: 100, first_name: "Ada" },
        chat: { id: 100, type: "private" },
        text: `/start ${token}`,
      },
    })
    expect(message).toMatchObject({
      type: "command",
      text: "/start",
      linkTokenHash: hashLinkToken(token),
    })
    // Le jeton ne survit ni dans le texte, ni dans le message brut.
    expect(JSON.stringify(message)).not.toContain(token)

    // Un /start sans paramètre reste l'accueil.
    const plain = parseTelegramUpdate({
      update_id: 46,
      message: {
        from: { id: 100 },
        chat: { id: 100, type: "private" },
        text: "/start",
      },
    })
    expect(plain?.linkTokenHash).toBeUndefined()

    // Hors conversation privée, aucune liaison, et le jeton est expurgé.
    const group = parseTelegramUpdate({
      update_id: 47,
      message: {
        from: { id: 100 },
        chat: { id: -5, type: "group" },
        text: `/start@SetragBot ${token}`,
      },
    })
    expect(group).toMatchObject({ type: "unsupported" })
    expect(group?.linkTokenHash).toBeUndefined()
    expect(JSON.stringify(group)).not.toContain(token)
  })

  it("compose un clavier en ligne avec rappels et liens", () => {
    expect(
      telegramInlineKeyboard([
        { label: "Confirmer", data: "approve:a" },
        {
          label: "Relier depuis le site",
          url: "https://billetterie.setrag.ga/compte/messageries",
        },
        { label: "Annuler", data: "reject:a" },
      ])
    ).toEqual([
      [
        { text: "Confirmer", callback_data: "approve:a" },
        { text: "Annuler", callback_data: "reject:a" },
      ],
      [
        {
          text: "Relier depuis le site",
          url: "https://billetterie.setrag.ga/compte/messageries",
        },
      ],
    ])
  })
})
