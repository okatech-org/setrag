import { v } from "convex/values"
import { internalMutation } from "../_generated/server"
import { internal } from "../_generated/api"
import type { Doc, Id, DataModel } from "../_generated/dataModel"

/** Classes de service, telles que le schéma les définit. */
type ServiceClass = Doc<"segmentCounters">["serviceClass"]
import type { GenericMutationCtx } from "convex/server"
import { addDays, fromServiceDate, toServiceDate } from "../model/calendar"
import { segmentMask } from "../model/inventory"
import { computeTicketFare, type FareSchedule } from "../model/fares"

/**
 * Historique de ventes de démonstration.
 *
 * Sans lui, les écrans d'indicateurs s'affichent vides et donnent l'impression
 * d'être cassés — on ne met pas au point un tableau de bord sans données
 * dedans.
 *
 * Ce n'est PAS de la donnée client. Tout est fabriqué, mais calé sur les
 * ordres de grandeur publics de l'exploitation réelle :
 *
 *  — environ 250 000 voyageurs par an, avec un pic historique à 330 000 ;
 *  — quatre départs hebdomadaires par sens, deux Express et deux Omnibus ;
 *  — trains complets pendant les vacances scolaires, au point que la vente
 *    est parfois suspendue ;
 *  — trajet d'une dizaine d'heures entre Owendo et Franceville.
 *
 * Le tirage est DÉTERMINISTE, semé par la date : rejouer la génération
 * reproduit exactement les mêmes chiffres. Une démonstration dont les chiffres
 * changent à chaque rechargement n'inspire aucune confiance, et un écart
 * constaté ne serait pas reproductible.
 */

type Ctx = GenericMutationCtx<DataModel>

/** Marque tout ce qui est fabriqué, pour pouvoir le purger sans hésiter. */
export const HISTORY_PREFIX = "H"

/* ═══════════════════════════ Tirage déterministe ═══════════════════════ */

/**
 * Générateur pseudo-aléatoire semé (mulberry32).
 *
 * `Math.random` conviendrait pour l'apparence mais pas pour l'usage : une
 * mutation Convex peut être rejouée, et une donnée qui change d'un rejeu à
 * l'autre rendrait tout écart impossible à reproduire.
 */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
}

/** Sème un générateur à partir d'une date, pour un tirage reproductible. */
export function seedFromDate(date: string): number {
  let h = 2_166_136_261
  for (let i = 0; i < date.length; i += 1) {
    h ^= date.charCodeAt(i)
    h = Math.imul(h, 16_777_619)
  }
  return h >>> 0
}

/** Tire un élément selon des poids relatifs. */
export function weightedPick<T>(
  rng: () => number,
  entries: ReadonlyArray<readonly [T, number]>,
): T {
  const total = entries.reduce((t, [, w]) => t + w, 0)
  let r = rng() * total
  for (const [value, weight] of entries) {
    r -= weight
    if (r <= 0) return value
  }
  return entries[entries.length - 1]![0]
}

/* ══════════════════════════ Saisonnalité ═══════════════════════════════ */

/**
 * Coefficient de fréquentation selon la période.
 *
 * Les vacances scolaires gabonaises — juillet à septembre, et fin décembre —
 * saturent les trains, au point que SETRAG a déjà suspendu la vente de billets
 * en pleine période. Le reste de l'année tourne nettement plus bas.
 */
export function seasonalFactor(date: string): number {
  const mois = Number.parseInt(date.slice(5, 7), 10)
  const jour = Number.parseInt(date.slice(8, 10), 10)

  if (mois >= 7 && mois <= 9) return 1.45
  if (mois === 12 && jour >= 15) return 1.4
  if (mois === 1 && jour <= 10) return 1.35
  // Saison des pluies, creux de fréquentation.
  if (mois >= 3 && mois <= 5) return 0.75
  return 0.95
}

/** Taux de remplissage visé pour une desserte, borné à la capacité réelle. */
export function targetLoad(
  rng: () => number,
  date: string,
  trainType: string,
): number {
  const base = trainType === "EXPRESS" ? 0.72 : 0.6
  const saison = seasonalFactor(date)
  // ±12 % de dispersion : deux trains du même jour ne se remplissent pas
  // identiquement, et un taux figé se verrait immédiatement sur une courbe.
  const bruit = 0.88 + rng() * 0.24
  return Math.min(0.99, base * saison * bruit)
}

/* ═══════════════════════════ Répartitions ══════════════════════════════ */

/**
 * Répartition par canal.
 *
 * Le guichet domine largement : l'achat en ligne reste minoritaire au Gabon,
 * et c'est précisément ce que le projet cherche à faire évoluer. Un jeu de
 * démonstration qui montrerait 60 % de ventes en ligne décrirait un système
 * déjà arrivé à ses fins.
 */
