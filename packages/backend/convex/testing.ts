import { v } from "convex/values"
import { mutation, query } from "./_generated/server"
import type { MutationCtx } from "./_generated/server"
import type { Id } from "./_generated/dataModel"
import { serviceClass } from "./schema"
import { performCounterSale } from "./functions/sales"
import { generateSeats } from "./model/seating"
import { toServiceDate, addDays } from "./model/calendar"

/**
 * Fonctions réservées aux tests d'intégration contre un backend réel.
 *
 * ⚠️ CHAQUE fonction de ce module est verrouillée par la variable
 * d'environnement `IS_TEST`. Elle n'est posée que sur le backend local
 * lancé par `docker/up.sh`, jamais sur un déploiement de développement ni de
 * production. Sans elle, tout appel échoue immédiatement.
 *
 * Ce module existe pour une raison précise : `convex-test` exécute les
 * mutations séquentiellement en JavaScript et ne reproduit pas les conflits
 * de contrôle de concurrence optimiste. Il ne peut donc pas démontrer
 * l'absence de survente. Seul le vrai moteur le peut, et il faut pour cela
 * pouvoir déclencher des ventes réellement parallèles sans passer par
 * l'authentification complète.
 */

/** Verrou : lève si le déploiement n'est pas explicitement en mode test. */
function assertTestMode(): void {
  if (process.env.IS_TEST !== "true") {
    throw new Error(
      "Fonction réservée aux tests : la variable IS_TEST n'est pas active " +
        "sur ce déploiement.",
    )
  }
}

/** Toutes les tables applicatives, dans l'ordre de purge. */
const TABLES = [
  "financeMutationReceipts",
  "financeJournalLines",
  "financeJournalBatches",
  "financeTaxRules",
  "financeTaxRuleSets",
  "financeAccounts",
  "financeChartVersions",
  "continuityExercises",
  "continuityPolicies",
  "approvalSteps",
  "approvalInstances",
  "documentVersions",
  "documentRecords",
  "integrationReceipts",
  "integrationEvents",
  "integrationEndpoints",
  "auditSeals",
  "moduleActivations",
  "userAssignments",
  "positions",
  "sites",
  "organizations",
  "messagingOutbox",
  "messagingApprovals",
  "messagingEvents",
  "messagingThreads",
  "messagingIdentities",
  "assistantMessages",
  "assistantTurns",
  "assistantToolExecutions",
  "assistantVoiceSessions",
  "assistantConversations",
  "ticketScans",
  "procesVerbaux",
  "incidents",
  "manualTickets",
  "journalEntries",
  "paymentEvents",
  "payments",
  "parcelItems",
  "parcels",
  "baggages",
  "vehicleTransports",
  "funeralTransports",
  "subscriptions",
  "tickets",
  "sales",
  "cashSessions",
  "accountingDays",
  "sequences",
  "seatOccupancy",
  "segmentCounters",
  "seatBlocks",
  "agencyQuotas",
  "fareClassQuotas",
  "pricingRules",
  "tripStops",
  "trips",
  "bookletSchedules",
  "timetableBooklets",
  "ancillaryFares",
  "discounts",
  "fareBases",
  "fareSchedules",
  "seats",
  "coaches",
  "trains",
  "pointsOfSale",
  "systemSettings",
  "stations",
  "corporateAccounts",
  "consents",
  "notifications",
  "pushTokens",
  "outboxEvents",
  "auditLogs",
  "users",
] as const

/** Vide entièrement la base entre deux tests. */
export const reset = mutation({
  args: {},
  handler: async (ctx) => {
    assertTestMode()
    const deleted: Record<string, number> = {}
    for (const table of TABLES) {
      const rows = await ctx.db.query(table).collect()
      for (const row of rows) await ctx.db.delete(row._id)
      if (rows.length > 0) deleted[table] = rows.length
    }
    return deleted
  },
})

/**
 * Monte le décor minimal d'un test de concurrence : une desserte à trois
 * arrêts, une voiture de `seatCount` places, une grille tarifaire, un point
 * de vente et `sellerCount` vendeurs avec leur caisse ouverte.
 */
