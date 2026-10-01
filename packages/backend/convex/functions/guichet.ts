import { ConvexError, v } from "convex/values"
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server"
import { internal } from "../_generated/api"
import type { Doc, Id } from "../_generated/dataModel"
import { audit, requirePermission } from "../lib/auth"
import { paymentMethod, serviceClass } from "../schema"
import { caisseDeSortie, performRefund, performSale } from "./sales"
import { can } from "../model/permissions"
import { accrueToAccountingDay, currentAccountingDay } from "../lib/saleContext"
import { chargerTarification, devisDesserte } from "../lib/tripQuote"
import { refus, verifierReglement, enregistrerReglement } from "../lib/reglement"
import {
  attenduParMoyen,
  compteEnCaisse,
  MOYENS_A_DISTANCE,
  type MoyenPaiement,
} from "../model/caisse"
import { availableForRange, release, segmentMask, SeatUnavailableError } from "../model/inventory"
import { addDays, toServiceDate } from "../model/calendar"
import { parsePreprintedNumber } from "../model/accounting"
import { distanceBetween } from "../model/network"

/**
 * Portail de vente — lectures et opérations propres au guichet.
 *
 * La vente de billets y suit le geste du vendeur : les places choisies sur le
 * plan sont TENUES (réservation temporaire, même code d'allocation que toute
 * vente) pendant la saisie des voyageurs et l'encaissement, puis la tenue
 * devient une vente ferme au règlement. Personne ne peut prendre la place
 * pendant que le client cherche sa monnaie.
 *
 * Paiements mobiles : l'opérateur n'est pas raccordé. Sa réponse est SIMULÉE
 * par `reponseOperateur`, planifiée quelques secondes après la demande, et
 * tracée comme telle (fournisseur « simulation »). C'est la seule simulation
 * du guichet : tout le reste — tenue, vente, caisse — est réel.
 */

/* ════════════════════════════ Paramétrage ═════════════════════════════════ */

const CLE_PARAMETRAGE = "commercial"

/** Délai avant la réponse simulée de l'opérateur de paiement mobile. */
export const DELAI_REPONSE_OPERATEUR_MS = 6_000
/** Délai laissé au client pour valider sur son téléphone. */
export const DELAI_VALIDATION_MOBILE_MS = 3 * 60_000

const MOTIFS_REMBOURSEMENT_DEFAUT = [
  "Voyage annulé par le client",
  "Changement de date",
  "Erreur de vente au guichet",
  "Desserte supprimée par SETRAG",
]

/** Paramètres d'exploitation lus par le guichet, valeurs par défaut du CDC. */
async function reglages(ctx: QueryCtx | MutationCtx) {
  const stored = await ctx.db
    .query("systemSettings")
    .withIndex("by_key", (q) => q.eq("key", CLE_PARAMETRAGE))
    .unique()
  return {
    tenueMinutes: stored?.seatHoldMinutes ?? 15,
    tentativesMobile: stored?.mobilePaymentAttempts ?? 3,
    ventesDegradees: stored?.degradedSalesEnabled ?? true,
    mentionDuplicata: stored?.duplicateMention ?? "DUPLICATA",
    piedBillet:
      stored?.ticketFooter ??
      "Billet nominatif, valable sur ce train uniquement.",
    remboursement: {
      penaliteAvantSeuilPct: stored?.refundPenaltyEarlyPct ?? 10,
      penaliteApresSeuilPct: stored?.refundPenaltyLatePct ?? 30,
      seuilHeures: stored?.refundThresholdHours ?? 2,
      apresDepart: stored?.refundAfterDepartureAllowed ?? false,
      motifs:
        stored?.refundReasons && stored.refundReasons.length > 0
          ? stored.refundReasons
          : MOTIFS_REMBOURSEMENT_DEFAUT,
      /** Vrai si aucun barème n'est encore paramétré : valeurs par défaut. */
      provisoire: stored?.refundPenaltyEarlyPct === undefined,
    },
  }
}

type Reglages = Awaited<ReturnType<typeof reglages>>

/**
 * Pénalité applicable au remboursement d'un billet.
 *
 * Une desserte supprimée par SETRAG se rembourse sans pénalité ; sinon le
 * taux dépend du délai avant le départ. Après le départ, le guichet ne
 * rembourse plus, sauf si le paramétrage l'autorise.
 */
export function penaliteRemboursement(
  politique: Reglages["remboursement"],
  trip: Pick<Doc<"trips">, "status" | "departureAt" | "delayMinutes">,
  maintenant: number
):
  | { autorise: true; penalitePct: number; raison: string }
  | { autorise: false; raison: string } {
  if (trip.status === "annule") {
    return { autorise: true, penalitePct: 0, raison: "Desserte supprimée : sans pénalité" }
  }
  const depart = trip.departureAt + trip.delayMinutes * 60_000
  const heuresAvant = (depart - maintenant) / 3_600_000
  if (heuresAvant <= 0) {
    return politique.apresDepart
      ? {
          autorise: true,
          penalitePct: politique.penaliteApresSeuilPct,
          raison: "Train parti : pénalité maximale",
        }
      : {
          autorise: false,
          raison:
            "Le train est parti : le guichet ne rembourse plus. Orientez le voyageur vers le service clients.",
        }
  }
  return heuresAvant >= politique.seuilHeures
    ? {
        autorise: true,
        penalitePct: politique.penaliteAvantSeuilPct,
        raison: `Départ dans plus de ${politique.seuilHeures} h`,
      }
    : {
        autorise: true,
        penalitePct: politique.penaliteApresSeuilPct,
        raison: `Départ dans moins de ${politique.seuilHeures} h`,
      }
}

/* ════════════════════════════ Contexte ════════════════════════════════════ */

async function sessionOuverte(ctx: QueryCtx | MutationCtx, sellerId: Id<"users">) {
  return await ctx.db
    .query("cashSessions")
    .withIndex("by_seller", (q) => q.eq("sellerId", sellerId))
    .filter((q) => q.eq(q.field("status"), "ouverte"))
    .first()
}

async function pointDeVente(ctx: QueryCtx, actor: Doc<"users">) {
  if (!actor.pointOfSaleId) {
    throw new ConvexError("Agent non rattaché à un point de vente")
  }
  const pos = await ctx.db.get(actor.pointOfSaleId)
  if (!pos) throw new ConvexError("Point de vente introuvable")
  const station = pos.stationId ? await ctx.db.get(pos.stationId) : null
  return { pos, station }
}

/**
 * Contexte commun des écrans du guichet : identité, point de vente, caisse,
 * paramètres. Une seule souscription, pour que la vente se bloque d'elle-même
 * à la fermeture de la caisse.
 */
export const contexte = query({
  args: {},
  handler: async (ctx) => {
    const actor = await requirePermission(ctx, "ventes", "consulter")
    const { pos, station } = await pointDeVente(ctx, actor)
    const session = await sessionOuverte(ctx, actor._id)
    const parametres = await reglages(ctx)
    return {
      seller: {
        id: actor._id,
        firstName: actor.firstName,
        lastName: actor.lastName,
        matricule: actor.matricule,
        role: actor.role,
      },
      pointOfSale: {
        id: pos._id,
        code: pos.code,
        name: pos.name,
        type: pos.type,
        isActive: pos.isActive,
        stationId: station?._id ?? null,
        stationCode: station?.code ?? null,
        stationName: station?.name ?? null,
      },
      session: session
        ? {
            id: session._id,
            openedAt: session.openedAt,
            openingFloatXaf: session.openingFloatXaf,
            emergencyBooklet: session.emergencyBooklet ?? null,
          }
        : null,
      parametres: {
        tenueMinutes: parametres.tenueMinutes,
        tentativesMobile: parametres.tentativesMobile,
        ventesDegradees: parametres.ventesDegradees,
        mentionDuplicata: parametres.mentionDuplicata,
        piedBillet: parametres.piedBillet,
      },
    }
  },
})

/* ═════════════════════════ Lectures partagées ═════════════════════════════ */

const CLASSES = ["DEUXIEME", "PREMIERE", "VIP"] as const
type Classe = (typeof CLASSES)[number]

async function arretsOrdonnes(ctx: QueryCtx, tripId: Id<"trips">) {
  return (
    await ctx.db
      .query("tripStops")
      .withIndex("by_trip_sequence", (q) => q.eq("tripId", tripId))
      .collect()
  ).sort((a, b) => a.sequence - b.sequence)
}

/** Places libres par classe sur un tronçon, et capacité de la classe. */
function disponibilites(
  counters: readonly Doc<"segmentCounters">[],
  fromIndex: number,
  toIndex: number
) {
  const parClasse: Partial<Record<Classe, { disponibles: number; capacite: number }>> = {}
  for (const classe of CLASSES) {
    const lignes = counters
      .filter((c) => c.serviceClass === classe)
      .sort((a, b) => a.segmentIndex - b.segmentIndex)
    if (lignes.length === 0) continue
    parClasse[classe] = {
      disponibles: availableForRange(
        lignes.map((l) => l.available),
        { fromIndex, toIndex }
      ),
      capacite: lignes[0]!.capacity,
    }
  }
  return parClasse
}

async function nomStation(ctx: QueryCtx, id: Id<"stations"> | undefined) {
  if (!id) return null
  const station = await ctx.db.get(id)
  return station ? { id: station._id, code: station.code, name: station.name } : null
}

function nomComplet(user: Doc<"users"> | null) {
  if (!user) return null
  return [user.firstName, user.lastName].filter(Boolean).join(" ") || user.matricule || null
}

/* ═════════════════════════════ Accueil ════════════════════════════════════ */

/**
 * Accueil vendeur : indicateurs du jour, prochains départs de la gare,
 * information trafic et dernières opérations de la caisse.
 */
