import type { Doc, Id } from "../_generated/dataModel"
import type { MutationCtx } from "../_generated/server"
import { configuredDemoAccounts } from "../model/demoPersonas"
import { addDays, daysBetween, fromServiceDate, toServiceDate, weekdayOf } from "../model/calendar"
import { computeTicketFare, type FareSchedule } from "../model/fares"
import { isRangeFree, occupy, release, segmentMask } from "../model/inventory"
import { occupancyRate, quotePrice, type PricingRule } from "../model/pricing"
import { formatNumber, sequenceKey, type NumberKind } from "../model/sales"
import {
  CONTEXTE_AUDIT,
  CONTEXTE_MANIFESTE,
  PERSONNEL,
  PREFIXE,
  PREFIXE_AUTH,
  travaille,
  tirage,
  entier,
  type AgentSeed,
  type ArretPlan,
  type CadrePlan,
  type Classe,
  type DessertePlan,
  AGENCES,
} from "./demoActivitePlan"

/**
 * Activité de démonstration — accès à la base.
 *
 * Ces fonctions reproduisent, pour une date PASSÉE, ce que font les
 * mutations de vente pour l'instant présent : les mutations applicatives
 * lisent `Date.now()` pour dater la vente, choisir la journée comptable et
 * numéroter les pièces, elles ne peuvent donc pas écrire un historique.
 *
 * Tout ce qui relève d'une règle métier est délégué aux fonctions pures du
 * modèle — barème (`computeTicketFare`), yield (`quotePrice`), masques
 * d'inventaire (`segmentMask`, `occupy`, `release`), ventilation fiscale et
 * numérotation (`model/sales`). Seul l'horodatage est fourni par le seed.
 */

type Ctx = MutationCtx

/* ═════════════════════════════ Journal d'audit ═════════════════════════ */

export interface EntreeAudit {
  acteur?: Id<"users">
  action: string
  table: string
  id: string
  a: number
  avant?: unknown
  apres?: unknown
  raison?: string
  resultat?: "succes" | "refus" | "echec"
  appareil?: string
  /** Création ou modification que le `reset` devra défaire. */
  manifeste?: boolean
}

/**
 * Écrit une entrée au format de `lib/auth.audit`, datée de l'instant de
 * l'opération et non de l'exécution du seed.
 */
export async function journaliser(ctx: Ctx, e: EntreeAudit): Promise<void> {
  await ctx.db.insert("auditLogs", {
    actorId: e.acteur,
    action: e.action,
    entityTable: e.table,
    entityId: e.id,
    reason: e.raison,
    result: e.resultat ?? "succes",
    before: e.avant === undefined ? undefined : JSON.stringify(e.avant),
    after: e.apres === undefined ? undefined : JSON.stringify(e.apres),
    context: e.manifeste ? CONTEXTE_MANIFESTE : CONTEXTE_AUDIT,
    deviceId: e.appareil,
    createdAt: e.a,
  })
}

/* ═════════════════════════════ Personnel ═══════════════════════════════ */

export interface Personnel {
  /** Agents fabriqués, par clé. */
  agents: Map<string, Doc<"users">>
  /** Personas de connexion présents sur le déploiement, par clé. */
  personas: Map<string, Doc<"users">>
  pointsDeVente: Map<string, Doc<"pointsOfSale">>
  pointsDeVenteParId: Map<Id<"pointsOfSale">, Doc<"pointsOfSale">>
}

export async function chargerPersonnel(ctx: Ctx): Promise<Personnel> {
  const agents = new Map<string, Doc<"users">>()
  for (const agent of PERSONNEL) {
    const user = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", PREFIXE_AUTH + agent.cle))
      .unique()
    if (user) agents.set(agent.cle, user)
  }
  const personas = new Map<string, Doc<"users">>()
  for (const compte of configuredDemoAccounts(process.env)) {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", compte.email))
      .unique()
    if (user?.isActive) personas.set(compte.key, user)
  }
  const pointsDeVente = new Map<string, Doc<"pointsOfSale">>()
  const pointsDeVenteParId = new Map<Id<"pointsOfSale">, Doc<"pointsOfSale">>()
  for (const pos of await ctx.db.query("pointsOfSale").collect()) {
    pointsDeVente.set(pos.code, pos)
    pointsDeVenteParId.set(pos._id, pos)
  }
  return { agents, personas, pointsDeVente, pointsDeVenteParId }
}

