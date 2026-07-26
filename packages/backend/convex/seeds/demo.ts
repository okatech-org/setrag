import { internalMutation } from "../_generated/server"
import { v } from "convex/values"
import type { Doc, Id } from "../_generated/dataModel"
import type { MutationCtx } from "../_generated/server"
import { addDays, fromServiceDate, toServiceDate } from "../model/calendar"
import { segmentCountFor } from "../model/network"

/**
 * Jeu de démonstration complet.
 *
 * Amorce tout ce qu'il faut pour faire tourner les quatre applications :
 * comptes de chaque rôle, livret horaire actif, dessertes ouvertes à la
 * vente sur toute la fenêtre, contingents de yield, et une activité
 * commerciale déjà en place pour que les écrans ne soient jamais vides.
 *
 *   bunx convex run seeds/demo:run
 *
 * ⚠️ Réservé aux environnements de démonstration. Les comptes portent des
 * identifiants prévisibles (`demo-<role>`) : ne jamais exécuter en
 * production.
 *
 * Prérequis : `bunx convex run seeds/referential:run` (gares, trains,
 * barèmes) doit avoir été exécuté au préalable.
 */

/** Comptes de démonstration, un par rôle du système. */
const DEMO_USERS = [
  { authId: "demo-admin", role: "admin_fonctionnel", firstName: "Aline", lastName: "ADMIN", matricule: "A-001" },
  { authId: "demo-it", role: "admin_it", firstName: "Ismaël", lastName: "TECH", matricule: "A-002" },
  { authId: "demo-guichet", role: "vendeur_guichet", firstName: "Aly", lastName: "MBOUMBA", matricule: "V-101" },
  { authId: "demo-guichet-2", role: "vendeur_guichet", firstName: "Sylvie", lastName: "NZENG", matricule: "V-102" },
  { authId: "demo-agence", role: "vendeur_agence", firstName: "Paul", lastName: "AGENCE", matricule: "V-201" },
  { authId: "demo-taxateur", role: "taxateur", firstName: "Thérèse", lastName: "OYANE", matricule: "T-301" },
  { authId: "demo-controleur", role: "controleur_train", firstName: "Félix", lastName: "ONANGA", matricule: "C-401" },
  { authId: "demo-controleur-2", role: "controleur_train", firstName: "Jean", lastName: "OBAME", matricule: "C-402" },
  { authId: "demo-recettes", role: "controleur_recettes", firstName: "Régine", lastName: "MBA", matricule: "R-501" },
  { authId: "demo-chef-gare", role: "chef_gare", firstName: "Charles", lastName: "NDONG", matricule: "G-601" },
  { authId: "demo-comptable", role: "comptable", firstName: "Colette", lastName: "IVANGA", matricule: "K-701" },
  { authId: "demo-kpi", role: "responsable_kpi", firstName: "Karim", lastName: "PONGUI", matricule: "K-801" },
] as const

/** Voyageurs de démonstration, pour la vente en ligne. */
const DEMO_TRAVELLERS = [
  { authId: "demo-voyageur", firstName: "Paul", lastName: "MBADINGA", phone: "+241 06 11 22 33" },
  { authId: "demo-voyageur-2", firstName: "Marie", lastName: "NZENG", phone: "+241 06 44 55 66" },
] as const

/** Horaires du livret de démonstration. */
const SCHEDULES = [
  {
    trainNumber: "TR-201",
    departureTime: "08:00",
    daysOfWeek: [1, 3, 5],
    stopCodes: ["OWE", "NDJ", "BOO", "LTV", "MOA", "FCV"],
    offsets: [0, 200, 380, 520, 620, 700],
  },
  {
    trainNumber: "TR-202",
    departureTime: "17:30",
    daysOfWeek: [2, 6],
    stopCodes: ["OWE", "NTM", "NDJ", "LOP", "BOO", "IVI", "LTV", "MOA", "FCV"],
    offsets: [0, 60, 230, 400, 460, 560, 680, 780, 840],
  },
] as const