export const accueil = query({
  args: {},
  handler: async (ctx) => {
    const actor = await requirePermission(ctx, "ventes", "consulter")
    const { station } = await pointDeVente(ctx, actor)
    const session = await sessionOuverte(ctx, actor._id)
    const now = Date.now()

    /* ── Indicateurs de la caisse ─────────────────────────────────────── */
    const ventes = session
      ? (
          await ctx.db
            .query("sales")
            .withIndex("by_cash_session", (q) => q.eq("cashSessionId", session._id))
            .collect()
        ).filter(compteEnCaisse)
      : []
    const billets = (
      await Promise.all(
        ventes
          .filter((s) => s.kind === "vente" && s.product === "billet")
          .map((s) =>
            ctx.db
              .query("tickets")
              .withIndex("by_sale", (q) => q.eq("saleId", s._id))
              .collect()
          )
      )
    ).flat()
    const sorties = ventes.filter((s) => s.kind !== "vente")
    const attendu = attenduParMoyen(ventes)
    const especes = attendu.find((a) => a.method === "especes")?.amountXaf ?? 0

    /* ── Départs et trafic de la gare ─────────────────────────────────── */
    const aujourdhui = toServiceDate(now)
    const departs: Array<{
      tripId: Id<"trips">
      trainNumber: string
      trainType: Doc<"trips">["trainType"]
      serviceDate: string
      departAt: number
      destination: string | null
      status: Doc<"trips">["status"]
      delayMinutes: number
      disponibles: Partial<Record<Classe, number>>
    }> = []
    const trafic: Array<{
      tripId: Id<"trips">
      trainNumber: string
      trainType: Doc<"trips">["trainType"]
      serviceDate: string
      departAt: number
      status: Doc<"trips">["status"]
      delayMinutes: number
      destination: string | null
    }> = []
    if (station) {
      for (const jour of [aujourdhui, addDays(aujourdhui, 1)]) {
        const trips = await ctx.db
          .query("trips")
          .withIndex("by_service_date", (q) => q.eq("serviceDate", jour))
          .collect()
        for (const trip of trips) {
          const arrets = await arretsOrdonnes(ctx, trip._id)
          const index = arrets.findIndex((a) => a.stationId === station._id)
          // La gare doit être desservie, et pas en terminus.
          if (index === -1 || index >= arrets.length - 1) continue
          const departAt = arrets[index]!.departureAt ?? trip.departureAt
          const destination = (await ctx.db.get(trip.destinationStationId))?.name ?? null
          const perturbe = trip.status === "annule" || trip.status === "retarde" || trip.delayMinutes > 0
          if (perturbe && departAt + trip.delayMinutes * 60_000 >= now - 3_600_000) {
            trafic.push({
              tripId: trip._id,
              trainNumber: trip.trainNumber,
              trainType: trip.trainType,
              serviceDate: trip.serviceDate,
              departAt,
              status: trip.status,
              delayMinutes: trip.delayMinutes,
              destination,
            })
          }
          if (departAt + trip.delayMinutes * 60_000 < now) continue
          if (!trip.isOpenForSale && trip.status !== "annule") continue
          const counters = await ctx.db
            .query("segmentCounters")
            .withIndex("by_trip_class", (q) => q.eq("tripId", trip._id))
            .collect()
          const dispo = disponibilites(counters, index, arrets.length - 1)
          departs.push({
            tripId: trip._id,
            trainNumber: trip.trainNumber,
            trainType: trip.trainType,
            serviceDate: trip.serviceDate,
            departAt,
            destination,
            status: trip.status,
            delayMinutes: trip.delayMinutes,
            disponibles: Object.fromEntries(
              Object.entries(dispo).map(([classe, d]) => [classe, d!.disponibles])
            ),
          })
        }
      }
    }

    /* ── Dernières opérations ─────────────────────────────────────────── */
    const recentes = [...ventes]
      .sort((a, b) => b._creationTime - a._creationTime)
      .slice(0, 6)
    const operations = await Promise.all(recentes.map((s) => resumeOperation(ctx, s)))

    return {
      station: station ? { id: station._id, code: station.code, name: station.name } : null,
      caisse: session
        ? { ouverteA: session.openedAt, fonds: session.openingFloatXaf }
        : null,
      indicateurs: {
        encaisse: ventes.reduce((sum, s) => sum + s.amounts.received, 0),
        operations: ventes.filter((s) => s.kind === "vente").length,
        billets: billets.length,
        enfants: billets.filter((b) => b.fare.discountCode === "ENFANT").length,
        especesAttendues: session ? session.openingFloatXaf + especes : 0,
        sorties: sorties.length,
        sortiesMontant: sorties.reduce((sum, s) => sum + s.amounts.received, 0),
      },
      departs: departs.sort((a, b) => a.departAt - b.departAt).slice(0, 6),
      trafic: trafic.sort((a, b) => a.departAt - b.departAt),
      operations,
    }
  },
})

/* ═══════════════════════════ Opérations ═══════════════════════════════════ */

type EtatOperation =
  | "emis"
  | "enregistre"
  | "controle"
  | "annule"
  | "rembourse"
  | "annulation"
  | "remboursement"
  | "en_attente"
  | "expire"

/** Résumé d'une opération pour les listes : produit, client, trajet, état. */
async function resumeOperation(ctx: QueryCtx, sale: Doc<"sales">) {
  let client: string | null = null
  let telephone: string | null = sale.contactPhone ?? null
  let trajet: string | null = null
  let desserte: { trainNumber: string; trainType: string; serviceDate: string; departAt: number } | null = null
  let places: string[] = []
  let references: string[] = []
  let controle = false
  let ticketsCount = 0

  const source = sale.kind === "vente" ? sale : sale.originSaleId ? await ctx.db.get(sale.originSaleId) : null
  const cible = source ?? sale

  if (cible.product === "billet") {
    const tickets = await ctx.db
      .query("tickets")
      .withIndex("by_sale", (q) => q.eq("saleId", cible._id))
      .collect()
    ticketsCount = tickets.length
    const premier = tickets[0]
    if (premier) {
      client = `${premier.passenger.firstName} ${premier.passenger.lastName}`.trim()
      telephone = telephone ?? premier.passenger.phone ?? null
      const [origine, arrivee, trip] = await Promise.all([
        ctx.db.get(premier.originStationId),
        ctx.db.get(premier.destinationStationId),
        ctx.db.get(premier.tripId),
      ])
      trajet = `${origine?.name ?? "?"} → ${arrivee?.name ?? "?"}`
      if (trip) {
        desserte = {
          trainNumber: trip.trainNumber,
          trainType: trip.trainType,
          serviceDate: trip.serviceDate,
          departAt: trip.departureAt,
        }
      }
    }
    places = tickets
      .filter((t) => t.seatLabel)
      .map((t) => `${t.coachLabel ? `${t.coachLabel} · ` : ""}${t.seatLabel}`)
    references = tickets.map((t) => t.number)
    controle = tickets.some((t) => t.status === "utilise")
  } else if (cible.product === "bagage") {
    const bagage = await ctx.db
      .query("baggages")
      .withIndex("by_sale", (q) => q.eq("saleId", cible._id))
      .first()
    if (bagage) {
      client = bagage.senderName
      references = [bagage.tagNumber]
      const [origine, arrivee, trip] = await Promise.all([
        ctx.db.get(bagage.originStationId),
        ctx.db.get(bagage.destinationStationId),
        ctx.db.get(bagage.tripId),
      ])
      trajet = `${origine?.name ?? "?"} → ${arrivee?.name ?? "?"}`
      if (trip) {
        desserte = { trainNumber: trip.trainNumber, trainType: trip.trainType, serviceDate: trip.serviceDate, departAt: trip.departureAt }
      }
    }
  } else if (cible.product === "colis") {
    const colis = await ctx.db
      .query("parcels")
      .withIndex("by_sale", (q) => q.eq("saleId", cible._id))
      .first()
    if (colis) {
      client = colis.senderName
      telephone = telephone ?? colis.senderPhone
      references = [colis.shipmentNumber]
      const [origine, arrivee, trip] = await Promise.all([
        ctx.db.get(colis.originStationId),
        ctx.db.get(colis.destinationStationId),
        colis.tripId ? ctx.db.get(colis.tripId) : null,
      ])
      trajet = `${origine?.name ?? "?"} → ${arrivee?.name ?? "?"}`
      if (trip) {
        desserte = { trainNumber: trip.trainNumber, trainType: trip.trainType, serviceDate: trip.serviceDate, departAt: trip.departureAt }
      }
    }
  } else {
    const special =
      cible.product === "taa"
        ? await ctx.db.query("vehicleTransports").withIndex("by_sale", (q) => q.eq("saleId", cible._id)).first()
        : await ctx.db.query("funeralTransports").withIndex("by_sale", (q) => q.eq("saleId", cible._id)).first()
    if (special) {
      client = special.senderName
      references = [special.shipmentNumber]
      const [origine, arrivee, trip] = await Promise.all([
        ctx.db.get(special.originStationId),
        ctx.db.get(special.destinationStationId),
        ctx.db.get(special.tripId),
      ])
      trajet = `${origine?.name ?? "?"} → ${arrivee?.name ?? "?"}`
      if (trip) {
        desserte = { trainNumber: trip.trainNumber, trainType: trip.trainType, serviceDate: trip.serviceDate, departAt: trip.departureAt }
      }
    }
  }

  if (sale.channel === "manuel") {
    const manuel = await ctx.db
      .query("manualTickets")
      .withIndex("by_sale", (q) => q.eq("saleId", sale._id))
      .first()
    if (manuel) {
      client = client ?? manuel.passengerName ?? null
      references = [manuel.preprintedNumber, ...references]
      if (!trajet && manuel.originStationId && manuel.destinationStationId) {
        const [origine, arrivee] = await Promise.all([
          ctx.db.get(manuel.originStationId),
          ctx.db.get(manuel.destinationStationId),
        ])
        trajet = `${origine?.name ?? "?"} → ${arrivee?.name ?? "?"}`
      }
    }
  }

  const pdv = sale.pointOfSaleId ? await ctx.db.get(sale.pointOfSaleId) : null

  let etat: EtatOperation
  if (sale.kind === "annulation") etat = "annulation"
  else if (sale.kind === "remboursement") etat = "remboursement"
  else if (sale.status === "en_attente_paiement") etat = "en_attente"
  else if (sale.status === "expiree") etat = "expire"
  else if (controle) etat = "controle"
  else if (sale.status === "annulee") etat = "annule"
  else if (sale.status === "remboursee") etat = "rembourse"
  else etat = sale.product === "billet" ? "emis" : "enregistre"

  return {
    id: sale._id,
    numero: sale.number,
    kind: sale.kind,
    produit: sale.product,
    canal: sale.channel,
    statut: sale.status,
    etat,
    montant: sale.amounts.ttc,
    percu: sale.amounts.received,
    moyen: sale.paymentMethod ?? null,
    heure: sale.soldAt,
    client,
    telephone,
    trajet,
    desserte,
    places,
    references,
    billets: ticketsCount,
    origine: sale.kind !== "vente" && source ? { id: source._id, numero: source.number } : null,
    pointDeVente: pdv ? { id: pdv._id, code: pdv.code, name: pdv.name } : null,
  }
}

