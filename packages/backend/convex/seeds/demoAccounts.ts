import { v } from "convex/values"
import { internal } from "../_generated/api"
import { internalAction, internalMutation } from "../_generated/server"
import type { Doc } from "../_generated/dataModel"
import type { MutationCtx } from "../_generated/server"
import { createAuth } from "../betterAuth/auth"
import { performCounterSale } from "../functions/sales"
import { toServiceDate } from "../model/calendar"
import { configuredDemoAccounts, DEMO_PERSONAS } from "../model/demoPersonas"
import { MODULE_CODES } from "../modules/platform/catalog"
import { currentPlatformEnvironment } from "../modules/platform/environment"

const PASSENGERS = [
  ["Ariane", "MBADINGA", "F"],
  ["Paul", "MBOUMBA", "M"],
  ["Mireille", "OBAME", "F"],
  ["Karim", "PONGUI", "M"],
  ["Sylvie", "NZENG", "F"],
  ["Jean", "ONDONG", "M"],
  ["Chantal", "MOUSSAVOU", "F"],
  ["Félix", "MBOUMBA", "M"],
] as const

/**
 * Crée ou réaligne le profil applicatif d'une identité Better Auth de démo.
 * Les arguments métier sont dérivés du catalogue côté mutation afin qu'une
 * action interne ne puisse pas injecter un rôle ou des modules arbitraires.
 */
export const upsertPersonaProfile = internalMutation({
  args: {
    key: v.string(),
    authId: v.string(),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const profile = DEMO_PERSONAS.find(({ key }) => key === args.key)
    if (!profile)
      throw new Error(`Profil de démonstration inconnu : ${args.key}`)

    const email = args.email.trim().toLowerCase()
    const byEmail = await ctx.db
      .query("users")
      .withIndex("by_email", (query) => query.eq("email", email))
      .unique()
    const byAuthId = await ctx.db
      .query("users")
      .withIndex("by_authId", (query) => query.eq("authId", args.authId))
      .unique()
    if (byEmail && byAuthId && byEmail._id !== byAuthId._id) {
      throw new Error(
        `Collision de profils de démonstration pour ${email} (${args.authId}).`
      )
    }

    const existing = byEmail ?? byAuthId
    // Les profils qui encaissent sont rattachés à leur point de vente, s'il
    // existe déjà (l'agence est créée par `seeds/demoActivite`).
    const pointOfSaleCode: string | undefined =
      "pointOfSaleCode" in profile ? profile.pointOfSaleCode : undefined
    const demoPointOfSale =
      pointOfSaleCode && !existing?.pointOfSaleId
        ? await ctx.db
            .query("pointsOfSale")
            .withIndex("by_code", (query) => query.eq("code", pointOfSaleCode))
            .unique()
        : null
    const userValues = {
      authId: args.authId,
      email,
      firstName: profile.firstName,
      lastName: profile.lastName,
      role: profile.role,
      identitySource: "local" as const,
      isActive: true,
      ...(existing?.pointOfSaleId
        ? { pointOfSaleId: existing.pointOfSaleId }
        : demoPointOfSale
          ? { pointOfSaleId: demoPointOfSale._id }
          : {}),
    }
    const userId = existing
      ? existing._id
      : await ctx.db.insert("users", userValues)
    if (existing) await ctx.db.patch(existing._id, userValues)

    const environment = currentPlatformEnvironment()
    const updatedAt = Date.now()
    let createdActivations = 0
    let updatedActivations = 0
    for (const moduleCode of MODULE_CODES) {
      const candidates = await ctx.db
        .query("moduleActivations")
        .withIndex("by_environment_module", (query) =>
          query.eq("environment", environment).eq("moduleCode", moduleCode)
        )
        .collect()
      const activation = candidates.find(
        (candidate) =>
          candidate.userId === userId && candidate.siteId === undefined
      )
      const values = {
        moduleCode,
        environment,
        userId,
        isEnabled: profile.moduleCodes.includes(moduleCode),
        reason: "Provisionnement du profil de démonstration",
        correlationId: `demo-persona:${profile.key}`,
        changedBy: userId,
        updatedAt,
      }
      if (activation) {
        await ctx.db.patch(activation._id, values)
        updatedActivations += 1
      } else {
        await ctx.db.insert("moduleActivations", values)
        createdActivations += 1
      }
    }

    return {
      key: profile.key,
      userId,
      created: !existing,
      createdActivations,
      updatedActivations,
    }
  },
})

