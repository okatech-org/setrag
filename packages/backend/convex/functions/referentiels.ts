import { v } from "convex/values"

import { internal } from "../_generated/api"
import type { Doc, Id } from "../_generated/dataModel"
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server"
import { audit, requirePermission } from "../lib/auth"
import {
  applyTransition,
  assertValidityWindow,
  isEditable,
  periodsOverlap,
} from "../model/approval"
import {
  addDays,
  daysUntilDeparture,
  enumerateServiceDates,
  toLocalTime,
  toServiceDate,
  weekdayOf,
} from "../model/calendar"
import { computeTicketFare, type FareSchedule } from "../model/fares"
import { applyBlock, occupiedSegments, segmentMask } from "../model/inventory"
import { distanceBetween } from "../model/network"
import { occupancyRate, quotePrice, type PricingRule } from "../model/pricing"
import { MAX_COLUMNS, seatLabel } from "../model/seating"
import { normaliserTelephone } from "../model/telephone"
import { paymentMethod, serviceClass, trainType } from "../schema"
import {
  assertRoleGrantable,
  validatePricingRule,
  validRuleLabel,
  validateManagedUser,
} from "./administration"

/**
 * Référentiels, exploitation et supervision du portail de gestion.
 *
 * Ces fonctions servent les écrans « Livrets », « Trains », « Places »,
 * « Tarifs », « Yield », « Points de vente », « Voyageurs », « Incidents »
 * et « Utilisateurs ». Elles lisent ce que les écrans affichent, déjà mis en
 * forme pour la décision (noms des agents, chevauchements, écarts de barème),
 * et chaque écriture passe par `audit()` avec ses valeurs avant et après.
 *
 * Les rares simulations (annuaire Entra ID) le disent dans leur résultat et
 * dans leur trace d'audit : rien ne se fait passer pour un échange réel.
 */

type Ctx = QueryCtx | MutationCtx
type ServiceClass = Doc<"coaches">["serviceClass"]

const JOUR_MS = 86_400_000

/* ═══════════════════════════════ Outils communs ═══════════════════════════ */

export interface Personne {
  id: Id<"users">
  nom: string
  court: string
  matricule?: string
  role: Doc<"users">["role"]
}