export type ResumeOperation = Awaited<ReturnType<typeof resumeOperation>>

/**
 * Opérations du point de vente sur une période, ou une opération précise
 * retrouvée par son numéro de vente, de billet, d'étiquette ou d'expédition.
 */
export const operations = query({
  args: {
    periode: v.union(v.literal("jour"), v.literal("7j"), v.literal("30j")),
    numero: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "ventes", "consulter")
    const { pos } = await pointDeVente(ctx, actor)

    const numero = args.numero?.trim()
    if (numero) {
      const vente = await venteParReference(ctx, numero)
      return vente ? [await resumeOperation(ctx, vente)] : []
    }

    const aujourdhui = toServiceDate(Date.now())
    const debut = addDays(aujourdhui, args.periode === "jour" ? 0 : args.periode === "7j" ? -6 : -29)
    const jours = await ctx.db
      .query("accountingDays")
      .withIndex("by_date", (q) => q.gte("date", debut))
      .collect()
    const ventes = (
      await Promise.all(
        jours.map((jour) =>
          ctx.db
            .query("sales")
            .withIndex("by_pos_day", (q) => q.eq("pointOfSaleId", pos._id).eq("accountingDayId", jour._id))
            .collect()
        )
      )
    )
      .flat()
      .sort((a, b) => b.soldAt - a.soldAt)
      .slice(0, 400)
    return await Promise.all(ventes.map((s) => resumeOperation(ctx, s)))
  },
})

/* ═══════════════════════ Après-vente du réseau ════════════════════════════ */

/**
 * Périmètre d'un encadrant pour l'après-vente.
 *
 * Rattaché à un point de vente (chef de gare), il voit toute sa gare : les
 * guichets du même bâtiment. Sans rattachement (contrôle des recettes, chef
 * de vente), il voit le réseau entier, ventes en ligne comprises.
 */
async function perimetreEncadrant(ctx: QueryCtx, actor: Doc<"users">) {
  if (actor.pointOfSaleId) {
    const pos = await ctx.db.get(actor.pointOfSaleId)
    if (pos) {
      const station = pos.stationId ? await ctx.db.get(pos.stationId) : null
      const pointsDeVente = pos.stationId
        ? await ctx.db
            .query("pointsOfSale")
            .withIndex("by_station", (q) => q.eq("stationId", pos.stationId))
            .collect()
        : [pos]
      return {
        mode: "gare" as const,
        gare: station ? { id: station._id, code: station.code, name: station.name } : null,
        pointsDeVente,
      }
    }
  }
  return { mode: "reseau" as const, gare: null, pointsDeVente: await ctx.db.query("pointsOfSale").collect() }
}

/** Ce que l'agent peut faire en après-vente, selon la matrice des droits. */
function droitsApresVente(actor: Doc<"users">) {
  return {
    annuler: can(actor.role, "annulations", "creer"),
    // La validation d'un remboursement vaut autorité pour l'exécuter :
    // le contrôle des recettes et le chef de vente remboursent, la
    // vendeuse non (séparation des tâches).
    rembourser: can(actor.role, "remboursements", "creer") || can(actor.role, "remboursements", "valider"),
    dupliquer: can(actor.role, "duplicatas", "creer"),
  }
}

/** Périmètre, points de vente filtrables et paramètres d'impression. */
export const perimetreApresVente = query({
  args: {},
  handler: async (ctx) => {
    const actor = await requirePermission(ctx, "remboursements", "consulter")
    const perimetre = await perimetreEncadrant(ctx, actor)
    const parametres = await reglages(ctx)
    return {
      mode: perimetre.mode,
      gare: perimetre.gare,
      pointsDeVente: perimetre.pointsDeVente
        .map((p) => ({ id: p._id, code: p.code, name: p.name, isActive: p.isActive }))
        .sort((a, b) => a.name.localeCompare(b.name, "fr")),
      droits: droitsApresVente(actor),
      parametres: { mentionDuplicata: parametres.mentionDuplicata, piedBillet: parametres.piedBillet },
    }
  },
})

/**
 * Opérations du périmètre de l'encadrant. Un numéro exact se retrouve sur
 * tout le réseau : le voyageur présente son billet là où il se trouve.
 */
export const operationsReseau = query({
  args: {
    periode: v.union(v.literal("jour"), v.literal("7j"), v.literal("30j")),
    numero: v.optional(v.string()),
    pointOfSaleId: v.optional(v.id("pointsOfSale")),
  },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "remboursements", "consulter")
    const numero = args.numero?.trim()
    if (numero) {
      const vente = await venteParReference(ctx, numero)
      return vente ? [await resumeOperation(ctx, vente)] : []
    }
    const perimetre = await perimetreEncadrant(ctx, actor)
    if (args.pointOfSaleId && !perimetre.pointsDeVente.some((p) => p._id === args.pointOfSaleId)) {
      refus("Ce point de vente est hors de votre périmètre")
    }
    const aujourdhui = toServiceDate(Date.now())
    const debut = addDays(aujourdhui, args.periode === "jour" ? 0 : args.periode === "7j" ? -6 : -29)
    const jours = await ctx.db
      .query("accountingDays")
      .withIndex("by_date", (q) => q.gte("date", debut))
      .collect()
    const lots =
      perimetre.mode === "reseau" && !args.pointOfSaleId
        ? jours.map((jour) =>
            ctx.db
              .query("sales")
              .withIndex("by_accounting_day", (q) => q.eq("accountingDayId", jour._id))
              .collect()
          )
        : jours.flatMap((jour) =>
            (args.pointOfSaleId ? [args.pointOfSaleId] : perimetre.pointsDeVente.map((p) => p._id)).map((pdv) =>
              ctx.db
                .query("sales")
                .withIndex("by_pos_day", (q) => q.eq("pointOfSaleId", pdv).eq("accountingDayId", jour._id))
                .collect()
            )
          )
    const ventes = (await Promise.all(lots))
      .flat()
      .sort((a, b) => b.soldAt - a.soldAt)
      .slice(0, 400)
    return await Promise.all(ventes.map((s) => resumeOperation(ctx, s)))
  },
})

const LIBELLES_CAISSE_SORTIE = {
  agent: "Rendu de votre caisse",
  origine: "Rendu par la caisse qui a encaissé la vente, encore ouverte",
  hors_caisse: "Hors caisse de guichet : réglé par la caisse centrale",
} as const

/** Vente retrouvée par un numéro de vente, de billet, d'étiquette ou d'expédition. */
async function venteParReference(ctx: QueryCtx, reference: string) {
  const parNumero = await ctx.db
    .query("sales")
    .withIndex("by_number", (q) => q.eq("number", reference))
    .unique()
  if (parNumero) return parNumero
  const billet =
    (await ctx.db.query("tickets").withIndex("by_number", (q) => q.eq("number", reference)).unique()) ??
    (await ctx.db.query("tickets").withIndex("by_barcode", (q) => q.eq("barcodePayload", reference)).first())
  if (billet) return await ctx.db.get(billet.saleId)
  const bagage = await ctx.db.query("baggages").withIndex("by_tag", (q) => q.eq("tagNumber", reference)).unique()
  if (bagage) return await ctx.db.get(bagage.saleId)
  const colis = await ctx.db.query("parcels").withIndex("by_shipment", (q) => q.eq("shipmentNumber", reference)).unique()
  if (colis) return await ctx.db.get(colis.saleId)
  const souche = await ctx.db.query("manualTickets").withIndex("by_preprinted", (q) => q.eq("preprintedNumber", reference)).unique()
  if (souche) return await ctx.db.get(souche.saleId)
  return null
}

/**
 * Dossier complet d'une opération : titres, paiements, écritures liées,
 * chronologie et actions permises au guichet.
 */
