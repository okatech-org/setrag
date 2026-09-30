/// <reference types="vite/client" />

import rateLimiterTest from "@convex-dev/rate-limiter/test"
import { convexTest } from "convex-test"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { api, internal } from "../_generated/api"
import type { Id } from "../_generated/dataModel"
import schema from "../schema"
import { modules } from "../test.setup"
import { addDays, toServiceDate } from "../model/calendar"
import {
  LINK_REQUEST_TTL_MS,
  MAX_ACTIVE_LINK_REQUESTS,
  hashLinkToken,
} from "./contracts"
import {
  reponseOpenAI,
  texteEntree,
  type CorpsOpenAI,
} from "../ai/fournisseurs.test-utils"
import { linkedMessage } from "./linking"
import { parseTelegramUpdate } from "./telegram"

/**
 * Liaison d'une messagerie à un compte SETRAG.
 *
 * Le jeton naît sur le site, pour le compte connecté ; la personne l'ouvre
 * dans SON Telegram et appuie sur « Démarrer ». Le cycle complet passe par
 * l'analyse Telegram et l'orchestrateur réels : le fil explique comment
 * relier, le site émet le lien, `/start <jeton>` relie, puis le fil retrouve
 * les billets du compte — jusqu'à la déliaison et l'effacement du compte.
 */

function newTest() {
  return convexTest(schema, modules)
}
type Test = ReturnType<typeof newTest>

const SECRET = "messaging-secret-de-test-0123456789-abcdef"
const SITE = "https://billetterie.setrag.test"
const BOT = "SetragTestBot"
const PHONE = "+241 66 11 22 33"
const SETTINGS_URL = `${SITE}/compte/messageries`

type OpenAIBody = {
  instructions: string
  input: Array<{
    role?: string
    type?: string
    output?: string
    content?: string | Array<{ type?: string; text?: string }>
  }>
  tools: Array<{ name: string }>
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}

/**
 * Réseau simulé : les réponses OpenAI sont servies dans l'ordre, Telegram
 * répond toujours `ok`. Un appel imprévu fait échouer le test.
 */
function stubNetwork() {
  const openai: unknown[] = []
  const fetchMock = vi.fn(
    async (url: string | URL | Request, _init?: RequestInit) => {
    const target = String(url)
    if (target.startsWith("https://api.openai.com/")) {
      const next = openai.shift()
      if (!next) throw new Error("Réponse OpenAI inattendue")
      return reponseOpenAI(next as CorpsOpenAI)
    }
    if (target.startsWith("https://api.telegram.org/")) {
      return jsonResponse({ ok: true, result: { message_id: 42 } })
    }
      throw new Error(`Appel réseau inattendu : ${target}`)
    }
  )
  vi.stubGlobal("fetch", fetchMock)
  return {
    queue: (...responses: unknown[]) => openai.push(...responses),
    openAIRequests: (): OpenAIBody[] =>
      fetchMock.mock.calls
        .filter(([url]) => String(url).startsWith("https://api.openai.com/"))
        .map(
          ([, init]) => JSON.parse(init!.body as string) as OpenAIBody
        ),
    telegramRequests: () =>
      fetchMock.mock.calls
        .filter(([url]) => String(url).startsWith("https://api.telegram.org/"))
        .map(([url, init]) => ({
          method: String(url).split("/").pop(),
          body: JSON.parse(init!.body as string),
        })),
  }
}

function toolCall(callId: string, name: string, input: unknown = {}) {
  return {
    output: [
      {
        type: "function_call",
        call_id: callId,
        name,
        arguments: JSON.stringify(input),
      },
    ],
  }
}

function reply(text: string) {
  return { output_text: text, output: [] }
}

let updateId = 1_000

/**
 * Reçoit un message du voyageur comme le ferait le webhook : la mise à jour
 * Telegram est analysée (`parseTelegramUpdate`), ingérée, puis traitée.
 */
async function receive(t: Test, chatId: string, text: string) {
  updateId += 1
  const parsed = parseTelegramUpdate({
    update_id: updateId,
    message: {
      message_id: updateId,
      from: { id: Number(chatId), first_name: "Ada", last_name: "Moussavou" },
      chat: { id: Number(chatId), type: "private" },
      text,
    },
  })!
  const ingested = await t.mutation(internal.messaging.core.ingestEvent, {
    channel: parsed.channel,
    externalEventId: parsed.eventId,
    externalThreadId: parsed.externalThreadId,
    externalUserId: parsed.externalUserId,
    type: parsed.type,
    text: parsed.text,
    linkTokenHash: parsed.linkTokenHash,
    displayName: parsed.displayName,
    rawPayload: parsed.rawPayload,
  })
  const processed = await t.action(
    internal.messaging.orchestrator.processEvent,
    { eventId: ingested.eventId }
  )
  expect(processed).toEqual({ processed: true })
  const thread = await t.run((ctx) =>
    ctx.db
      .query("messagingThreads")
      .withIndex("by_channel_and_external_thread", (q) =>
        q.eq("channel", "telegram").eq("externalThreadId", chatId)
      )
      .unique()
  )
  const outbox = await t.run((ctx) =>
    ctx.db
      .query("messagingOutbox")
      .withIndex("by_source_event", (q) =>
        q.eq("sourceEventId", ingested.eventId)
      )
      .collect()
  )
  return { thread: thread!, outbox, eventId: ingested.eventId }
}