export function nomComplet(user: Doc<"users">): string {
  return (
    `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() ||
    user.email ||
    user.matricule ||
    "Agent sans nom"
  )
}

/** « Clarisse Mba » → « C. Mba » : la forme des journaux et des tableaux. */
export function nomCourt(user: Doc<"users">): string {
  if (user.firstName && user.lastName) {
    return `${user.firstName.trim()[0]}. ${user.lastName.trim()}`
  }
  return nomComplet(user)
}

function versPersonne(user: Doc<"users"> | null): Personne | null {
  if (!user) return null
  return {
    id: user._id,
    nom: nomComplet(user),
    court: nomCourt(user),
    matricule: user.matricule,
    role: user.role,
  }
}

/** Lecture des agents avec mémoire : un tableau cite souvent le même auteur. */
function annuaire(ctx: Ctx) {
  const cache = new Map<string, Promise<Personne | null>>()
  return (id: Id<"users"> | undefined | null) => {
    if (!id) return Promise.resolve(null)
    const connu = cache.get(id)
    if (connu) return connu
    const lu = ctx.db.get(id).then(versPersonne)
    cache.set(id, lu)
    return lu
  }
}

export interface EvenementHistorique {
  id: Id<"auditLogs">
  action: string
  createdAt: number
  acteur: Personne | null
  reason?: string
  result?: string
  before?: string
  after?: string
  metadata?: string
}

/** Historique d'un dossier, tiré du journal d'audit, du plus récent au plus ancien. */
async function historique(
  ctx: Ctx,
  entites: readonly { table: string; id: string }[],
  limite = 60
): Promise<EvenementHistorique[]> {
  const personne = annuaire(ctx)
  const lots = await Promise.all(
    entites.map((entite) =>
      ctx.db
        .query("auditLogs")
        .withIndex("by_entity", (q) =>
          q.eq("entityTable", entite.table).eq("entityId", entite.id)
        )
        .order("desc")
        .take(limite)
    )
  )
  const logs = lots
    .flat()
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limite)
  return await Promise.all(
    logs.map(async (log) => ({
      id: log._id,
      action: log.action,
      createdAt: log.createdAt,
      acteur: await personne(log.actorId),
      reason: log.reason,
      result: log.result,
      before: log.before,
      after: log.after,
      metadata: log.metadata,
    }))
  )
}

async function gareDe(ctx: Ctx, id: Id<"stations"> | undefined) {
  if (!id) return null
  const station = await ctx.db.get(id)
  return station
    ? {
        id: station._id,
        code: station.code,
        name: station.name,
        kilometerPoint: station.kilometerPoint,
      }
    : null
}

/** Libellé court d'une desserte : « Express 201 · 2026-10-02 · Owendo → Franceville ». */
async function resumeDesserte(ctx: Ctx, trip: Doc<"trips"> | null) {
  if (!trip) return null
  const [origine, destination, train] = await Promise.all([
    gareDe(ctx, trip.originStationId),
    gareDe(ctx, trip.destinationStationId),
    ctx.db.get(trip.trainId),
  ])
  return {
    id: trip._id,
    trainId: trip.trainId,
    trainNumber: trip.trainNumber,
    trainName: train?.name ?? null,
    trainType: trip.trainType,
    serviceDate: trip.serviceDate,
    departureAt: trip.departureAt,
    arrivalAt: trip.arrivalAt,
    heureDepart: toLocalTime(trip.departureAt),
    heureArrivee: toLocalTime(trip.arrivalAt),
    origine,
    destination,
    status: trip.status,
    delayMinutes: trip.delayMinutes,
    isOpenForSale: trip.isOpenForSale,
    segmentCount: trip.segmentCount,
  }
}

async function arretsDe(ctx: Ctx, tripId: Id<"trips">) {
  const stops = await ctx.db
    .query("tripStops")
    .withIndex("by_trip_sequence", (q) => q.eq("tripId", tripId))
    .collect()
  stops.sort((a, b) => a.sequence - b.sequence)
  return await Promise.all(
    stops.map(async (stop) => ({
      sequence: stop.sequence,
      kilometerPoint: stop.kilometerPoint,
      station: await gareDe(ctx, stop.stationId),
      arrivalAt: stop.arrivalAt,
      departureAt: stop.departureAt,
    }))
  )
}

function minutesDepuis(heure: string) {
  const [h, m] = heure.split(":").map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

function heurePlus(heure: string, minutes: number) {
  const total = minutesDepuis(heure) + minutes
  const jours = Math.floor(total / 1440)
  const reste = ((total % 1440) + 1440) % 1440
  return {
    heure: `${String(Math.floor(reste / 60)).padStart(2, "0")}:${String(reste % 60).padStart(2, "0")}`,
    jours,
  }
}

function aujourdhui() {
  return toServiceDate(Date.now())
}

/* ═════════════════════════════════ Livrets ════════════════════════════════ */

function datesDeCirculation(
  booklet: Doc<"timetableBooklets">,
  schedule: Doc<"bookletSchedules">
) {
  try {
    return enumerateServiceDates(
      toServiceDate(booklet.validFrom),
      toServiceDate(booklet.validUntil),
      schedule.daysOfWeek
    )
  } catch {
    return []
  }
}

/** Livrets qui couvrent la même période et font foi ou vont faire foi. */
function chevauchementsDe(
  booklet: Doc<"timetableBooklets">,
  tous: readonly Doc<"timetableBooklets">[]
) {
  return tous
    .filter(
      (autre) =>
        autre._id !== booklet._id &&
        (autre.status === "actif" || autre.status === "a_valider") &&
        periodsOverlap(
          booklet.validFrom,
          booklet.validUntil,
          autre.validFrom,
          autre.validUntil
        )
    )
    .map((autre) => ({
      id: autre._id,
      label: autre.label,
      status: autre.status,
      debut: Math.max(booklet.validFrom, autre.validFrom),
      fin: Math.min(booklet.validUntil, autre.validUntil),
    }))
}

export const livrets = query({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, "livrets_horaires", "consulter")
    const personne = annuaire(ctx)
    const tous = await ctx.db.query("timetableBooklets").collect()
    tous.sort((a, b) => b.validFrom - a.validFrom)
    return await Promise.all(
      tous.map(async (booklet) => {
        const schedules = await ctx.db
          .query("bookletSchedules")
          .withIndex("by_booklet", (q) => q.eq("bookletId", booklet._id))
          .collect()
        const trains = [...new Set(schedules.map((s) => s.trainNumber))].sort(
          (a, b) => a.localeCompare(b, "fr", { numeric: true })
        )
        return {
          _id: booklet._id,
          label: booklet.label,
          description: booklet.description,
          status: booklet.status,
          validFrom: booklet.validFrom,
          validUntil: booklet.validUntil,
          horaires: schedules.length,
          trains,
          circulations: schedules.reduce(
            (total, schedule) =>
              total + datesDeCirculation(booklet, schedule).length,
            0
          ),
          chevauchements: chevauchementsDe(booklet, tous),
          creePar: await personne(booklet.createdBy),
          soumisPar: await personne(booklet.submittedBy),
          soumisLe: booklet.submittedAt ?? null,
          validePar: await personne(booklet.approvedBy),
          valideLe: booklet.approvedAt ?? null,
          rejectionReason: booklet.rejectionReason,
        }
      })
    )
  },
})

export const livret = query({
  args: { bookletId: v.id("timetableBooklets") },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "livrets_horaires", "consulter")
    const booklet = await ctx.db.get(args.bookletId)
    if (!booklet) return null
    const personne = annuaire(ctx)
    const tous = await ctx.db.query("timetableBooklets").collect()
    const schedules = await ctx.db
      .query("bookletSchedules")
      .withIndex("by_booklet", (q) => q.eq("bookletId", booklet._id))
      .collect()

    // Trains déjà au service d'un autre livret actif : les autres sont
    // signalés « nouveaux », comme l'Express 211 des fêtes.
    const autresActifs = tous.filter(
      (autre) => autre._id !== booklet._id && autre.status === "actif"
    )
    const trainsConnus = new Set<string>()
    for (const autre of autresActifs) {
      const horaires = await ctx.db
        .query("bookletSchedules")
        .withIndex("by_booklet", (q) => q.eq("bookletId", autre._id))
        .collect()
      for (const horaire of horaires) trainsConnus.add(horaire.trainNumber)
    }

    const circulations = await Promise.all(
      schedules.map(async (schedule) => {
        const [train, coaches, arrets] = await Promise.all([
          ctx.db.get(schedule.trainId),
          ctx.db
            .query("coaches")
            .withIndex("by_train", (q) => q.eq("trainId", schedule.trainId))
            .collect(),
          Promise.all(
            [...schedule.stops]
              .sort((a, b) => a.sequence - b.sequence)
              .map(async (stop) => {
                const arrivee =
                  stop.arrivalOffsetMinutes === undefined
                    ? null
                    : heurePlus(schedule.departureTime, stop.arrivalOffsetMinutes)
                const depart =
                  stop.departureOffsetMinutes === undefined
                    ? null
                    : heurePlus(
                        schedule.departureTime,
                        stop.departureOffsetMinutes
                      )
                return {
                  stationId: stop.stationId,
                  sequence: stop.sequence,
                  station: await gareDe(ctx, stop.stationId),
                  arrivalOffsetMinutes: stop.arrivalOffsetMinutes,
                  departureOffsetMinutes: stop.departureOffsetMinutes,
                  arrivee,
                  depart,
                }
              })
          ),
        ])
        const dernier = arrets[arrets.length - 1]
        const arrivee =
          dernier?.arrivee ??
          dernier?.depart ??
          heurePlus(schedule.departureTime, 0)
        return {
          _id: schedule._id,
          trainId: schedule.trainId,
          trainNumber: schedule.trainNumber,
          trainName: train?.name ?? null,
          trainType: schedule.trainType,
          departureTime: schedule.departureTime,
          daysOfWeek: schedule.daysOfWeek,
          stops: schedule.stops,
          arrets,
          heureArrivee: arrivee.heure,
          joursArrivee: arrivee.jours,
          voitures: coaches.length,
          places: coaches.reduce((total, coach) => total + coach.seatCount, 0),
          circulations: datesDeCirculation(booklet, schedule).length,
          nouveau: !trainsConnus.has(schedule.trainNumber),
        }
      })
    )
    circulations.sort((a, b) =>
      a.departureTime.localeCompare(b.departureTime) ||
      a.trainNumber.localeCompare(b.trainNumber, "fr", { numeric: true })
    )

    const dessertes = await ctx.db
      .query("trips")
      .withIndex("by_booklet", (q) => q.eq("bookletId", booklet._id))
      .collect()

    return {
      booklet,
      circulations,
      prevues: circulations.reduce((total, c) => total + c.circulations, 0),
      engendrees: dessertes.length,
      ouvertesALaVente: dessertes.filter((trip) => trip.isOpenForSale).length,
      chevauchements: chevauchementsDe(booklet, tous),
      creePar: await personne(booklet.createdBy),
      soumisPar: await personne(booklet.submittedBy),
      validePar: await personne(booklet.approvedBy),
      historique: await historique(ctx, [
        { table: "timetableBooklets", id: booklet._id },
        ...schedules.map((s) => ({ table: "bookletSchedules", id: s._id })),
      ]),
    }
  },
})

/**
 * Clôt un livret actif. Les dessertes déjà engendrées et les billets vendus
 * restent valables ; le livret n'ouvre simplement plus de nouvelle période.
 */
export const expirerLivret = mutation({
  args: { bookletId: v.id("timetableBooklets") },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "livrets_horaires", "valider")
    const booklet = await ctx.db.get(args.bookletId)
    if (!booklet) throw new Error("Livret horaire introuvable")
    const status = applyTransition(booklet.status, "expirer")
    await ctx.db.patch(booklet._id, { status })
    await audit(ctx, {
      actorId: actor._id,
      action: "livret.expirer",
      entityTable: "timetableBooklets",
      entityId: booklet._id,
      permission: "valider",
      before: { status: booklet.status },
      after: { status },
    })
    return status
  },
})

/* ══════════════════════════════ Trains et voitures ════════════════════════ */

function resumeComposition(coaches: readonly Doc<"coaches">[]) {
  const parClasse: Record<ServiceClass, number> = {
    VIP: 0,
    PREMIERE: 0,
    DEUXIEME: 0,
  }
  for (const coach of coaches) parClasse[coach.serviceClass] += coach.seatCount
  return {
    nbVoitures: coaches.length,
    placesAssises: coaches.reduce((t, c) => t + c.seatCount, 0),
    placesDebout: coaches.reduce((t, c) => t + c.standingCapacity, 0),
    parClasse,
  }
}

export const trains = query({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, "referentiel", "consulter")
    const tous = await ctx.db.query("trains").collect()
    const today = aujourdhui()
    const lignes = await Promise.all(
      tous.map(async (train) => {
        const [coaches, prochaine] = await Promise.all([
          ctx.db
            .query("coaches")
            .withIndex("by_train", (q) => q.eq("trainId", train._id))
            .collect(),
          ctx.db
            .query("trips")
            .withIndex("by_train_date", (q) =>
              q.eq("trainId", train._id).gte("serviceDate", today)
            )
            .first(),
        ])
        coaches.sort((a, b) => a.position - b.position)
        return {
          _id: train._id,
          number: train.number,
          name: train.name,
          description: train.description,
          type: train.type,
          isActive: train.isActive,
          composition: coaches.map((coach) => ({
            label: coach.label,
            serviceClass: coach.serviceClass,
            seatCount: coach.seatCount,
          })),
          ...resumeComposition(coaches),
          prochaineDesserte: prochaine
            ? await resumeDesserte(ctx, prochaine)
            : null,
        }
      })
    )
    return lignes.sort((a, b) =>
      a.number.localeCompare(b.number, "fr", { numeric: true })
    )
  },
})

export const train = query({
  args: { trainId: v.id("trains") },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "referentiel", "consulter")
    const train = await ctx.db.get(args.trainId)
    if (!train) return null
    const coaches = await ctx.db
      .query("coaches")
      .withIndex("by_train", (q) => q.eq("trainId", train._id))
      .collect()
    coaches.sort((a, b) => a.position - b.position)
    const voitures = await Promise.all(
      coaches.map(async (coach) => {
        const seats = await ctx.db
          .query("seats")
          .withIndex("by_coach", (q) => q.eq("coachId", coach._id))
          .collect()
        seats.sort((a, b) => a.row - b.row || a.column - b.column)
        return {
          ...coach,
          seats: seats.map((seat) => ({
            _id: seat._id,
            label: seat.label,
            row: seat.row,
            column: seat.column,
            isActive: seat.isActive,
            kind: seat.kind ?? "standard",
          })),
        }
      })
    )
    const today = aujourdhui()
    const [prochaines, premiere] = await Promise.all([
      ctx.db
        .query("trips")
        .withIndex("by_train_date", (q) =>
          q.eq("trainId", train._id).gte("serviceDate", today)
        )
        .take(6),
      ctx.db
        .query("trips")
        .withIndex("by_train_date", (q) => q.eq("trainId", train._id))
        .first(),
    ])
    return {
      train,
      voitures,
      ...resumeComposition(coaches),
      placesPmr: voitures.reduce(
        (total, voiture) =>
          total + voiture.seats.filter((seat) => seat.kind === "pmr").length,
        0
      ),
      pmr: voitures.flatMap((voiture) =>
        voiture.seats
          .filter((seat) => seat.kind === "pmr")
          .map((seat) => `${voiture.label} · ${seat.label}`)
      ),
      /** Un train déjà engagé a un inventaire : sa composition est verrouillée. */
      aDesDessertes: premiere !== null,
      prochainesDessertes: await Promise.all(
        prochaines.map((trip) => resumeDesserte(ctx, trip))
      ),
      historique: await historique(ctx, [
        { table: "trains", id: train._id },
        ...coaches.map((coach) => ({ table: "coaches", id: coach._id })),
      ]),
    }
  },
})

const TYPES_PLACE = ["standard", "pmr", "strapontin"] as const

export interface PlaceImportee {
  rangee: number
  colonne: number
  numero?: string
  type?: string
}

/**
 * Contrôle d'un plan de voiture importé : positions uniques et dans la
 * grille, numéros uniques, types connus. Retourne le plan normalisé.
 */
export function validerPlanImporte(places: readonly PlaceImportee[]) {
  if (places.length === 0) throw new Error("Le plan importé est vide.")
  if (places.length > 200) {
    throw new Error("Un plan de voiture ne peut pas dépasser 200 places.")
  }
  const positions = new Set<string>()
  const numeros = new Set<string>()
  const normalisees = places.map((place, index) => {
    const ligne = index + 2
    if (!Number.isInteger(place.rangee) || place.rangee < 1 || place.rangee > 60) {
      throw new Error(`Ligne ${ligne} : rangée invalide (${place.rangee}).`)
    }
    if (
      !Number.isInteger(place.colonne) ||
      place.colonne < 1 ||
      place.colonne > MAX_COLUMNS
    ) {
      throw new Error(`Ligne ${ligne} : colonne invalide (${place.colonne}).`)
    }
    const numero = (
      place.numero?.trim() || seatLabel(place.rangee, place.colonne)
    ).toUpperCase()
    if (!/^[0-9A-Z-]{1,8}$/.test(numero)) {
      throw new Error(`Ligne ${ligne} : numéro de place invalide (${numero}).`)
    }
    const position = `${place.rangee}:${place.colonne}`
    if (positions.has(position)) {
      throw new Error(
        `Ligne ${ligne} : deux places à la rangée ${place.rangee}, colonne ${place.colonne}.`
      )
    }
    if (numeros.has(numero)) {
      throw new Error(`Ligne ${ligne} : le numéro ${numero} est en double.`)
    }
    positions.add(position)
    numeros.add(numero)
    const type = (place.type?.trim().toLowerCase() || "standard") as
      | (typeof TYPES_PLACE)[number]
      | string
    if (!TYPES_PLACE.includes(type as (typeof TYPES_PLACE)[number])) {
      throw new Error(
        `Ligne ${ligne} : type « ${type} » inconnu (standard, pmr, strapontin).`
      )
    }
    return {
      row: place.rangee,
      column: place.colonne,
      label: numero,
      kind: type as (typeof TYPES_PLACE)[number],
    }
  })
  normalisees.sort((a, b) => a.row - b.row || a.column - b.column)
  return {
    places: normalisees,
    rowCount: Math.max(...normalisees.map((p) => p.row)),
    columnCount: Math.max(...normalisees.map((p) => p.column)),
  }
}

/**
 * Remplace le plan d'une voiture par un plan importé (CSV : rangée, colonne,
 * numéro, type). Refusé dès que la voiture a servi : réécrire les places d'une
 * desserte ouverte déplacerait des voyageurs.
 */
export const importerPlanVoiture = mutation({
  args: {
    coachId: v.id("coaches"),
    places: v.array(
      v.object({
        rangee: v.number(),
        colonne: v.number(),
        numero: v.optional(v.string()),
        type: v.optional(v.string()),
      })
    ),
    fichier: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "referentiel", "modifier")
    const coach = await ctx.db.get(args.coachId)
    if (!coach) throw new Error("Voiture introuvable")
    const plan = validerPlanImporte(args.places)

    const seats = await ctx.db
      .query("seats")
      .withIndex("by_coach", (q) => q.eq("coachId", coach._id))
      .collect()
    const dessertes = await ctx.db
      .query("trips")
      .withIndex("by_train_date", (q) => q.eq("trainId", coach.trainId))
      .take(1000)
    for (const trip of dessertes) {
      const occupation = await ctx.db
        .query("seatOccupancy")
        .withIndex("by_trip_coach", (q) =>
          q.eq("tripId", trip._id).eq("coachId", coach._id)
        )
        .first()
      if (occupation) {
        throw new Error(
          `Voiture engagée sur la desserte ${trip.trainNumber} du ${trip.serviceDate} : ` +
            "son plan ne peut plus être remplacé."
        )
      }
    }
    for (const seat of seats) {
      const [ticket, block] = await Promise.all([
        ctx.db
          .query("tickets")
          .withIndex("by_seat", (q) => q.eq("seatId", seat._id))
          .first(),
        ctx.db
          .query("seatBlocks")
          .withIndex("by_seat", (q) => q.eq("seatId", seat._id))
          .first(),
      ])
      if (ticket || block) {
        throw new Error(
          "Une place de cette voiture a déjà été vendue ou bloquée : import refusé."
        )
      }
    }

    for (const seat of seats) await ctx.db.delete(seat._id)
    for (const place of plan.places) {
      await ctx.db.insert("seats", {
        coachId: coach._id,
        trainId: coach.trainId,
        label: place.label,
        row: place.row,
        column: place.column,
        isActive: true,
        kind: place.kind,
      })
    }
    const after = {
      rowCount: plan.rowCount,
      columnCount: plan.columnCount,
      seatCount: plan.places.length,
    }
    await ctx.db.patch(coach._id, after)
    await audit(ctx, {
      actorId: actor._id,
      action: "referentiel.voiture.importer_plan",
      entityTable: "coaches",
      entityId: coach._id,
      permission: "modifier",
      before: {
        rowCount: coach.rowCount,
        columnCount: coach.columnCount,
        seatCount: coach.seatCount,
      },
      after: {
        ...after,
        pmr: plan.places.filter((p) => p.kind === "pmr").length,
        strapontins: plan.places.filter((p) => p.kind === "strapontin").length,
      },
      metadata: args.fichier ? { fichier: args.fichier } : undefined,
    })
    return after
  },
})

/* ═════════════════════════════ Dessertes (sélecteurs) ═════════════════════ */

const RESSOURCE_DESSERTES = {
  places: "places",
  yield: "yield",
  voyageurs: "donnees_voyageurs",
  incidents: "incidents",
} as const

/** Dessertes d'une journée, pour choisir la circulation à examiner. */
export const dessertes = query({
  args: {
    serviceDate: v.string(),
    pour: v.union(
      v.literal("places"),
      v.literal("yield"),
      v.literal("voyageurs"),
      v.literal("incidents")
    ),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, RESSOURCE_DESSERTES[args.pour], "consulter")
    if (!/^\d{4}-\d{2}-\d{2}$/.test(args.serviceDate)) return []
    const trips = await ctx.db
      .query("trips")
      .withIndex("by_service_date", (q) => q.eq("serviceDate", args.serviceDate))
      .collect()
    const resumes = await Promise.all(trips.map((trip) => resumeDesserte(ctx, trip)))
    return resumes
      .filter((resume) => resume !== null)
      .sort((a, b) => a.departureAt - b.departureAt)
  },
})

/* ═════════════════════════════ Places et quotas ═══════════════════════════ */

type EtatPlace = "vendue" | "tenue" | "bloquee" | "quota" | "libre"

export const occupation = query({
  args: { tripId: v.id("trips") },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "places", "consulter")
    const trip = await ctx.db.get(args.tripId)
    if (!trip) return null
    const personne = annuaire(ctx)

    const [coaches, seats, occupancies, blocks, quotas, arrets, counters] =
      await Promise.all([
        ctx.db
          .query("coaches")
          .withIndex("by_train", (q) => q.eq("trainId", trip.trainId))
          .collect(),
        ctx.db
          .query("seats")
          .withIndex("by_train", (q) => q.eq("trainId", trip.trainId))
          .collect(),
        ctx.db
          .query("seatOccupancy")
          .withIndex("by_trip_class", (q) => q.eq("tripId", trip._id))
          .collect(),
        ctx.db
          .query("seatBlocks")
          .withIndex("by_trip", (q) => q.eq("tripId", trip._id))
          .collect(),
        ctx.db
          .query("agencyQuotas")
          .withIndex("by_trip", (q) => q.eq("tripId", trip._id))
          .collect(),
        arretsDe(ctx, trip._id),
        ctx.db
          .query("segmentCounters")
          .withIndex("by_trip_class", (q) => q.eq("tripId", trip._id))
          .collect(),
      ])
    coaches.sort((a, b) => a.position - b.position)
    const occupationParPlace = new Map(occupancies.map((o) => [o.seatId, o]))
    const seatById = new Map(seats.map((seat) => [seat._id, seat]))
    const coachById = new Map(coaches.map((coach) => [coach._id, coach]))

    // Un quota réserve un NOMBRE de places d'une classe, pas des sièges
    // désignés : on le figure sur les dernières places libres de la classe.
    const reserveParClasse: Record<ServiceClass, number> = {
      VIP: 0,
      PREMIERE: 0,
      DEUXIEME: 0,
    }
    for (const quota of quotas) {
      if (quota.isActive) {
        reserveParClasse[quota.serviceClass] += Math.max(
          0,
          quota.allocated - quota.sold
        )
      }
    }

    const voitures = coaches.map((coach) => {
      const places = seats
        .filter((seat) => seat.coachId === coach._id)
        .sort((a, b) => a.row - b.row || a.column - b.column)
        .map((seat) => {
          const occ = occupationParPlace.get(seat._id)
          const etat: EtatPlace = !occ
            ? "libre"
            : occ.soldMask !== 0
              ? "vendue"
              : occ.blockedMask !== 0
                ? "bloquee"
                : occ.heldMask !== 0
                  ? "tenue"
                  : "libre"
          return {
            id: seat._id,
            label: seat.label,
            row: seat.row,
            column: seat.column,
            kind: seat.kind ?? "standard",
            etat: etat as EtatPlace,
          }
        })
      return {
        id: coach._id,
        label: coach.label,
        position: coach.position,
        serviceClass: coach.serviceClass,
        rowCount: coach.rowCount,
        columnCount: coach.columnCount,
        places,
      }
    })
    for (const classe of ["VIP", "PREMIERE", "DEUXIEME"] as const) {
      let reste = reserveParClasse[classe]
      for (const voiture of [...voitures].reverse()) {
        if (voiture.serviceClass !== classe) continue
        for (const place of [...voiture.places].reverse()) {
          if (reste <= 0) break
          if (place.etat === "libre") {
            place.etat = "quota"
            reste -= 1
          }
        }
      }
    }

    const totaux = { vendue: 0, tenue: 0, bloquee: 0, quota: 0, libre: 0 }
    for (const voiture of voitures) {
      for (const place of voiture.places) totaux[place.etat] += 1
    }

    const nomDeGare = (index: number) =>
      arrets.find((arret) => arret.sequence === index)?.station?.name ?? "?"
    const blocages = await Promise.all(
      blocks
        .sort((a, b) => b._creationTime - a._creationTime)
        .map(async (block) => {
          const seat = seatById.get(block.seatId)
          const coach = seat ? coachById.get(seat.coachId) : undefined
          const segments = occupiedSegments(block.mask, trip.segmentCount)
          const premier = segments[0] ?? 0
          const dernier = (segments[segments.length - 1] ?? 0) + 1
          return {
            id: block._id,
            place: `${coach?.label ?? "?"} · ${seat?.label ?? "?"}`,
            serviceClass: coach?.serviceClass ?? null,
            reason: block.reason,
            comment: block.comment,
            portion:
              premier === 0 && dernier === trip.segmentCount
                ? "Tout le parcours"
                : `${nomDeGare(premier)} → ${nomDeGare(dernier)}`,
            isActive: block.isActive,
            creePar: await personne(block.createdBy),
            creeLe: block._creationTime,
            liberePar: await personne(block.releasedBy),
            libereLe: block.releasedAt ?? null,
          }
        })
    )

    const quotasAgences = await Promise.all(
      quotas
        .sort((a, b) => b._creationTime - a._creationTime)
        .map(async (quota) => {
          const pos = await ctx.db.get(quota.pointOfSaleId)
          return {
            id: quota._id,
            pointOfSale: pos
              ? { id: pos._id, code: pos.code, name: pos.name }
              : null,
            serviceClass: quota.serviceClass,
            allocated: quota.allocated,
            sold: quota.sold,
            isActive: quota.isActive,
            releaseAt: quota.releaseAt ?? null,
            releaseNote: quota.releaseNote,
            creePar: await personne(quota.createdBy),
            creeLe: quota._creationTime,
            annulePar: await personne(quota.cancelledBy),
            annuleLe: quota.cancelledAt ?? null,
          }
        })
    )

    const agences = (await ctx.db.query("pointsOfSale").collect())
      .filter(
        (pos) =>
          pos.isActive &&
          (pos.type === "agence_accreditee" || pos.type === "agence_premium")
      )
      .map((pos) => ({ id: pos._id, code: pos.code, name: pos.name }))
      .sort((a, b) => a.code.localeCompare(b.code))

    const disponiblesParClasse: Record<ServiceClass, number | null> = {
      VIP: null,
      PREMIERE: null,
      DEUXIEME: null,
    }
    for (const counter of counters) {
      const actuel = disponiblesParClasse[counter.serviceClass]
      disponiblesParClasse[counter.serviceClass] =
        actuel === null ? counter.available : Math.min(actuel, counter.available)
    }

    return {
      desserte: await resumeDesserte(ctx, trip),
      arrets,
      voitures,
      totaux,
      capacite: seats.length,
      reserveParClasse,
      disponiblesParClasse,
      blocages,
      quotas: quotasAgences,
      agences,
    }
  },
})

async function compteursClasse(
  ctx: MutationCtx,
  tripId: Id<"trips">,
  classe: ServiceClass
) {
  const counters = await ctx.db
    .query("segmentCounters")
    .withIndex("by_trip_class", (q) =>
      q.eq("tripId", tripId).eq("serviceClass", classe)
    )
    .collect()
  return counters.sort((a, b) => a.segmentIndex - b.segmentIndex)
}

/** Retire une place de la vente, dans la même transaction que ses compteurs. */
async function bloquerUnePlace(
  ctx: MutationCtx,
  params: {
    actorId: Id<"users">
    trip: Doc<"trips">
    seatId: Id<"seats">
    mask: number
    fromStopIndex: number
    toStopIndex: number
    reason: Doc<"seatBlocks">["reason"]
    comment: string
  }
) {
  const { trip, seatId, mask } = params
  const seat = await ctx.db.get(seatId)
  if (!seat || seat.trainId !== trip.trainId) {
    throw new Error("Place introuvable dans la composition de cette desserte")
  }
  const occupancy = await ctx.db
    .query("seatOccupancy")
    .withIndex("by_trip_seat", (q) =>
      q.eq("tripId", trip._id).eq("seatId", seatId)
    )
    .unique()
  if (!occupancy) throw new Error(`Inventaire de la place ${seat.label} introuvable`)
  if ((occupancy.soldMask & mask) !== 0) {
    throw new Error(`La place ${seat.label} est déjà vendue sur une partie du trajet`)
  }
  if ((occupancy.heldMask & mask) !== 0) {
    throw new Error(`La place ${seat.label} fait déjà l'objet d'une réservation`)
  }
  if ((occupancy.blockedMask & mask) !== 0) {
    throw new Error(`La place ${seat.label} est déjà bloquée sur une partie du trajet`)
  }
  const segments = occupiedSegments(mask, trip.segmentCount)
  const counters = (await compteursClasse(ctx, trip._id, occupancy.serviceClass))
    .filter((counter) => segments.includes(counter.segmentIndex))
  if (counters.length !== segments.length) {
    throw new Error("Compteurs d'inventaire incomplets pour cette desserte")
  }
  for (const counter of counters) {
    if (counter.available <= 0) {
      throw new Error(
        `Aucune place disponible à retirer au segment ${counter.segmentIndex}`
      )
    }
  }
  await ctx.db.patch(occupancy._id, {
    blockedMask: applyBlock(occupancy.blockedMask, mask),
  })
  for (const counter of counters) {
    await ctx.db.patch(counter._id, {
      reserved: counter.reserved + 1,
      available: counter.available - 1,
    })
  }
  const blockId = await ctx.db.insert("seatBlocks", {
    tripId: trip._id,
    seatId,
    mask,
    reason: params.reason,
    comment: params.comment,
    createdBy: params.actorId,
    isActive: true,
  })
  await audit(ctx, {
    actorId: params.actorId,
    action: "place.bloquer",
    entityTable: "seatBlocks",
    entityId: blockId,
    permission: "creer",
    reason: params.comment,
    after: {
      tripId: trip._id,
      seatId,
      place: seat.label,
      fromStopIndex: params.fromStopIndex,
      toStopIndex: params.toStopIndex,
      reason: params.reason,
    },
  })
  return blockId
}

/**
 * Bloque une ou plusieurs places d'une desserte, toutes ou aucune : un
 * refus sur une place annule le lot entier, ce qui évite un blocage partiel.
 */
export const bloquerPlaces = mutation({
  args: {
    tripId: v.id("trips"),
    seatIds: v.array(v.id("seats")),
    fromStopIndex: v.number(),
    toStopIndex: v.number(),
    reason: v.union(
      v.literal("maintenance"),
      v.literal("exploitation"),
      v.literal("protocole"),
      v.literal("autre")
    ),
    comment: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "places", "creer")
    const trip = await ctx.db.get(args.tripId)
    if (!trip) throw new Error("Desserte introuvable")
    if (!trip.isOpenForSale) {
      throw new Error("Cette desserte n'est pas ouverte à la vente")
    }
    const comment = args.comment.trim()
    if (comment.length < 3) throw new Error("Le motif détaillé est obligatoire")
    const seatIds = [...new Set(args.seatIds)]
    if (seatIds.length === 0) throw new Error("Choisissez au moins une place")
    if (seatIds.length > 40) {
      throw new Error("Un blocage porte au plus sur 40 places à la fois")
    }
    const mask = segmentMask(
      { fromIndex: args.fromStopIndex, toIndex: args.toStopIndex },
      trip.segmentCount
    )
    const ids: Id<"seatBlocks">[] = []
    for (const seatId of seatIds) {
      ids.push(
        await bloquerUnePlace(ctx, {
          actorId: actor._id,
          trip,
          seatId,
          mask,
          fromStopIndex: args.fromStopIndex,
          toStopIndex: args.toStopIndex,
          reason: args.reason,
          comment,
        })
      )
    }
    return ids
  },
})

/** Rend à la vente générale les places non vendues d'un quota. */
async function libererQuota(
  ctx: MutationCtx,
  quota: Doc<"agencyQuotas">,
  params: { actorId?: Id<"users">; note: string; action: string }
) {
  const reste = Math.max(0, quota.allocated - quota.sold)
  if (reste > 0) {
    for (const counter of await compteursClasse(
      ctx,
      quota.tripId,
      quota.serviceClass
    )) {
      const reserved = Math.max(0, counter.reserved - reste)
      await ctx.db.patch(counter._id, {
        reserved,
        available: Math.max(
          0,
          counter.capacity - counter.sold - counter.held - reserved
        ),
      })
    }
  }
  await ctx.db.patch(quota._id, {
    isActive: false,
    cancelledBy: params.actorId,
    cancelledAt: Date.now(),
    releaseNote: params.note,
  })
  await audit(ctx, {
    actorId: params.actorId,
    action: params.action,
    entityTable: "agencyQuotas",
    entityId: quota._id,
    permission: params.actorId ? "supprimer" : undefined,
    reason: params.note,
    before: { isActive: true, allocated: quota.allocated, sold: quota.sold },
    after: { isActive: false, placesRendues: reste },
  })
  return reste
}

/**
 * Réserve un nombre de places d'une classe à une agence accréditée. Les
 * places sortent de la vente générale sur tout le parcours, dans la même
 * transaction que leurs compteurs ; à l'échéance, le reliquat y revient.
 */
export const creerQuotaAgence = mutation({
  args: {
    tripId: v.id("trips"),
    pointOfSaleId: v.id("pointsOfSale"),
    serviceClass,
    allocated: v.number(),
    releaseAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "quotas_agences", "creer")
    const [trip, pos] = await Promise.all([
      ctx.db.get(args.tripId),
      ctx.db.get(args.pointOfSaleId),
    ])
    if (!trip) throw new Error("Desserte introuvable")
    if (!trip.isOpenForSale) {
      throw new Error("Cette desserte n'est pas ouverte à la vente")
    }
    if (
      !pos ||
      (pos.type !== "agence_accreditee" && pos.type !== "agence_premium")
    ) {
      throw new Error("Un quota ne s'accorde qu'à une agence accréditée")
    }
    if (!pos.isActive) throw new Error(`L'agence ${pos.code} est suspendue`)
    if (!Number.isInteger(args.allocated) || args.allocated < 1 || args.allocated > 200) {
      throw new Error("Le quota doit être un nombre entier de places, de 1 à 200")
    }
    if (args.releaseAt !== undefined) {
      if (args.releaseAt <= Date.now()) {
        throw new Error("L'échéance du quota doit être dans le futur")
      }
      if (args.releaseAt >= trip.departureAt) {
        throw new Error("L'échéance du quota doit précéder le départ")
      }
    }
    const counters = await compteursClasse(ctx, trip._id, args.serviceClass)
    if (counters.length === 0) {
      throw new Error("Cette classe n'existe pas dans la composition du train")
    }
    const disponible = Math.min(...counters.map((c) => c.available))
    if (disponible < args.allocated) {
      throw new Error(
        `Seulement ${disponible} place(s) disponible(s) sur tout le parcours dans cette classe`
      )
    }
    for (const counter of counters) {
      await ctx.db.patch(counter._id, {
        reserved: counter.reserved + args.allocated,
        available: counter.available - args.allocated,
      })
    }
    const quotaId = await ctx.db.insert("agencyQuotas", {
      pointOfSaleId: pos._id,
      tripId: trip._id,
      serviceClass: args.serviceClass,
      allocated: args.allocated,
      sold: 0,
      isActive: true,
      createdBy: actor._id,
      releaseAt: args.releaseAt,
    })
    if (args.releaseAt !== undefined) {
      await ctx.scheduler.runAt(
        args.releaseAt,
        internal.functions.referentiels.libererQuotaEchu,
        { quotaId }
      )
    }
    await audit(ctx, {
      actorId: actor._id,
      action: "quota_agence.creer",
      entityTable: "agencyQuotas",
      entityId: quotaId,
      permission: "creer",
      after: {
        agence: pos.code,
        tripId: trip._id,
        serviceClass: args.serviceClass,
        allocated: args.allocated,
        releaseAt: args.releaseAt,
      },
    })
    return quotaId
  },
})