/**
 * Provisionne toutes les identités de démo actuellement configurées.
 *
 * Better Auth demeure la source des identifiants. Une inscription dupliquée
 * est suivie d'une connexion, qui valide que le mot de passe configuré est
 * bien celui du compte existant avant toute habilitation applicative.
 */
export const provisionPersonas = internalAction({
  args: {},
  handler: async (
    ctx
  ): Promise<{
    configured: number
    createdAuthAccounts: number
    existingAuthAccounts: number
    profiles: Array<{
      key: string
      created: boolean
      createdActivations: number
      updatedActivations: number
    }>
  }> => {
    if (process.env.DEMO_ACCOUNTS_ENABLED !== "true") {
      throw new Error(
        "Provisionnement refusé : DEMO_ACCOUNTS_ENABLED doit valoir true."
      )
    }

    const accounts = configuredDemoAccounts(process.env)
    if (accounts.length === 0) {
      throw new Error(
        "Aucun compte de démonstration configuré : renseignez les variables legacy ou DEMO_PERSONAS_PASSWORD."
      )
    }

    const auth = createAuth(ctx)
    let createdAuthAccounts = 0
    let existingAuthAccounts = 0
    const profiles: Array<{
      key: string
      created: boolean
      createdActivations: number
      updatedActivations: number
    }> = []

    for (const account of accounts) {
      let authUser: { id: string }
      try {
        const signedUp = await auth.api.signUpEmail({
          body: {
            email: account.email,
            password: account.password,
            name: `${account.firstName} ${account.lastName}`,
          },
        })
        authUser = signedUp.user
        createdAuthAccounts += 1
      } catch (signupError) {
        try {
          const signedIn = await auth.api.signInEmail({
            body: { email: account.email, password: account.password },
          })
          authUser = signedIn.user
          existingAuthAccounts += 1
        } catch (signinError) {
          throw new Error(
            `Compte Better Auth impossible à créer ou valider : ${account.email}. ` +
              `Inscription : ${String(signupError)}. Connexion : ${String(signinError)}`
          )
        }
      }

      const result = await ctx.runMutation(
        internal.seeds.demoAccounts.upsertPersonaProfile,
        {
          key: account.key,
          authId: authUser.id,
          email: account.email,
        }
      )
      profiles.push({
        key: result.key,
        created: result.created,
        createdActivations: result.createdActivations,
        updatedActivations: result.updatedActivations,
      })
    }

    return {
      configured: accounts.length,
      createdAuthAccounts,
      existingAuthAccounts,
      profiles,
    }
  },
})

/**
 * Rattache une caisse et une activité crédible au véritable compte Better
 * Auth utilisé par la démonstration. Contrairement à l'ancien seed `demo-*`,
 * ces opérations sont visibles par l'utilisateur qui se connecte réellement.
 */