const CHANNELS = [
  ["guichet", 56],
  ["ligne", 22],
  ["agence", 14],
  ["bord", 8],
] as const

/** Noms gabonais courants, pour que les listes ne soient pas des « Test 1 ». */
const NOMS = [
  "MBADINGA", "NZENG", "OBAME", "ONDO", "MOUSSAVOU", "BOUKANDOU", "NGUEMA",
  "MBOUMBA", "OYANE", "IVALA", "MOUELE", "BEKALE", "ELLA", "NDONG", "MINKO",
  "LEKOGO", "MAGANGA", "BOUSSOUGOU", "MABIKA", "NZAMBA",
]
const PRENOMS_H = [
  "Paul", "Jean", "Serge", "Landry", "Ulrich", "Steeve", "Franck", "Aristide",
  "Brice", "Rodrigue",
]
const PRENOMS_F = [
  "Marie", "Sylvie", "Chantal", "Nadège", "Prisca", "Ornella", "Bénédicte",
  "Laurianne", "Gaëlle", "Estelle",
]

function drawPassenger(rng: () => number) {
  const homme = rng() < 0.52
  const prénoms = homme ? PRENOMS_H : PRENOMS_F
  return {
    lastName: NOMS[Math.floor(rng() * NOMS.length)]!,
    firstName: prénoms[Math.floor(rng() * prénoms.length)]!,
    gender: homme ? ("M" as const) : ("F" as const),
  }
}

/* ══════════════════════════ Génération ═════════════════════════════════ */

/**
 * Amorce la génération de l'historique.
 *
 * Chaque journée est traitée par sa propre mutation : une seule transaction
 * couvrant trois mois de ventes dépasserait largement le budget d'exécution.
 * Les journées sont planifiées en cascade plutôt qu'en parallèle, pour ne pas
 * mettre le déploiement à genoux pendant la génération.
 */
export const generate = internalMutation({
  args: {
    /** Nombre de semaines d'historique. Douze par défaut, soit un trimestre. */
    weeks: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const semaines = Math.min(Math.max(args.weeks ?? 12, 1), 26)
    const aujourdhui = toServiceDate(Date.now())
    const début = addDays(aujourdhui, -semaines * 7)

    const schedules = await ctx.db.query("bookletSchedules").collect()
    if (schedules.length === 0) {
      throw new Error(
        "Aucun horaire en base : lancer d'abord le seed de démonstration.",
      )
    }

    // Une seule journée est planifiée ici ; chacune enchaîne sur la suivante.
    await ctx.scheduler.runAfter(0, internal.seeds.history.populateDay, {
      date: début,
      until: addDays(aujourdhui, -1),
    })

    return { from: début, to: addDays(aujourdhui, -1), weeks: semaines }
  },
})

/**
 * Remplit une journée, puis planifie la suivante.
 *
 * La cascade tient lieu de file d'attente : chaque journée s'exécute dans sa
 * propre transaction, et un incident sur l'une n'emporte pas les autres.
 */
export const populateDay = internalMutation({
  args: { date: v.string(), until: v.string() },
  handler: async (ctx, args) => {
    const rapport = await fillDay(ctx, args.date)

    if (args.date < args.until) {
      await ctx.scheduler.runAfter(0, internal.seeds.history.populateDay, {
        date: addDays(args.date, 1),
        until: args.until,
      })
    }
    return rapport
  },
})