export const run = internalMutation({
  args: {
    /** Nombre de jours de dessertes à engendrer. */
    days: v.optional(v.number()),
    /** Crée aussi des ventes, une caisse ouverte et des contrôles. */
    withActivity: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const report = {
      users: 0,
      travellers: 0,
      booklet: "",
      trips: 0,
      quotas: 0,
      pricingRules: 0,
      sales: 0,
      onlineBookings: 0,
      scans: 0,
      penalties: 0,
      incidents: 0,
      warnings: [] as string[],
    }

    /* ── Prérequis ────────────────────────────────────────────────────── */
    const stations = await ctx.db.query("stations").collect()
    if (stations.length === 0) {
      throw new Error(
        "Référentiel absent : exécuter d'abord " +
          "« bunx convex run seeds/referential:run »",
      )
    }
    const byCode = new Map(stations.map((s) => [s.code, s]))
    const pointsOfSale = await ctx.db.query("pointsOfSale").collect()
    const owendo = pointsOfSale.find((p) => p.code === "OWE-PV")
    if (!owendo) throw new Error("Point de vente d'Owendo introuvable")

    /* ── Comptes ──────────────────────────────────────────────────────── */
    const userIds = new Map<string, Id<"users">>()
    for (const u of DEMO_USERS) {
      const existing = await ctx.db
        .query("users")
        .withIndex("by_authId", (q) => q.eq("authId", u.authId))
        .unique()
      const doc = {
        authId: u.authId,
        firstName: u.firstName,
        lastName: u.lastName,
        role: u.role,
        matricule: u.matricule,
        // Les rôles de vente et de contrôle sont rattachés à Owendo.
        pointOfSaleId: [
          "vendeur_guichet",
          "vendeur_agence",
          "taxateur",
          "chef_gare",
        ].includes(u.role)
          ? owendo._id
          : undefined,
        identitySource: "local" as const,
        isActive: true,
      }
      if (existing) {
        await ctx.db.patch(existing._id, doc)
        userIds.set(u.authId, existing._id)
      } else {
        userIds.set(u.authId, await ctx.db.insert("users", doc))
        report.users += 1
      }
    }

    for (const t of DEMO_TRAVELLERS) {
      const existing = await ctx.db
        .query("users")
        .withIndex("by_authId", (q) => q.eq("authId", t.authId))
        .unique()
      const doc = {
        authId: t.authId,
        firstName: t.firstName,
        lastName: t.lastName,
        phone: t.phone,
        role: "voyageur" as const,
        identitySource: "local" as const,
        isActive: true,
      }
      if (existing) {
        await ctx.db.patch(existing._id, doc)
        userIds.set(t.authId, existing._id)
      } else {
        userIds.set(t.authId, await ctx.db.insert("users", doc))
        report.travellers += 1
      }
    }
    const adminId = userIds.get("demo-admin")!

    /* ── Livret horaire actif ─────────────────────────────────────────── */
    const days = args.days ?? 21
    const today = toServiceDate(Date.now())
    const from = fromServiceDate(today, "00:00")
    const until = fromServiceDate(addDays(today, days), "23:00")

    // Expire les livrets actifs précédents : deux livrets actifs sur une même
    // période produiraient des dessertes en double.
    for (const b of await ctx.db.query("timetableBooklets").collect()) {
      if (b.status === "actif") await ctx.db.patch(b._id, { status: "expire" })
    }

    const bookletId = await ctx.db.insert("timetableBooklets", {
      label: `Livret de démonstration — ${today}`,
      description: "Engendré par seeds/demo. Circulation type du Transgabonais.",
      validFrom: from,
      validUntil: until,
      status: "actif",
      createdBy: adminId,
      approvedBy: adminId,
      approvedAt: Date.now(),
    })
    report.booklet = `actif du ${today} au ${addDays(today, days)}`

    const trains = await ctx.db.query("trains").collect()
    const scheduleIds: Array<{ id: Id<"bookletSchedules">; days: number[] }> = []

    for (const s of SCHEDULES) {
      const train = trains.find((t) => t.number === s.trainNumber)
      if (!train) {
        report.warnings.push(`Train ${s.trainNumber} absent du référentiel`)
        continue
      }
      const stops = s.stopCodes.map((code, index) => {
        const station = byCode.get(code)
        if (!station) throw new Error(`Gare ${code} absente du référentiel`)
        return {
          stationId: station._id,
          sequence: index,
          arrivalOffsetMinutes: index === 0 ? undefined : s.offsets[index],
          departureOffsetMinutes:
            index === s.stopCodes.length - 1 ? undefined : s.offsets[index],
        }
      })
      const id = await ctx.db.insert("bookletSchedules", {
        bookletId,
        trainId: train._id,
        trainNumber: train.number,
        trainType: train.type,
        departureTime: s.departureTime,
        daysOfWeek: [...s.daysOfWeek],
        stops,
      })
      scheduleIds.push({ id, days: [...s.daysOfWeek] })
    }

    /* ── Dessertes et inventaire ──────────────────────────────────────── */
    for (const { id: scheduleId, days: circulation } of scheduleIds) {
      const schedule = (await ctx.db.get(scheduleId))!
      for (let offset = 0; offset <= days; offset += 1) {
        const serviceDate = addDays(today, offset)
        const weekday = new Date(
          fromServiceDate(serviceDate, "12:00"),
        ).getUTCDay()
        if (!circulation.includes(weekday)) continue

        const tripId = await generateTrip(ctx, schedule, serviceDate)
        if (tripId) report.trips += 1
      }
    }

    /* ── Yield : contingents et règles ────────────────────────────────── */
    const trips = await ctx.db.query("trips").collect()
    for (const trip of trips) {
      const counters = await ctx.db
        .query("segmentCounters")
        .withIndex("by_trip_class", (q) => q.eq("tripId", trip._id))
        .collect()
      const classes = [...new Set(counters.map((c) => c.serviceClass))]

      for (const serviceClass of classes) {
        const existing = await ctx.db
          .query("fareClassQuotas")
          .withIndex("by_trip_class", (q) =>
            q.eq("tripId", trip._id).eq("serviceClass", serviceClass),
          )
          .collect()
        if (existing.length > 0) continue

        const capacity =
          counters.find((c) => c.serviceClass === serviceClass)?.capacity ?? 0
        // Répartition type du yield ferroviaire : un cinquième bon marché,
        // la moitié au tarif de référence, le reste en flexible.
        for (const [label, part, coefficient, priority] of [
          ["Bas prix", 0.2, 0.8, 1],
          ["Standard", 0.55, 1, 2],
          ["Flexible", 0.25, 1.35, 3],
        ] as const) {
          await ctx.db.insert("fareClassQuotas", {
            tripId: trip._id,
            serviceClass,
            label,
            priority,
            seatCount: Math.max(1, Math.round(capacity * part)),
            soldCount: 0,
            coefficient,
            isActive: true,
          })
          report.quotas += 1
        }
      }
    }

    const existingRules = await ctx.db.query("pricingRules").collect()
    if (existingRules.length === 0) {
      for (const rule of [
        { type: "anticipation" as const, threshold: 21, modifierPct: -10, priority: 10, code: "anticipation-21j" },
        { type: "anticipation" as const, threshold: 2, modifierPct: 10, priority: 20, code: "derniere-minute" },
        { type: "remplissage" as const, threshold: 0.7, modifierPct: 15, priority: 30, code: "remplissage-70" },
        { type: "remplissage" as const, threshold: 0.9, modifierPct: 15, priority: 40, code: "remplissage-90" },
        { type: "periode" as const, threshold: 5, modifierPct: 20, priority: 50, code: "vendredi" },
      ]) {
        await ctx.db.insert("pricingRules", {
          scope: "reseau",
          type: rule.type,
          threshold: rule.threshold,
          modifierPct: rule.modifierPct,
          priority: rule.priority,
          code: rule.code,
          // Bornes de sécurité contre un cumul aberrant.
          floorXaf: 2000,
          capXaf: 150000,
          isActive: true,
          createdBy: adminId,
        })
        report.pricingRules += 1
      }
    }

    /* ── Activité commerciale ─────────────────────────────────────────── */
    if (args.withActivity !== false) {
      const activity = await seedActivity(ctx, {
        userIds,
        pointOfSaleId: owendo._id,
        byCode,
      })
      report.sales = activity.sales
      report.onlineBookings = activity.onlineBookings
      report.scans = activity.scans
      report.penalties = activity.penalties
      report.incidents = activity.incidents
    }

    report.warnings.push(
      "Comptes de démonstration à identifiants prévisibles (demo-*) : " +
        "ne jamais exécuter ce seed en production.",
    )

    await ctx.db.insert("auditLogs", {
      actorId: adminId,
      action: "seed.demo",
      entityTable: "timetableBooklets",
      entityId: bookletId,
      metadata: JSON.stringify(report),
      createdAt: Date.now(),
    })

    return report
  },
})