export const annulerQuotaAgence = mutation({
  args: { quotaId: v.id("agencyQuotas"), motif: v.string() },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "quotas_agences", "supprimer")
    const quota = await ctx.db.get(args.quotaId)
    if (!quota) throw new Error("Quota introuvable")
    if (!quota.isActive) throw new Error("Ce quota est déjà levé")
    const motif = args.motif.trim()
    if (motif.length < 3) throw new Error("Un motif est obligatoire")
    return await libererQuota(ctx, quota, {
      actorId: actor._id,
      note: motif,
      action: "quota_agence.annuler",
    })
  },
})

/** Échéance d'un quota : planifiée à sa création, rejouable sans effet. */
export const libererQuotaEchu = internalMutation({
  args: { quotaId: v.id("agencyQuotas") },
  handler: async (ctx, args) => {
    const quota = await ctx.db.get(args.quotaId)
    if (!quota || !quota.isActive) return 0
    return await libererQuota(ctx, quota, {
      note: "Échéance du quota atteinte : reliquat rendu à la vente générale",
      action: "quota_agence.liberer_echeance",
    })
  },
})

/**
 * Filet de sécurité de l'échéance : libère tout quota actif dont l'échéance
 * est passée. La libération planifiée à la création suffit d'ordinaire ; ce
 * balayage horaire couvre un quota posé sans planification (reprise de
 * données, import) ou une tâche perdue.
 */