/** Premier acteur disponible : le persona s'il existe, sinon l'agent fabriqué. */
export function acteur(
  personnel: Personnel,
  persona: string | undefined,
  agent: string
): Doc<"users"> {
  const trouve =
    (persona ? personnel.personas.get(persona) : undefined) ??
    personnel.agents.get(agent)
  if (!trouve) {
    throw new Error(`Agent de démonstration absent : ${agent}. Relancer la préparation.`)
  }
  return trouve
}

export function recettes(p: Personnel) {
  return acteur(p, "recettes", "rec-nguema")
}
export function comptable(p: Personnel) {
  return acteur(p, "comptable", "cpt-bekale")
}
export function administrateur(p: Personnel) {
  return acteur(p, "admin-fonctionnel", "adm-obiang")
}
export function chefDeVente(p: Personnel) {
  return acteur(p, "chef-vente", "cv-mintsa")
}

/** Chef de gare qui traite les remboursements d'un point de vente. */
export function chefDeGare(p: Personnel, codePointDeVente: string | undefined): Doc<"users"> {
  const gare = codePointDeVente?.startsWith("AG")
    ? AGENCES.find((a) => a.code === codePointDeVente)?.gare ?? "OWE"
    : codePointDeVente?.slice(0, 3) ?? "OWE"
  if (gare === "FCV" || gare === "MOA") return acteur(p, undefined, "chef-fcv-ondo")
  if (gare === "LTV" || gare === "BOO") return acteur(p, undefined, "chef-ltv-ivala")
  return acteur(p, "chef-gare", "chef-owe-mboumba")
}

/** Vendeurs d'un point de vente présents un jour donné, dans un ordre stable. */
export function vendeursDuJour(
  p: Personnel,
  codePointDeVente: string,
  date: string
): Doc<"users">[] {
  const fabriques = PERSONNEL.filter(
    (a) =>
      a.pointDeVente === codePointDeVente &&
      (a.role === "vendeur_guichet" || a.role === "vendeur_agence") &&
      travaille(a, date)
  ).flatMap((a) => {
    const user = p.agents.get(a.cle)
    return user ? [user] : []
  })
  // Les personas de vente tiennent leur caisse tous les jours : la personne
  // qui se connecte en démonstration trouve toujours une activité récente.
  const personas = ["agent", "agence"].flatMap((cle) => {
    const user = p.personas.get(cle)
    const pos = user?.pointOfSaleId ? p.pointsDeVenteParId.get(user.pointOfSaleId) : undefined
    return user && pos?.code === codePointDeVente ? [user] : []
  })
  return [...fabriques, ...personas].sort((a, b) =>
    (a.matricule ?? a._id).localeCompare(b.matricule ?? b._id)
  )
}

/** Contrôleur de service d'une desserte : deux agents par gare, en alternance. */
export function controleurDeDesserte(
  p: Personnel,
  gareOrigine: string,
  serviceDate: string
): Doc<"users"> | null {
  const equipe = PERSONNEL.filter(
    (a) => a.role === "controleur_train" && a.pointDeVente === `${gareOrigine}-PV`
  )
  if (equipe.length === 0) return null
  const rang = ((daysBetween("2026-01-01", serviceDate) % equipe.length) + equipe.length) % equipe.length
  return p.agents.get(equipe[rang]!.cle) ?? null
}

export function agentSeed(cle: string): AgentSeed {
  const agent = PERSONNEL.find((a) => a.cle === cle)
  if (!agent) throw new Error(`Agent inconnu : ${cle}`)
  return agent
}

/* ═════════════════════════════ Dessertes ═══════════════════════════════ */

export interface DessertesChargees {
  plans: DessertePlan[]
  parCle: Map<string, Doc<"trips">>
}

/**
 * Dessertes d'une période, au format du plan.
 *
 * Les dessertes sont prises telles qu'elles sont en base, quels que soient
 * leur train, leur livret et le nombre de gares desservies.
 */