export const provision = internalMutation({
  args: {},
  handler: async (ctx) => {
    if (process.env.DEMO_ACCOUNTS_ENABLED !== "true") {
      throw new Error(
        "Peuplement refusé : DEMO_ACCOUNTS_ENABLED doit valoir true."
      )
    }

    const email = configuredDemoAccounts(process.env).find(
      ({ key }) => key === "agent"
    )?.email
    if (!email) {
      throw new Error(
        "Compte agent absent : configurez le couple DEMO_AGENT_* ou DEMO_PERSONAS_PASSWORD."
      )
    }

    const agent = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique()
    if (!agent) throw new Error(`Compte applicatif introuvable : ${email}`)
    if (
      !["vendeur_guichet", "vendeur_agence", "taxateur"].includes(agent.role)
    ) {
      throw new Error(`Le compte ${email} n'est pas un compte de vente.`)
    }
    if (!agent.pointOfSaleId) {
      throw new Error(
        `Le compte ${email} n'est rattaché à aucun point de vente.`
      )
    }

    const pointOfSale = await ctx.db.get(agent.pointOfSaleId)
    if (!pointOfSale?.isActive) {
      throw new Error("Le point de vente du compte agent est absent ou fermé.")
    }

    const date = toServiceDate(Date.now())
    let day = await ctx.db
      .query("accountingDays")
      .withIndex("by_date", (q) => q.eq("date", date))
      .unique()
    if (!day) {
      const dayId = await ctx.db.insert("accountingDays", {
        date,
        status: "ouverte",
        openedAt: Date.now(),
        totalTtc: 0,
        totalReceived: 0,
      })
      day = await ctx.db.get(dayId)
    }
    if (!day) throw new Error("La journée comptable n'a pas pu être ouverte.")

    let session = await ctx.db
      .query("cashSessions")
      .withIndex("by_seller", (q) => q.eq("sellerId", agent._id))
      .filter((q) => q.eq(q.field("status"), "ouverte"))
      .first()
    if (!session) {
      const sessionId = await ctx.db.insert("cashSessions", {
        sellerId: agent._id,
        pointOfSaleId: pointOfSale._id,
        accountingDayId: day._id,
        openedAt: Date.now() - 4 * 60 * 60 * 1000,
        openingFloatXaf: 50_000,
        expectedByMethod: [],
        status: "ouverte",
      })
      session = await ctx.db.get(sessionId)
    }
    if (!session) throw new Error("La caisse agent n'a pas pu être ouverte.")

    const existing = await ctx.db
      .query("sales")
      .withIndex("by_cash_session", (q) => q.eq("cashSessionId", session!._id))
      .collect()
    const alreadyProvisioned = existing.filter((sale) =>
      sale.deviceId?.startsWith("demo-production-bootstrap")
    )
    const provisionedTickets = (
      await Promise.all(
        alreadyProvisioned.map((sale) =>
          ctx.db
            .query("tickets")
            .withIndex("by_sale", (q) => q.eq("saleId", sale._id))
            .collect()
        )
      )
    ).flat()
    const ticketedSaleIds = new Set(
      provisionedTickets.map((ticket) => ticket.saleId)
    )
    const provisionedSaleCount = ticketedSaleIds.size

    if (provisionedSaleCount >= PASSENGERS.length) {
      return {
        email,
        sessionId: session._id,
        createdSales: 0,
        existingSales: existing.length,
        existingTickets: provisionedTickets.length,
        totalReceived: existing.reduce(
          (sum, sale) => sum + sale.amounts.received,
          0
        ),
        fixtures: await provisionManagementFixtures(
          ctx,
          agent,
          tripsForSeed(ctx)
        ),
      }
    }

    const trips = await tripsForSeed(ctx)
    if (trips.length === 0) {
      throw new Error("Aucune desserte future ouverte à la vente.")
    }

    let createdSales = 0
    let totalReceived = 0
    const serviceClasses: Array<Doc<"coaches">["serviceClass"]> = [
      "DEUXIEME",
      "PREMIERE",
      "DEUXIEME",
      "VIP",
    ]
    const methods = ["especes", "airtel_money", "moov_money", "visa"] as const

    for (
      let index = provisionedSaleCount;
      index < PASSENGERS.length;
      index += 1
    ) {
      const trip = trips[index % trips.length]!
      const stops = (
        await ctx.db
          .query("tripStops")
          .withIndex("by_trip_sequence", (q) => q.eq("tripId", trip._id))
          .collect()
      ).sort((left, right) => left.sequence - right.sequence)
      if (stops.length < 2) continue

      const [firstName, lastName, gender] = PASSENGERS[index]!
      const requestedClass = serviceClasses[index % serviceClasses.length]!
      const counters = await ctx.db
        .query("segmentCounters")
        .withIndex("by_trip_class", (q) =>
          q.eq("tripId", trip._id).eq("serviceClass", requestedClass)
        )
        .collect()
      const serviceClass =
        counters.length > 0 ? requestedClass : ("DEUXIEME" as const)

      const result = await performCounterSale(ctx, agent, {
        tripId: trip._id,
        originStationId: stops[0]!.stationId,
        destinationStationId: stops[stops.length - 1]!.stationId,
        serviceClass,
        passengers: [
          {
            firstName,
            lastName,
            gender,
            phone: `+241 06 7${index} 2${index} 3${index}`,
          },
        ],
        method: methods[index % methods.length]!,
        deviceId: "demo-production-bootstrap-v2",
      })
      createdSales += 1
      totalReceived += result.amounts.received
    }

    return {
      email,
      sessionId: session._id,
      createdSales,
      existingSales: existing.length + createdSales,
      existingTickets: provisionedTickets.length + createdSales,
      totalReceived,
      fixtures: await provisionManagementFixtures(ctx, agent, trips),
    }
  },
})