/* ─────────────────────── Génération d'une desserte ─────────────────────── */

type SeedCtx = MutationCtx
type Schedule = Doc<"bookletSchedules">

/**
 * Crée une desserte avec ses arrêts, l'occupation de chaque place et les
 * compteurs de chaque segment. Idempotent : une desserte déjà engendrée pour
 * ce couple (horaire, date) n'est pas recréée.
 */
async function generateTrip(
  ctx: SeedCtx,
  schedule: Schedule,
  serviceDate: string,
): Promise<Id<"trips"> | null> {
  const existing = await ctx.db
    .query("trips")
    .withIndex("by_train_date", (q) =>
      q.eq("trainId", schedule.trainId).eq("serviceDate", serviceDate),
    )
    .collect()
  if (existing.some((t) => t.scheduleId === schedule._id)) return null

  const stops = [...schedule.stops].sort((a, b) => a.sequence - b.sequence)
  const segmentCount = segmentCountFor(stops.length)
  const departureAt = fromServiceDate(serviceDate, schedule.departureTime)
  const last = stops[stops.length - 1]!
  const arrivalAt =
    departureAt +
    (last.arrivalOffsetMinutes ?? last.departureOffsetMinutes ?? 0) * 60_000

  const tripId = await ctx.db.insert("trips", {
    bookletId: schedule.bookletId,
    scheduleId: schedule._id,
    trainId: schedule.trainId,
    trainNumber: schedule.trainNumber,
    trainType: schedule.trainType,
    serviceDate,
    departureAt,
    arrivalAt,
    originStationId: stops[0]!.stationId,
    destinationStationId: last.stationId,
    status: "planifie",
    delayMinutes: 0,
    segmentCount,
    // Toutes les dessertes du jeu de démonstration sont vendables.
    isOpenForSale: true,
  })

  for (const stop of stops) {
    const station = await ctx.db.get(stop.stationId)
    await ctx.db.insert("tripStops", {
      tripId,
      stationId: stop.stationId,
      sequence: stop.sequence,
      kilometerPoint: station?.kilometerPoint ?? 0,
      arrivalAt:
        stop.arrivalOffsetMinutes !== undefined
          ? departureAt + stop.arrivalOffsetMinutes * 60_000
          : undefined,
      departureAt:
        stop.departureOffsetMinutes !== undefined
          ? departureAt + stop.departureOffsetMinutes * 60_000
          : undefined,
    })
  }

  const coaches = await ctx.db
    .query("coaches")
    .withIndex("by_train", (q) => q.eq("trainId", schedule.trainId))
    .collect()

  const capacityByClass = new Map<Doc<"coaches">["serviceClass"], number>()
  for (const coach of coaches) {
    const seats = await ctx.db
      .query("seats")
      .withIndex("by_coach", (q) => q.eq("coachId", coach._id))
      .collect()
    const actives = seats.filter((s) => s.isActive)
    for (const seat of actives) {
      await ctx.db.insert("seatOccupancy", {
        tripId,
        seatId: seat._id,
        coachId: coach._id,
        serviceClass: coach.serviceClass,
        soldMask: 0,
        heldMask: 0,
        blockedMask: 0,
      })
    }
    capacityByClass.set(
      coach.serviceClass,
      (capacityByClass.get(coach.serviceClass) ?? 0) +
        actives.length +
        coach.standingCapacity,
    )
  }

  for (const [serviceClass, capacity] of capacityByClass) {
    for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex += 1) {
      await ctx.db.insert("segmentCounters", {
        tripId,
        serviceClass,
        segmentIndex,
        capacity,
        sold: 0,
        held: 0,
        reserved: 0,
        available: capacity,
      })
    }
  }

  return tripId
}