export const libererQuotasEchus = internalMutation({
  args: {},
  handler: async (ctx) => {
    const maintenant = Date.now()
    const echus = (await ctx.db.query("agencyQuotas").collect()).filter(
      (quota) => quota.isActive && quota.releaseAt !== undefined && quota.releaseAt <= maintenant
    )
    let places = 0
    for (const quota of echus) {
      places += await libererQuota(ctx, quota, {
        note: "Échéance du quota atteinte : reliquat rendu à la vente générale",
        action: "quota_agence.liberer_echeance",
      })
    }
    return { quotas: echus.length, places }
  },
})

/* ═════════════════════════════════ Tarifs ═════════════════════════════════ */

type BaseTarif = Pick<
  Doc<"fareBases">,
  "trainType" | "serviceClass" | "shortDistanceRate" | "longDistanceRate"
>

/** Nombre de taux qui diffèrent d'un barème de référence. */
export function valeursModifiees(
  bases: readonly BaseTarif[],
  reference: readonly BaseTarif[] | null
) {
  if (!reference) return 0
  let modifiees = 0
  const cles = new Set([
    ...bases.map((b) => `${b.trainType}|${b.serviceClass}`),
    ...reference.map((b) => `${b.trainType}|${b.serviceClass}`),
  ])
  for (const cle of cles) {
    const a = bases.find((b) => `${b.trainType}|${b.serviceClass}` === cle)
    const b = reference.find((r) => `${r.trainType}|${r.serviceClass}` === cle)
    if (a?.shortDistanceRate !== b?.shortDistanceRate) modifiees += 1
    if (a?.longDistanceRate !== b?.longDistanceRate) modifiees += 1
  }
  return modifiees
}

async function basesDe(ctx: Ctx, scheduleId: Id<"fareSchedules">) {
  return await ctx.db
    .query("fareBases")
    .withIndex("by_schedule", (q) => q.eq("scheduleId", scheduleId))
    .collect()
}

/**
 * Barème de comparaison d'une grille : la grille active si ce n'en est pas
 * une autre, sinon la dernière grille approuvée avant elle.
 */
function referenceDe(
  schedule: Doc<"fareSchedules">,
  toutes: readonly Doc<"fareSchedules">[]
) {
  const active = toutes.find(
    (autre) => autre._id !== schedule._id && autre.status === "actif"
  )
  if (active) return active
  return (
    toutes
      .filter(
        (autre) =>
          autre._id !== schedule._id &&
          (autre.status === "expire" || autre.status === "actif") &&
          autre.validFrom < schedule.validFrom
      )
      .sort((a, b) => b.validFrom - a.validFrom)[0] ?? null
  )
}

export const grillesTarifaires = query({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, "tarifs", "consulter")
    const personne = annuaire(ctx)
    const toutes = await ctx.db.query("fareSchedules").collect()
    toutes.sort((a, b) => b.validFrom - a.validFrom)
    return await Promise.all(
      toutes.map(async (schedule) => {
        const reference = referenceDe(schedule, toutes)
        const [bases, basesReference, discounts] = await Promise.all([
          basesDe(ctx, schedule._id),
          reference ? basesDe(ctx, reference._id) : Promise.resolve(null),
          ctx.db
            .query("discounts")
            .withIndex("by_schedule", (q) => q.eq("scheduleId", schedule._id))
            .collect(),
        ])
        return {
          _id: schedule._id,
          label: schedule.label,
          status: schedule.status,
          validFrom: schedule.validFrom,
          validUntil: schedule.validUntil,
          vatPct: schedule.vatPct,
          cssPct: schedule.cssPct,
          bases: bases.length,
          reductions: discounts.length,
          types: [...new Set(bases.map((b) => b.trainType))],
          reference: reference ? { id: reference._id, label: reference.label } : null,
          modifiees: valeursModifiees(bases, basesReference),
          creePar: await personne(schedule.createdBy),
          soumisPar: await personne(schedule.submittedBy),
          soumisLe: schedule.submittedAt ?? null,
          approuvePar: await personne(schedule.approvedBy),
          approuveLe: schedule.approvedAt ?? null,
          rejectionReason: schedule.rejectionReason,
        }
      })
    )
  },
})

export const grilleTarifaire = query({
  args: { scheduleId: v.id("fareSchedules") },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "tarifs", "consulter")
    const schedule = await ctx.db.get(args.scheduleId)
    if (!schedule) return null
    const personne = annuaire(ctx)
    const toutes = await ctx.db.query("fareSchedules").collect()
    const reference = referenceDe(schedule, toutes)
    const [bases, basesReference, discounts] = await Promise.all([
      basesDe(ctx, schedule._id),
      reference ? basesDe(ctx, reference._id) : Promise.resolve([]),
      ctx.db
        .query("discounts")
        .withIndex("by_schedule", (q) => q.eq("scheduleId", schedule._id))
        .collect(),
    ])
    discounts.sort((a, b) => b.ratePct - a.ratePct || a.code.localeCompare(b.code))
    return {
      schedule,
      bases,
      reference: reference
        ? {
            id: reference._id,
            label: reference.label,
            status: reference.status,
            bases: basesReference,
          }
        : null,
      modifiees: reference ? valeursModifiees(bases, basesReference) : 0,
      discounts,
      creePar: await personne(schedule.createdBy),
      soumisPar: await personne(schedule.submittedBy),
      approuvePar: await personne(schedule.approvedBy),
      /** L'agent courant a rédigé ou soumis la grille : il ne l'approuve pas. */
      estAuteur:
        schedule.createdBy === actor._id || schedule.submittedBy === actor._id,
      historique: await historique(ctx, [
        { table: "fareSchedules", id: schedule._id },
        ...bases.map((base) => ({ table: "fareBases", id: base._id })),
        ...discounts.map((d) => ({ table: "discounts", id: d._id })),
      ]),
    }
  },
})

async function grilleModifiable(ctx: MutationCtx, scheduleId: Id<"fareSchedules">) {
  const schedule = await ctx.db.get(scheduleId)
  if (!schedule) throw new Error("Grille tarifaire introuvable")
  if (!isEditable(schedule.status)) {
    throw new Error(
      `Grille « ${schedule.status} » : elle n'est plus modifiable. ` +
        "Créez une nouvelle version pour la faire évoluer."
    )
  }
  return schedule
}

async function reprendreSiRejetee(ctx: MutationCtx, schedule: Doc<"fareSchedules">) {
  if (schedule.status === "rejete") {
    await ctx.db.patch(schedule._id, {
      status: applyTransition(schedule.status, "reprendre"),
      rejectionReason: undefined,
    })
  }
}

/**
 * Enregistre la grille kilométrique entière en une fois : les cellules
 * présentes sont créées ou mises à jour, les combinaisons absentes retirées.
 * Une seule trace d'audit porte le barème avant et après.
 */
export const enregistrerGrille = mutation({
  args: {
    scheduleId: v.id("fareSchedules"),
    bases: v.array(
      v.object({
        trainType,
        serviceClass,
        shortDistanceRate: v.number(),
        longDistanceRate: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "tarifs", "modifier")
    const schedule = await grilleModifiable(ctx, args.scheduleId)
    const vues = new Set<string>()
    for (const base of args.bases) {
      const cle = `${base.trainType}|${base.serviceClass}`
      if (vues.has(cle)) {
        throw new Error(`Base ${base.trainType} / ${base.serviceClass} en double`)
      }
      vues.add(cle)
      for (const taux of [base.shortDistanceRate, base.longDistanceRate]) {
        if (!Number.isFinite(taux) || taux <= 0 || taux > 1_000) {
          throw new Error(
            `Taux invalide pour ${base.trainType} / ${base.serviceClass} : ` +
              "il doit être compris entre 0 et 1 000 XAF/km"
          )
        }
      }
    }
    const existantes = await basesDe(ctx, schedule._id)
    const retirees = existantes.filter(
      (base) => !vues.has(`${base.trainType}|${base.serviceClass}`)
    )
    if (retirees.length > 0) {
      await requirePermission(ctx, "tarifs", "supprimer")
    }
    for (const base of retirees) await ctx.db.delete(base._id)
    for (const base of args.bases) {
      const valeurs = {
        scheduleId: schedule._id,
        trainType: base.trainType,
        serviceClass: base.serviceClass,
        shortDistanceRate: Math.round(base.shortDistanceRate * 100) / 100,
        longDistanceRate: Math.round(base.longDistanceRate * 100) / 100,
      }
      const existante = existantes.find(
        (e) => e.trainType === base.trainType && e.serviceClass === base.serviceClass
      )
      if (existante) {
        if (
          existante.shortDistanceRate !== valeurs.shortDistanceRate ||
          existante.longDistanceRate !== valeurs.longDistanceRate
        ) {
          await ctx.db.patch(existante._id, valeurs)
        }
      } else {
        await ctx.db.insert("fareBases", valeurs)
      }
    }
    await reprendreSiRejetee(ctx, schedule)
    const avant = existantes.map(({ trainType, serviceClass, shortDistanceRate, longDistanceRate }) => ({
      trainType,
      serviceClass,
      shortDistanceRate,
      longDistanceRate,
    }))
    const modifiees = valeursModifiees(args.bases, avant)
    await audit(ctx, {
      actorId: actor._id,
      action: "tarif.grille.bareme",
      entityTable: "fareSchedules",
      entityId: schedule._id,
      permission: "modifier",
      before: avant,
      after: args.bases,
      metadata: { valeursModifiees: modifiees, retirees: retirees.length },
    })
    return { modifiees }
  },
})

/** Crée une grille en brouillon, vierge ou copiée d'une version existante. */
export const creerGrille = mutation({
  args: {
    label: v.string(),
    validFrom: v.number(),
    validUntil: v.number(),
    roundingBasis: v.union(v.literal("HT"), v.literal("TTC")),
    vatPct: v.number(),
    cssPct: v.number(),
    copierDe: v.optional(v.id("fareSchedules")),
  },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "tarifs", "creer")
    const label = args.label.trim()
    if (!label) throw new Error("Le libellé est obligatoire")
    assertValidityWindow(args.validFrom, args.validUntil)
    if (args.vatPct < 0 || args.cssPct < 0 || args.vatPct > 100 || args.cssPct > 100) {
      throw new Error("Les taux fiscaux doivent être compris entre 0 et 100 %")
    }
    const source = args.copierDe ? await ctx.db.get(args.copierDe) : null
    if (args.copierDe && !source) throw new Error("Grille source introuvable")
    const scheduleId = await ctx.db.insert("fareSchedules", {
      label,
      status: "brouillon",
      validFrom: args.validFrom,
      validUntil: args.validUntil,
      roundingBasis: args.roundingBasis,
      vatPct: args.vatPct,
      cssPct: args.cssPct,
      createdBy: actor._id,
    })
    let bases = 0
    let reductions = 0
    if (source) {
      for (const base of await basesDe(ctx, source._id)) {
        await ctx.db.insert("fareBases", {
          scheduleId,
          trainType: base.trainType,
          serviceClass: base.serviceClass,
          shortDistanceRate: base.shortDistanceRate,
          longDistanceRate: base.longDistanceRate,
        })
        bases += 1
      }
      const discounts = await ctx.db
        .query("discounts")
        .withIndex("by_schedule", (q) => q.eq("scheduleId", source._id))
        .collect()
      for (const { _id, _creationTime, scheduleId: _ancien, ...discount } of discounts) {
        await ctx.db.insert("discounts", { ...discount, scheduleId })
        reductions += 1
      }
    }
    await audit(ctx, {
      actorId: actor._id,
      action: "tarif.grille.creer",
      entityTable: "fareSchedules",
      entityId: scheduleId,
      permission: "creer",
      after: { label, validFrom: args.validFrom, validUntil: args.validUntil, bases, reductions },
      metadata: source ? { copieDe: source._id, source: source.label } : undefined,
    })
    return scheduleId
  },
})