export async function chargerDessertes(
  ctx: Ctx,
  du: string,
  au: string,
  maintenant: number
): Promise<DessertesChargees> {
  const trips = await ctx.db
    .query("trips")
    .withIndex("by_service_date", (q) => q.gte("serviceDate", du).lte("serviceDate", au))
    .collect()
  const stations = new Map((await ctx.db.query("stations").collect()).map((s) => [s._id, s]))
  const capacites = new Map<Id<"trains">, Partial<Record<Classe, number>>>()

  const plans: DessertePlan[] = []
  const parCle = new Map<string, Doc<"trips">>()
  for (const trip of trips) {
    const cle = `${trip.serviceDate}|${trip.trainNumber}`
    // Deux dessertes d'un même train le même jour : on garde la première.
    if (parCle.has(cle)) continue

    // Les arrêts RÉELS de la desserte. L'horaire auquel elle est rattachée
    // ne fait pas foi : `seeds/demo` rattache une desserte existante au
    // nouvel horaire sans en refaire les arrêts, et une desserte peut ne
    // desservir que quelques gares de la ligne.
    const stops = (
      await ctx.db
        .query("tripStops")
        .withIndex("by_trip_sequence", (q) => q.eq("tripId", trip._id))
        .collect()
    ).sort((a, b) => a.sequence - b.sequence)
    if (stops.length < 2 || stops.length - 1 !== trip.segmentCount) continue
    const arrets: ArretPlan[] = stops.map((s) => ({
      code: stations.get(s.stationId)?.code ?? "?",
      km: s.kilometerPoint,
      departAt: s.departureAt,
      arriveeAt: s.arrivalAt,
    }))

    let capacite = capacites.get(trip.trainId)
    if (!capacite) {
      capacite = {}
      for (const coach of await ctx.db
        .query("coaches")
        .withIndex("by_train", (q) => q.eq("trainId", trip.trainId))
        .collect()) {
        capacite[coach.serviceClass] = (capacite[coach.serviceClass] ?? 0) + coach.seatCount
      }
      capacites.set(trip.trainId, capacite)
    }

    parCle.set(cle, trip)
    plans.push({
      cle,
      serviceDate: trip.serviceDate,
      trainNumber: trip.trainNumber,
      trainType: trip.trainType,
      departureAt: trip.departureAt,
      arrivalAt: trip.arrivalAt,
      arrets,
      capacites: capacite,
      supprimeeA: suppression(trip, arrets, maintenant),
    })
  }
  return { plans, parCle }
}

/**
 * Scénario d'exploitation du jour : le train minéralier déraillé entre
 * Lastourville et Moanda à 05 h 50 bloque la ligne ; la desserte montante,
 * au départ de Franceville, est supprimée à 06 h 40. Elle n'existe qu'une
 * fois l'instant passé, pour qu'un rejeu à l'aube ne l'invente pas.
 */
export function instantSuppression(serviceDate: string): number {
  return fromServiceDate(serviceDate, "06:40")
}
export function instantDeraillement(serviceDate: string): number {
  return fromServiceDate(serviceDate, "05:50")
}

function suppression(
  trip: Doc<"trips">,
  arrets: readonly ArretPlan[],
  maintenant: number
): number | undefined {
  if (trip.serviceDate !== toServiceDate(maintenant)) return undefined
  if (arrets[0]?.code !== "FCV") return undefined
  const a = instantSuppression(trip.serviceDate)
  return maintenant >= a ? a : undefined
}

/**
 * Retard constaté d'une desserte passée, en minutes.
 *
 * La majorité des trains arrivent à l'heure ou presque ; un sur cinq perd
 * plus d'une demi-heure (croisements, ralentissements de chantier PRN,
 * pannes), et quelques-uns plusieurs heures.
 */
export function retardDesserte(cle: string): number {
  const rng = tirage("demo-activite", "retard", cle)
  const u = rng()
  if (u < 0.52) return entier(rng, 0, 9)
  if (u < 0.78) return entier(rng, 10, 29)
  if (u < 0.95) return entier(rng, 30, 90)
  return entier(rng, 91, 240)
}