export const vente = query({
  args: { venteId: v.id("sales") },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "ventes", "consulter")
    const sale = await ctx.db.get(args.venteId)
    if (!sale) return null
    const parametres = await reglages(ctx)
    const resume = await resumeOperation(ctx, sale)

    const tickets = await ctx.db
      .query("tickets")
      .withIndex("by_sale", (q) => q.eq("saleId", sale._id))
      .collect()
    const trip = tickets[0] ? await ctx.db.get(tickets[0].tripId) : null
    const arrets = trip ? await arretsOrdonnes(ctx, trip._id) : []
    const [origine, arrivee] = await Promise.all([
      nomStation(ctx, tickets[0]?.originStationId),
      nomStation(ctx, tickets[0]?.destinationStationId),
    ])
    const scans = (
      await Promise.all(
        tickets.map((t) =>
          ctx.db
            .query("ticketScans")
            .withIndex("by_ticket", (q) => q.eq("ticketId", t._id))
            .collect()
        )
      )
    ).flat()
    const [payments, liees, vendeur, pos] = await Promise.all([
      ctx.db.query("payments").withIndex("by_sale", (q) => q.eq("saleId", sale._id)).collect(),
      ctx.db.query("sales").withIndex("by_origin", (q) => q.eq("originSaleId", sale._id)).collect(),
      sale.sellerId ? ctx.db.get(sale.sellerId) : null,
      sale.pointOfSaleId ? ctx.db.get(sale.pointOfSaleId) : null,
    ])
    const [bagage, colis, vehicule, funeraire, souche] = await Promise.all([
      ctx.db.query("baggages").withIndex("by_sale", (q) => q.eq("saleId", sale._id)).first(),
      ctx.db.query("parcels").withIndex("by_sale", (q) => q.eq("saleId", sale._id)).first(),
      ctx.db.query("vehicleTransports").withIndex("by_sale", (q) => q.eq("saleId", sale._id)).first(),
      ctx.db.query("funeralTransports").withIndex("by_sale", (q) => q.eq("saleId", sale._id)).first(),
      ctx.db.query("manualTickets").withIndex("by_sale", (q) => q.eq("saleId", sale._id)).first(),
    ])
    const articles = colis
      ? await ctx.db.query("parcelItems").withIndex("by_parcel", (q) => q.eq("parcelId", colis._id)).collect()
      : []
    const client = colis
      ? { origine: await nomStation(ctx, colis.originStationId), arrivee: await nomStation(ctx, colis.destinationStationId) }
      : bagage
        ? { origine: await nomStation(ctx, bagage.originStationId), arrivee: await nomStation(ctx, bagage.destinationStationId) }
        : vehicule
          ? { origine: await nomStation(ctx, vehicule.originStationId), arrivee: await nomStation(ctx, vehicule.destinationStationId) }
          : funeraire
            ? { origine: await nomStation(ctx, funeraire.originStationId), arrivee: await nomStation(ctx, funeraire.destinationStationId) }
            : null
    const acheminement = colis?.tripId ?? bagage?.tripId ?? vehicule?.tripId ?? funeraire?.tripId
    const tripAnnexe = !trip && acheminement ? await ctx.db.get(acheminement) : null

    /* ── Chronologie : journal d'audit de la vente et de ses titres ───── */
    const journaux = (
      await Promise.all(
        [sale._id as string, ...tickets.map((t) => t._id as string)].map((id) =>
          ctx.db
            .query("auditLogs")
            .withIndex("by_entity", (q) => q.eq("entityTable", id === sale._id ? "sales" : "tickets").eq("entityId", id))
            .collect()
        )
      )
    ).flat()
    const acteurs = new Map<string, string | null>()
    for (const log of journaux) {
      if (log.actorId && !acteurs.has(log.actorId)) acteurs.set(log.actorId, nomComplet(await ctx.db.get(log.actorId)))
    }
    const chronologie = [
      ...journaux.map((log) => ({
        cle: log._id as string,
        heure: log.createdAt,
        action: log.action,
        acteur: log.actorId ? (acteurs.get(log.actorId) ?? null) : null,
        detail: log.after ?? null,
      })),
      ...(await Promise.all(
        scans.map(async (scan) => {
          const agent = await ctx.db.get(scan.agentId)
          const scanTrip = await ctx.db.get(scan.tripId)
          return {
            cle: scan._id as string,
            heure: scan.scannedAt,
            action: `controle.${scan.result}`,
            acteur: nomComplet(agent),
            detail: scanTrip ? `${scanTrip.trainNumber} · ${scan.offline ? "hors ligne" : "en ligne"}` : null,
          }
        })
      )),
    ].sort((a, b) => a.heure - b.heure)

    /* ── Actions permises ─────────────────────────────────────────────── */
    const valides = tickets.filter((t) => t.status === "valide")
    const controle = tickets.some((t) => t.status === "utilise")
    const estVenteBillet = sale.kind === "vente" && sale.product === "billet"
    const politique = trip ? penaliteRemboursement(parametres.remboursement, trip, Date.now()) : null
    const sortie = await caisseDeSortie(ctx, sale, actor)

    return {
      resume,
      vente: {
        id: sale._id,
        numero: sale.number,
        kind: sale.kind,
        produit: sale.product,
        canal: sale.channel,
        statut: sale.status,
        montants: sale.amounts,
        moyen: sale.paymentMethod ?? null,
        heure: sale.soldAt,
        motif: sale.refundReason ?? null,
        penalitePct: sale.penaltyPct ?? null,
        vendeur: nomComplet(vendeur),
        matriculeVendeur: vendeur?.matricule ?? null,
        pointDeVente: pos ? { code: pos.code, name: pos.name } : null,
        telephone: sale.contactPhone ?? null,
        finTenue: sale.status === "en_attente_paiement" ? (sale.priceLockedUntil ?? null) : null,
      },
      desserte: trip
        ? {
            id: trip._id,
            trainNumber: trip.trainNumber,
            trainType: trip.trainType,
            serviceDate: trip.serviceDate,
            departAt: arrets[tickets[0]!.fromStopIndex]?.departureAt ?? trip.departureAt,
            arriveeAt: arrets[tickets[0]!.toStopIndex]?.arrivalAt ?? trip.arrivalAt,
            status: trip.status,
            delayMinutes: trip.delayMinutes,
          }
        : tripAnnexe
          ? {
              id: tripAnnexe._id,
              trainNumber: tripAnnexe.trainNumber,
              trainType: tripAnnexe.trainType,
              serviceDate: tripAnnexe.serviceDate,
              departAt: tripAnnexe.departureAt,
              arriveeAt: tripAnnexe.arrivalAt,
              status: tripAnnexe.status,
              delayMinutes: tripAnnexe.delayMinutes,
            }
          : null,
      origine: origine ?? client?.origine ?? null,
      arrivee: arrivee ?? client?.arrivee ?? null,
      billets: tickets.map((t) => ({
        id: t._id,
        numero: t.number,
        voyageur: { nom: t.passenger.lastName, prenom: t.passenger.firstName, telephone: t.passenger.phone ?? null },
        classe: t.serviceClass,
        voiture: t.coachLabel ?? null,
        place: t.seatLabel ?? null,
        debout: t.isStanding,
        prix: t.unitPriceTtc,
        reduction: t.fare.discountCode ?? null,
        reductionPct: t.fare.discountPct,
        statut: t.status,
        duplicatas: t.duplicateCount,
        codeBarres: t.barcodePayload ?? null,
        controleA: scans.find((s) => s.ticketId === t._id && s.result === "valide")?.scannedAt ?? t.usedAt ?? null,
      })),
      paiements: payments.map((p) => ({
        id: p._id,
        moyen: p.method,
        statut: p.status,
        montant: p.amountXaf,
        remis: p.tenderedXaf ?? null,
        rendu: p.changeXaf ?? null,
        reference: p.reference ?? p.providerReference ?? null,
        telephone: p.payerPhone ?? null,
        simule: p.provider === "simulation",
        regleA: p.settledAt ?? null,
        raison: p.failureReason ?? null,
      })),
      liees: await Promise.all(liees.map((s) => resumeOperation(ctx, s))),
      bagage: bagage
        ? {
            etiquette: bagage.tagNumber,
            poids: bagage.weightKg,
            pieces: bagage.pieceCount ?? 1,
            nature: bagage.description ?? null,
            expediteur: bagage.senderName,
            destinataire: bagage.recipientName ?? null,
            distanceKm: bagage.distanceKm,
            billet: (await ctx.db.get(bagage.ticketId))?.number ?? null,
          }
        : null,
      colis: colis
        ? {
            expedition: colis.shipmentNumber,
            zone: colis.zone,
            distanceKm: colis.distanceKm,
            poids: colis.totalWeightKg,
            statut: colis.status,
            expediteur: { nom: colis.senderName, telephone: colis.senderPhone, piece: colis.senderIdDocument ?? null },
            destinataire: { nom: colis.recipientName, telephone: colis.recipientPhone },
            valeurDeclaree: colis.declaredValueXaf ?? null,
            consignes: colis.handling ?? [],
            articles: articles.map((a) => ({ vignette: a.stickerNumber, description: a.description, poids: a.weightKg, montant: a.amountTtc })),
          }
        : null,
      transportSpecial: vehicule
        ? { type: "taa" as const, expedition: vehicule.shipmentNumber, tonnage: vehicule.tonnage, expediteur: vehicule.senderName, valideJusquA: vehicule.validUntil }
        : funeraire
          ? { type: "funeraire" as const, expedition: funeraire.shipmentNumber, tonnage: funeraire.tonnage, expediteur: funeraire.senderName, valideJusquA: null }
          : null,
      souche: souche ? { numero: souche.preprintedNumber, venduA: souche.soldAt, ressaisieA: souche.recordedAt } : null,
      chronologie,
      actions: {
        duplicata: estVenteBillet && valides.length > 0,
        annulation: estVenteBillet && sale.status === "confirmee" && valides.length > 0 && !controle,
        remboursement:
          estVenteBillet && sale.status !== "remboursee" && valides.length > 0 && !controle && (politique?.autorise ?? false),
        controle,
        politique,
        motifs: parametres.remboursement.motifs,
        baremeProvisoire: parametres.remboursement.provisoire,
      },
      moi: actor._id === sale.sellerId,
      droits: droitsApresVente(actor),
      /** D'où sortirait l'argent si l'agent annulait ou remboursait maintenant. */
      caisseSortie: sale.kind === "vente" ? { mode: sortie.mode, libelle: LIBELLES_CAISSE_SORTIE[sortie.mode] } : null,
    }
  },
})