export const enregistrerReduction = mutation({
  args: {
    scheduleId: v.id("fareSchedules"),
    discountId: v.optional(v.id("discounts")),
    code: v.string(),
    label: v.string(),
    ratePct: v.number(),
    minAge: v.optional(v.number()),
    maxAge: v.optional(v.number()),
    minPassengers: v.optional(v.number()),
    maxPassengers: v.optional(v.number()),
    requiresProof: v.boolean(),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    const actor = await requirePermission(
      ctx,
      "tarifs",
      args.discountId ? "modifier" : "creer"
    )
    const schedule = await grilleModifiable(ctx, args.scheduleId)
    const code = args.code.trim().toUpperCase()
    if (!/^[A-Z][A-Z0-9_]{1,29}$/.test(code)) {
      throw new Error("Le code doit contenir 2 à 30 lettres, chiffres ou soulignés")
    }
    const label = args.label.trim()
    if (!label || label.length > 80) {
      throw new Error("Le libellé est obligatoire (80 caractères au plus)")
    }
    if (!Number.isFinite(args.ratePct) || args.ratePct < 0 || args.ratePct > 100) {
      throw new Error("La remise doit être comprise entre 0 et 100 %")
    }
    for (const [min, max, nom] of [
      [args.minAge, args.maxAge, "âge"],
      [args.minPassengers, args.maxPassengers, "effectif"],
    ] as const) {
      if (min !== undefined && (!Number.isInteger(min) || min < 0)) {
        throw new Error(`Borne d'${nom} invalide`)
      }
      if (max !== undefined && (!Number.isInteger(max) || max < 0)) {
        throw new Error(`Borne d'${nom} invalide`)
      }
      if (min !== undefined && max !== undefined && min > max) {
        throw new Error(`La borne minimale d'${nom} dépasse la borne maximale`)
      }
    }
    const doublon = await ctx.db
      .query("discounts")
      .withIndex("by_schedule_code", (q) => q.eq("scheduleId", schedule._id).eq("code", code))
      .first()
    if (doublon && doublon._id !== args.discountId) {
      throw new Error(`La réduction ${code} existe déjà dans cette grille`)
    }
    const valeurs = {
      scheduleId: schedule._id,
      code,
      label,
      ratePct: args.ratePct,
      minAge: args.minAge,
      maxAge: args.maxAge,
      minPassengers: args.minPassengers,
      maxPassengers: args.maxPassengers,
      requiresProof: args.requiresProof,
      isActive: args.isActive,
    }
    let id: Id<"discounts">
    let avant: Doc<"discounts"> | null = null
    if (args.discountId) {
      avant = await ctx.db.get(args.discountId)
      if (!avant || avant.scheduleId !== schedule._id) {
        throw new Error("Réduction introuvable dans cette grille")
      }
      await ctx.db.patch(avant._id, valeurs)
      id = avant._id
    } else {
      id = await ctx.db.insert("discounts", valeurs)
    }
    await reprendreSiRejetee(ctx, schedule)
    await audit(ctx, {
      actorId: actor._id,
      action: avant ? "tarif.reduction.modifier" : "tarif.reduction.creer",
      entityTable: "discounts",
      entityId: id,
      permission: avant ? "modifier" : "creer",
      before: avant ?? undefined,
      after: valeurs,
    })
    return id
  },
})

export const supprimerReduction = mutation({
  args: { discountId: v.id("discounts") },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "tarifs", "supprimer")
    const discount = await ctx.db.get(args.discountId)
    if (!discount) throw new Error("Réduction introuvable")
    const schedule = await grilleModifiable(ctx, discount.scheduleId)
    await ctx.db.delete(discount._id)
    await reprendreSiRejetee(ctx, schedule)
    await audit(ctx, {
      actorId: actor._id,
      action: "tarif.reduction.supprimer",
      entityTable: "discounts",
      entityId: discount._id,
      permission: "supprimer",
      before: discount,
    })
  },
})

function versRegle(rule: Doc<"pricingRules">): PricingRule {
  return {
    id: rule._id,
    type: rule.type,
    threshold: rule.threshold,
    modifierPct: rule.modifierPct,
    priority: rule.priority,
    validFrom: rule.validFrom,
    validUntil: rule.validUntil,
    code: rule.code,
    isActive: rule.isActive,
  }
}

/** Bornes de sécurité retenues par le moteur de vente (règle active la plus prioritaire). */
function bornesDe(rules: readonly Doc<"pricingRules">[]) {
  return rules
    .filter((rule) => rule.isActive && (rule.floorXaf !== undefined || rule.capXaf !== undefined))
    .sort((a, b) => a.priority - b.priority)[0]
}

function grilleModele(
  schedule: Doc<"fareSchedules">,
  bases: readonly Doc<"fareBases">[]
): FareSchedule {
  return {
    taxes: { vatPct: schedule.vatPct, cssPct: schedule.cssPct },
    roundingBasis: schedule.roundingBasis,
    bases: bases.map((base) => ({
      trainType: base.trainType,
      serviceClass: base.serviceClass,
      shortDistanceRate: base.shortDistanceRate,
      longDistanceRate: base.longDistanceRate,
    })),
  }
}

/**
 * Simulateur de prix : le même enchaînement que la vente (distance × barème,
 * réduction, taxes, arrondi réglementaire, yield, bornes), pour une grille
 * choisie — y compris un brouillon avant sa soumission.
 */
export const simulerPrix = query({
  args: {
    scheduleId: v.optional(v.id("fareSchedules")),
    originStationId: v.id("stations"),
    destinationStationId: v.id("stations"),
    trainType,
    serviceClass,
    discountCode: v.optional(v.string()),
    joursAvantDepart: v.number(),
    jourSemaine: v.number(),
    remplissagePct: v.number(),
    canal: v.union(v.literal("guichet"), v.literal("ligne")),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "tarifs", "consulter")
    const schedule = args.scheduleId
      ? await ctx.db.get(args.scheduleId)
      : await ctx.db
          .query("fareSchedules")
          .withIndex("by_status", (q) => q.eq("status", "actif"))
          .first()
    if (!schedule) {
      return { ok: false as const, message: "Aucune grille tarifaire active à simuler." }
    }
    const [origine, destination] = await Promise.all([
      ctx.db.get(args.originStationId),
      ctx.db.get(args.destinationStationId),
    ])
    if (!origine || !destination) {
      return { ok: false as const, message: "Gare inconnue." }
    }
    const distanceKm = distanceBetween(origine.kilometerPoint, destination.kilometerPoint)
    if (distanceKm <= 0) {
      return { ok: false as const, message: "Choisissez deux gares différentes." }
    }
    const [bases, discounts, rules] = await Promise.all([
      basesDe(ctx, schedule._id),
      ctx.db
        .query("discounts")
        .withIndex("by_schedule", (q) => q.eq("scheduleId", schedule._id))
        .collect(),
      ctx.db.query("pricingRules").collect(),
    ])
    const discount = args.discountCode
      ? discounts.find((d) => d.code === args.discountCode)
      : undefined
    let tarif
    try {
      tarif = computeTicketFare({
        schedule: grilleModele(schedule, bases),
        trainType: args.trainType,
        serviceClass: args.serviceClass,
        distanceKm,
        discount: discount
          ? { code: discount.code as never, ratePct: discount.ratePct, label: discount.label }
          : null,
      })
    } catch (cause) {
      return {
        ok: false as const,
        message: cause instanceof Error ? cause.message : "Simulation impossible.",
      }
    }
    const reseau = rules.filter(
      (rule) =>
        rule.tripId === undefined &&
        (rule.serviceClass === undefined || rule.serviceClass === args.serviceClass)
    )
    const bornes = bornesDe(rules)
    const now = Date.now()
    const contexte = {
      occupancyRate: occupancyRate(100, Math.max(0, Math.min(100, args.remplissagePct))),
      daysUntilDeparture: Math.max(0, Math.trunc(args.joursAvantDepart)),
      departureWeekday: Math.max(0, Math.min(6, Math.trunc(args.jourSemaine))),
      channel: args.canal,
      now,
    }
    const devis = quotePrice({
      basePriceTtc: tarif.ttc,
      distanceKm,
      seatsNeeded: 1,
      rules: reseau.map(versRegle),
      context: contexte,
      floorXaf: bornes?.floorXaf,
      capXaf: bornes?.capXaf,
    })
    const appliquees = devis.appliedRules
      .map((id) => rules.find((rule) => rule._id === id))
      .filter((rule): rule is Doc<"pricingRules"> => rule !== undefined)
    return {
      ok: true as const,
      grille: { id: schedule._id, label: schedule.label, status: schedule.status },
      origine: origine.name,
      destination: destination.name,
      distanceKm,
      chargeableKm: tarif.chargeableKm,
      ratePerKm: tarif.ratePerKm,
      brut: tarif.grossAmount,
      reduction: discount
        ? { code: discount.code, label: discount.label, ratePct: discount.ratePct, montant: tarif.discountAmount }
        : null,
      vatPct: schedule.vatPct,
      cssPct: schedule.cssPct,
      roundingBasis: tarif.roundingBasis,
      roundingStep: tarif.roundingStep,
      ht: tarif.ht,
      vat: tarif.vat,
      css: tarif.css,
      prixGrille: tarif.ttc,
      regles: appliquees.map((rule) => ({
        id: rule._id,
        code: rule.code ?? rule.type,
        label: rule.label ?? null,
        type: rule.type,
        modifierPct: rule.modifierPct,
      })),
      totalModifierPct: devis.totalModifierPct,
      bornes: bornes ? { floorXaf: bornes.floorXaf ?? null, capXaf: bornes.capXaf ?? null } : null,
      borne: devis.bounded,
      prixFinal: devis.unitPriceTtc,
    }
  },
})

/* ═════════════════════════════════ Yield ══════════════════════════════════ */

const typeRegle = v.union(
  v.literal("remplissage"),
  v.literal("anticipation"),
  v.literal("periode"),
  v.literal("canal"),
  v.literal("promotion")
)

export function etatRegle(rule: Pick<Doc<"pricingRules">, "isActive" | "validFrom" | "validUntil">, now: number) {
  if (!rule.isActive) return "suspendue" as const
  if (rule.validUntil !== undefined && rule.validUntil < now) return "echue" as const
  if (rule.validFrom !== undefined && rule.validFrom > now) return "programmee" as const
  return "active" as const
}

export const reglesYield = query({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, "yield", "consulter")
    const personne = annuaire(ctx)
    const now = Date.now()
    const rules = await ctx.db.query("pricingRules").collect()
    rules.sort((a, b) => a.priority - b.priority)
    return await Promise.all(
      rules.map(async (rule) => ({
        ...rule,
        etat: etatRegle(rule, now),
        desserte: rule.tripId ? await resumeDesserte(ctx, await ctx.db.get(rule.tripId)) : null,
        creePar: await personne(rule.createdBy),
      }))
    )
  },
})

export const regleYield = query({
  args: { ruleId: v.id("pricingRules") },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "yield", "consulter")
    const rule = await ctx.db.get(args.ruleId)
    if (!rule) return null
    const personne = annuaire(ctx)
    return {
      rule,
      etat: etatRegle(rule, Date.now()),
      desserte: rule.tripId ? await resumeDesserte(ctx, await ctx.db.get(rule.tripId)) : null,
      creePar: await personne(rule.createdBy),
      historique: await historique(ctx, [{ table: "pricingRules", id: rule._id }]),
    }
  },
})

export const creerRegleYield = mutation({
  args: {
    label: v.optional(v.string()),
    code: v.string(),
    scope: v.union(v.literal("reseau"), v.literal("ligne"), v.literal("desserte")),
    tripId: v.optional(v.id("trips")),
    serviceClass: v.optional(serviceClass),
    type: typeRegle,
    threshold: v.optional(v.number()),
    modifierPct: v.number(),
    priority: v.number(),
    validFrom: v.optional(v.number()),
    validUntil: v.optional(v.number()),
    floorXaf: v.optional(v.number()),
    capXaf: v.optional(v.number()),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "yield", "creer")
    const regle = await validatePricingRule(ctx, args)
    const doublon = (await ctx.db.query("pricingRules").collect()).find(
      (rule) => rule.code?.toUpperCase() === regle.code
    )
    if (doublon) throw new Error(`La règle ${regle.code} existe déjà.`)
    const valeurs = {
      ...regle,
      label: validRuleLabel(args.label),
      isActive: args.isActive,
      createdBy: actor._id,
    }
    const id = await ctx.db.insert("pricingRules", valeurs)
    await audit(ctx, {
      actorId: actor._id,
      action: "yield.regle.creer",
      entityTable: "pricingRules",
      entityId: id,
      permission: "creer",
      after: valeurs,
    })
    return id
  },
})

/**
 * Courbe du prix d'une desserte selon l'anticipation : le prix de la grille
 * active, puis les règles actives évaluées jour par jour, au remplissage
 * actuel de la classe. C'est le calcul de la vente, rejoué sur 60 jours.
 */