async function fillDay(ctx: Ctx, date: string) {
  const rng = seededRandom(seedFromDate(date))
  const weekday = new Date(fromServiceDate(date, "12:00")).getUTCDay()

  const schedules = await ctx.db.query("bookletSchedules").collect()
  const duJour = schedules.filter(
    (s) => s.daysOfWeek.length === 0 || s.daysOfWeek.includes(weekday),
  )
  if (duJour.length === 0) {
    return { date, trips: 0, sales: 0, tickets: 0, skipped: "pas de circulation" }
  }

  // Journée comptable déjà close : l'historique n'est pas en cours de vente.
  const existante = await ctx.db
    .query("accountingDays")
    .withIndex("by_date", (q) => q.eq("date", date))
    .unique()
  if (existante) {
    return { date, trips: 0, sales: 0, tickets: 0, skipped: "journée déjà présente" }
  }

  const dayId = await ctx.db.insert("accountingDays", {
    date,
    status: "cloturee",
    openedAt: Date.parse(`${date}T05:00:00Z`),
    closedAt: Date.parse(`${date}T21:00:00Z`),
    totalTtc: 0,
    totalReceived: 0,
  })

  const [schedule] = await ctx.db.query("fareSchedules").collect()
  const bases = schedule
    ? await ctx.db
        .query("fareBases")
        .withIndex("by_schedule", (q) => q.eq("scheduleId", schedule._id))
        .collect()
    : []
  const grille: FareSchedule | null = schedule
    ? {
        taxes: { vatPct: schedule.vatPct, cssPct: schedule.cssPct },
        roundingBasis: schedule.roundingBasis,
        bases: bases.map((b) => ({
          trainType: b.trainType,
          serviceClass: b.serviceClass,
          shortDistanceRate: b.shortDistanceRate,
          longDistanceRate: b.longDistanceRate,
        })),
      }
    : null

  const pointsOfSale = await ctx.db.query("pointsOfSale").collect()

  let totalSales = 0
  let totalTickets = 0
  let totalTtc = 0
  let trips = 0

  for (const s of duJour) {
    const rapport = await ctx.runMutation(
      internal.functions.trips.generateOne,
      { scheduleId: s._id, serviceDate: date },
    )
    const tripId = rapport.tripId as Id<"trips">
    trips += 1

    const vendu = await sellOnTrip(ctx, {
      tripId,
      date,
      dayId,
      rng,
      grille,
      pointsOfSale,
    })
    totalSales += vendu.sales
    totalTickets += vendu.tickets
    totalTtc += vendu.ttc

    await ctx.runMutation(internal.functions.rollup.rollupTrip, { tripId })
  }

  await ctx.db.patch(dayId, { totalTtc, totalReceived: totalTtc })
  await ctx.runMutation(internal.functions.rollup.rollupAccountingDay, {
    accountingDayId: dayId,
  })

  return { date, trips, sales: totalSales, tickets: totalTickets, ttc: totalTtc }
}

/* ════════════════════════ Ventes d'une desserte ════════════════════════ */

async function sellOnTrip(
  ctx: Ctx,
  input: {
    tripId: Id<"trips">
    date: string
    dayId: Id<"accountingDays">
    rng: () => number
    grille: FareSchedule | null
    pointsOfSale: Doc<"pointsOfSale">[]
  },
) {
  const { rng } = input
  const trip = (await ctx.db.get(input.tripId))!

  const stops = (
    await ctx.db
      .query("tripStops")
      .withIndex("by_trip_sequence", (q) => q.eq("tripId", input.tripId))
      .collect()
  ).sort((a, b) => a.sequence - b.sequence)
  if (stops.length < 2) return { sales: 0, tickets: 0, ttc: 0 }

  const counters = await ctx.db
    .query("segmentCounters")
    .withIndex("by_trip_class", (q) => q.eq("tripId", input.tripId))
    .collect()

  const capacité = new Map<ServiceClass, number>()
  for (const c of counters) {
    capacité.set(c.serviceClass, Math.max(capacité.get(c.serviceClass) ?? 0, c.capacity))
  }

  const objectif = targetLoad(rng, input.date, trip.trainType)
  let sales = 0
  let tickets = 0
  let ttc = 0

  for (const [serviceClass, places] of capacité) {
    // Nombre de voyageurs visé pour cette classe. Le remplissage est un taux
    // en sièges-kilomètres ; on l'approche en vendant surtout des trajets
    // longs, ce qui correspond à l'usage réel de la ligne.
    const visé = Math.round(places * objectif)
    let vendus = 0
    let garde = 0

    while (vendus < visé && garde < visé * 3) {
      garde += 1

      // Trajets : deux tiers de bout en bout, le reste sur une portion.
      const boutEnBout = rng() < 0.62
      const from = boutEnBout ? 0 : Math.floor(rng() * (stops.length - 1))
      const to = boutEnBout
        ? stops.length - 1
        : from + 1 + Math.floor(rng() * (stops.length - 1 - from))

      const groupe = 1 + (rng() < 0.22 ? Math.floor(rng() * 3) : 0)
      const effectif = Math.min(groupe, visé - vendus)
      if (effectif <= 0) break

      const libre = await reserve(ctx, counters, serviceClass, {
        fromIndex: from,
        toIndex: to,
        segmentCount: trip.segmentCount,
        effectif,
      })
      if (!libre) continue

      const distance = Math.abs(
        stops[to]!.kilometerPoint - stops[from]!.kilometerPoint,
      )
      const prix = input.grille
        ? computeTicketFare({
            schedule: input.grille,
            trainType: trip.trainType,
            serviceClass,
            distanceKm: distance,
            discount: null,
          }).ttc
        : Math.round(distance * 45)

      const channel = weightedPick(rng, CHANNELS)
      const pos =
        channel === "ligne"
          ? undefined
          : input.pointsOfSale[
              Math.floor(rng() * Math.max(1, input.pointsOfSale.length))
            ]?._id

      sales += 1
      const montant = prix * effectif
      ttc += montant

      const saleId = await ctx.db.insert("sales", {
        number: `${HISTORY_PREFIX}-${input.date}-${sales}`,
        kind: "vente",
        product: "billet",
        channel,
        status: "confirmee",
        pointOfSaleId: pos,
        amounts: {
          ht: montant,
          vat: 0,
          css: 0,
          ttc: montant,
          received: montant,
        },
        accountingDayId: input.dayId,
        soldAt: Date.parse(`${input.date}T${8 + Math.floor(rng() * 10)}:00:00Z`),
      })

      for (let i = 0; i < effectif; i += 1) {
        await ctx.db.insert("tickets", {
          saleId,
          number: `${HISTORY_PREFIX}B-${input.date}-${tickets + 1}`,
          tripId: input.tripId,
          passenger: drawPassenger(rng),
          originStationId: stops[from]!.stationId,
          destinationStationId: stops[to]!.stationId,
          fromStopIndex: from,
          toStopIndex: to,
          serviceClass,
          isStanding: false,
          fare: {
            distanceKm: distance,
            chargeableKm: distance,
            ratePerKm: distance > 0 ? prix / distance : 0,
            discountPct: 0,
            appliedRules: [],
            roundingStep: 100,
          },
          unitPriceTtc: prix,
          // Les dessertes passées ont circulé : les titres ont été contrôlés.
          status: rng() < 0.94 ? "utilise" : "valide",
          duplicateCount: 0,
          usedAt: Date.parse(`${input.date}T12:00:00Z`),
        })
        tickets += 1
      }
      vendus += effectif

      // Quelques annulations, à un taux plausible pour du transport public.
      if (rng() < 0.03) {
        const remboursé = Math.round(montant * 0.9)
        await ctx.db.insert("sales", {
          number: `${HISTORY_PREFIX}A-${input.date}-${sales}`,
          kind: rng() < 0.6 ? "annulation" : "remboursement",
          product: "billet",
          channel,
          status: "annulee",
          pointOfSaleId: pos,
          amounts: {
            ht: -remboursé,
            vat: 0,
            css: 0,
            ttc: -remboursé,
            received: -remboursé,
          },
          accountingDayId: input.dayId,
          originSaleId: saleId,
          soldAt: Date.parse(`${input.date}T16:00:00Z`),
        })
        ttc -= remboursé
      }
    }
  }

  return { sales, tickets, ttc }
}