/** Retard annoncé sur la desserte descendante du jour, bloquée par le déraillement. */
export const RETARD_DU_JOUR_MINUTES = 95

/* ═════════════════════════════ Référentiel ═════════════════════════════ */

export interface Tarification {
  schedule: Doc<"fareSchedules">
  grille: FareSchedule
  discounts: Doc<"discounts">[]
  ancillary: Doc<"ancillaryFares">[]
  regles: Doc<"pricingRules">[]
  remboursement: { avantSeuilPct: number; apresSeuilPct: number; seuilHeures: number }
}

export async function chargerTarification(ctx: Ctx): Promise<Tarification> {
  const schedule = await ctx.db
    .query("fareSchedules")
    .withIndex("by_status", (q) => q.eq("status", "actif"))
    .first()
  if (!schedule) throw new Error("Aucune grille tarifaire active : lancer seeds/referential:run")
  const [bases, discounts, ancillary, regles, reglages] = await Promise.all([
    ctx.db.query("fareBases").withIndex("by_schedule", (q) => q.eq("scheduleId", schedule._id)).collect(),
    ctx.db.query("discounts").withIndex("by_schedule", (q) => q.eq("scheduleId", schedule._id)).collect(),
    ctx.db
      .query("ancillaryFares")
      .withIndex("by_schedule_product", (q) => q.eq("scheduleId", schedule._id))
      .collect(),
    ctx.db
      .query("pricingRules")
      .withIndex("by_active_priority", (q) => q.eq("isActive", true))
      .collect(),
    ctx.db.query("systemSettings").withIndex("by_key", (q) => q.eq("key", "commercial")).unique(),
  ])
  return {
    schedule,
    grille: {
      taxes: { vatPct: schedule.vatPct, cssPct: schedule.cssPct },
      roundingBasis: schedule.roundingBasis,
      bases: bases.map((b) => ({
        trainType: b.trainType,
        serviceClass: b.serviceClass,
        shortDistanceRate: b.shortDistanceRate,
        longDistanceRate: b.longDistanceRate,
      })),
    },
    discounts,
    ancillary,
    regles,
    // Mêmes valeurs par défaut que le guichet (`functions/guichet.ts`).
    remboursement: {
      avantSeuilPct: reglages?.refundPenaltyEarlyPct ?? 10,
      apresSeuilPct: reglages?.refundPenaltyLatePct ?? 30,
      seuilHeures: reglages?.refundThresholdHours ?? 2,
    },
  }
}

export function cadreDuPlan(
  debut: string,
  echelle: number,
  personnel: Personnel,
  venteEnCompte: boolean
): CadrePlan {
  const agences: Record<string, string[]> = {}
  for (const agence of AGENCES) {
    if (!personnel.pointsDeVente.get(agence.code)?.isActive) continue
    ;(agences[agence.gare] ??= []).push(agence.code)
  }
  return { debut, echelle, agences, venteEnCompte }
}

/* ══════════════════════════════ Séquences ══════════════════════════════ */

/**
 * Compteurs de numérotation, lus une fois et écrits en fin de lot.
 * Même clé et même format que `lib/saleContext.nextSequence`.
 */
export class Sequences {
  private readonly valeurs = new Map<string, { id?: Id<"sequences">; value: number; modifie: boolean }>()
  constructor(private readonly ctx: Ctx) {}

  async suivant(cle: string): Promise<number> {
    let entree = this.valeurs.get(cle)
    if (!entree) {
      const doc = await this.ctx.db
        .query("sequences")
        .withIndex("by_key", (q) => q.eq("key", cle))
        .unique()
      entree = { id: doc?._id, value: doc?.value ?? 0, modifie: false }
      this.valeurs.set(cle, entree)
    }
    entree.value += 1
    entree.modifie = true
    return entree.value
  }

  async numero(kind: NumberKind, code: string, date: string): Promise<string> {
    const seq = await this.suivant(sequenceKey(code, date, kind))
    return formatNumber(kind, code, date, seq)
  }

  async enregistrer(): Promise<void> {
    for (const [key, entree] of this.valeurs) {
      if (!entree.modifie) continue
      if (entree.id) await this.ctx.db.patch(entree.id, { value: entree.value })
      else entree.id = await this.ctx.db.insert("sequences", { key, value: entree.value })
      entree.modifie = false
    }
  }
}