export const courbeYield = query({
  args: { tripId: v.id("trips"), serviceClass },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "yield", "consulter")
    const trip = await ctx.db.get(args.tripId)
    if (!trip) return null
    const desserte = await resumeDesserte(ctx, trip)
    const schedule = await ctx.db
      .query("fareSchedules")
      .withIndex("by_status", (q) => q.eq("status", "actif"))
      .first()
    const arrets = await arretsDe(ctx, trip._id)
    const premier = arrets[0]
    const dernier = arrets[arrets.length - 1]
    const distanceKm =
      premier && dernier ? Math.abs(dernier.kilometerPoint - premier.kilometerPoint) : 0
    const [counters, quotas, rules] = await Promise.all([
      ctx.db
        .query("segmentCounters")
        .withIndex("by_trip_class", (q) =>
          q.eq("tripId", trip._id).eq("serviceClass", args.serviceClass)
        )
        .collect(),
      ctx.db
        .query("fareClassQuotas")
        .withIndex("by_trip_class", (q) =>
          q.eq("tripId", trip._id).eq("serviceClass", args.serviceClass)
        )
        .collect(),
      ctx.db.query("pricingRules").collect(),
    ])
    const capacite = counters[0]?.capacity ?? 0
    const vendues = counters.length > 0 ? Math.max(...counters.map((c) => c.sold)) : 0
    const remplissage = occupancyRate(capacite, vendues)
    const base = { desserte, distanceKm, capacite, vendues, remplissage }
    if (!schedule || distanceKm <= 0 || capacite === 0) {
      return {
        ...base,
        etat: !schedule ? ("sans_grille" as const) : ("sans_inventaire" as const),
        prixGrille: null,
        points: [],
        aujourdhui: null,
        quotas: [],
        reglesSuspendues: 0,
      }
    }
    let prixGrille: number
    try {
      prixGrille = computeTicketFare({
        schedule: grilleModele(schedule, await basesDe(ctx, schedule._id)),
        trainType: trip.trainType,
        serviceClass: args.serviceClass,
        distanceKm,
      }).ttc
    } catch {
      return {
        ...base,
        etat: "sans_base" as const,
        prixGrille: null,
        points: [],
        aujourdhui: null,
        quotas: [],
        reglesSuspendues: 0,
      }
    }
    const portee = rules.filter(
      (rule) =>
        (rule.tripId === undefined || rule.tripId === trip._id) &&
        (rule.serviceClass === undefined || rule.serviceClass === args.serviceClass)
    )
    const actives = portee.filter((rule) => rule.isActive)
    const bornes = bornesDe(rules)
    const quotaInputs = quotas.map((quota) => ({
      label: quota.label,
      priority: quota.priority,
      seatCount: quota.seatCount,
      soldCount: quota.soldCount,
      coefficient: quota.coefficient,
      isActive: quota.isActive,
    }))
    const semaine = weekdayOf(trip.serviceDate)
    const points = []
    for (let jours = 60; jours >= 0; jours -= 1) {
      const devis = quotePrice({
        basePriceTtc: prixGrille,
        distanceKm,
        quotas: quotaInputs,
        seatsNeeded: 1,
        rules: actives.map(versRegle),
        context: {
          occupancyRate: remplissage,
          daysUntilDeparture: jours,
          departureWeekday: semaine,
          channel: "guichet",
          now: trip.departureAt - jours * JOUR_MS,
        },
        floorXaf: bornes?.floorXaf,
        capXaf: bornes?.capXaf,
      })
      points.push({
        jours,
        prix: devis.unitPriceTtc,
        modificateurPct: devis.totalModifierPct,
        regles: devis.appliedRules.map(
          (id) => {
            const rule = actives.find((r) => r._id === id)
            return rule?.label ?? rule?.code ?? rule?.type ?? "règle"
          }
        ),
        borne: devis.bounded,
      })
    }
    const joursRestants = daysUntilDeparture(trip.departureAt, Date.now())
    const courant = points.find((point) => point.jours === Math.max(0, Math.min(60, joursRestants)))
    return {
      ...base,
      etat: "ok" as const,
      prixGrille,
      points,
      aujourdhui:
        joursRestants >= 0 && courant
          ? { jours: joursRestants, prix: courant.prix, regles: courant.regles }
          : null,
      quotas: quotas
        .sort((a, b) => a.priority - b.priority)
        .map((quota) => ({
          id: quota._id,
          label: quota.label,
          seatCount: quota.seatCount,
          soldCount: quota.soldCount,
          coefficient: quota.coefficient,
          isActive: quota.isActive,
        })),
      reglesSuspendues: portee.length - actives.length,
    }
  },
})

async function periodeIndicateurs(ctx: QueryCtx, depuis: string, jusqua: string) {
  const metrics = await ctx.db
    .query("tripMetrics")
    .withIndex("by_service_date", (q) =>
      q.gte("serviceDate", depuis).lte("serviceDate", jusqua)
    )
    .take(3000)
  let recette = 0
  let offerts = 0
  let vendus = 0
  let sieges = 0
  const dessertes = new Set<string>()
  for (const metric of metrics) {
    recette += metric.revenueTtc
    offerts += metric.seatKmOffered
    vendus += metric.seatKmSold
    dessertes.add(metric.tripId)
    const compteur = await ctx.db
      .query("segmentCounters")
      .withIndex("by_trip_class_segment", (q) =>
        q.eq("tripId", metric.tripId).eq("serviceClass", metric.serviceClass).eq("segmentIndex", 0)
      )
      .first()
    sieges += compteur?.capacity ?? 0
  }
  return {
    recette,
    dessertes: dessertes.size,
    remplissage: offerts > 0 ? vendus / offerts : null,
    recetteParSiege: sieges > 0 ? Math.round(recette / sieges) : null,
    recetteParDesserte: dessertes.size > 0 ? Math.round(recette / dessertes.size) : null,
  }
}

/** Indicateurs de pilotage du yield sur 30 jours glissants, comparés aux 30 précédents. */
export const indicateursYield = query({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, "yield", "consulter")
    const today = aujourdhui()
    const [courant, precedent, rules] = await Promise.all([
      periodeIndicateurs(ctx, addDays(today, -29), today),
      periodeIndicateurs(ctx, addDays(today, -59), addDays(today, -30)),
      ctx.db.query("pricingRules").collect(),
    ])
    const now = Date.now()
    // Même règle que le tableau de bord : une période de référence qui porte
    // sur beaucoup moins de dessertes (historique incomplet) n'est pas
    // comparable, et aucune évolution n'en est tirée.
    const comparable = precedent.dessertes >= Math.max(1, Math.ceil(courant.dessertes * 0.8))
    return {
      courant,
      precedent: comparable
        ? precedent
        : { ...precedent, remplissage: null, recetteParSiege: null, recetteParDesserte: null },
      comparable,
      reglesActives: rules.filter((rule) => etatRegle(rule, now) === "active").length,
      reglesTotal: rules.length,
    }
  },
})

/* ════════════════════════════════ Points de vente ═════════════════════════ */

function premierDuMois() {
  return `${aujourdhui().slice(0, 8)}01`
}

export const pointsDeVente = query({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, "referentiel", "consulter")
    const [points, stations, sessionsOuvertes, metrics, quotas, users] = await Promise.all([
      ctx.db.query("pointsOfSale").collect(),
      ctx.db.query("stations").collect(),
      ctx.db
        .query("cashSessions")
        .withIndex("by_status", (q) => q.eq("status", "ouverte"))
        .collect(),
      ctx.db
        .query("dailyMetrics")
        .withIndex("by_date", (q) => q.gte("date", premierDuMois()).lte("date", aujourdhui()))
        .collect(),
      ctx.db.query("agencyQuotas").collect(),
      ctx.db.query("users").collect(),
    ])
    const stationById = new Map(stations.map((s) => [s._id, s]))
    const recette = new Map<string, number>()
    let recetteEnLigne = 0
    for (const metric of metrics) {
      const net = metric.grossTtc - metric.refundedTtc
      if (metric.pointOfSaleId) {
        recette.set(metric.pointOfSaleId, (recette.get(metric.pointOfSaleId) ?? 0) + net)
      } else if (metric.channel === "ligne") {
        recetteEnLigne += net
      }
    }
    const lignes = points.map((pos) => {
      const station = pos.stationId ? stationById.get(pos.stationId) : undefined
      const quotasActifs = quotas.filter((q) => q.pointOfSaleId === pos._id && q.isActive)
      return {
        _id: pos._id,
        code: pos.code,
        name: pos.name,
        type: pos.type,
        isActive: pos.isActive,
        royaltyPct: pos.royaltyPct ?? null,
        station: station
          ? { code: station.code, name: station.name, kilometerPoint: station.kilometerPoint }
          : null,
        postes: pos.counters.passengers + pos.counters.baggage + pos.counters.parcels,
        counters: pos.counters,
        caissesOuvertes: sessionsOuvertes.filter((s) => s.pointOfSaleId === pos._id).length,
        vendeurs: users.filter((u) => u.pointOfSaleId === pos._id && u.isActive).length,
        recetteMois: recette.get(pos._id) ?? 0,
        quotasActifs: quotasActifs.length,
        placesEnQuota: quotasActifs.reduce((t, q) => t + Math.max(0, q.allocated - q.sold), 0),
      }
    })
    lignes.sort((a, b) =>
      (a.station?.kilometerPoint ?? 10_000) - (b.station?.kilometerPoint ?? 10_000) ||
      a.code.localeCompare(b.code)
    )
    return {
      lignes,
      gares: stations.length,
      garesEquipees: stations.filter((s) => s.isEquipped && s.isActive).length,
      postes: lignes.reduce((t, l) => t + (l.isActive ? l.postes : 0), 0),
      postesParProduit: points.reduce(
        (t, p) => ({
          passengers: t.passengers + p.counters.passengers,
          baggage: t.baggage + p.counters.baggage,
          parcels: t.parcels + p.counters.parcels,
        }),
        { passengers: 0, baggage: 0, parcels: 0 }
      ),
      caissesOuvertes: sessionsOuvertes.length,
      agences: points.filter(
        (p) => p.isActive && (p.type === "agence_accreditee" || p.type === "agence_premium")
      ).length,
      recetteEnLigne,
      mois: premierDuMois(),
    }
  },
})

export const pointDeVente = query({
  args: { pointOfSaleId: v.id("pointsOfSale") },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "referentiel", "consulter")
    const pos = await ctx.db.get(args.pointOfSaleId)
    if (!pos) return null
    const personne = annuaire(ctx)
    const debut = addDays(aujourdhui(), -29)
    const [station, users, sessions, quotas, metrics] = await Promise.all([
      pos.stationId ? ctx.db.get(pos.stationId) : null,
      ctx.db
        .query("users")
        .withIndex("by_pointOfSale", (q) => q.eq("pointOfSaleId", pos._id))
        .collect(),
      ctx.db
        .query("cashSessions")
        .withIndex("by_pos_day", (q) => q.eq("pointOfSaleId", pos._id))
        .collect(),
      ctx.db
        .query("agencyQuotas")
        .withIndex("by_pos_trip", (q) => q.eq("pointOfSaleId", pos._id))
        .collect(),
      ctx.db
        .query("dailyMetrics")
        .withIndex("by_date", (q) => q.gte("date", debut).lte("date", aujourdhui()))
        .collect(),
    ])
    const parJour = new Map<string, { net: number; billets: number }>()
    for (const metric of metrics) {
      if (metric.pointOfSaleId !== pos._id) continue
      const jour = parJour.get(metric.date) ?? { net: 0, billets: 0 }
      jour.net += metric.grossTtc - metric.refundedTtc
      jour.billets += metric.ticketCount
      parJour.set(metric.date, jour)
    }
    const serie = [...parJour.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, valeurs]) => ({ date, ...valeurs }))
    sessions.sort((a, b) => b.openedAt - a.openedAt)
    const ouvertes = sessions.filter((s) => s.status === "ouverte")
    return {
      pointOfSale: pos,
      station: station
        ? { id: station._id, code: station.code, name: station.name, kilometerPoint: station.kilometerPoint }
        : null,
      vendeurs: users
        .sort((a, b) => nomComplet(a).localeCompare(nomComplet(b), "fr"))
        .map((user) => ({
          id: user._id,
          nom: nomComplet(user),
          matricule: user.matricule,
          role: user.role,
          isActive: user.isActive,
          lastSeenAt: user.lastSeenAt ?? null,
          caisseOuverte: ouvertes.some((s) => s.sellerId === user._id),
        })),
      caisses: await Promise.all(
        sessions.slice(0, 12).map(async (session) => ({
          id: session._id,
          vendeur: await personne(session.sellerId),
          status: session.status,
          openedAt: session.openedAt,
          closedAt: session.closedAt ?? null,
          openingFloatXaf: session.openingFloatXaf,
          varianceXaf: session.varianceXaf ?? null,
          varianceReason: session.varianceReason,
        }))
      ),
      caissesOuvertes: ouvertes.length,
      recette30j: serie.reduce((t, j) => t + j.net, 0),
      billets30j: serie.reduce((t, j) => t + j.billets, 0),
      serie,
      quotas: await Promise.all(
        quotas
          .filter((quota) => quota.isActive)
          .map(async (quota) => ({
            id: quota._id,
            desserte: await resumeDesserte(ctx, await ctx.db.get(quota.tripId)),
            serviceClass: quota.serviceClass,
            allocated: quota.allocated,
            sold: quota.sold,
            releaseAt: quota.releaseAt ?? null,
          }))
      ),
      dependances: {
        agents: users.length,
        agentsActifs: users.filter((u) => u.isActive).length,
        caissesOuvertes: ouvertes.length,
        quotasActifs: quotas.filter((q) => q.isActive).length,
      },
      historique: await historique(ctx, [{ table: "pointsOfSale", id: pos._id }]),
    }
  },
})

/* ═══════════════════════════ Voyageurs et manifeste ═══════════════════════ */