/* ═════════════════════════ Recherche de desserte ══════════════════════════ */

/**
 * Dessertes d'un jour entre deux gares, au tarif du guichet : une ligne par
 * train, une case par classe (prix adulte, places libres sur tout le trajet,
 * total du groupe saisi).
 */
export const dessertes = query({
  args: {
    originStationId: v.id("stations"),
    destinationStationId: v.id("stations"),
    serviceDate: v.string(),
    /** Une entrée par voyageur : code de réduction, vide pour un adulte. */
    discountCodes: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "ventes", "consulter")
    const voyageurs = Math.max(1, args.discountCodes.length)
    if (voyageurs > 50) throw new ConvexError("Au plus 50 voyageurs par vente")
    if (args.originStationId === args.destinationStationId) return []

    let tarification: Awaited<ReturnType<typeof chargerTarification>> | null = null
    try {
      tarification = await chargerTarification(ctx)
    } catch {
      tarification = null
    }

    const trips = await ctx.db
      .query("trips")
      .withIndex("by_service_date", (q) => q.eq("serviceDate", args.serviceDate))
      .collect()
    const resultats = []
    for (const trip of trips) {
      if (!trip.isOpenForSale && trip.status !== "annule") continue
      const arrets = await arretsOrdonnes(ctx, trip._id)
      const fromIndex = arrets.findIndex((a) => a.stationId === args.originStationId)
      const toIndex = arrets.findIndex((a) => a.stationId === args.destinationStationId)
      if (fromIndex === -1 || toIndex === -1 || toIndex <= fromIndex) continue
      const distanceKm = Math.abs(arrets[toIndex]!.kilometerPoint - arrets[fromIndex]!.kilometerPoint)
      const counters = await ctx.db
        .query("segmentCounters")
        .withIndex("by_trip_class", (q) => q.eq("tripId", trip._id))
        .collect()
      const quotas =
        tarification && trip.status !== "annule"
          ? await ctx.db
              .query("fareClassQuotas")
              .withIndex("by_trip_class", (q) => q.eq("tripId", trip._id))
              .collect()
          : []
      const dispo = disponibilites(counters, fromIndex, toIndex)
      const classes: Partial<
        Record<Classe, { disponibles: number; capacite: number; prixAdulteTtc: number | null; totalTtc: number | null; lignes: number[] }>
      > = {}
      for (const classe of CLASSES) {
        const d = dispo[classe]
        if (!d) continue
        let prixAdulteTtc: number | null = null
        let totalTtc: number | null = null
        let lignes: number[] = []
        if (tarification && trip.status !== "annule") {
          try {
            const base = { trip, distanceKm, fromIndex, toIndex, serviceClass: classe, passengerCount: voyageurs }
            const adulte = await devisDesserte(ctx, tarification, base, "guichet", { counters, quotas })
            const groupe = await devisDesserte(
              ctx,
              tarification,
              { ...base, discountCodes: args.discountCodes },
              "guichet",
              { counters, quotas }
            )
            prixAdulteTtc = adulte.lines[0]?.unitPriceTtc ?? null
            totalTtc = groupe.totalTtc
            lignes = groupe.lines.map((l) => l.unitPriceTtc)
          } catch {
            // Classe sans base tarifaire : affichée, non vendable.
          }
        }
        classes[classe] = { ...d, prixAdulteTtc, totalTtc, lignes }
      }
      resultats.push({
        tripId: trip._id,
        trainNumber: trip.trainNumber,
        trainType: trip.trainType,
        serviceDate: trip.serviceDate,
        status: trip.status,
        delayMinutes: trip.delayMinutes,
        departAt: arrets[fromIndex]!.departureAt ?? trip.departureAt,
        arriveeAt: arrets[toIndex]!.arrivalAt ?? trip.arrivalAt,
        fromIndex,
        toIndex,
        distanceKm,
        arretsIntermediaires: toIndex - fromIndex - 1,
        classes,
      })
    }
    return resultats.sort((a, b) => a.departAt - b.departAt)
  },
})

/* ═════════════════════════ Tenue des places ═══════════════════════════════ */

/** Vente tenue par ce vendeur, encore en attente de règlement. */
async function tenueDuVendeur(ctx: MutationCtx, actor: Doc<"users">, venteId: Id<"sales">) {
  const sale = await ctx.db.get(venteId)
  if (!sale || sale.sellerId !== actor._id || sale.channel !== "guichet") {
    refus("Tenue introuvable pour ce guichet")
  }
  return sale
}

/**
 * Libère les places d'une tenue et clôt la vente sans écriture comptable :
 * elle n'a jamais rien encaissé. Le document reste, pour que la numérotation
 * du guichet ne présente aucun trou.
 */
async function libererTenueInterne(ctx: MutationCtx, sale: Doc<"sales">, statut: "annulee" | "expiree") {
  if (sale.status !== "en_attente_paiement") return 0
  const tickets = await ctx.db
    .query("tickets")
    .withIndex("by_sale", (q) => q.eq("saleId", sale._id))
    .collect()
  for (const ticket of tickets) {
    if (ticket.status !== "en_attente") continue
    const trip = await ctx.db.get(ticket.tripId)
    if (!trip) continue
    const mask = segmentMask({ fromIndex: ticket.fromStopIndex, toIndex: ticket.toStopIndex }, trip.segmentCount)
    if (ticket.seatId) {
      const occupancy = await ctx.db
        .query("seatOccupancy")
        .withIndex("by_trip_seat", (q) => q.eq("tripId", ticket.tripId).eq("seatId", ticket.seatId!))
        .unique()
      if (occupancy) await ctx.db.patch(occupancy._id, { heldMask: release(occupancy.heldMask, mask) })
    }
    await ctx.db.patch(ticket._id, { status: statut === "annulee" ? "annule" : "expire" })
    const counters = (
      await ctx.db
        .query("segmentCounters")
        .withIndex("by_trip_class", (q) => q.eq("tripId", ticket.tripId).eq("serviceClass", ticket.serviceClass))
        .collect()
    ).filter((c) => c.segmentIndex >= ticket.fromStopIndex && c.segmentIndex < ticket.toStopIndex)
    for (const counter of counters) {
      const held = Math.max(0, counter.held - 1)
      await ctx.db.patch(counter._id, { held, available: counter.capacity - counter.sold - held - counter.reserved })
    }
  }
  const enAttente = await ctx.db
    .query("payments")
    .withIndex("by_sale", (q) => q.eq("saleId", sale._id))
    .collect()
  for (const payment of enAttente) {
    if (payment.status === "en_attente" || payment.status === "initie") {
      await ctx.db.patch(payment._id, { status: "echoue", failureReason: "Places libérées avant la confirmation" })
    }
  }
  await ctx.db.patch(sale._id, { status: statut, cancelledAt: Date.now(), priceLockedUntil: undefined })
  return tickets.length
}

/**
 * Transforme une tenue en vente ferme : les masques passent de « tenu » à
 * « vendu », la vente entre en comptabilité et dans la caisse.
 */
async function confirmerTenue(ctx: MutationCtx, sale: Doc<"sales">, actorId: Id<"users"> | undefined) {
  const tickets = await ctx.db
    .query("tickets")
    .withIndex("by_sale", (q) => q.eq("saleId", sale._id))
    .collect()
  if (tickets.length === 0) refus("Tenue sans titre")
  for (const ticket of tickets) {
    const trip = await ctx.db.get(ticket.tripId)
    if (!trip) refus("Desserte introuvable")
    const mask = segmentMask({ fromIndex: ticket.fromStopIndex, toIndex: ticket.toStopIndex }, trip.segmentCount)
    if (ticket.seatId) {
      const occupancy = await ctx.db
        .query("seatOccupancy")
        .withIndex("by_trip_seat", (q) => q.eq("tripId", ticket.tripId).eq("seatId", ticket.seatId!))
        .unique()
      if (occupancy) {
        await ctx.db.patch(occupancy._id, {
          heldMask: release(occupancy.heldMask, mask),
          soldMask: occupancy.soldMask | mask,
        })
      }
    }
    await ctx.db.patch(ticket._id, { status: "valide" })
    const counters = (
      await ctx.db
        .query("segmentCounters")
        .withIndex("by_trip_class", (q) => q.eq("tripId", ticket.tripId).eq("serviceClass", ticket.serviceClass))
        .collect()
    ).filter((c) => c.segmentIndex >= ticket.fromStopIndex && c.segmentIndex < ticket.toStopIndex)
    for (const counter of counters) {
      const held = Math.max(0, counter.held - 1)
      const sold = counter.sold + 1
      await ctx.db.patch(counter._id, { held, sold, available: counter.capacity - sold - held - counter.reserved })
    }
  }
  const day = await currentAccountingDay(ctx)
  await ctx.db.patch(sale._id, {
    status: "confirmee",
    accountingDayId: day._id,
    amounts: { ...sale.amounts, received: sale.amounts.ttc },
    priceLockedUntil: undefined,
    soldAt: Date.now(),
  })
  await accrueToAccountingDay(ctx, day, sale.amounts.ttc, sale.amounts.ttc)
  await audit(ctx, {
    actorId,
    action: "vente.guichet",
    entityTable: "sales",
    entityId: sale._id,
    after: { number: sale.number, tickets: tickets.length, ttc: sale.amounts.ttc, tenue: true },
  })
  return tickets
}