/* ────────────────────────── Activité commerciale ───────────────────────── */

/**
 * Peuple le système d'une activité crédible : une caisse ouverte, des ventes
 * guichet, une réservation en ligne, des contrôles, un procès-verbal et un
 * incident. Sans cela, tous les écrans de suivi s'ouvrent vides.
 */
async function seedActivity(
  ctx: SeedCtx,
  params: {
    userIds: Map<string, Id<"users">>
    pointOfSaleId: Id<"pointsOfSale">
    byCode: Map<string, Doc<"stations">>
  },
): Promise<{
  sales: number
  onlineBookings: number
  scans: number
  penalties: number
  incidents: number
}> {
  const { userIds, pointOfSaleId, byCode } = params
  const vendeurId = userIds.get("demo-guichet")!
  const controleurId = userIds.get("demo-controleur")!

  // Journée comptable et caisse ouvertes.
  const date = toServiceDate(Date.now())
  let day = await ctx.db
    .query("accountingDays")
    .withIndex("by_date", (q) => q.eq("date", date))
    .unique()
  if (!day) {
    const id = await ctx.db.insert("accountingDays", {
      date,
      status: "ouverte",
      openedAt: Date.now(),
      totalTtc: 0,
      totalReceived: 0,
    })
    day = await ctx.db.get(id)
  }

  const existingSession = await ctx.db
    .query("cashSessions")
    .withIndex("by_seller", (q) => q.eq("sellerId", vendeurId))
    .filter((q) => q.eq(q.field("status"), "ouverte"))
    .first()
  if (!existingSession) {
    await ctx.db.insert("cashSessions", {
      sellerId: vendeurId,
      pointOfSaleId,
      accountingDayId: day!._id,
      openedAt: Date.now(),
      openingFloatXaf: 50000,
      expectedByMethod: [],
      status: "ouverte",
    })
  }

  // Un incident et un procès-verbal, pour que les écrans terrain vivent.
  const trips = await ctx.db.query("trips").collect()
  const premiere = trips.sort(
    (a, b) => a.departureAt - b.departureAt,
  )[0]

  let penalties = 0
  let incidents = 0
  if (premiere) {
    const pvExistant = await ctx.db
      .query("procesVerbaux")
      .withIndex("by_client_id", (q) => q.eq("clientId", "demo-pv-1"))
      .unique()
    if (!pvExistant) {
      await ctx.db.insert("procesVerbaux", {
        number: "PV-000001",
        agentId: controleurId,
        tripId: premiere._id,
        offender: {
          lastName: "MOUSSAVOU",
          firstName: "Léon",
          declined: false,
          phone: "+241 06 77 88 99",
        },
        reason: "sans_titre",
        notes: "Voyageur monté à Ndjolé sans titre de transport.",
        amountXaf: 25000,
        status: "emis",
        issuedAt: Date.now() - 2 * 3_600_000,
        offline: true,
        clientId: "demo-pv-1",
      })
      penalties += 1
    }

    const incidentExistant = await ctx.db
      .query("incidents")
      .withIndex("by_client_id", (q) => q.eq("clientId", "demo-incident-1"))
      .unique()
    if (!incidentExistant) {
      await ctx.db.insert("incidents", {
        reporterId: controleurId,
        tripId: premiere._id,
        category: "technique",
        severity: "important",
        description:
          "Climatisation hors service en voiture 4, signalée par plusieurs voyageurs.",
        photoStorageIds: [],
        status: "ouvert",
        reportedAt: Date.now() - 3_600_000,
        offline: false,
        clientId: "demo-incident-1",
      })
      incidents += 1
    }
  }

  return { sales: 0, onlineBookings: 0, scans: 0, penalties, incidents }
}

/** Purge le jeu de démonstration, en conservant le référentiel. */
export const reset = internalMutation({
  args: {},
  handler: async (ctx) => {
    const tables = [
      "ticketScans",
      "procesVerbaux",
      "incidents",
      "manualTickets",
      "journalEntries",
      "payments",
      "tickets",
      "sales",
      "cashSessions",
      "accountingDays",
      "sequences",
      "seatOccupancy",
      "segmentCounters",
      "fareClassQuotas",
      "pricingRules",
      "tripStops",
      "trips",
      "bookletSchedules",
      "timetableBooklets",
      "notifications",
      "consents",
    ] as const

    const deleted: Record<string, number> = {}
    for (const table of tables) {
      const rows = await ctx.db.query(table).collect()
      for (const row of rows) await ctx.db.delete(row._id)
      if (rows.length > 0) deleted[table] = rows.length
    }

    // Comptes de démonstration uniquement.
    const users = await ctx.db.query("users").collect()
    let removedUsers = 0
    for (const u of users) {
      if (u.authId.startsWith("demo-")) {
        await ctx.db.delete(u._id)
        removedUsers += 1
      }
    }
    if (removedUsers > 0) deleted.users = removedUsers

    return deleted
  },
})