/* ══════════════════════════════ Inventaire ═════════════════════════════ */

interface InventaireClasse {
  counters: Doc<"segmentCounters">[]
  occupations: Doc<"seatOccupancy">[]
  quotas: Doc<"fareClassQuotas">[]
}

/**
 * Inventaire d'une desserte, lu une fois par lot et réécrit en fin de lot.
 *
 * Les mêmes règles que `performSale` : une place n'est attribuée que si son
 * masque est libre sur tout le trajet, les compteurs de tronçon gardent la
 * disponibilité, et le contingent tarifaire le moins prioritaire capable
 * d'absorber l'effectif est consommé.
 */
export class Inventaire {
  private readonly classes = new Map<string, InventaireClasse>()
  private readonly sieges = new Map<Id<"trains">, Map<Id<"seats">, Doc<"seats">>>()
  private readonly voitures = new Map<Id<"trains">, Map<Id<"coaches">, Doc<"coaches">>>()
  private readonly modifies = new Set<string>()
  private readonly docs = new Map<string, Doc<"segmentCounters"> | Doc<"seatOccupancy"> | Doc<"fareClassQuotas">>()

  constructor(private readonly ctx: Ctx) {}

  async classe(tripId: Id<"trips">, classe: Classe): Promise<InventaireClasse> {
    const cle = `${tripId}|${classe}`
    let inv = this.classes.get(cle)
    if (!inv) {
      const [counters, occupations, quotas] = await Promise.all([
        this.ctx.db
          .query("segmentCounters")
          .withIndex("by_trip_class", (q) => q.eq("tripId", tripId).eq("serviceClass", classe))
          .collect(),
        this.ctx.db
          .query("seatOccupancy")
          .withIndex("by_trip_class", (q) => q.eq("tripId", tripId).eq("serviceClass", classe))
          .collect(),
        this.ctx.db
          .query("fareClassQuotas")
          .withIndex("by_trip_class", (q) => q.eq("tripId", tripId).eq("serviceClass", classe))
          .collect(),
      ])
      inv = { counters, occupations, quotas }
      for (const d of [...counters, ...occupations, ...quotas]) this.docs.set(d._id, d)
      this.classes.set(cle, inv)
    }
    return inv
  }

  async siege(trainId: Id<"trains">, seatId: Id<"seats">): Promise<{ seat?: Doc<"seats">; coach?: Doc<"coaches"> }> {
    let sieges = this.sieges.get(trainId)
    let voitures = this.voitures.get(trainId)
    if (!sieges || !voitures) {
      sieges = new Map(
        (await this.ctx.db.query("seats").withIndex("by_train", (q) => q.eq("trainId", trainId)).collect()).map(
          (s) => [s._id, s]
        )
      )
      voitures = new Map(
        (await this.ctx.db.query("coaches").withIndex("by_train", (q) => q.eq("trainId", trainId)).collect()).map(
          (c) => [c._id, c]
        )
      )
      this.sieges.set(trainId, sieges)
      this.voitures.set(trainId, voitures)
    }
    const seat = sieges.get(seatId)
    return { seat, coach: seat ? voitures.get(seat.coachId) : undefined }
  }

  modifier(doc: { _id: string }): void {
    this.modifies.add(doc._id)
  }

  /**
   * Attribue des places sur un trajet. Retourne `null` si l'effectif ne peut
   * pas être servi en entier : on ne vend jamais un groupe partiellement.
   */
  attribuer(
    inv: InventaireClasse,
    trip: Doc<"trips">,
    de: number,
    a: number,
    effectif: number
  ): Doc<"seatOccupancy">[] | null {
    const demande = segmentMask({ fromIndex: de, toIndex: a }, trip.segmentCount)
    const troncons = inv.counters.filter((c) => c.segmentIndex >= de && c.segmentIndex < a)
    if (troncons.length === 0) return null
    if (Math.min(...troncons.map((c) => c.available)) < effectif) return null
    const choisies: Doc<"seatOccupancy">[] = []
    for (const o of inv.occupations) {
      if (choisies.length === effectif) break
      if (isRangeFree(o.soldMask | o.heldMask | o.blockedMask, demande)) choisies.push(o)
    }
    return choisies.length === effectif ? choisies : null
  }