/** Réponse des mutations de tenue : de quoi afficher le récapitulatif. */
async function etatTenue(ctx: MutationCtx, saleId: Id<"sales">) {
  const sale = (await ctx.db.get(saleId))!
  const tickets = await ctx.db
    .query("tickets")
    .withIndex("by_sale", (q) => q.eq("saleId", saleId))
    .collect()
  return {
    venteId: sale._id,
    numero: sale.number,
    finTenue: sale.priceLockedUntil ?? Date.now(),
    montants: sale.amounts,
    billets: tickets.map((t) => ({
      id: t._id,
      numero: t.number,
      seatId: t.seatId ?? null,
      voiture: t.coachLabel ?? null,
      place: t.seatLabel ?? null,
      prix: t.unitPriceTtc,
      reduction: t.fare.discountCode ?? null,
    })),
  }
}

/**
 * Tient les places choisies pendant la saisie et l'encaissement.
 *
 * `remplace` libère la tenue précédente DANS la même transaction : changer
 * une place ou une catégorie ne rend jamais la place au public, même une
 * fraction de seconde.
 */
export const tenirPlaces = mutation({
  args: {
    tripId: v.id("trips"),
    originStationId: v.id("stations"),
    destinationStationId: v.id("stations"),
    serviceClass,
    passagers: v.array(
      v.object({
        seatId: v.optional(v.id("seats")),
        discountCode: v.optional(v.string()),
      })
    ),
    remplace: v.optional(v.id("sales")),
    deviceId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "ventes", "creer")
    if (args.passagers.length === 0) refus("Aucun voyageur : rien à tenir")
    if (args.passagers.length > 50) refus("Au plus 50 voyageurs par vente")
    if (args.remplace) {
      const precedente = await tenueDuVendeur(ctx, actor, args.remplace)
      await libererTenueInterne(ctx, precedente, "annulee")
    }
    const parametres = await reglages(ctx)
    const holdMs = parametres.tenueMinutes * 60_000

    let result: Awaited<ReturnType<typeof performSale>>
    try {
      result = await performSale(
        ctx,
        { actor, channel: "guichet", mode: "hold", holdMs },
        {
          tripId: args.tripId,
          originStationId: args.originStationId,
          destinationStationId: args.destinationStationId,
          serviceClass: args.serviceClass,
          // L'identité se saisit à l'étape suivante : elle n'entre ni dans le
          // prix ni dans le code-barres signé, et remplace ces libellés au
          // règlement.
          passengers: args.passagers.map((p, index) => ({
            lastName: "VOYAGEUR",
            firstName: String(index + 1),
            gender: "M" as const,
            discountCode: p.discountCode || undefined,
            seatId: p.seatId,
          })),
          method: "especes",
          deviceId: args.deviceId,
        }
      )
    } catch (cause) {
      if (cause instanceof SeatUnavailableError) {
        refus("Une place choisie vient d'être vendue sur ce trajet : choisissez-en une autre.")
      }
      if (cause instanceof ConvexError) throw cause
      refus(cause instanceof Error ? cause.message : "Places impossibles à tenir")
    }

    // Repère de voiture sur chaque titre, pour le billet imprimé.
    const tickets = await ctx.db
      .query("tickets")
      .withIndex("by_sale", (q) => q.eq("saleId", result.saleId))
      .collect()
    for (const ticket of tickets) {
      if (!ticket.seatId) continue
      const seat = await ctx.db.get(ticket.seatId)
      const coach = seat ? await ctx.db.get(seat.coachId) : null
      if (coach) await ctx.db.patch(ticket._id, { coachLabel: coach.label })
    }
    return await etatTenue(ctx, result.saleId)
  },
})

/** Rend les places tenues : abandon de la vente ou retour au choix du trajet. */
export const libererTenue = mutation({
  args: { venteId: v.id("sales") },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "ventes", "creer")
    const sale = await tenueDuVendeur(ctx, actor, args.venteId)
    const liberes = await libererTenueInterne(ctx, sale, "annulee")
    if (liberes > 0) {
      await audit(ctx, {
        actorId: actor._id,
        action: "vente.tenue.liberer",
        entityTable: "sales",
        entityId: sale._id,
        after: { number: sale.number, tickets: liberes },
      })
    }
    return { liberes }
  },
})

const voyageurArg = v.object({
  billetId: v.id("tickets"),
  lastName: v.string(),
  firstName: v.string(),
  gender: v.union(v.literal("M"), v.literal("F")),
  phone: v.optional(v.string()),
})

/**
 * Encaisse une vente tenue.
 *
 * Espèces, carte et compte client : la vente devient ferme dans la même
 * transaction. Paiement mobile ou Click&Pay : une demande part vers
 * l'opérateur et la tenue est prolongée le temps qu'il réponde ; la vente se
 * confirme d'elle-même à sa réponse.
 */
export const encaisserBillets = mutation({
  args: {
    venteId: v.id("sales"),
    voyageurs: v.array(voyageurArg),
    method: paymentMethod,
    tendered: v.optional(v.number()),
    payerPhone: v.optional(v.string()),
    reference: v.optional(v.string()),
    corporateAccountId: v.optional(v.id("corporateAccounts")),
  },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "ventes", "creer")
    const sale = await tenueDuVendeur(ctx, actor, args.venteId)
    if (sale.status === "confirmee") refus("Vente déjà encaissée")
    if (sale.status !== "en_attente_paiement") {
      refus("Les places ne sont plus tenues : reprenez le choix des places")
    }
    const now = Date.now()
    if (sale.priceLockedUntil !== undefined && sale.priceLockedUntil < now) {
      refus("Le délai de tenue est écoulé : les places ont été rendues à la vente")
    }
    const session = sale.cashSessionId ? await ctx.db.get(sale.cashSessionId) : null
    if (!session || session.status !== "ouverte") {
      refus("La caisse a été clôturée : ouvrez une nouvelle caisse pour vendre")
    }

    /* ── Identité des voyageurs ───────────────────────────────────────── */
    const tickets = await ctx.db
      .query("tickets")
      .withIndex("by_sale", (q) => q.eq("saleId", sale._id))
      .collect()
    if (args.voyageurs.length !== tickets.length) {
      refus(`${tickets.length} voyageur(s) attendu(s), ${args.voyageurs.length} saisi(s)`)
    }
    for (const [index, voyageur] of args.voyageurs.entries()) {
      const ticket = tickets.find((t) => t._id === voyageur.billetId)
      if (!ticket) refus("Un voyageur ne correspond à aucune place tenue")
      if (!voyageur.lastName.trim() || !voyageur.firstName.trim()) {
        refus(`Voyageur ${index + 1} : le nom et le prénom sont obligatoires`)
      }
      await ctx.db.patch(ticket._id, {
        passenger: {
          ...ticket.passenger,
          lastName: voyageur.lastName.trim().toUpperCase(),
          firstName: voyageur.firstName.trim(),
          gender: voyageur.gender,
          phone: voyageur.phone?.trim() || undefined,
        },
      })
    }
    const contact = args.voyageurs.find((v) => v.phone?.trim())?.phone?.trim()
    if (contact) await ctx.db.patch(sale._id, { contactPhone: contact })

    const ttc = sale.amounts.ttc

    /* ── Paiement à distance : demande à l'opérateur ─────────────────── */
    if (MOYENS_A_DISTANCE.includes(args.method)) {
      const telephone = args.payerPhone?.trim()
      if (!telephone) refus("Le numéro du payeur est obligatoire")
      const parametres = await reglages(ctx)
      const precedents = await ctx.db
        .query("payments")
        .withIndex("by_sale", (q) => q.eq("saleId", sale._id))
        .collect()
      if (precedents.some((p) => p.status === "en_attente")) {
        refus("Une demande de paiement est déjà en cours pour cette vente")
      }
      const tentatives = precedents.filter((p) => MOYENS_A_DISTANCE.includes(p.method)).length
      if (tentatives >= parametres.tentativesMobile) {
        refus(`${tentatives} tentatives de paiement mobile : proposez un autre moyen de paiement`)
      }
      const expiresAt = now + DELAI_VALIDATION_MOBILE_MS
      const paymentId = await ctx.db.insert("payments", {
        saleId: sale._id,
        method: args.method,
        provider: "simulation",
        status: "en_attente",
        amountXaf: ttc,
        payerPhone: telephone,
        expiresAt,
        requestedBy: actor._id,
        attempt: tentatives + 1,
      })
      // La tenue couvre au moins le délai de validation du client.
      await ctx.db.patch(sale._id, {
        priceLockedUntil: Math.max(sale.priceLockedUntil ?? now, expiresAt + 30_000),
      })
      await ctx.scheduler.runAfter(DELAI_REPONSE_OPERATEUR_MS, internal.functions.guichet.reponseOperateur, { paymentId })
      await audit(ctx, {
        actorId: actor._id,
        action: "paiement.demander",
        entityTable: "sales",
        entityId: sale._id,
        after: { method: args.method, ttc, attempt: tentatives + 1, simulation: true },
      })
      return { statut: "en_attente" as const, paiementId: paymentId, venteId: sale._id, expireA: expiresAt, monnaie: 0 }
    }

    /* ── Règlement au comptoir : la vente devient ferme ──────────────── */
    const reglement = await verifierReglement(ctx, actor, args, ttc)
    await confirmerTenue(ctx, sale, actor._id)
    await enregistrerReglement(ctx, actor, sale._id, reglement, ttc)
    return {
      statut: "confirmee" as const,
      paiementId: null,
      venteId: sale._id,
      expireA: null,
      monnaie: reglement.changeXaf ?? 0,
    }
  },
})

/**
 * Demande de paiement mobile hors billet (bagage, colis, prestation) : le
 * paiement est confirmé AVANT l'écriture de la vente, qui le consomme.
 */