/** Émet un lien de liaison depuis le site, pour le compte `authId`. */
async function linkFromSite(t: Test, authId: string) {
  const result = await t
    .withIdentity({ subject: authId })
    .action(api.messaging.linking.startFromSite, { canal: "telegram" })
  if (!result.disponible) throw new Error("Liaison indisponible.")
  const token = new URL(result.url).searchParams.get("start")!
  return { ...result, token }
}

async function linkRequests(t: Test) {
  return await t.run((ctx) => ctx.db.query("messagingLinkRequests").collect())
}

async function identityOf(t: Test, chatId: string) {
  return await t.run((ctx) =>
    ctx.db
      .query("messagingIdentities")
      .withIndex("by_channel_and_external_user", (q) =>
        q.eq("channel", "telegram").eq("externalUserId", chatId)
      )
      .unique()
  )
}

async function insertTraveler(
  t: Test,
  authId: string,
  fields: { firstName?: string; role?: "voyageur" | "vendeur_guichet" } = {}
) {
  return await t.run((ctx) =>
    ctx.db.insert("users", {
      authId,
      firstName: fields.firstName ?? "Ada",
      lastName: "Moussavou",
      phone: PHONE,
      role: fields.role ?? "voyageur",
      identitySource: "local",
      isActive: true,
    })
  )
}

/** Réseau minimal et une desserte à vendre, comme les tests de documents. */
async function seedTrip(t: Test) {
  const net = await t.run(async (ctx) => {
    const owe = await ctx.db.insert("stations", {
      code: "OWE",
      name: "Owendo",
      province: "Estuaire",
      kilometerPoint: 0,
      isEquipped: true,
      isActive: true,
    })
    const fcv = await ctx.db.insert("stations", {
      code: "FCV",
      name: "Franceville",
      province: "Haut-Ogooué",
      kilometerPoint: 648,
      isEquipped: true,
      isActive: true,
    })
    const trainId = await ctx.db.insert("trains", {
      number: "TR-201",
      name: "Express",
      type: "EXPRESS",
      isActive: true,
    })
    const coachId = await ctx.db.insert("coaches", {
      trainId,
      label: "V1",
      serviceClass: "DEUXIEME",
      rowCount: 1,
      columnCount: 2,
      seatCount: 2,
      standingCapacity: 0,
      position: 1,
    })
    for (const [label, column] of [
      ["1A", 1],
      ["1B", 2],
    ] as const) {
      await ctx.db.insert("seats", {
        coachId,
        trainId,
        label,
        row: 1,
        column,
        isActive: true,
      })
    }
    const admin = await ctx.db.insert("users", {
      authId: "seed-admin",
      role: "admin_fonctionnel",
      identitySource: "annuaire",
      isActive: true,
    })
    const scheduleId = await ctx.db.insert("fareSchedules", {
      label: "Barème",
      status: "actif",
      validFrom: 0,
      validUntil: Date.now() + 365 * 86_400_000,
      roundingBasis: "TTC",
      vatPct: 0,
      cssPct: 0,
      createdBy: admin,
    })
    await ctx.db.insert("fareBases", {
      scheduleId,
      trainType: "EXPRESS",
      serviceClass: "DEUXIEME",
      shortDistanceRate: 47.51,
      longDistanceRate: 43.42,
    })
    return { owe, fcv, trainId }
  })

  const serviceDate = addDays(toServiceDate(Date.now()), 2)
  const admin = t.withIdentity({ subject: "seed-admin" })
  const bookletId = await admin.mutation(api.functions.booklets.create, {
    label: "Livret",
    validFrom: Date.parse(`${serviceDate}T00:00:00Z`),
    validUntil: Date.parse(`${serviceDate}T23:00:00Z`),
  })
  const scheduleId = await admin.mutation(api.functions.booklets.addSchedule, {
    bookletId,
    trainId: net.trainId,
    departureTime: "08:00",
    daysOfWeek: [],
    stops: [
      { stationId: net.owe, sequence: 0, departureOffsetMinutes: 0 },
      { stationId: net.fcv, sequence: 1, arrivalOffsetMinutes: 700 },
    ],
  })
  await admin.mutation(api.functions.booklets.submit, { bookletId })
  await admin.mutation(api.functions.booklets.approve, { bookletId })
  const generated = await t.mutation(internal.functions.trips.generateOne, {
    scheduleId,
    serviceDate,
  })
  return { ...net, tripId: generated.tripId as Id<"trips"> }
}