  /** Écrit l'occupation en mémoire ; lève si un tronçon vient d'être pris. */
  occuper(inv: InventaireClasse, trip: Doc<"trips">, places: Doc<"seatOccupancy">[], de: number, a: number): void {
    const demande = segmentMask({ fromIndex: de, toIndex: a }, trip.segmentCount)
    for (const o of places) {
      occupy(o.soldMask | o.heldMask | o.blockedMask, demande)
      o.soldMask |= demande
      this.modifier(o)
    }
    for (const c of inv.counters) {
      if (c.segmentIndex < de || c.segmentIndex >= a) continue
      c.sold += places.length
      c.available = c.capacity - c.sold - c.held - c.reserved
      if (c.available < 0) throw new Error(`Survente détectée au segment ${c.segmentIndex}`)
      this.modifier(c)
    }
    for (const q of [...inv.quotas].sort((x, y) => x.priority - y.priority)) {
      if (q.isActive && q.seatCount - q.soldCount >= places.length) {
        q.soldCount += places.length
        this.modifier(q)
        break
      }
    }
  }

  /** Libère les titres annulés ou remboursés, comme `releaseTicketsInventory`. */
  async liberer(tickets: readonly Doc<"tickets">[], trip: Doc<"trips">): Promise<void> {
    for (const ticket of tickets) {
      const inv = await this.classe(ticket.tripId, ticket.serviceClass)
      const masque = segmentMask(
        { fromIndex: ticket.fromStopIndex, toIndex: ticket.toStopIndex },
        trip.segmentCount
      )
      const o = inv.occupations.find((x) => x.seatId === ticket.seatId)
      if (o) {
        o.soldMask = release(o.soldMask, masque)
        this.modifier(o)
      }
      for (const c of inv.counters) {
        if (c.segmentIndex < ticket.fromStopIndex || c.segmentIndex >= ticket.toStopIndex) continue
        c.sold = Math.max(0, c.sold - 1)
        c.available = Math.min(c.capacity, c.capacity - c.sold - c.held - c.reserved)
        this.modifier(c)
      }
      const quota = [...inv.quotas]
        .filter((q) => q.soldCount > 0)
        .sort((x, y) => y.priority - x.priority)[0]
      if (quota) {
        quota.soldCount -= 1
        this.modifier(quota)
      }
    }
  }

  /** Taux d'occupation et vendus du tronçon le plus chargé, pour le yield. */
  charge(inv: InventaireClasse, de: number, a: number): { capacite: number; vendus: number } {
    const troncons = inv.counters.filter((c) => c.segmentIndex >= de && c.segmentIndex < a)
    return {
      capacite: troncons[0]?.capacity ?? 0,
      vendus: Math.max(0, ...troncons.map((c) => c.sold)),
    }
  }

  async enregistrer(): Promise<void> {
    for (const id of this.modifies) {
      const doc = this.docs.get(id)
      if (!doc) continue
      if ("soldMask" in doc) {
        await this.ctx.db.patch(doc._id, { soldMask: doc.soldMask, blockedMask: doc.blockedMask })
      } else if ("segmentIndex" in doc) {
        await this.ctx.db.patch(doc._id, { sold: doc.sold, available: doc.available, reserved: doc.reserved })
      } else {
        await this.ctx.db.patch(doc._id, { soldCount: doc.soldCount })
      }
    }
    this.modifies.clear()
  }
}

/* ══════════════════════════════ Tarification ═══════════════════════════ */

/**
 * Prix unitaire d'un voyageur, par le même enchaînement que `performSale` :
 * barème kilométrique et réduction, puis contingent et règles de yield
 * actives à l'instant de la vente, puis bornes de sécurité.
 */