export const seedConcurrencyFixture = mutation({
  args: {
    seatCount: v.number(),
    sellerCount: v.number(),
  },
  handler: async (ctx, args) => {
    assertTestMode()
    if (args.seatCount < 1 || args.seatCount % 2 !== 0) {
      throw new Error("seatCount doit être un entier pair et positif")
    }

    const pointOfSaleId = await ctx.db.insert("pointsOfSale", {
      code: "TEST-PV",
      name: "Point de vente de test",
      type: "gare",
      counters: { passengers: 4, baggage: 0, parcels: 0 },
      isActive: true,
    })

    const owe = await ctx.db.insert("stations", {
      code: "OWE",
      name: "Owendo",
      province: "Estuaire",
      kilometerPoint: 0,
      isEquipped: true,
      isActive: true,
    })
    const boo = await ctx.db.insert("stations", {
      code: "BOO",
      name: "Booué",
      province: "Ogooué-Ivindo",
      kilometerPoint: 340,
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
      number: "TR-TEST",
      name: "Train de test",
      type: "EXPRESS",
      isActive: true,
    })
    const rowCount = args.seatCount / 2
    const coachId = await ctx.db.insert("coaches", {
      trainId,
      label: "V1",
      serviceClass: "DEUXIEME",
      rowCount,
      columnCount: 2,
      seatCount: args.seatCount,
      standingCapacity: 0,
      position: 1,
    })
    for (const seat of generateSeats({
      rowCount,
      columnCount: 2,
      seatCount: args.seatCount,
    })) {
      await ctx.db.insert("seats", {
        coachId,
        trainId,
        label: seat.label,
        row: seat.row,
        column: seat.column,
        isActive: true,
      })
    }

    const adminId = await ctx.db.insert("users", {
      authId: "test-admin",
      role: "admin_fonctionnel",
      identitySource: "local",
      isActive: true,
    })

    const scheduleId = await ctx.db.insert("fareSchedules", {
      label: "Barème de test",
      status: "actif",
      validFrom: 0,
      validUntil: Date.now() + 365 * 86_400_000,
      roundingBasis: "TTC",
      vatPct: 0,
      cssPct: 0,
      createdBy: adminId,
    })
    await ctx.db.insert("fareBases", {
      scheduleId,
      trainType: "EXPRESS",
      serviceClass: "DEUXIEME",
      shortDistanceRate: 47.51,
      longDistanceRate: 43.42,
    })

    const serviceDate = addDays(toServiceDate(Date.now()), 3)
    const bookletId = await ctx.db.insert("timetableBooklets", {
      label: "Livret de test",
      validFrom: Date.now(),
      validUntil: Date.now() + 30 * 86_400_000,
      status: "actif",
      createdBy: adminId,
    })
    const departureAt = Date.now() + 3 * 86_400_000
    const tripId = await ctx.db.insert("trips", {
      bookletId,
      trainId,
      trainNumber: "TR-TEST",
      trainType: "EXPRESS",
      serviceDate,
      departureAt,
      arrivalAt: departureAt + 12 * 3_600_000,
      originStationId: owe,
      destinationStationId: fcv,
      status: "planifie",
      delayMinutes: 0,
      segmentCount: 2,
      isOpenForSale: true,
    })
    for (const [index, stationId, km] of [
      [0, owe, 0],
      [1, boo, 340],
      [2, fcv, 648],
    ] as const) {
      await ctx.db.insert("tripStops", {
        tripId,
        stationId,
        sequence: index,
        kilometerPoint: km,
        departureAt: departureAt + index * 3_600_000,
        arrivalAt: departureAt + index * 3_600_000,
      })
    }

    const seats = await ctx.db
      .query("seats")
      .withIndex("by_coach", (q) => q.eq("coachId", coachId))
      .collect()
    for (const seat of seats) {
      await ctx.db.insert("seatOccupancy", {
        tripId,
        seatId: seat._id,
        coachId,
        serviceClass: "DEUXIEME",
        soldMask: 0,
        heldMask: 0,
        blockedMask: 0,
      })
    }
    for (let segmentIndex = 0; segmentIndex < 2; segmentIndex += 1) {
      await ctx.db.insert("segmentCounters", {
        tripId,
        serviceClass: "DEUXIEME",
        segmentIndex,
        capacity: args.seatCount,
        sold: 0,
        held: 0,
        reserved: 0,
        available: args.seatCount,
      })
    }

    // Une journée comptable et un vendeur par caisse.
    const dayId = await ctx.db.insert("accountingDays", {
      date: toServiceDate(Date.now()),
      status: "ouverte",
      openedAt: Date.now(),
      totalTtc: 0,
      totalReceived: 0,
    })
    const sellerIds: Id<"users">[] = []
    for (let i = 0; i < args.sellerCount; i += 1) {
      const sellerId = await ctx.db.insert("users", {
        authId: `test-vendeur-${i}`,
        firstName: "Vendeur",
        lastName: String(i),
        role: "vendeur_guichet",
        pointOfSaleId,
        identitySource: "local",
        isActive: true,
      })
      await ctx.db.insert("cashSessions", {
        sellerId,
        pointOfSaleId,
        accountingDayId: dayId,
        openedAt: Date.now(),
        openingFloatXaf: 0,
        expectedByMethod: [],
        status: "ouverte",
      })
      sellerIds.push(sellerId)
    }

    return {
      tripId,
      originStationId: owe,
      midStationId: boo,
      destinationStationId: fcv,
      sellerIds,
      seatCount: args.seatCount,
    }
  },
})