async function tripsForSeed(ctx: MutationCtx) {
  return (await ctx.db.query("trips").collect())
    .filter(
      (trip) =>
        trip.isOpenForSale &&
        trip.status === "planifie" &&
        trip.departureAt > Date.now()
    )
    .sort((left, right) => left.departureAt - right.departureAt)
}

async function provisionManagementFixtures(
  ctx: MutationCtx,
  actor: Doc<"users">,
  tripsPromise: Promise<Doc<"trips">[]> | Doc<"trips">[]
) {
  const trips = await tripsPromise
  let settings = 0
  let reportSchedules = 0
  let seatBlocks = 0

  const storedSettings = await ctx.db
    .query("systemSettings")
    .withIndex("by_key", (q) => q.eq("key", "commercial"))
    .unique()
  if (!storedSettings) {
    await ctx.db.insert("systemSettings", {
      key: "commercial",
      vatPct: 18,
      cssPct: 0,
      seatHoldMinutes: 15,
      mobilePaymentAttempts: 3,
      degradedSalesEnabled: true,
      cashVarianceNotificationsEnabled: true,
      updatedBy: actor._id,
      updatedAt: Date.now(),
    })
    settings = 1
  }

  if ((await ctx.db.query("reportSchedules").collect()).length === 0) {
    const now = Date.now()
    for (const [label, reportType, frequency, format, offset] of [
      ["Chiffre d’affaires quotidien", "ventes_canaux", "quotidien", "csv", 1],
      ["Remplissage hebdomadaire", "remplissage", "hebdomadaire", "xlsx", 7],
      ["Contrôle mensuel des annulations", "annulations", "mensuel", "pdf", 30],
    ] as const) {
      await ctx.db.insert("reportSchedules", {
        label,
        reportType,
        frequency,
        format,
        recipients: ["demo-direction@setrag.ga"],
        nextRunAt: now + offset * 86_400_000,
        isActive: true,
        createdBy: actor._id,
        createdAt: now,
        updatedAt: now,
      })
      reportSchedules += 1
    }
  }

  const activeBlocks = (await ctx.db.query("seatBlocks").collect()).filter(
    (block) => block.isActive
  )
  if (activeBlocks.length === 0 && trips[0]) {
    const trip = trips[0]
    const occupancies = await ctx.db
      .query("seatOccupancy")
      .withIndex("by_trip_class", (q) => q.eq("tripId", trip._id))
      .collect()
    const free = occupancies.find(
      (row) => row.soldMask === 0 && row.heldMask === 0 && row.blockedMask === 0
    )
    if (free) {
      const mask = 2 ** trip.segmentCount - 1
      await ctx.db.patch(free._id, { blockedMask: mask })
      const counters = await ctx.db
        .query("segmentCounters")
        .withIndex("by_trip_class", (q) =>
          q.eq("tripId", trip._id).eq("serviceClass", free.serviceClass)
        )
        .collect()
      for (const counter of counters) {
        await ctx.db.patch(counter._id, {
          reserved: counter.reserved + 1,
          available: Math.max(0, counter.available - 1),
        })
      }
      await ctx.db.insert("seatBlocks", {
        tripId: trip._id,
        seatId: free.seatId,
        mask,
        reason: "maintenance",
        comment: "Contrôle préventif de la sellerie · donnée de démonstration",
        createdBy: actor._id,
        isActive: true,
      })
      seatBlocks = 1
    }
  }

  return { settings, reportSchedules, seatBlocks }
}
