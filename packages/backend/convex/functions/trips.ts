import { v } from "convex/values"
import {
  internalMutation,
  mutation,
  query,
  type QueryCtx,
} from "../_generated/server"
import type { Id } from "../_generated/dataModel"
import { audit, requirePermission } from "../lib/auth"
import { tripStatus } from "../schema"
import {
  addDays,
  fromServiceDate,
  isWithinSaleWindow,
  toServiceDate,
} from "../model/calendar"
import { segmentCountFor } from "../model/network"
import { availableForRange, segmentMask, isRangeFree } from "../model/inventory"
import {
  chargerTarification,
  devisDesserte,
  type Tarification,
} from "../lib/tripQuote"

/**
 * Dessertes — génération et consultation.
 *
 * Engendrer une desserte, c'est créer d'un seul tenant son horaire, ses
 * arrêts et TOUT son inventaire : une occupation par place et un compteur par
 * classe et par segment. Ces trois écritures sont indissociables — une
 * desserte sans inventaire serait vendable à l'infini.
 */

/**
 * Engendre une desserte à partir d'un horaire de livret et d'une date.
 *
 * Mutation interne : elle est planifiée par l'activation du livret, jamais
 * appelée depuis une interface. Idempotente — une desserte déjà engendrée
 * pour ce couple (horaire, date) n'est pas recréée, ce qui rend l'opération
 * rejouable après un incident.
 */