/**
 * Exécute une vente au guichet au nom d'un vendeur donné.
 *
 * Appelle exactement la même fonction que la mutation publique : le test de
 * concurrence exerce donc le code de production, pas une copie.
 */
export const sellOne = mutation({
  args: {
    sellerId: v.id("users"),
    tripId: v.id("trips"),
    originStationId: v.id("stations"),
    destinationStationId: v.id("stations"),
    serviceClass,
    passengerCount: v.number(),
    label: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertTestMode()
    const actor = await ctx.db.get(args.sellerId)
    if (!actor) throw new Error("Vendeur de test introuvable")

    return await performCounterSale(ctx as MutationCtx, actor, {
      tripId: args.tripId,
      originStationId: args.originStationId,
      destinationStationId: args.destinationStationId,
      serviceClass: args.serviceClass,
      passengers: Array.from({ length: args.passengerCount }, (_, i) => ({
        lastName: "TEST",
        firstName: `${args.label ?? "V"}${i}`,
        gender: "M" as const,
      })),
      method: "especes",
    })
  },
})

/** Photographie de l'inventaire, pour les assertions du test. */
export const inventorySnapshot = query({
  args: { tripId: v.id("trips") },
  handler: async (ctx, args) => {
    assertTestMode()
    const counters = (
      await ctx.db
        .query("segmentCounters")
        .withIndex("by_trip_class", (q) => q.eq("tripId", args.tripId))
        .collect()
    ).sort((a, b) => a.segmentIndex - b.segmentIndex)

    const occupancy = await ctx.db
      .query("seatOccupancy")
      .withIndex("by_trip_class", (q) => q.eq("tripId", args.tripId))
      .collect()

    const tickets = await ctx.db
      .query("tickets")
      .withIndex("by_trip", (q) => q.eq("tripId", args.tripId))
      .collect()

    const sales = await ctx.db.query("sales").collect()

    return {
      counters: counters.map((c) => ({
        segmentIndex: c.segmentIndex,
        capacity: c.capacity,
        sold: c.sold,
        available: c.available,
      })),
      seatMasks: occupancy.map((o) => o.soldMask),
      ticketCount: tickets.length,
      saleCount: sales.length,
      /** Numéros émis : sert à détecter tout doublon de numérotation. */
      saleNumbers: sales.map((s) => s.number),
      ticketNumbers: tickets.map((t) => t.number),
    }
  },
})