/**
 * Décrémente les compteurs de tronçon si la place existe.
 *
 * L'historique passe par les mêmes compteurs que la vente réelle : le taux de
 * remplissage affiché est donc calculé, pas décrété. Un jeu de démonstration
 * dont les indicateurs seraient écrits en dur ne prouverait rien du système.
 */
async function reserve(
  ctx: Ctx,
  counters: Doc<"segmentCounters">[],
  serviceClass: ServiceClass,
  trajet: {
    fromIndex: number
    toIndex: number
    segmentCount: number
    effectif: number
  },
): Promise<boolean> {
  const { effectif } = trajet
  const masque = segmentMask(trajet, trajet.segmentCount)
  const concernés = counters.filter(
    (c) =>
      c.serviceClass === serviceClass &&
      (masque & (1 << c.segmentIndex)) !== 0,
  )
  if (concernés.length === 0) return false
  if (concernés.some((c) => c.available < effectif)) return false

  for (const c of concernés) {
    const sold = c.sold + effectif
    const available = c.capacity - sold - c.held - c.reserved
    await ctx.db.patch(c._id, { sold, available })
    c.sold = sold
    c.available = available
  }
  return true
}

/* ══════════════════════════════ Purge ══════════════════════════════════ */

/** Retire l'historique fabriqué, en laissant le référentiel intact. */
export const purge = internalMutation({
  args: {},
  handler: async (ctx) => {
    const sales = await ctx.db.query("sales").collect()
    const fabriquées = sales.filter((s) =>
      s.number.startsWith(`${HISTORY_PREFIX}-`) ||
      s.number.startsWith(`${HISTORY_PREFIX}A-`),
    )

    let titres = 0
    for (const sale of fabriquées) {
      const tickets = await ctx.db
        .query("tickets")
        .withIndex("by_sale", (q) => q.eq("saleId", sale._id))
        .collect()
      for (const t of tickets) {
        await ctx.db.delete(t._id)
        titres += 1
      }
      await ctx.db.delete(sale._id)
    }

    for (const table of ["dailyMetrics", "tripMetrics"] as const) {
      for (const row of await ctx.db.query(table).collect()) {
        await ctx.db.delete(row._id)
      }
    }

    return { sales: fabriquées.length, tickets: titres }
  },
})