/** « +241 77 12 34 21 » → « +241 77 •• •• 21 » : assez pour reconnaître, pas pour appeler. */
export function masquerTelephone(numero: string | undefined | null): string | null {
  if (!numero?.trim()) return null
  const brut = numero.trim()
  const chiffres = brut.replace(/\D/g, "")
  if (chiffres.length < 4) return "•• ••"
  let indicatif = ""
  let national = chiffres
  if (brut.startsWith("+")) {
    indicatif = `+${chiffres.slice(0, 3)} `
    national = chiffres.slice(3)
  } else if (chiffres.startsWith("00")) {
    indicatif = `+${chiffres.slice(2, 5)} `
    national = chiffres.slice(5)
  }
  if (national.length < 4) return `${indicatif}•• ${chiffres.slice(-2)}`
  return `${indicatif}${national.slice(0, 2)} •• •• ${national.slice(-2)}`
}

function normaliserTexte(texte: string) {
  return texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
}

const STATUTS_MANIFESTE = new Set(["valide", "utilise"])

/**
 * Extraction nominative. C'est une mutation, et non une lecture : chaque
 * extraction est ainsi journalisée dans la même transaction (qui, quand,
 * quel filtre, combien de voyageurs), sans qu'un écran puisse l'oublier.
 */
export const extraireManifeste = mutation({
  args: {
    tripId: v.optional(v.id("trips")),
    serviceDate: v.optional(v.string()),
    stationId: v.optional(v.id("stations")),
    recherche: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "donnees_voyageurs", "consulter")
    if (!args.tripId && !args.serviceDate) {
      throw new Error("Choisissez une desserte ou une date de circulation")
    }
    const trips = args.tripId
      ? [await ctx.db.get(args.tripId)].filter((t): t is Doc<"trips"> => t !== null)
      : await ctx.db
          .query("trips")
          .withIndex("by_service_date", (q) => q.eq("serviceDate", args.serviceDate!))
          .collect()
    const recherche = normaliserTexte(args.recherche?.trim() ?? "")
    const telephoneCherche = normaliserTelephone(args.recherche ?? "")
    const gares = new Map<string, Awaited<ReturnType<typeof gareDe>>>()
    const gare = async (id: Id<"stations">) => {
      if (!gares.has(id)) gares.set(id, await gareDe(ctx, id))
      return gares.get(id)!
    }
    const LIMITE = 1500
    const lignes = []
    const resumes = []
    let tronque = false
    for (const trip of trips.sort((a, b) => a.departureAt - b.departureAt)) {
      const resume = await resumeDesserte(ctx, trip)
      if (resume) resumes.push(resume)
      const tickets = await ctx.db
        .query("tickets")
        .withIndex("by_trip", (q) => q.eq("tripId", trip._id))
        .collect()
      for (const ticket of tickets) {
        if (!STATUTS_MANIFESTE.has(ticket.status)) continue
        if (
          args.stationId &&
          ticket.originStationId !== args.stationId &&
          ticket.destinationStationId !== args.stationId
        ) {
          continue
        }
        const p = ticket.passenger
        if (recherche) {
          const texte = normaliserTexte(`${p.lastName} ${p.firstName} ${p.firstName} ${p.lastName} ${ticket.number}`)
          const parTelephone =
            telephoneCherche.length >= 4 &&
            [p.phone, p.emergencyPhone].some(
              (tel) => tel && normaliserTelephone(tel).includes(telephoneCherche)
            )
          if (!texte.includes(recherche) && !parTelephone) continue
        }
        if (lignes.length >= LIMITE) {
          tronque = true
          break
        }
        const [origine, destination, scan, bagages] = await Promise.all([
          gare(ticket.originStationId),
          gare(ticket.destinationStationId),
          ctx.db
            .query("ticketScans")
            .withIndex("by_ticket", (q) => q.eq("ticketId", ticket._id))
            .order("desc")
            .first(),
          ctx.db
            .query("baggages")
            .withIndex("by_ticket", (q) => q.eq("ticketId", ticket._id))
            .collect(),
        ])
        lignes.push({
          ticketId: ticket._id,
          number: ticket.number,
          tripId: trip._id,
          trainNumber: trip.trainNumber,
          serviceDate: trip.serviceDate,
          nom: p.lastName.toUpperCase(),
          prenom: p.firstName,
          gender: p.gender,
          nationalite: p.nationality ?? null,
          categorie: ticket.fare.discountCode ?? null,
          origine: origine?.name ?? "?",
          destination: destination?.name ?? "?",
          serviceClass: ticket.serviceClass,
          voiture: ticket.coachLabel ?? null,
          place: ticket.seatLabel ?? null,
          debout: ticket.isStanding,
          telephone: masquerTelephone(p.phone),
          urgence: masquerTelephone(p.emergencyPhone),
          bagages: bagages.length,
          status: ticket.status,
          controle: scan
            ? { result: scan.result, at: scan.scannedAt }
            : ticket.usedAt
              ? { result: "valide" as const, at: ticket.usedAt }
              : null,
        })
      }
      if (tronque) break
    }
    lignes.sort((a, b) =>
      a.nom.localeCompare(b.nom, "fr") || a.prenom.localeCompare(b.prenom, "fr")
    )
    await audit(ctx, {
      actorId: actor._id,
      action: "voyageurs.extraction",
      entityTable: args.tripId ? "trips" : "tickets",
      entityId: args.tripId ?? args.serviceDate ?? "*",
      permission: "consulter",
      classification: "confidentiel",
      metadata: {
        filtres: {
          tripId: args.tripId,
          serviceDate: args.serviceDate,
          stationId: args.stationId,
          recherche: args.recherche?.trim() || undefined,
        },
        voyageurs: lignes.length,
        tronque,
      },
    })
    return { generatedAt: Date.now(), dessertes: resumes, lignes, tronque }
  },
})

export const journaliserExportManifeste = mutation({
  args: {
    tripId: v.optional(v.id("trips")),
    serviceDate: v.optional(v.string()),
    format: v.union(v.literal("csv"), v.literal("impression")),
    voyageurs: v.number(),
  },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "donnees_voyageurs", "consulter")
    await audit(ctx, {
      actorId: actor._id,
      action: args.format === "csv" ? "voyageurs.manifeste.exporter" : "voyageurs.manifeste.imprimer",
      entityTable: args.tripId ? "trips" : "tickets",
      entityId: args.tripId ?? args.serviceDate ?? "*",
      permission: "consulter",
      classification: "confidentiel",
      metadata: { format: args.format, voyageurs: args.voyageurs, serviceDate: args.serviceDate },
    })
  },
})

/** Affiche un numéro complet, sur motif écrit, et le trace au journal. */
export const revelerTelephone = mutation({
  args: { ticketId: v.id("tickets"), motif: v.string() },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "donnees_voyageurs", "consulter")
    const motif = args.motif.trim()
    if (motif.length < 8) {
      throw new Error("Motivez l'affichage en une phrase (8 caractères au moins)")
    }
    const ticket = await ctx.db.get(args.ticketId)
    if (!ticket) throw new Error("Billet introuvable")
    const sale = await ctx.db.get(ticket.saleId)
    await audit(ctx, {
      actorId: actor._id,
      action: "voyageurs.telephone.afficher",
      entityTable: "tickets",
      entityId: ticket._id,
      permission: "consulter",
      reason: motif,
      classification: "restreint",
      metadata: { billet: ticket.number },
    })
    return {
      telephone: ticket.passenger.phone ?? null,
      urgence: ticket.passenger.emergencyPhone ?? null,
      contact: sale?.contactPhone ?? null,
    }
  },
})

export const billetVoyageur = query({
  args: { ticketId: v.id("tickets") },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "donnees_voyageurs", "consulter")
    const ticket = await ctx.db.get(args.ticketId)
    if (!ticket) return null
    const personne = annuaire(ctx)
    const [sale, trip, origine, destination, scans, baggages] = await Promise.all([
      ctx.db.get(ticket.saleId),
      ctx.db.get(ticket.tripId),
      gareDe(ctx, ticket.originStationId),
      gareDe(ctx, ticket.destinationStationId),
      ctx.db
        .query("ticketScans")
        .withIndex("by_ticket", (q) => q.eq("ticketId", ticket._id))
        .collect(),
      ctx.db
        .query("baggages")
        .withIndex("by_ticket", (q) => q.eq("ticketId", ticket._id))
        .collect(),
    ])
    const [payments, vendeur, pos] = await Promise.all([
      sale
        ? ctx.db
            .query("payments")
            .withIndex("by_sale", (q) => q.eq("saleId", sale._id))
            .collect()
        : [],
      personne(sale?.sellerId),
      sale?.pointOfSaleId ? ctx.db.get(sale.pointOfSaleId) : null,
    ])
    const { phone, emergencyPhone, ...passager } = ticket.passenger
    return {
      ticket: {
        _id: ticket._id,
        number: ticket.number,
        status: ticket.status,
        serviceClass: ticket.serviceClass,
        coachLabel: ticket.coachLabel ?? null,
        seatLabel: ticket.seatLabel ?? null,
        isStanding: ticket.isStanding,
        unitPriceTtc: ticket.unitPriceTtc,
        duplicateCount: ticket.duplicateCount,
        usedAt: ticket.usedAt ?? null,
        fare: ticket.fare,
        passager,
        telephone: masquerTelephone(phone),
        urgence: masquerTelephone(emergencyPhone),
      },
      vente: sale
        ? {
            number: sale.number,
            channel: sale.channel,
            soldAt: sale.soldAt,
            status: sale.status,
            contactTelephone: masquerTelephone(sale.contactPhone),
            contactEmail: sale.contactEmail ?? null,
            vendeur,
            pointOfSale: pos ? { code: pos.code, name: pos.name } : null,
          }
        : null,
      desserte: await resumeDesserte(ctx, trip),
      origine,
      destination,
      paiements: payments.map((p) => ({
        id: p._id,
        method: p.method,
        status: p.status,
        amountXaf: p.amountXaf,
        settledAt: p.settledAt ?? null,
      })),
      controles: await Promise.all(
        scans
          .sort((a, b) => b.scannedAt - a.scannedAt)
          .map(async (scan) => ({
            id: scan._id,
            result: scan.result,
            scannedAt: scan.scannedAt,
            agent: await personne(scan.agentId),
            offline: scan.offline,
            conflict: scan.conflict,
          }))
      ),
      bagages: baggages.map((b) => ({
        id: b._id,
        tagNumber: b.tagNumber,
        weightKg: b.weightKg,
      })),
      historique: await historique(ctx, [
        { table: "tickets", id: ticket._id },
        ...(sale ? [{ table: "sales", id: sale._id as string }] : []),
      ]),
    }
  },
})

/* ════════════════════════════ Incidents et PV ═════════════════════════════ */

/** Numérotation continue des incidents : « INC-2026-0082 », par année. */
export async function numeroIncident(ctx: MutationCtx, reportedAt: number) {
  const annee = toServiceDate(reportedAt).slice(0, 4)
  const key = `reseau:incident:${annee}`
  const existing = await ctx.db
    .query("sequences")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique()
  const value = (existing?.value ?? 0) + 1
  if (existing) await ctx.db.patch(existing._id, { value })
  else await ctx.db.insert("sequences", { key, value })
  return `INC-${annee}-${String(value).padStart(4, "0")}`
}

/** Référence affichée : le numéro, ou un repère stable pour les anciens incidents. */
export function referenceIncident(incident: Pick<Doc<"incidents">, "number" | "clientId" | "reportedAt">) {
  if (incident.number) return incident.number
  const annee = toServiceDate(incident.reportedAt).slice(0, 4)
  const court = incident.clientId.replace(/[^A-Za-z0-9]/g, "").slice(-4).toUpperCase()
  return `INC-${annee}-${court || "0000"}`
}

export const incidents = query({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, "incidents", "consulter")
    const personne = annuaire(ctx)
    const tous = await ctx.db.query("incidents").withIndex("by_reported_at").order("desc").take(1000)
    return await Promise.all(
      tous.map(async (incident) => {
        const trip = incident.tripId ? await ctx.db.get(incident.tripId) : null
        return {
          _id: incident._id,
          reference: referenceIncident(incident),
          category: incident.category,
          severity: incident.severity,
          description: incident.description,
          status: incident.status,
          reportedAt: incident.reportedAt,
          resolvedAt: incident.resolvedAt ?? null,
          closureCause: incident.closureCause ?? null,
          location: incident.location ?? null,
          train: trip ? { trainNumber: trip.trainNumber, serviceDate: trip.serviceDate } : null,
          station: await gareDe(ctx, incident.stationId),
          declarant: await personne(incident.reporterId),
          photos: incident.photoStorageIds.length,
        }
      })
    )
  },
})

export const incident = query({
  args: { incidentId: v.id("incidents") },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "incidents", "consulter")
    const incident = await ctx.db.get(args.incidentId)
    if (!incident) return null
    const personne = annuaire(ctx)
    const [trip, photoUrls] = await Promise.all([
      incident.tripId ? ctx.db.get(incident.tripId) : null,
      Promise.all(incident.photoStorageIds.map((id) => ctx.storage.getUrl(id))),
    ])
    return {
      incident,
      reference: referenceIncident(incident),
      desserte: await resumeDesserte(ctx, trip),
      station: await gareDe(ctx, incident.stationId),
      declarant: await personne(incident.reporterId),
      resolveur: await personne(incident.resolvedBy),
      photoUrls: photoUrls.filter((url): url is string => Boolean(url)),
      historique: await historique(ctx, [{ table: "incidents", id: incident._id }]),
    }
  },
})

const categorieIncident = v.union(
  v.literal("securite"),
  v.literal("technique"),
  v.literal("comportement"),
  v.literal("medical"),
  v.literal("autre")
)
const graviteIncident = v.union(
  v.literal("information"),
  v.literal("important"),
  v.literal("critique")
)
const causeIncident = v.union(
  v.literal("materiel"),
  v.literal("infrastructure"),
  v.literal("exploitation"),
  v.literal("tiers"),
  v.literal("voyageur"),
  v.literal("meteo"),
  v.literal("autre")
)