beforeEach(() => {
  // Les envois planifiés (flush du fil) ne partent pas tout seuls : le test
  // les déclenche lui-même, sans consommer les réponses OpenAI simulées.
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
  vi.stubEnv("OPENAI_API_KEY", "sk-test-messaging")
  vi.stubEnv("AI_TEXT_PROVIDER", "openai")
  vi.stubEnv("MESSAGING_SESSION_SECRET", SECRET)
  vi.stubEnv("SITE_URL", SITE)
  vi.stubEnv("TELEGRAM_BOT_TOKEN", "bot-test-token")
  vi.stubEnv("TELEGRAM_BOT_USERNAME", BOT)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("liaison d'une messagerie depuis le site", () => {
  it("relie Telegram au compte qui a émis le lien, retrouve les billets, puis délie", async () => {
    const network = stubNetwork()
    const t = newTest()
    rateLimiterTest.register(t)
    const fx = await seedTrip(t)
    const userId = await insertTraveler(t, "traveler-telegram")
    await insertTraveler(t, "traveler-other")
    const traveler = t.withIdentity({ subject: "traveler-telegram" })
    const other = t.withIdentity({ subject: "traveler-other" })

    // Un billet réglé sur le site, avec le compte.
    const booking = await traveler.mutation(api.functions.bookings.create, {
      tripId: fx.tripId,
      originStationId: fx.owe,
      destinationStationId: fx.fcv,
      serviceClass: "DEUXIEME",
      passengers: [{ lastName: "MOUSSAVOU", firstName: "Ada", gender: "F" }],
      contactPhone: PHONE,
    })
    await traveler.mutation(api.functions.bookings.confirm, {
      reference: booking.reference,
      method: "airtel_money",
    })

    // 1. Invité : le modèle propose la connexion ; le fil explique comment
    //    relier depuis le site, sans aucun jeton.
    network.queue(
      toolCall("sign-in-1", "request_sign_in", {
        reason: "retrouver vos billets",
      }),
      reply("Connectez-vous pour que je retrouve vos billets.")
    )
    const asked = await receive(t, "7001", "Où sont mes billets ?")
    const guestTurn = network.openAIRequests()[0]!
    expect(guestTurn.tools.map((tool) => tool.name)).toContain(
      "request_sign_in"
    )
    expect(guestTurn.tools.map((tool) => tool.name)).not.toContain(
      "list_my_tickets"
    )
    expect(asked.outbox).toHaveLength(1)
    expect(asked.outbox[0]).toMatchObject({
      text: expect.stringContaining("Relier Telegram"),
      buttons: [{ label: "Relier depuis le site", url: SETTINGS_URL }],
    })
    expect(asked.outbox[0]!.text).toMatch(
      /^Connectez-vous pour que je retrouve vos billets\./
    )
    await expect(linkRequests(t)).resolves.toEqual([])

    // 2. Sur le site, le compte connecté émet le lien.
    const started = await linkFromSite(t, "traveler-telegram")
    expect(started.url).toMatch(
      new RegExp(`^https://t\\.me/${BOT}\\?start=[A-Za-z0-9_-]{43}$`)
    )
    const requests = await linkRequests(t)
    expect(requests).toHaveLength(1)
    expect(requests[0]).toMatchObject({
      userId,
      channel: "telegram",
      tokenHash: hashLinkToken(started.token),
      status: "pending",
      expiresAt: started.expiresAt,
    })
    expect(requests[0]!.expiresAt - requests[0]!.createdAt).toBe(
      LINK_REQUEST_TTL_MS
    )
    expect(JSON.stringify(requests)).not.toContain(started.token)

    // 3. Dans SON Telegram, la personne appuie sur « Démarrer ».
    const linkedEvent = await receive(t, "7001", `/start ${started.token}`)
    const confirmation = linkedMessage("Ada")
    expect(linkedEvent.outbox.map((message) => message.text)).toEqual([
      confirmation,
    ])
    const linked = await t.run(async (ctx) => {
      const thread = (await ctx.db.get(asked.thread._id))!
      return {
        identity: await ctx.db.get(thread.identityId),
        conversation: await ctx.db.get(thread.conversationId),
        messages: await ctx.db
          .query("assistantMessages")
          .withIndex("by_conversation_and_created_at", (q) =>
            q.eq("conversationId", thread.conversationId)
          )
          .collect(),
        request: (await ctx.db.query("messagingLinkRequests").collect())[0],
        events: await ctx.db.query("messagingEvents").collect(),
        audits: await ctx.db.query("auditLogs").collect(),
      }
    })
    expect(linked.identity).toMatchObject({
      userId,
      linkedAt: expect.any(Number),
    })
    expect(linked.request).toMatchObject({
      status: "used",
      identityId: linked.identity!._id,
      usedAt: expect.any(Number),
    })
    // Le jeton n'est gardé nulle part, pas même dans le message brut.
    expect(JSON.stringify(linked.events)).not.toContain(started.token)
    // Le fil repart sur une conversation neuve du compte : l'échange tenu en
    // invité n'est jamais rattaché (si la personne a ouvert le lien de
    // quelqu'un d'autre, ses messages ne passent pas à ce compte).
    expect(linked.conversation).toMatchObject({ userId, status: "active" })
    expect(linked.conversation!._id).not.toBe(asked.thread.conversationId)
    expect(
      linked.messages
        .filter((message) => message.role !== "tool")
        .map((message) => message.content)
    ).toEqual([confirmation])
    const ancienne = await t.run((ctx) => ctx.db.get(asked.thread.conversationId))
    expect(ancienne).toMatchObject({ status: "closed" })
    expect(ancienne?.userId).toBeUndefined()
    expect(linked.audits.map((entry) => entry.action)).toEqual(
      expect.arrayContaining(["messagerie.demander_liaison", "messagerie.lier"])
    )

    // Le compte voit la messagerie reliée dans son espace ; un autre, non.
    await expect(
      traveler.query(api.messaging.linking.listMine, {})
    ).resolves.toEqual([
      {
        identityId: linked.identity!._id,
        canal: "telegram",
        nomAffiche: "Ada Moussavou",
        linkedAt: expect.any(Number),
        lastSeenAt: expect.any(Number),
      },
    ])
    await expect(other.query(api.messaging.linking.listMine, {})).resolves.toEqual(
      []
    )

    // 4. Les messages suivants agissent pour le compte relié.
    network.queue(
      toolCall("tickets-1", "list_my_tickets"),
      reply("Vous avez un billet pour Franceville.")
    )
    await receive(t, "7001", "Et maintenant, mes billets ?")
    const [, , linkedTurn, linkedContinuation] = network.openAIRequests()
    expect(linkedTurn!.tools.map((tool) => tool.name)).toContain(
      "list_my_tickets"
    )
    expect(linkedTurn!.tools.map((tool) => tool.name)).not.toContain(
      "request_sign_in"
    )
    expect(linkedTurn!.instructions).toContain("Contexte voyageur authentifié")
    expect(
      linkedTurn!.input.some(
        (item) => item.role === "assistant" && texteEntree(item) === confirmation
      )
    ).toBe(true)
    const ticketsOutput = linkedContinuation!.input.find(
      (item) => item.type === "function_call_output"
    )!.output!
    expect(JSON.parse(ticketsOutput)).toEqual([
      expect.objectContaining({ reference: booking.reference }),
    ])
    // La sortie d'outil ne transporte pas le code-barres signé du billet.
    expect(ticketsOutput).not.toContain("barcode")

    // 5. /deconnexion : le fil repart invité, sur une conversation neuve.
    const unlinked = await receive(t, "7001", "/deconnexion")
    expect(unlinked.outbox[0]!.text).toContain("n’est plus relié")
    const afterUnlink = await t.run(async (ctx) => ({
      identity: await ctx.db.get(unlinked.thread.identityId),
      previous: await ctx.db.get(asked.thread.conversationId),
      current: await ctx.db.get(unlinked.thread.conversationId),
      audits: await ctx.db
        .query("auditLogs")
        .filter((q) => q.eq(q.field("action"), "messagerie.delier"))
        .collect(),
    }))
    expect(afterUnlink.identity?.userId).toBeUndefined()
    expect(afterUnlink.previous?.status).toBe("closed")
    expect(unlinked.thread.conversationId).not.toBe(asked.thread.conversationId)
    expect(afterUnlink.current).toMatchObject({ status: "active" })
    expect(afterUnlink.current?.userId).toBeUndefined()
    expect(afterUnlink.audits).toHaveLength(1)
    expect(afterUnlink.audits[0]!.actorId).toBe(userId)

    network.queue(reply("Bonjour !"))
    await receive(t, "7001", "Bonjour")
    const turns = network.openAIRequests()
    const guestAgain = turns[turns.length - 1]!
    expect(guestAgain.tools.map((tool) => tool.name)).not.toContain(
      "list_my_tickets"
    )
    expect(guestAgain.instructions).not.toContain(
      "Contexte voyageur authentifié"
    )
  })

  it("n'émet aucun jeton depuis le fil : /connexion renvoie vers le site", async () => {
    const network = stubNetwork()
    const t = newTest()
    rateLimiterTest.register(t)

    for (const text of ["/connexion", "Me connecter !"]) {
      const asked = await receive(t, "7101", text)
      expect(asked.outbox[0]).toMatchObject({
        text: expect.stringContaining("appuyez sur « Relier Telegram »"),
        buttons: [{ label: "Relier depuis le site", url: SETTINGS_URL }],
      })
      expect(JSON.stringify(asked.outbox)).not.toMatch(/start=|\/lier\//)
    }
    // Ni le modèle, ni une demande de liaison.
    expect(network.openAIRequests()).toHaveLength(0)
    await expect(linkRequests(t)).resolves.toEqual([])

    // Relié : /connexion le rappelle, sans bouton.
    await insertTraveler(t, "traveler-already")
    const { token } = await linkFromSite(t, "traveler-already")
    await receive(t, "7101", `/start ${token}`)
    const again = await receive(t, "7101", "/connexion")
    expect(again.outbox[0]!.text).toContain("déjà relié")
    expect(again.outbox[0]!.buttons).toBeUndefined()
  })

  it("écrit l'adresse du site dans le texte quand un bouton n'est pas possible", async () => {
    vi.stubEnv("SITE_URL", "http://localhost:3000")
    stubNetwork()
    const t = newTest()
    rateLimiterTest.register(t)
    const asked = await receive(t, "7151", "/connexion")
    expect(asked.outbox[0]!.buttons).toBeUndefined()
    expect(asked.outbox[0]!.text).toMatch(
      /Démarrer\.\n\nhttp:\/\/localhost:3000\/compte\/messageries$/
    )
  })

  it("ne relie jamais au compte de la personne qui envoie le lien, mais à celui qui l'a émis", async () => {
    stubNetwork()
    const t = newTest()
    rateLimiterTest.register(t)
    const victimId = await insertTraveler(t, "traveler-victim", {
      firstName: "Victime",
    })
    const attackerId = await insertTraveler(t, "traveler-attacker", {
      firstName: "Intrus",
    })

    // L'intrus émet un lien depuis SON compte et le fait ouvrir à la
    // victime : c'est le compte de l'intrus qui est relié, jamais celui de
    // la victime, et le fil le dit.
    const { token } = await linkFromSite(t, "traveler-attacker")
    const opened = await receive(t, "7201", `/start ${token}`)
    expect(opened.outbox[0]!.text).toBe(linkedMessage("Intrus"))
    expect((await identityOf(t, "7201"))?.userId).toBe(attackerId)
    await expect(
      t
        .withIdentity({ subject: "traveler-victim" })
        .query(api.messaging.linking.listMine, {})
    ).resolves.toEqual([])
    expect(victimId).not.toBe(attackerId)

    // Le même jeton ne relie pas une seconde messagerie.
    const replay = await receive(t, "7202", `/start ${token}`)
    expect(replay.outbox[0]!.text).toContain("n’est pas valable")
    expect((await identityOf(t, "7202"))?.userId).toBeUndefined()
  })

  it("refuse un jeton inconnu ou expiré, et garde un jeton déjà consommé inutilisable", async () => {
    stubNetwork()
    const t = newTest()
    rateLimiterTest.register(t)
    await insertTraveler(t, "traveler-expiry")

    const unknown = await receive(t, "7301", `/start ${"A".repeat(43)}`)
    expect(unknown.outbox[0]).toMatchObject({
      text: expect.stringContaining("n’est pas valable"),
      buttons: [{ label: "Relier depuis le site", url: SETTINGS_URL }],
    })

    const expired = await linkFromSite(t, "traveler-expiry")
    await t.run(async (ctx) => {
      const request = await ctx.db
        .query("messagingLinkRequests")
        .withIndex("by_token_hash", (q) =>
          q.eq("tokenHash", hashLinkToken(expired.token))
        )
        .unique()
      await ctx.db.patch(request!._id, { expiresAt: Date.now() - 1 })
    })
    const late = await receive(t, "7301", `/start ${expired.token}`)
    expect(late.outbox[0]!.text).toContain("a expiré")
    expect((await identityOf(t, "7301"))?.userId).toBeUndefined()
    const [request] = await linkRequests(t)
    expect(request!.status).toBe("expired")
  })

  it("rejoue une liaison sans effet, et refuse une identité déjà reliée à un autre compte", async () => {
    stubNetwork()
    const t = newTest()
    rateLimiterTest.register(t)
    const firstId = await insertTraveler(t, "traveler-first", {
      firstName: "Premier",
    })
    const secondId = await insertTraveler(t, "traveler-second", {
      firstName: "Second",
    })

    const first = await linkFromSite(t, "traveler-first")
    const linked = await receive(t, "7401", `/start ${first.token}`)
    // Un traitement rejoué rend la même liaison, sans doublon.
    await expect(
      t.mutation(internal.messaging.linking.linkFromStart, {
        threadId: linked.thread._id,
        tokenHash: hashLinkToken(first.token),
      })
    ).resolves.toEqual({
      statut: "relie",
      message: linkedMessage("Premier"),
    })
    const audits = await t.run((ctx) =>
      ctx.db
        .query("auditLogs")
        .filter((q) => q.eq(q.field("action"), "messagerie.lier"))
        .collect()
    )
    expect(audits).toHaveLength(1)

    // Le lien d'un second compte ne détourne pas une identité déjà reliée…
    const second = await linkFromSite(t, "traveler-second")
    const refused = await receive(t, "7401", `/start ${second.token}`)
    expect(refused.outbox[0]!.text).toContain(
      "déjà reliée à un autre compte SETRAG"
    )
    expect((await identityOf(t, "7401"))?.userId).toBe(firstId)

    // …mais reste valable : après /deconnexion, le même lien relie.
    await receive(t, "7401", "/deconnexion")
    const relinked = await receive(t, "7401", `/start ${second.token}`)
    expect(relinked.outbox[0]!.text).toBe(linkedMessage("Second"))
    expect((await identityOf(t, "7401"))?.userId).toBe(secondId)
  })

  it("réserve la liaison aux voyageurs actifs connectés", async () => {
    stubNetwork()
    const t = newTest()
    rateLimiterTest.register(t)
    await insertTraveler(t, "agent-guichet", { role: "vendeur_guichet" })
    const travelerId = await insertTraveler(t, "traveler-deactivated")

    await expect(
      t.action(api.messaging.linking.startFromSite, { canal: "telegram" })
    ).rejects.toThrow(/Non authentifié/)
    await expect(
      t
        .withIdentity({ subject: "agent-guichet" })
        .action(api.messaging.linking.startFromSite, { canal: "telegram" })
    ).rejects.toThrow(/réservée aux comptes voyageurs/)
    await expect(linkRequests(t)).resolves.toEqual([])

    // Un compte désactivé entre l'émission du lien et « Démarrer ».
    const { token } = await linkFromSite(t, "traveler-deactivated")
    await t.run((ctx) => ctx.db.patch(travelerId, { isActive: false }))
    const refused = await receive(t, "7501", `/start ${token}`)
    expect(refused.outbox[0]!.text).toContain("n’est pas valable")
    expect((await identityOf(t, "7501"))?.userId).toBeUndefined()
  })

  it("répond honnêtement quand le bot n'est pas configuré", async () => {
    vi.stubEnv("TELEGRAM_BOT_USERNAME", "")
    const t = newTest()
    await insertTraveler(t, "traveler-no-bot")
    await expect(
      t
        .withIdentity({ subject: "traveler-no-bot" })
        .action(api.messaging.linking.startFromSite, { canal: "telegram" })
    ).resolves.toEqual({ disponible: false })
    await expect(linkRequests(t)).resolves.toEqual([])
  })

  it(`garde au plus ${MAX_ACTIVE_LINK_REQUESTS} demandes en cours par compte`, async () => {
    const t = newTest()
    await insertTraveler(t, "traveler-many")
    const tokens = []
    for (let index = 0; index < MAX_ACTIVE_LINK_REQUESTS + 1; index += 1) {
      tokens.push((await linkFromSite(t, "traveler-many")).token)
    }
    const requests = await linkRequests(t)
    const byToken = (token: string) =>
      requests.find((request) => request.tokenHash === hashLinkToken(token))
    expect(requests.filter((request) => request.status === "pending")).toHaveLength(
      MAX_ACTIVE_LINK_REQUESTS
    )
    // La plus ancienne expire, les plus récentes restent.
    expect(byToken(tokens[0]!)!.status).toBe("expired")
    expect(byToken(tokens[tokens.length - 1]!)!.status).toBe("pending")
  })

  it("purge les demandes échues et garde les demandes en cours", async () => {
    const t = newTest()
    const userId = await insertTraveler(t, "traveler-purge")
    const now = Date.now()
    await t.run(async (ctx) => {
      for (const [index, expiresAt] of [
        now - 60_000,
        now - 1,
        now + LINK_REQUEST_TTL_MS,
      ].entries()) {
        await ctx.db.insert("messagingLinkRequests", {
          userId,
          channel: "telegram",
          tokenHash: `empreinte-${index}`,
          status: index === 0 ? "used" : "pending",
          expiresAt,
          createdAt: now - LINK_REQUEST_TTL_MS,
        })
      }
    })
    await expect(
      t.mutation(internal.messaging.linking.purgeExpiredRequests, {})
    ).resolves.toEqual({ deleted: 2, done: true })
    const left = await linkRequests(t)
    expect(left.map((request) => request.tokenHash)).toEqual(["empreinte-2"])
  })

  it("délie depuis l'espace compte et prévient le fil", async () => {
    stubNetwork()
    const t = newTest()
    rateLimiterTest.register(t)
    await insertTraveler(t, "traveler-site-unlink")
    await insertTraveler(t, "traveler-site-intruder")
    const traveler = t.withIdentity({ subject: "traveler-site-unlink" })
    const intruder = t.withIdentity({ subject: "traveler-site-intruder" })
    const { token } = await linkFromSite(t, "traveler-site-unlink")
    const linked = await receive(t, "7601", `/start ${token}`)
    const [identity] = await traveler.query(api.messaging.linking.listMine, {})

    await expect(
      intruder.mutation(api.messaging.linking.unlink, {
        identityId: identity!.identityId,
      })
    ).rejects.toThrow(/Liaison introuvable/)
    await expect(
      traveler.mutation(api.messaging.linking.unlink, {
        identityId: identity!.identityId,
      })
    ).resolves.toEqual({ delie: true })
    await expect(
      traveler.query(api.messaging.linking.listMine, {})
    ).resolves.toEqual([])

    const state = await t.run(async (ctx) => ({
      conversation: await ctx.db.get(linked.thread.conversationId),
      outbox: await ctx.db
        .query("messagingOutbox")
        .withIndex("by_thread_and_status", (q) =>
          q.eq("threadId", linked.thread._id).eq("status", "pending")
        )
        .collect(),
    }))
    expect(state.conversation?.status).toBe("closed")
    expect(state.outbox[state.outbox.length - 1]?.text).toContain(
      "n'est plus relié"
    )

    // Au message suivant, le fil repart sur une conversation invitée.
    const next = await receive(t, "7601", "/aide")
    expect(next.thread.conversationId).not.toBe(linked.thread.conversationId)
    const conversation = await t.run((ctx) =>
      ctx.db.get(next.thread.conversationId)
    )
    expect(conversation).toMatchObject({ status: "active" })
    expect(conversation?.userId).toBeUndefined()
  })
})

describe("acteur venu d'une messagerie", () => {
  it("refuse un compte désactivé ou qui n'est plus voyageur", async () => {
    stubNetwork()
    const t = newTest()
    rateLimiterTest.register(t)
    const userId = await insertTraveler(t, "traveler-role-change")
    const { token } = await linkFromSite(t, "traveler-role-change")
    const linked = await receive(t, "7701", `/start ${token}`)
    const access = {
      conversationId: linked.thread.conversationId,
      messagingThreadId: linked.thread._id,
    }
    await expect(
      t.query(internal.ai.conversations.accessContext, access)
    ).resolves.toMatchObject({ acteur: { userId, source: "messaging" } })

    await t.run((ctx) => ctx.db.patch(userId, { role: "vendeur_guichet" }))
    await expect(
      t.query(internal.ai.conversations.accessContext, access)
    ).rejects.toThrow(/n'est pas autorisé depuis une messagerie/)

    await t.run((ctx) =>
      ctx.db.patch(userId, { role: "voyageur", isActive: false })
    )
    await expect(
      t.query(internal.ai.conversations.accessContext, access)
    ).rejects.toThrow(/Compte désactivé/)
  })

  it("ne donne jamais accès aux duplicatas d'un agent depuis une messagerie", async () => {
    const t = newTest()
    const fx = await seedTrip(t)
    await insertTraveler(t, "traveler-ticket-owner")
    const agentId = await insertTraveler(t, "agent-duplicatas", {
      role: "vendeur_guichet",
    })
    const booking = await t
      .withIdentity({ subject: "traveler-ticket-owner" })
      .mutation(api.functions.bookings.create, {
        tripId: fx.tripId,
        originStationId: fx.owe,
        destinationStationId: fx.fcv,
        serviceClass: "DEUXIEME",
        passengers: [{ lastName: "MOUSSAVOU", firstName: "Ada", gender: "F" }],
        contactPhone: PHONE,
      })
    await t
      .withIdentity({ subject: "traveler-ticket-owner" })
      .mutation(api.functions.bookings.confirm, {
        reference: booking.reference,
        method: "airtel_money",
      })
    const ticketId = await t.run(async (ctx) => {
      const [ticket] = await ctx.db
        .query("tickets")
        .withIndex("by_sale", (q) =>
          q.eq("saleId", booking.saleId as Id<"sales">)
        )
        .collect()
      return ticket!._id
    })

    // Le même agent, en session, a droit aux duplicatas…
    await expect(
      t.query(internal.functions.documents.printDataForActor, {
        userId: agentId,
        source: "session",
        ticketId,
      })
    ).resolves.toMatchObject({ saleNumber: booking.reference })
    // …mais pas quand il agit depuis une messagerie.
    await expect(
      t.query(internal.functions.documents.printDataForActor, {
        userId: agentId,
        source: "messaging",
        ticketId,
      })
    ).rejects.toThrow(/Titre introuvable/)
    // Le téléphone de contact reste une preuve, comme pour tout invité.
    await expect(
      t.query(internal.functions.documents.printDataForActor, {
        userId: agentId,
        source: "messaging",
        ticketId,
        contactPhone: PHONE,
      })
    ).resolves.toMatchObject({ saleNumber: booking.reference })
  })
})

describe("effacement d'un compte relié", () => {
  it("délie, anonymise l'identité et purge les conversations de l'assistant", async () => {
    const network = stubNetwork()
    const t = newTest()
    rateLimiterTest.register(t)
    const userId = await insertTraveler(t, "traveler-supprime")
    const traveler = t.withIdentity({ subject: "traveler-supprime" })
    const { token } = await linkFromSite(t, "traveler-supprime")
    const linked = await receive(t, "7801", `/start ${token}`)
    network.queue(reply("Bonjour Ada."))
    await receive(t, "7801", "Bonjour")
    // Une conversation web du même compte, avec une exécution d'outil et une
    // session vocale.
    const web = await traveler.mutation(api.ai.conversations.create, {
      guestKey: "guest-key-web-supprime-0123456789-abcdef",
    })
    await t.run(async (ctx) => {
      await ctx.db.insert("assistantToolExecutions", {
        conversationId: web.conversationId,
        callId: "call-1",
        toolName: "list_my_tickets",
        inputJson: "{}",
        status: "succeeded",
        requiresApproval: false,
        createdAt: Date.now(),
      })
      await ctx.db.insert("assistantVoiceSessions", {
        conversationId: web.conversationId,
        provider: "openai",
        model: "gpt-realtime",
        status: "ended",
        createdAt: Date.now(),
      })
    })

    await traveler.mutation(api.functions.customers.deleteMyAccount, {
      confirmation: "SUPPRIMER",
    })

    const identity = await t.run((ctx) => ctx.db.get(linked.thread.identityId))
    expect(identity?.userId).toBeUndefined()
    expect(identity?.displayName).toBeUndefined()
    expect(identity?.externalUserId).toMatch(/^efface:[a-f0-9]{32}$/)
    expect(JSON.stringify(identity)).not.toContain("7801")
    const thread = await t.run((ctx) => ctx.db.get(linked.thread._id))
    expect(thread).toMatchObject({ state: "closed" })
    expect(thread?.externalThreadId).toMatch(/^efface:/)

    // La purge planifiée efface tout ce que Ruban gardait du compte.
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    const left = await t.run(async (ctx) => ({
      conversations: await ctx.db
        .query("assistantConversations")
        .withIndex("by_user_and_last_message_at", (q) =>
          q.eq("userId", userId)
        )
        .collect(),
      messages: await ctx.db.query("assistantMessages").collect(),
      turns: await ctx.db.query("assistantTurns").collect(),
      executions: await ctx.db.query("assistantToolExecutions").collect(),
      voice: await ctx.db.query("assistantVoiceSessions").collect(),
    }))
    expect(left).toEqual({
      conversations: [],
      messages: [],
      turns: [],
      executions: [],
      voice: [],
    })

    // Si la personne écrit de nouveau au bot, elle repart en invitée, sur un
    // fil et une identité neufs.
    network.queue(reply("Bonjour !"))
    const fresh = await receive(t, "7801", "Bonjour")
    expect(fresh.thread._id).not.toBe(linked.thread._id)
    expect(fresh.thread.identityId).not.toBe(linked.thread.identityId)
    expect((await identityOf(t, "7801"))?.userId).toBeUndefined()
  })

  it("purge par lots bornés et se replanifie tant qu'il reste des messages", async () => {
    const t = newTest()
    const userId = await insertTraveler(t, "traveler-long-history")
    await t.run(async (ctx) => {
      const conversationId = await ctx.db.insert("assistantConversations", {
        userId,
        guestKeyHash: "empreinte",
        assistantId: "concierge",
        provider: "openai",
        model: "gpt-test",
        status: "closed",
        createdAt: 0,
        lastMessageAt: 0,
      })
      for (let index = 0; index < 450; index += 1) {
        await ctx.db.insert("assistantMessages", {
          conversationId,
          role: "user",
          content: `message ${index}`,
          createdAt: index,
        })
      }
    })
    await expect(
      t.mutation(internal.ai.conversations.purgeUserData, { userId })
    ).resolves.toEqual({ done: false, deleted: 200 })
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    const left = await t.run(async (ctx) => ({
      conversations: await ctx.db.query("assistantConversations").collect(),
      messages: await ctx.db.query("assistantMessages").collect(),
    }))
    expect(left).toEqual({ conversations: [], messages: [] })
  })
})

describe("boutons Telegram", () => {
  it("envoie les rappels par paires et le lien sur sa propre ligne", async () => {
    const network = stubNetwork()
    const t = newTest()
    const thread = await t.mutation(internal.messaging.core.ensureThread, {
      channel: "telegram",
      externalThreadId: "7901",
      externalUserId: "7901",
      guestKey: "channel-key-7901-0123456789-abcdef",
    })
    await t.mutation(internal.messaging.core.enqueueBundle, {
      threadId: thread._id,
      texts: ["Confirmez-vous ?"],
      buttons: [
        { label: "Confirmer", data: "approve:jeton" },
        { label: "Annuler", data: "reject:jeton" },
        { label: "Relier depuis le site", url: SETTINGS_URL },
      ],
    })
    await expect(
      t.action(internal.messaging.telegram.flushThread, {
        threadId: thread._id,
      })
    ).resolves.toEqual({ flushed: 1 })
    expect(network.telegramRequests()).toEqual([
      {
        method: "sendMessage",
        body: {
          chat_id: "7901",
          text: "Confirmez-vous ?",
          reply_markup: {
            inline_keyboard: [
              [
                { text: "Confirmer", callback_data: "approve:jeton" },
                { text: "Annuler", callback_data: "reject:jeton" },
              ],
              [{ text: "Relier depuis le site", url: SETTINGS_URL }],
            ],
          },
        },
      },
    ])
  })
})