export const generateOne = internalMutation({
  args: {
    scheduleId: v.id("bookletSchedules"),
    serviceDate: v.string(),
  },
  handler: async (ctx, args) => {
    const schedule = await ctx.db.get(args.scheduleId)
    if (!schedule) throw new Error("Horaire de livret introuvable")

    const booklet = await ctx.db.get(schedule.bookletId)
    if (!booklet) throw new Error("Livret horaire introuvable")
    if (booklet.status !== "actif") {
      throw new Error(`Livret « ${booklet.status} » : génération refusée`)
    }

    // Idempotence : ne pas recréer une desserte déjà engendrée.
    const existing = await ctx.db
      .query("trips")
      .withIndex("by_train_date", (q) =>
        q.eq("trainId", schedule.trainId).eq("serviceDate", args.serviceDate)
      )
      .collect()
    const sameSchedule = existing.find((t) => t.scheduleId === args.scheduleId)
    if (sameSchedule) {
      return { created: false, tripId: sameSchedule._id }
    }

    const stops = [...schedule.stops].sort((a, b) => a.sequence - b.sequence)
    if (stops.length < 2) {
      throw new Error("Desserte invalide : au moins deux arrêts attendus")
    }
    const segmentCount = segmentCountFor(stops.length)

    const departureAt = fromServiceDate(
      args.serviceDate,
      schedule.departureTime
    )
    const lastStop = stops[stops.length - 1]!
    const arrivalOffset =
      lastStop.arrivalOffsetMinutes ?? lastStop.departureOffsetMinutes ?? 0
    const arrivalAt = departureAt + arrivalOffset * 60_000

    /* ── La desserte ──────────────────────────────────────────────────── */
    const tripId = await ctx.db.insert("trips", {
      bookletId: schedule.bookletId,
      scheduleId: args.scheduleId,
      trainId: schedule.trainId,
      trainNumber: schedule.trainNumber,
      trainType: schedule.trainType,
      serviceDate: args.serviceDate,
      departureAt,
      arrivalAt,
      originStationId: stops[0]!.stationId,
      destinationStationId: lastStop.stationId,
      status: "planifie",
      delayMinutes: 0,
      segmentCount,
      isOpenForSale: isWithinSaleWindow(
        args.serviceDate,
        toServiceDate(Date.now())
      ),
    })

    /* ── Les arrêts ───────────────────────────────────────────────────── */
    for (const stop of stops) {
      const station = await ctx.db.get(stop.stationId)
      if (!station) throw new Error("Gare introuvable dans la desserte")
      await ctx.db.insert("tripStops", {
        tripId,
        stationId: stop.stationId,
        sequence: stop.sequence,
        kilometerPoint: station.kilometerPoint,
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

    /* ── L'inventaire ─────────────────────────────────────────────────── */
    const coaches = await ctx.db
      .query("coaches")
      .withIndex("by_train", (q) => q.eq("trainId", schedule.trainId))
      .collect()
    if (coaches.length === 0) {
      throw new Error(
        `Train ${schedule.trainNumber} sans composition : inventaire ` +
          `impossible`
      )
    }

    let seatCount = 0
    const capacityByClass = new Map<string, number>()

    for (const coach of coaches) {
      const seats = await ctx.db
        .query("seats")
        .withIndex("by_coach", (q) => q.eq("coachId", coach._id))
        .collect()

      for (const seat of seats) {
        if (!seat.isActive) continue
        await ctx.db.insert("seatOccupancy", {
          tripId,
          seatId: seat._id,
          coachId: coach._id,
          serviceClass: coach.serviceClass,
          soldMask: 0,
          heldMask: 0,
          blockedMask: 0,
        })
        seatCount += 1
      }

      // Les places debout consomment de l'inventaire sans siège attribué.
      const total =
        seats.filter((s) => s.isActive).length + coach.standingCapacity
      capacityByClass.set(
        coach.serviceClass,
        (capacityByClass.get(coach.serviceClass) ?? 0) + total
      )
    }

    let counterCount = 0
    for (const [serviceClass, capacity] of capacityByClass) {
      for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex++) {
        await ctx.db.insert("segmentCounters", {
          tripId,
          serviceClass: serviceClass as "DEUXIEME" | "PREMIERE" | "VIP",
          segmentIndex,
          capacity,
          sold: 0,
          held: 0,
          reserved: 0,
          available: capacity,
        })
        counterCount += 1
      }
    }

    return {
      created: true,
      tripId,
      stops: stops.length,
      segments: segmentCount,
      seats: seatCount,
      counters: counterCount,
    }
  },
})

/**
 * Prochains départs ouverts à la vente depuis une gare d'origine.
 *
 * Cette requête alimente les raccourcis de la page d'accueil. Elle ne
 * fabrique aucun horaire : seules les dessertes réellement engendrées dans
 * le livret actif et encore ouvertes à la vente sont retournées.
 */
export const nextDepartures = query({
  args: {
    originCode: v.string(),
    limit: v.optional(v.number()),
    after: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 2
    if (!Number.isInteger(limit) || limit < 1 || limit > 8) {
      throw new Error(`Limite invalide : ${limit}`)
    }

    const origin = await ctx.db
      .query("stations")
      .withIndex("by_code", (q) => q.eq("code", args.originCode))
      .unique()
    if (!origin || !origin.isActive) return []

    const trips = await ctx.db
      .query("trips")
      .withIndex("by_origin_departure", (q) =>
        q
          .eq("originStationId", origin._id)
          .gte("departureAt", args.after ?? Date.now())
      )
      .filter((q) => q.eq(q.field("isOpenForSale"), true))
      .take(limit)

    return await Promise.all(
      trips.map(async (trip) => {
        const destination = await ctx.db.get(trip.destinationStationId)
        return {
          tripId: trip._id,
          trainNumber: trip.trainNumber,
          trainType: trip.trainType,
          serviceDate: trip.serviceDate,
          departureAt: trip.departureAt,
          arrivalAt: trip.arrivalAt,
          status: trip.status,
          delayMinutes: trip.delayMinutes,
          origin: {
            stationId: origin._id,
            code: origin.code,
            name: origin.name,
          },
          destination: destination
            ? {
                stationId: destination._id,
                code: destination.code,
                name: destination.name,
              }
            : null,
        }
      })
    )
  },
})

const CLASSES = ["DEUXIEME", "PREMIERE", "VIP"] as const
type Classe = (typeof CLASSES)[number]

/**
 * Dessertes d'un jour qui relient deux gares dans le bon sens, avec la
 * disponibilité par classe et, si la grille tarifaire est active, le prix.
 *
 * Le prix est celui du groupe cherché (`discountCodes` : une entrée par
 * voyageur, vide pour un adulte) : c'est ce que le voyageur paiera, pas un
 * « à partir de » théorique. Il reste indicatif — il est figé à la création
 * de la réservation.
 */
async function dessertesDuJour(
  ctx: QueryCtx,
  args: {
    originStationId: Id<"stations">
    destinationStationId: Id<"stations">
    serviceDate: string
    passengers: number
    discountCodes?: string[]
  },
  tarification: Tarification | null
) {
  const trips = await ctx.db
    .query("trips")
    .withIndex("by_service_date", (q) => q.eq("serviceDate", args.serviceDate))
    .collect()

  const results = []
  for (const trip of trips) {
    // L'annulation referme `isOpenForSale` (cf. `setStatus`), mais une
    // desserte supprimée doit malgré tout rester visible, marquée : c'est le
    // cas particulier que gère la boucle des prix ci-dessous.
    if (!trip.isOpenForSale && trip.status !== "annule") continue

    const stops = await ctx.db
      .query("tripStops")
      .withIndex("by_trip_sequence", (q) => q.eq("tripId", trip._id))
      .collect()
    const ordered = stops.sort((a, b) => a.sequence - b.sequence)

    const fromIndex = ordered.findIndex(
      (s) => s.stationId === args.originStationId
    )
    const toIndex = ordered.findIndex(
      (s) => s.stationId === args.destinationStationId
    )
    if (fromIndex === -1 || toIndex === -1 || toIndex <= fromIndex) continue

    const origin = ordered[fromIndex]!
    const destination = ordered[toIndex]!
    const distanceKm = Math.abs(
      destination.kilometerPoint - origin.kilometerPoint
    )

    const counters = await ctx.db
      .query("segmentCounters")
      .withIndex("by_trip_class", (q) => q.eq("tripId", trip._id))
      .collect()
    // Contingents lus une fois pour les trois classes, et seulement si l'on
    // chiffre : une desserte supprimée ou sans grille n'en a pas besoin.
    const quotas =
      tarification && trip.status !== "annule"
        ? await ctx.db
            .query("fareClassQuotas")
            .withIndex("by_trip_class", (q) => q.eq("tripId", trip._id))
            .collect()
        : []

    const availableByClass: Partial<Record<Classe, number>> = {}
    const prixParClasse: Partial<
      Record<Classe, { totalTtc: number; unitaireTtc: number }>
    > = {}
    for (const serviceClass of CLASSES) {
      const rows = counters
        .filter((c) => c.serviceClass === serviceClass)
        .sort((a, b) => a.segmentIndex - b.segmentIndex)
      if (rows.length === 0) continue
      availableByClass[serviceClass] = availableForRange(
        rows.map((r) => r.available),
        { fromIndex, toIndex }
      )
      // Une desserte supprimée garde ses horaires à l'écran, sans prix.
      if (!tarification || trip.status === "annule") continue
      try {
        const devis = await devisDesserte(
          ctx,
          tarification,
          {
            trip,
            distanceKm,
            fromIndex,
            toIndex,
            serviceClass,
            passengerCount: args.passengers,
            discountCodes: args.discountCodes,
          },
          "ligne",
          { counters, quotas }
        )
        prixParClasse[serviceClass] = {
          totalTtc: devis.totalTtc,
          unitaireTtc: devis.lines[0]?.unitPriceTtc ?? devis.totalTtc,
        }
      } catch {
        // Classe sans base tarifaire : elle reste affichée, sans prix.
      }
    }

    results.push({
      trip,
      fromIndex,
      toIndex,
      distanceKm,
      /** Arrêts desservis entre les deux gares, extrémités exclues. */
      intermediateStops: toIndex - fromIndex - 1,
      departureAt: origin.departureAt ?? trip.departureAt,
      arrivalAt: destination.arrivalAt ?? trip.arrivalAt,
      availableByClass,
      prixParClasse,
      hasAvailability:
        trip.status !== "annule" &&
        Object.values(availableByClass).some((n) => n >= args.passengers),
    })
  }

  return results.sort((a, b) => a.departureAt - b.departureAt)
}

async function tarificationOuRien(ctx: QueryCtx) {
  try {
    return await chargerTarification(ctx)
  } catch {
    return null
  }
}

/**
 * Au-delà, aucune rame ne transporte le groupe : la recherche n'a plus de
 * sens, et chiffrer un effectif arbitraire coûterait à chaque appel public.
 * Le guichet vend aussi aux groupes, d'où un plafond large.
 */
export const MAX_VOYAGEURS_RECHERCHE = 500

/**
 * Le calendrier des prix alimente la bande des jours du site, qui limite une
 * réservation à neuf voyageurs : il n'a pas à chiffrer davantage, sur trois
 * semaines au plus.
 */
export const MAX_VOYAGEURS_CALENDRIER = 9
export const MAX_JOURS_CALENDRIER = 21

function verifierVoyageurs(
  passengers: number,
  discountCodes: string[] | undefined,
  maximum: number
) {
  if (!Number.isInteger(passengers) || passengers < 1) {
    throw new Error(`Nombre de voyageurs invalide : ${passengers}`)
  }
  if (passengers > maximum) {
    throw new Error(
      `Nombre de voyageurs invalide : ${passengers} (au plus ${maximum})`
    )
  }
  if (discountCodes && discountCodes.length > passengers) {
    throw new Error("Plus de réductions que de voyageurs")
  }
}

/**
 * Recherche de dessertes pour un trajet et une date.
 *
 * La disponibilité est lue sur les compteurs dénormalisés, pas sur les
 * places : c'est le segment le plus chargé du parcours qui commande. Les
 * dessertes supprimées sont renvoyées, marquées : le voyageur doit savoir que
 * son train habituel ne circule pas, pas le voir disparaître.
 */
export const search = query({
  args: {
    originStationId: v.id("stations"),
    destinationStationId: v.id("stations"),
    serviceDate: v.string(),
    passengers: v.optional(v.number()),
    discountCodes: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const passengers = args.passengers ?? 1
    verifierVoyageurs(passengers, args.discountCodes, MAX_VOYAGEURS_RECHERCHE)
    return await dessertesDuJour(
      ctx,
      { ...args, passengers },
      await tarificationOuRien(ctx)
    )
  },
})

/**
 * Calendrier des prix : pour chaque jour, le nombre de trains qui ont encore
 * de la place et le prix le plus bas du groupe cherché.
 *
 * Alimente la bande des jours au-dessus des résultats. Un jour « complet » a
 * des trains, mais aucun avec assez de places ; un jour sans train n'en a pas.
 */
export const fareCalendar = query({
  args: {
    originStationId: v.id("stations"),
    destinationStationId: v.id("stations"),
    from: v.string(),
    days: v.number(),
    passengers: v.optional(v.number()),
    discountCodes: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const passengers = args.passengers ?? 1
    verifierVoyageurs(passengers, args.discountCodes, MAX_VOYAGEURS_CALENDRIER)
    if (
      !Number.isInteger(args.days) ||
      args.days < 1 ||
      args.days > MAX_JOURS_CALENDRIER
    ) {
      throw new Error(`Nombre de jours invalide : ${args.days}`)
    }
    const tarification = await tarificationOuRien(ctx)

    const jours = []
    for (let decalage = 0; decalage < args.days; decalage += 1) {
      const serviceDate = addDays(args.from, decalage)
      const dessertes = await dessertesDuJour(
        ctx,
        { ...args, serviceDate, passengers },
        tarification
      )
      const ouvertes = dessertes.filter((d) => d.hasAvailability)
      const prix = ouvertes.flatMap((d) =>
        CLASSES.filter(
          (c) => (d.availableByClass[c] ?? 0) >= passengers
        ).flatMap((c) => d.prixParClasse[c]?.totalTtc ?? [])
      )
      jours.push({
        serviceDate,
        trains: dessertes.filter((d) => d.trip.status !== "annule").length,
        trainsDisponibles: ouvertes.length,
        prixMinTtc: prix.length > 0 ? Math.min(...prix) : null,
        complet: dessertes.length > 0 && ouvertes.length === 0,
      })
    }
    return jours
  },
})

/** Détail d'une desserte : arrêts et disponibilité par classe. */
export const get = query({
  args: { tripId: v.id("trips") },
  handler: async (ctx, args) => {
    const trip = await ctx.db.get(args.tripId)
    if (!trip) throw new Error("Desserte introuvable")

    const stops = await ctx.db
      .query("tripStops")
      .withIndex("by_trip_sequence", (q) => q.eq("tripId", args.tripId))
      .collect()

    const counters = await ctx.db
      .query("segmentCounters")
      .withIndex("by_trip_class", (q) => q.eq("tripId", args.tripId))
      .collect()
    const hydratedStops = await Promise.all(
      stops.map(async (stop) => ({
        ...stop,
        station: await ctx.db.get(stop.stationId),
      }))
    )

    return {
      trip,
      stops: hydratedStops.sort((a, b) => a.sequence - b.sequence),
      counters: counters.sort(
        (a, b) =>
          a.serviceClass.localeCompare(b.serviceClass) ||
          a.segmentIndex - b.segmentIndex
      ),
    }
  },
})

/** Places libres d'une desserte sur un trajet donné, pour le plan de voiture. */
export const availableSeats = query({
  args: {
    tripId: v.id("trips"),
    fromIndex: v.number(),
    toIndex: v.number(),
    serviceClass: v.optional(
      v.union(v.literal("DEUXIEME"), v.literal("PREMIERE"), v.literal("VIP"))
    ),
  },
  handler: async (ctx, args) => {
    const trip = await ctx.db.get(args.tripId)
    if (!trip) throw new Error("Desserte introuvable")

    const request = segmentMask(
      { fromIndex: args.fromIndex, toIndex: args.toIndex },
      trip.segmentCount
    )

    const occupancy = await ctx.db
      .query("seatOccupancy")
      .withIndex("by_trip_class", (q) => q.eq("tripId", args.tripId))
      .collect()

    const filtered = args.serviceClass
      ? occupancy.filter((o) => o.serviceClass === args.serviceClass)
      : occupancy

    const coaches = await ctx.db
      .query("coaches")
      .withIndex("by_train", (q) => q.eq("trainId", trip.trainId))
      .collect()
    const coachById = new Map(coaches.map((coach) => [coach._id, coach]))
    const seats = []
    for (const row of filtered) {
      const seat = await ctx.db.get(row.seatId)
      if (!seat) continue
      const coach = coachById.get(row.coachId)
      if (!coach) continue
      const isBlocked = !isRangeFree(row.blockedMask, request)
      const isOccupied = !isRangeFree(row.soldMask | row.heldMask, request)
      seats.push({
        seatId: row.seatId,
        coachId: row.coachId,
        coachLabel: coach.label,
        coachPosition: coach.position,
        coachRowCount: coach.rowCount,
        coachColumnCount: coach.columnCount,
        label: seat.label,
        row: seat.row,
        column: seat.column,
        serviceClass: row.serviceClass,
        isBlocked,
        isOccupied,
        isFree: !isBlocked && !isOccupied,
      })
    }
    return seats.sort(
      (a, b) =>
        a.coachPosition - b.coachPosition ||
        a.row - b.row ||
        a.column - b.column
    )
  },
})

/** Déclare un retard, une annulation ou la fin d'une desserte. */
export const setStatus = mutation({
  args: {
    tripId: v.id("trips"),
    status: tripStatus,
    delayMinutes: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "livrets_horaires", "modifier")
    const trip = await ctx.db.get(args.tripId)
    if (!trip) throw new Error("Desserte introuvable")

    const delayMinutes = args.delayMinutes ?? trip.delayMinutes
    if (delayMinutes < 0) {
      throw new Error(`Retard invalide : ${delayMinutes} minutes`)
    }

    await ctx.db.patch(args.tripId, {
      status: args.status,
      delayMinutes,
      // Une desserte annulée ou terminée sort de la vente.
      isOpenForSale:
        args.status === "annule" || args.status === "termine"
          ? false
          : trip.isOpenForSale,
    })

    await audit(ctx, {
      actorId: actor._id,
      action: "desserte.statut",
      entityTable: "trips",
      entityId: args.tripId,
      before: { status: trip.status, delayMinutes: trip.delayMinutes },
      after: { status: args.status, delayMinutes },
    })
  },
})

/** Dessertes d'une journée, pour le tableau de bord et le contrôleur. */
export const listByDate = query({
  args: { serviceDate: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("trips")
      .withIndex("by_service_date", (q) => q.eq("serviceDate", args.serviceDate))
      .collect()
  },
})

/**
 * Ouvre à la vente les dessertes entrées dans la fenêtre glissante.
 * Appelée par un cron quotidien : la fenêtre avance d'un jour chaque jour.
 */
export const rollSaleWindow = internalMutation({
  args: { windowDays: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const today = toServiceDate(Date.now())
    const trips = await ctx.db
      .query("trips")
      .withIndex("by_status", (q) => q.eq("status", "planifie"))
      .collect()

    let opened = 0
    for (const trip of trips) {
      if (trip.isOpenForSale) continue
      if (isWithinSaleWindow(trip.serviceDate, today, args.windowDays)) {
        await ctx.db.patch(trip._id, { isOpenForSale: true })
        opened += 1
      }
    }
    return { opened }
  },
})