/** Déclaration d'un incident depuis le portail (gare, siège). */
export const declarerIncident = mutation({
  args: {
    tripId: v.optional(v.id("trips")),
    stationId: v.optional(v.id("stations")),
    location: v.optional(v.string()),
    category: categorieIncident,
    severity: graviteIncident,
    description: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "incidents", "creer")
    const description = args.description.trim()
    if (description.length < 5) {
      throw new Error("Décrivez l'incident en une phrase au moins")
    }
    if (!args.tripId && !args.stationId && !args.location?.trim()) {
      throw new Error("Indiquez un train, une gare ou un lieu")
    }
    if (args.tripId && !(await ctx.db.get(args.tripId))) {
      throw new Error("Desserte introuvable")
    }
    if (args.stationId && !(await ctx.db.get(args.stationId))) {
      throw new Error("Gare introuvable")
    }
    const reportedAt = Date.now()
    const number = await numeroIncident(ctx, reportedAt)
    const id = await ctx.db.insert("incidents", {
      reporterId: actor._id,
      tripId: args.tripId,
      stationId: args.stationId,
      location: args.location?.trim() || undefined,
      category: args.category,
      severity: args.severity,
      description,
      photoStorageIds: [],
      status: "ouvert",
      reportedAt,
      offline: false,
      clientId: `portail-${reportedAt}-${Math.random().toString(36).slice(2, 10)}`,
      number,
    })
    if (args.severity === "critique") {
      const chefs = await ctx.db
        .query("users")
        .withIndex("by_role", (q) => q.eq("role", "chef_gare"))
        .collect()
      for (const chef of chefs) {
        if (chef._id === actor._id || !chef.isActive) continue
        await ctx.db.insert("notifications", {
          userId: chef._id,
          channel: "push",
          title: `Incident critique ${number}`,
          body: description.slice(0, 140),
          data: JSON.stringify({ incidentId: id }),
        })
      }
    }
    await audit(ctx, {
      actorId: actor._id,
      action: "incident.declarer",
      entityTable: "incidents",
      entityId: id,
      permission: "creer",
      after: {
        number,
        category: args.category,
        severity: args.severity,
        tripId: args.tripId,
        stationId: args.stationId,
        location: args.location?.trim() || undefined,
      },
    })
    return { id, number }
  },
})

/** Clôt un incident : la cause et une note sont exigées. */
export const cloreIncident = mutation({
  args: { incidentId: v.id("incidents"), cause: causeIncident, note: v.string() },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "incidents", "modifier")
    const incident = await ctx.db.get(args.incidentId)
    if (!incident) throw new Error("Incident introuvable")
    if (incident.status === "resolu") throw new Error("Cet incident est déjà clos")
    const note = args.note.trim()
    if (note.length < 3) throw new Error("Une note de clôture est obligatoire")
    const resolvedAt = Date.now()
    await ctx.db.patch(incident._id, {
      status: "resolu",
      closureCause: args.cause,
      resolvedBy: actor._id,
      resolvedAt,
      resolutionNote: note,
    })
    await audit(ctx, {
      actorId: actor._id,
      action: "incident.clore",
      entityTable: "incidents",
      entityId: incident._id,
      permission: "modifier",
      reason: note,
      before: { status: incident.status },
      after: { status: "resolu", cause: args.cause, note },
    })
  },
})

export const penalite = query({
  args: { penaltyId: v.id("procesVerbaux") },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "proces_verbaux", "consulter")
    const penalty = await ctx.db.get(args.penaltyId)
    if (!penalty) return null
    const personne = annuaire(ctx)
    const [trip, ticket, payment] = await Promise.all([
      ctx.db.get(penalty.tripId),
      penalty.ticketId ? ctx.db.get(penalty.ticketId) : null,
      penalty.paymentId ? ctx.db.get(penalty.paymentId) : null,
    ])
    const { phone, ...contrevenant } = penalty.offender
    return {
      penalty: { ...penalty, offender: { ...contrevenant, phone: masquerTelephone(phone) } },
      desserte: await resumeDesserte(ctx, trip),
      billet: ticket ? { id: ticket._id, number: ticket.number } : null,
      paiement: payment
        ? {
            method: payment.method,
            status: payment.status,
            amountXaf: payment.amountXaf,
            settledAt: payment.settledAt ?? null,
            reference: payment.providerReference ?? null,
          }
        : null,
      agent: await personne(penalty.agentId),
      resolveur: await personne(penalty.resolvedBy),
      historique: await historique(ctx, [{ table: "procesVerbaux", id: penalty._id }]),
    }
  },
})

/**
 * Encaisse au guichet un procès-verbal non payé à bord. Le paiement est
 * enregistré et le PV soldé dans la même transaction.
 */
export const encaisserPv = mutation({
  args: {
    penaltyId: v.id("procesVerbaux"),
    method: paymentMethod,
    reference: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "proces_verbaux", "modifier")
    const penalty = await ctx.db.get(args.penaltyId)
    if (!penalty) throw new Error("Procès-verbal introuvable")
    if (penalty.status !== "emis" && penalty.status !== "conteste") {
      throw new Error(`Procès-verbal « ${penalty.status} » : rien à encaisser`)
    }
    if (args.method === "en_compte") {
      throw new Error("Un procès-verbal ne s'encaisse pas en compte client")
    }
    const reference = args.reference?.trim()
    if (args.method !== "especes" && !reference) {
      throw new Error("La référence de la transaction est obligatoire hors espèces")
    }
    const settledAt = Date.now()
    const paymentId = await ctx.db.insert("payments", {
      penaltyId: penalty._id,
      method: args.method,
      status: "confirme",
      amountXaf: penalty.amountXaf,
      providerReference: reference || undefined,
      settledAt,
    })
    const note = args.note?.trim() || `Encaissé au guichet (${args.method})`
    await ctx.db.patch(penalty._id, {
      status: "paye",
      paymentId,
      resolvedBy: actor._id,
      resolutionNote: note,
    })
    await audit(ctx, {
      actorId: actor._id,
      action: "pv.encaisser",
      entityTable: "procesVerbaux",
      entityId: penalty._id,
      permission: "modifier",
      reason: note,
      before: { status: penalty.status },
      after: { status: "paye", method: args.method, amountXaf: penalty.amountXaf, reference },
    })
    return paymentId
  },
})

/* ═══════════════════════════ Utilisateurs et droits ═══════════════════════ */

export function etatCompte(user: Pick<Doc<"users">, "isActive" | "invitedAt" | "lastSeenAt">) {
  if (!user.isActive) return "suspendu" as const
  if (user.invitedAt && !user.lastSeenAt) return "invite" as const
  return "actif" as const
}

export const comptes = query({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, "utilisateurs", "consulter")
    const personne = annuaire(ctx)
    const [users, points, derniere] = await Promise.all([
      ctx.db.query("users").collect(),
      ctx.db.query("pointsOfSale").collect(),
      ctx.db
        .query("auditLogs")
        .withIndex("by_action", (q) => q.eq("action", "annuaire.synchroniser"))
        .order("desc")
        .first(),
    ])
    const posById = new Map(points.map((p) => [p._id, p]))
    const personnel = users.filter((user) => user.role !== "voyageur")
    return {
      comptes: personnel
        .map((user) => {
          const pos = user.pointOfSaleId ? posById.get(user.pointOfSaleId) : undefined
          return {
            _id: user._id,
            nom: nomComplet(user),
            firstName: user.firstName ?? null,
            lastName: user.lastName ?? null,
            email: user.email ?? null,
            matricule: user.matricule ?? null,
            role: user.role,
            pointOfSale: pos ? { id: pos._id, code: pos.code, name: pos.name } : null,
            identitySource: user.identitySource,
            secondFactor: user.secondFactor ?? null,
            lastSeenAt: user.lastSeenAt ?? null,
            directorySyncedAt: user.directorySyncedAt ?? null,
            etat: etatCompte(user),
          }
        })
        .sort((a, b) => a.nom.localeCompare(b.nom, "fr")),
      voyageurs: users.length - personnel.length,
      annuaire: {
        /** L'annuaire Entra ID n'est pas raccordé : la synchronisation est simulée. */
        simule: !process.env.ERAMET_DIRECTORY_SYNC_URL || !process.env.ERAMET_DIRECTORY_SYNC_TOKEN,
        derniereSynchronisation: derniere
          ? { at: derniere.createdAt, par: await personne(derniere.actorId), metadata: derniere.metadata }
          : null,
      },
    }
  },
})

export const compte = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "utilisateurs", "consulter")
    const user = await ctx.db.get(args.userId)
    if (!user) return null
    const personne = annuaire(ctx)
    const [pos, sessions, ventes, actions] = await Promise.all([
      user.pointOfSaleId ? ctx.db.get(user.pointOfSaleId) : null,
      ctx.db
        .query("cashSessions")
        .withIndex("by_seller", (q) => q.eq("sellerId", user._id))
        .collect(),
      ctx.db
        .query("sales")
        .withIndex("by_seller", (q) => q.eq("sellerId", user._id))
        .take(5000),
      ctx.db
        .query("auditLogs")
        .withIndex("by_actor", (q) => q.eq("actorId", user._id))
        .order("desc")
        .take(15),
    ])
    return {
      user,
      etat: etatCompte(user),
      pointOfSale: pos ? { id: pos._id, code: pos.code, name: pos.name, isActive: pos.isActive } : null,
      estSoiMeme: actor._id === user._id,
      invitePar: await personne(user.invitedBy),
      dependances: {
        caisses: sessions.length,
        caissesOuvertes: sessions.filter((s) => s.status === "ouverte").length,
        ventes: ventes.length,
      },
      historique: await historique(ctx, [{ table: "users", id: user._id }]),
      dernieresActions: actions.map((log) => ({
        id: log._id,
        action: log.action,
        createdAt: log.createdAt,
        entityTable: log.entityTable,
        entityId: log.entityId,
        result: log.result ?? null,
      })),
    }
  },
})

/**
 * Invite un agent : son profil est provisionné (rôle, rattachement) et
 * attend sa première connexion par l'annuaire. Le rôle d'administrateur
 * système reste réservé aux administrateurs système.
 */
export const inviterUtilisateur = mutation({
  args: {
    email: v.string(),
    firstName: v.string(),
    lastName: v.string(),
    phone: v.optional(v.string()),
    matricule: v.optional(v.string()),
    role: v.string(),
    pointOfSaleId: v.optional(v.id("pointsOfSale")),
  },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "utilisateurs", "creer")
    const role = args.role as Doc<"users">["role"]
    if (role === "voyageur") {
      throw new Error("Un voyageur crée son compte lui-même, sur la billetterie")
    }
    if (!args.email.trim()) throw new Error("L'adresse e-mail est obligatoire")
    if (!args.firstName.trim() || !args.lastName.trim()) {
      throw new Error("Le prénom et le nom sont obligatoires")
    }
    assertRoleGrantable(actor, role)
    const valeurs = await validateManagedUser(ctx, {
      email: args.email,
      phone: args.phone,
      firstName: args.firstName,
      lastName: args.lastName,
      role,
      matricule: args.matricule,
      pointOfSaleId: args.pointOfSaleId,
    })
    const now = Date.now()
    const id = await ctx.db.insert("users", {
      ...valeurs,
      authId: `invitation:${valeurs.email}`,
      identitySource: "annuaire",
      isActive: true,
      invitedAt: now,
      invitedBy: actor._id,
    })
    await audit(ctx, {
      actorId: actor._id,
      action: "utilisateur.inviter",
      entityTable: "users",
      entityId: id,
      permission: "creer",
      after: valeurs,
    })
    return id
  },
})

/**
 * Synchronisation avec l'annuaire Eramet (Entra ID) — SIMULÉE.
 *
 * Tant que la DSI n'a pas fourni l'URL, le jeton et le contrat de données de
 * l'annuaire, aucun échange réel n'a lieu. La simulation relit les comptes
 * provisionnés par l'annuaire, date leur synchronisation et en déduit leur
 * second facteur (déclaré « application » pour un compte déjà connecté,
 * « aucun » sinon). Le résultat et la trace d'audit portent `simule: true`.
 */
export const synchroniserAnnuaire = mutation({
  args: {},
  handler: async (ctx) => {
    const actor = await requirePermission(ctx, "utilisateurs", "modifier")
    const now = Date.now()
    const users = (await ctx.db.query("users").collect()).filter(
      (user) => user.role !== "voyageur"
    )
    let synchronises = 0
    let sansSecondFacteur = 0
    for (const user of users) {
      if (user.identitySource !== "annuaire") continue
      const secondFactor = user.secondFactor ?? (user.lastSeenAt ? "application" : "aucun")
      if (secondFactor === "aucun") sansSecondFacteur += 1
      await ctx.db.patch(user._id, { directorySyncedAt: now, secondFactor })
      synchronises += 1
    }
    const rapport = {
      simule: true,
      lus: users.length,
      synchronises,
      locaux: users.length - synchronises,
      sansSecondFacteur,
      inactifs: users.filter((u) => !u.isActive).length,
    }
    await audit(ctx, {
      actorId: actor._id,
      action: "annuaire.synchroniser",
      entityTable: "users",
      entityId: "annuaire",
      permission: "modifier",
      reason: "Synchronisation simulée : annuaire Entra ID non raccordé",
      metadata: rapport,
    })
    return rapport
  },
})