export const demanderPaiement = mutation({
  args: {
    method: paymentMethod,
    amountXaf: v.number(),
    payerPhone: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "ventes", "creer")
    if (!MOYENS_A_DISTANCE.includes(args.method)) refus("Ce moyen se règle au comptoir")
    if (!Number.isFinite(args.amountXaf) || args.amountXaf <= 0) refus("Montant à régler invalide")
    if (!args.payerPhone.trim()) refus("Le numéro du payeur est obligatoire")
    if (!(await sessionOuverte(ctx, actor._id))) refus("Aucune caisse ouverte : vente impossible")
    const expiresAt = Date.now() + DELAI_VALIDATION_MOBILE_MS
    const paymentId = await ctx.db.insert("payments", {
      method: args.method,
      provider: "simulation",
      status: "en_attente",
      amountXaf: args.amountXaf,
      payerPhone: args.payerPhone.trim(),
      expiresAt,
      requestedBy: actor._id,
      attempt: 1,
    })
    await ctx.scheduler.runAfter(DELAI_REPONSE_OPERATEUR_MS, internal.functions.guichet.reponseOperateur, { paymentId })
    await audit(ctx, {
      actorId: actor._id,
      action: "paiement.demander",
      entityTable: "payments",
      entityId: paymentId,
      after: { method: args.method, amountXaf: args.amountXaf, simulation: true },
    })
    return { paiementId: paymentId, expireA: expiresAt }
  },
})

/** Le vendeur renonce à une demande en cours : le client paiera autrement. */
export const annulerDemandePaiement = mutation({
  args: { paiementId: v.id("payments") },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "ventes", "creer")
    const payment = await ctx.db.get(args.paiementId)
    if (!payment || payment.requestedBy !== actor._id) refus("Demande introuvable")
    if (payment.status !== "en_attente") return { statut: payment.status }
    await ctx.db.patch(payment._id, { status: "echoue", failureReason: "Demande annulée au guichet" })
    await audit(ctx, {
      actorId: actor._id,
      action: "paiement.annuler_demande",
      entityTable: "payments",
      entityId: payment._id,
    })
    return { statut: "echoue" as const }
  },
})

/** État d'une demande de paiement, suivi en direct par l'écran d'attente. */
export const paiement = query({
  args: { paiementId: v.id("payments") },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "ventes", "consulter")
    const payment = await ctx.db.get(args.paiementId)
    if (!payment || payment.requestedBy !== actor._id) return null
    const sale = payment.saleId ? await ctx.db.get(payment.saleId) : null
    const parametres = await reglages(ctx)
    return {
      id: payment._id,
      statut: payment.status,
      moyen: payment.method,
      montant: payment.amountXaf,
      telephone: payment.payerPhone ?? null,
      expireA: payment.expiresAt ?? null,
      raison: payment.failureReason ?? null,
      reference: payment.providerReference ?? null,
      simule: payment.provider === "simulation",
      tentative: payment.attempt ?? 1,
      tentativesMax: parametres.tentativesMobile,
      vente: sale ? { id: sale._id, numero: sale.number, statut: sale.status } : null,
    }
  },
})

/**
 * SIMULATION de la réponse de l'opérateur (Airtel Money, Moov Money,
 * Click&Pay), faute de raccordement. Un numéro de payeur finissant par
 * « 000 » est refusé (solde insuffisant), pour exercer le chemin d'échec ;
 * tout autre numéro est accepté.
 */
export const reponseOperateur = internalMutation({
  args: { paymentId: v.id("payments") },
  handler: async (ctx, args) => {
    const payment = await ctx.db.get(args.paymentId)
    if (!payment || payment.status !== "en_attente") return null
    const now = Date.now()
    if (payment.expiresAt !== undefined && payment.expiresAt < now) {
      await ctx.db.patch(payment._id, { status: "expire", failureReason: "Délai de validation dépassé" })
      return "expire"
    }
    const chiffres = (payment.payerPhone ?? "").replace(/\D/g, "")
    if (chiffres.endsWith("000")) {
      await ctx.db.patch(payment._id, {
        status: "echoue",
        failureReason: "Refusé par l'opérateur : solde insuffisant (simulation)",
        lastPolledAt: now,
      })
      return "echoue"
    }
    const reference = `SIM-${payment.method === "airtel_money" ? "AM" : payment.method === "moov_money" ? "MM" : "CP"}-${String(now).slice(-8)}`
    if (payment.saleId) {
      const sale = await ctx.db.get(payment.saleId)
      if (!sale || sale.status !== "en_attente_paiement") {
        await ctx.db.patch(payment._id, { status: "echoue", failureReason: "Places libérées avant la confirmation" })
        return "echoue"
      }
      await confirmerTenue(ctx, sale, payment.requestedBy)
      await ctx.db.patch(sale._id, { paymentMethod: payment.method })
    }
    await ctx.db.patch(payment._id, {
      status: "confirme",
      settledAt: now,
      lastPolledAt: now,
      providerReference: reference,
      reference,
    })
    await audit(ctx, {
      actorId: payment.requestedBy,
      action: "paiement.confirmation_simulee",
      entityTable: "payments",
      entityId: payment._id,
      after: { method: payment.method, amountXaf: payment.amountXaf, reference, saleId: payment.saleId },
    })
    return "confirme"
  },
})

/* ═════════════════════════ Après-vente ════════════════════════════════════ */

/**
 * Rembourse un billet au guichet. La pénalité ne se saisit pas : elle vient
 * du paramétrage, selon le délai avant départ et l'état de la desserte.
 */
export const rembourser = mutation({
  args: {
    venteId: v.id("sales"),
    billetIds: v.optional(v.array(v.id("tickets"))),
    motif: v.string(),
  },
  handler: async (ctx, args) => {
    // Droit de créer (chef de gare) ou de valider (contrôle des recettes,
    // chef de vente) : l'un et l'autre exécutent le remboursement.
    let actor: Doc<"users">
    try {
      actor = await requirePermission(ctx, "remboursements", "creer")
    } catch {
      actor = await requirePermission(ctx, "remboursements", "valider")
    }
    const sale = await ctx.db.get(args.venteId)
    if (!sale) refus("Vente introuvable")
    const premier = await ctx.db
      .query("tickets")
      .withIndex("by_sale", (q) => q.eq("saleId", sale._id))
      .first()
    if (!premier) refus("Vente sans billet : rien à rembourser")
    const trip = await ctx.db.get(premier.tripId)
    if (!trip) refus("Desserte introuvable")
    const parametres = await reglages(ctx)
    const politique = penaliteRemboursement(parametres.remboursement, trip, Date.now())
    if (!politique.autorise) refus(politique.raison)
    try {
      return await performRefund(ctx, actor, {
        saleId: sale._id,
        ticketIds: args.billetIds,
        reason: args.motif,
        penaltyPct: politique.penalitePct,
      })
    } catch (cause) {
      if (cause instanceof ConvexError) throw cause
      refus(cause instanceof Error ? cause.message : "Remboursement impossible")
    }
  },
})

/* ═════════════════════════ Billet pour les annexes ════════════════════════ */

/**
 * Billet retrouvé par son numéro ou par la lecture de son code, pour y
 * rattacher un bagage ou un véhicule.
 */
export const billet = query({
  args: { reference: v.string() },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "ventes", "consulter")
    const reference = args.reference.trim()
    if (!reference) return null
    const ticket =
      (await ctx.db.query("tickets").withIndex("by_number", (q) => q.eq("number", reference)).unique()) ??
      (await ctx.db.query("tickets").withIndex("by_barcode", (q) => q.eq("barcodePayload", reference)).first())
    if (!ticket) return null
    const [trip, origine, arrivee, sale] = await Promise.all([
      ctx.db.get(ticket.tripId),
      ctx.db.get(ticket.originStationId),
      ctx.db.get(ticket.destinationStationId),
      ctx.db.get(ticket.saleId),
    ])
    const arrets = trip ? await arretsOrdonnes(ctx, trip._id) : []
    const bagages = await ctx.db
      .query("baggages")
      .withIndex("by_ticket", (q) => q.eq("ticketId", ticket._id))
      .collect()
    return {
      id: ticket._id,
      numero: ticket.number,
      vente: sale?.number ?? null,
      voyageur: `${ticket.passenger.lastName} ${ticket.passenger.firstName}`.trim(),
      statut: ticket.status,
      classe: ticket.serviceClass,
      voiture: ticket.coachLabel ?? null,
      place: ticket.seatLabel ?? null,
      origine: origine ? { code: origine.code, name: origine.name } : null,
      arrivee: arrivee ? { code: arrivee.code, name: arrivee.name } : null,
      distanceKm: origine && arrivee ? distanceBetween(origine.kilometerPoint, arrivee.kilometerPoint) : 0,
      desserte: trip
        ? {
            trainNumber: trip.trainNumber,
            trainType: trip.trainType,
            serviceDate: trip.serviceDate,
            departAt: arrets[ticket.fromStopIndex]?.departureAt ?? trip.departureAt,
            status: trip.status,
          }
        : null,
      bagages: bagages.map((b) => ({ etiquette: b.tagNumber, poids: b.weightKg })),
    }
  },
})

/** Clients conventionnés actifs, pour le règlement en compte. */
export const clientsConventionnes = query({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, "ventes", "consulter")
    const comptes = await ctx.db.query("corporateAccounts").collect()
    return comptes
      .filter((c) => c.isActive)
      .map((c) => ({
        id: c._id,
        code: c.code,
        nom: c.name,
        plafond: c.creditLimitXaf,
        encours: c.outstandingXaf,
        disponible: Math.max(0, c.creditLimitXaf - c.outstandingXaf),
      }))
      .sort((a, b) => a.nom.localeCompare(b.nom, "fr"))
  },
})

/* ═════════════════════════════ Caisse ═════════════════════════════════════ */