export function prixBillet(input: {
  tarif: Tarification
  trip: Doc<"trips">
  classe: Classe
  distanceKm: number
  reduction?: string
  quotas: readonly Doc<"fareClassQuotas">[]
  effectif: number
  capacite: number
  vendus: number
  canal: string
  a: number
}): {
  unitaire: number
  fare: Doc<"tickets">["fare"]
} {
  const { tarif, trip } = input
  const remise = input.reduction
    ? tarif.discounts.find((d) => d.code === input.reduction && d.isActive)
    : undefined
  const base = computeTicketFare({
    schedule: tarif.grille,
    trainType: trip.trainType,
    serviceClass: input.classe,
    distanceKm: input.distanceKm,
    discount: remise
      ? { code: remise.code as never, ratePct: remise.ratePct, label: remise.label }
      : null,
  })
  const regles: PricingRule[] = tarif.regles
    .filter((r) => r.tripId === undefined || r.tripId === trip._id)
    .filter((r) => r.serviceClass === undefined || r.serviceClass === input.classe)
    .map((r) => ({
      id: r._id,
      type: r.type,
      threshold: r.threshold,
      modifierPct: r.modifierPct,
      priority: r.priority,
      validFrom: r.validFrom,
      validUntil: r.validUntil,
      code: r.code,
      isActive: r.isActive,
    }))
  const bornes = tarif.regles
    .filter((r) => r.floorXaf !== undefined || r.capXaf !== undefined)
    .sort((x, y) => x.priority - y.priority)[0]
  const devis = quotePrice({
    basePriceTtc: base.ttc,
    distanceKm: input.distanceKm,
    quotas: input.quotas.map((q) => ({
      label: q.label,
      priority: q.priority,
      seatCount: q.seatCount,
      soldCount: q.soldCount,
      coefficient: q.coefficient,
      isActive: q.isActive,
    })),
    seatsNeeded: input.effectif,
    rules: regles,
    context: {
      occupancyRate: occupancyRate(input.capacite, input.vendus),
      daysUntilDeparture: Math.floor((trip.departureAt - input.a) / 86_400_000),
      departureWeekday: weekdayOf(trip.serviceDate),
      channel: input.canal,
      now: input.a,
    },
    floorXaf: bornes?.floorXaf,
    capXaf: bornes?.capXaf,
  })
  return {
    unitaire: devis.unitPriceTtc,
    fare: {
      distanceKm: input.distanceKm,
      chargeableKm: base.chargeableKm,
      ratePerKm: base.ratePerKm,
      fareCode: remise?.code,
      discountCode: base.discountCode ?? undefined,
      discountPct: base.discountPct,
      appliedRules: devis.appliedRules,
      roundingStep: base.roundingStep,
    },
  }
}

/* ══════════════════════════════ Caisse ═════════════════════════════════ */

/** Session de caisse d'un agent un jour donné, si elle couvre l'instant. */
export function sessionCouvrant(
  sessions: readonly Doc<"cashSessions">[],
  a: number
): Doc<"cashSessions"> | undefined {
  return sessions.find((s) => s.openedAt <= a && (s.closedAt === undefined || a <= s.closedAt))
}

/** Une opération compte en caisse dès qu'elle est entrée en comptabilité. */
export function compteEnCaisse(sale: Doc<"sales">): boolean {
  return (
    sale.accountingDayId !== undefined &&
    sale.status !== "en_attente_paiement" &&
    sale.status !== "expiree" &&
    sale.status !== "brouillon"
  )
}

/** Journée comptable d'une date, créée si besoin. */
export async function journee(ctx: Ctx, date: string): Promise<Doc<"accountingDays"> | null> {
  return await ctx.db
    .query("accountingDays")
    .withIndex("by_date", (q) => q.eq("date", date))
    .unique()
}

/* ═════════════════════════════ Divers ══════════════════════════════════ */

export function cleClient(suffixe: string): string {
  return PREFIXE + suffixe
}

export async function venteExistante(ctx: Ctx, cle: string): Promise<Doc<"sales"> | null> {
  return await ctx.db
    .query("sales")
    .withIndex("by_client_id", (q) => q.eq("clientSaleId", cleClient(cle)))
    .unique()
}

/** Date de la veille et de l'avant-veille, par rapport au jour d'exécution. */
export function statutJour(date: string, aujourdhui: string): "jour" | "veille" | "close" {
  if (date === aujourdhui) return "jour"
  if (date === addDays(aujourdhui, -1)) return "veille"
  return "close"
}