async function detailSession(ctx: QueryCtx, session: Doc<"cashSessions">) {
  const ventes = (
    await ctx.db
      .query("sales")
      .withIndex("by_cash_session", (q) => q.eq("cashSessionId", session._id))
      .collect()
  ).filter(compteEnCaisse)
  const attendu = session.status === "ouverte" ? attenduParMoyen(ventes) : null
  const attenduStocke = session.expectedByMethod.map((e) => ({
    method: e.method,
    amountXaf: e.amountXaf,
    count: ventes.filter((s) => (s.paymentMethod ?? "especes") === e.method).length,
  }))
  const encaissements = ventes.filter((s) => s.kind === "vente")
  const sorties = ventes.filter((s) => s.kind !== "vente")
  const [pos, vendeur] = await Promise.all([ctx.db.get(session.pointOfSaleId), ctx.db.get(session.sellerId)])
  const jour = await ctx.db.get(session.accountingDayId)
  return {
    id: session._id,
    statut: session.status,
    ouverteA: session.openedAt,
    clotureeA: session.closedAt ?? null,
    journee: jour?.date ?? null,
    fonds: session.openingFloatXaf,
    billetageOuverture: session.openingBreakdown ?? null,
    billetageCloture: session.closingBreakdown ?? null,
    carnet: session.emergencyBooklet ?? null,
    attendu: attendu ?? attenduStocke,
    compte: session.countedByMethod ?? null,
    ecart: session.varianceXaf ?? null,
    justification: session.varianceReason ?? null,
    vendeur: nomComplet(vendeur),
    matricule: vendeur?.matricule ?? null,
    pointDeVente: pos ? { code: pos.code, name: pos.name } : null,
    encaissements: {
      nombre: encaissements.length,
      montant: encaissements.reduce((sum, s) => sum + s.amounts.received, 0),
    },
    sorties: {
      nombre: sorties.length,
      montant: sorties.reduce((sum, s) => sum + s.amounts.received, 0),
      numeros: sorties.map((s) => s.number),
    },
    operations: [...ventes]
      .sort((a, b) => a.soldAt - b.soldAt)
      .map((s) => ({
        id: s._id,
        numero: s.number,
        kind: s.kind,
        produit: s.product,
        moyen: s.paymentMethod ?? "especes",
        montant: s.amounts.received,
        heure: s.soldAt,
      })),
  }
}

export type DetailSessionCaisse = Awaited<ReturnType<typeof detailSession>>

/** Caisse ouverte du vendeur, détaillée pour la clôture. `null` si fermée. */
export const caisse = query({
  args: {},
  handler: async (ctx) => {
    const actor = await requirePermission(ctx, "caisse", "consulter")
    const session = await sessionOuverte(ctx, actor._id)
    return session ? await detailSession(ctx, session) : null
  },
})

/** Sessions passées du vendeur, les plus récentes d'abord. */
export const sessionsCaisse = query({
  args: { limite: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "caisse", "consulter")
    const sessions = await ctx.db
      .query("cashSessions")
      .withIndex("by_seller", (q) => q.eq("sellerId", actor._id))
      .collect()
    const limite = Math.min(Math.max(Math.trunc(args.limite ?? 30), 1), 100)
    const recentes = sessions.sort((a, b) => b.openedAt - a.openedAt).slice(0, limite)
    return await Promise.all(
      recentes.map(async (s) => {
        const ventes = (
          await ctx.db
            .query("sales")
            .withIndex("by_cash_session", (q) => q.eq("cashSessionId", s._id))
            .collect()
        ).filter(compteEnCaisse)
        const jour = await ctx.db.get(s.accountingDayId)
        const attendu = s.status === "ouverte" ? attenduParMoyen(ventes) : s.expectedByMethod
        return {
          id: s._id,
          statut: s.status,
          journee: jour?.date ?? null,
          ouverteA: s.openedAt,
          clotureeA: s.closedAt ?? null,
          fonds: s.openingFloatXaf,
          operations: ventes.length,
          attendu: attendu.reduce((sum, a) => sum + a.amountXaf, 0),
          compte: s.countedByMethod ? s.countedByMethod.reduce((sum, c) => sum + c.amountXaf, 0) : null,
          ecart: s.varianceXaf ?? null,
          justification: s.varianceReason ?? null,
        }
      })
    )
  },
})

/** Détail d'une session : la sienne, ou une de son point de vente. */
export const sessionCaisse = query({
  args: { sessionId: v.id("cashSessions") },
  handler: async (ctx, args) => {
    const actor = await requirePermission(ctx, "caisse", "consulter")
    const session = await ctx.db.get(args.sessionId)
    if (!session) return null
    if (session.sellerId !== actor._id && session.pointOfSaleId !== actor.pointOfSaleId) return null
    return await detailSession(ctx, session)
  },
})

/* ═════════════════════════ Ventes manuelles ═══════════════════════════════ */

/**
 * Carnet de secours et souches ressaisies du point de vente.
 *
 * Les souches d'un carnet sont numérotées d'affilée : toute souche absente
 * entre la première et la dernière ressaisie est « à ressaisir ». C'est le
 * contrôle de séquence du CDC §7.10, carnet par carnet.
 */
export const ventesManuelles = query({
  args: {},
  handler: async (ctx) => {
    const actor = await requirePermission(ctx, "ventes_manuelles", "consulter")
    const pointOfSaleId = actor.pointOfSaleId
    const session = await sessionOuverte(ctx, actor._id)
    const sessions = await ctx.db
      .query("cashSessions")
      .withIndex("by_seller", (q) => q.eq("sellerId", actor._id))
      .collect()
    const carnet =
      session?.emergencyBooklet ??
      sessions.sort((a, b) => b.openedAt - a.openedAt).find((s) => s.emergencyBooklet)?.emergencyBooklet ??
      null

    const toutes = await ctx.db.query("manualTickets").collect()
    const souches = []
    for (const manuel of toutes) {
      const sale = await ctx.db.get(manuel.saleId)
      if (!sale) continue
      if (pointOfSaleId && (manuel.pointOfSaleId ?? sale.pointOfSaleId) !== pointOfSaleId) continue
      const [origine, arrivee, trip, ticket, vendeur] = await Promise.all([
        manuel.originStationId ? ctx.db.get(manuel.originStationId) : null,
        manuel.destinationStationId ? ctx.db.get(manuel.destinationStationId) : null,
        manuel.tripId ? ctx.db.get(manuel.tripId) : null,
        manuel.ticketId ? ctx.db.get(manuel.ticketId) : null,
        ctx.db.get(manuel.originalSellerId),
      ])
      souches.push({
        id: manuel._id,
        venteId: sale._id,
        numero: manuel.preprintedNumber,
        numeroSysteme: manuel.systemNumber,
        venduA: manuel.soldAt,
        ressaisieA: manuel.recordedAt,
        voyageur: manuel.passengerName ?? null,
        trajet: origine && arrivee ? `${origine.name} → ${arrivee.name}` : null,
        classe: manuel.serviceClass ?? null,
        desserte: trip ? { trainNumber: trip.trainNumber, trainType: trip.trainType, serviceDate: trip.serviceDate, departAt: trip.departureAt } : null,
        montant: sale.amounts.ttc,
        billet: ticket ? { numero: ticket.number, voiture: ticket.coachLabel ?? null, place: ticket.seatLabel ?? null } : null,
        vendeur: nomComplet(vendeur),
      })
    }
    souches.sort((a, b) => a.numero.localeCompare(b.numero, "fr", { numeric: true }))

    /* ── Contrôle de séquence du carnet ───────────────────────────────── */
    let sequence: {
      prefixe: string
      premiere: number
      derniere: number
      largeur: number
      utilisees: number
      manquantes: string[]
    } | null = null
    if (carnet) {
      try {
        const premiere = parsePreprintedNumber(carnet.firstNumber)
        const derniere = parsePreprintedNumber(carnet.lastNumber)
        const largeur = carnet.firstNumber.replace(/^.*?(\d+)$/, "$1").length
        const numero = (n: number) =>
          `${carnet.firstNumber.replace(/\d+$/, "")}${String(n).padStart(largeur, "0")}`
        const dans = souches
          .map((s) => {
            try {
              return parsePreprintedNumber(s.numero)
            } catch {
              return null
            }
          })
          .filter((p): p is { prefix: string; value: number } => p !== null && p.prefix === premiere.prefix)
          .map((p) => p.value)
          .filter((n) => n >= premiere.value && n <= derniere.value)
        const presentes = new Set(dans)
        const plusHaute = dans.length > 0 ? Math.max(...dans) : premiere.value - 1
        const manquantes: string[] = []
        for (let n = premiere.value; n <= plusHaute; n += 1) if (!presentes.has(n)) manquantes.push(numero(n))
        sequence = {
          prefixe: premiere.prefix,
          premiere: premiere.value,
          derniere: derniere.value,
          largeur,
          utilisees: Math.max(0, plusHaute - premiere.value + 1),
          manquantes,
        }
      } catch {
        sequence = null
      }
    }

    const dansCarnet = sequence
      ? souches.filter((s) => {
          try {
            const p = parsePreprintedNumber(s.numero)
            return p.prefix === sequence!.prefixe && p.value >= sequence!.premiere && p.value <= sequence!.derniere
          } catch {
            return false
          }
        })
      : []
    const horaires = dansCarnet.map((s) => s.venduA)
    return {
      carnet,
      sequence,
      souches,
      indicateurs: {
        ressaisies: dansCarnet.length,
        encaisse: dansCarnet.reduce((sum, s) => sum + s.montant, 0),
        coupure: horaires.length > 0 ? { debut: Math.min(...horaires), fin: Math.max(...horaires) } : null,
      },
      vendeurId: actor._id,
      caisseOuverte: session !== null,
    }
  },
})
