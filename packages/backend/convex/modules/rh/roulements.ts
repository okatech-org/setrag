import { v } from "convex/values"

import type { Doc, Id } from "../../_generated/dataModel"
import { mutation, query, type MutationCtx } from "../../_generated/server"
import { accesRh, chronologieRh, tracerRh } from "./acces"
import { contexteAgent, servicesAvecConflits, servicesVoisins, versServicePlanifie } from "./lecture"
import {
  METIERS,
  METIERS_ROULANTS,
  TYPES_SERVICE,
  conflitsService,
  controlerFormeService,
  dateIso,
  dateLibreville,
  estGareConnue,
  joursCalendaires,
  nomComplet,
  nomGare,
  texteFacultatif,
  texteRequis,
  type Conflit,
} from "./model"
import { typeServiceValidator } from "./tables"

const FENETRE_MAX_JOURS = 31

function resumeAgent(agent: Doc<"rhAgents">) {
  return {
    _id: agent._id,
    matricule: agent.matricule,
    nomComplet: nomComplet(agent),
    metier: agent.metier,
    metierLibelle: METIERS[agent.metier].libelle,
    gareCode: agent.gareCode,
    gareNom: nomGare(agent.gareCode),
    statut: agent.statut,
  }
}

function vueService(service: Doc<"rhServices">) {
  return {
    _id: service._id,
    agentId: service.agentId,
    date: service.date,
    debut: service.debut,
    fin: service.fin,
    type: service.type,
    pauseMinutes: service.pauseMinutes,
    trainNumber: service.trainNumber,
    desserte: service.desserte,
    gareDebutCode: service.gareDebutCode,
    gareDebutNom: nomGare(service.gareDebutCode),
    gareFinCode: service.gareFinCode,
    gareFinNom: nomGare(service.gareFinCode),
    decouche: service.decouche,
    statut: service.statut,
    derogation: service.derogation,
  }
}

/* ═════════════════════════════ Lecture ══════════════════════════════════ */

/** Planning d'une fenêtre de dates, conflits recalculés à la lecture. */
export const planning = query({
  args: { du: v.string(), au: v.string() },
  handler: async (ctx, args) => {
    await accesRh(ctx, "consulter", "roulements.lire")
    const du = dateIso(args.du, "La date de début")
    const au = dateIso(args.au, "La date de fin")
    if (au < du) throw new Error("La fin de la fenêtre précède son début.")
    if (joursCalendaires(du, au) > FENETRE_MAX_JOURS) {
      throw new Error(`La fenêtre est limitée à ${FENETRE_MAX_JOURS} jours.`)
    }
    const { services, agents } = await servicesAvecConflits(ctx, du, au)
    const roulants = (await ctx.db.query("rhAgents").withIndex("by_statut", (q) => q.eq("statut", "actif")).collect()).filter(
      (agent) => METIERS_ROULANTS.includes(agent.metier)
    )
    for (const agent of roulants) agents.set(agent._id, agent)
    return {
      du,
      au,
      agents: [...agents.values()]
        .map(resumeAgent)
        .sort((a, b) => a.metier.localeCompare(b.metier) || a.nomComplet.localeCompare(b.nomComplet, "fr")),
      services: services.map(({ service, conflits }) => ({ ...vueService(service), conflits })),
      totaux: {
        services: services.length,
        planifies: services.filter(({ service }) => service.statut === "planifie").length,
        conflitsBloquants: services.filter(({ conflits }) => conflits.some((c) => c.bloquant)).length,
        alertes: services.filter(({ conflits }) => conflits.length > 0 && !conflits.some((c) => c.bloquant)).length,
      },
    }
  },
})

export const service = query({
  args: { serviceId: v.id("rhServices") },
  handler: async (ctx, { serviceId }) => {
    await accesRh(ctx, "consulter", "roulements.lire")
    const service = await ctx.db.get(serviceId)
    if (!service) return null
    const agent = await ctx.db.get(service.agentId)
    if (!agent) return null
    const voisins = await servicesVoisins(ctx, agent._id, service.debut, service.fin)
    const conflits =
      service.statut === "annule"
        ? []
        : conflitsService(versServicePlanifie(service), voisins, await contexteAgent(ctx, agent))
    const autresIds = [...new Set(conflits.map((c) => c.autreServiceId).filter(Boolean))] as Id<"rhServices">[]
    const autres = await Promise.all(autresIds.map((id) => ctx.db.get(id)))
    return {
      service: { ...vueService(service), motifAnnulation: service.motifAnnulation, creeParNom: service.creeParNom, createdAt: service.createdAt },
      agent: resumeAgent(agent),
      conflits,
      servicesLies: autres.filter((s): s is Doc<"rhServices"> => s !== null).map(vueService),
      chronologie: await chronologieRh(ctx, { entite: "service", entiteId: serviceId }, false),
    }
  },
})

/** Contrôle d'un service avant enregistrement : l'écran affiche les conflits en direct. */
export const previsualiser = query({
  args: {
    agentId: v.id("rhAgents"),
    debut: v.number(),
    fin: v.number(),
    type: typeServiceValidator,
    pauseMinutes: v.number(),
    serviceId: v.optional(v.id("rhServices")),
  },
  handler: async (ctx, args) => {
    await accesRh(ctx, "consulter", "roulements.lire")
    const agent = await ctx.db.get(args.agentId)
    if (!agent) return { erreur: "Agent introuvable.", conflits: [] as Conflit[] }
    try {
      controlerFormeService(args)
    } catch (cause) {
      return { erreur: cause instanceof Error ? cause.message : String(cause), conflits: [] as Conflit[] }
    }
    const voisins = await servicesVoisins(ctx, agent._id, args.debut, args.fin)
    const conflits = conflitsService(
      { id: args.serviceId ?? "nouveau", agentId: agent._id, debut: args.debut, fin: args.fin, type: args.type, pauseMinutes: args.pauseMinutes },
      voisins,
      await contexteAgent(ctx, agent)
    )
    return { erreur: null, conflits }
  },
})

/** Dessertes du jour (référentiel billettique), pour rattacher un service. */
export const dessertes = query({
  args: { date: v.string() },
  handler: async (ctx, args) => {
    await accesRh(ctx, "consulter", "roulements.lire")
    const date = dateIso(args.date)
    const trips = await ctx.db.query("trips").withIndex("by_service_date", (q) => q.eq("serviceDate", date)).take(100)
    const resultat = []
    for (const trip of trips) {
      const [origine, destination] = await Promise.all([ctx.db.get(trip.originStationId), ctx.db.get(trip.destinationStationId)])
      resultat.push({
        _id: trip._id,
        trainNumber: trip.trainNumber,
        departureAt: trip.departureAt,
        arrivalAt: trip.arrivalAt,
        origineCode: origine?.code ?? "",
        origine: origine?.name ?? "",
        destinationCode: destination?.code ?? "",
        destination: destination?.name ?? "",
        status: trip.status,
      })
    }
    return resultat.sort((a, b) => a.departureAt - b.departureAt)
  },
})

/* ════════════════════════════ Écriture ══════════════════════════════════ */

const champsService = {
  agentId: v.id("rhAgents"),
  debut: v.number(),
  fin: v.number(),
  type: typeServiceValidator,
  pauseMinutes: v.number(),
  trainNumber: v.optional(v.string()),
  desserte: v.optional(v.string()),
  tripId: v.optional(v.id("trips")),
  gareDebutCode: v.string(),
  gareFinCode: v.string(),
  decouche: v.boolean(),
  derogation: v.optional(v.string()),
}

interface SaisieService {
  agentId: Id<"rhAgents">
  debut: number
  fin: number
  type: Doc<"rhServices">["type"]
  pauseMinutes: number
  trainNumber?: string
  desserte?: string
  tripId?: Id<"trips">
  gareDebutCode: string
  gareFinCode: string
  decouche: boolean
  derogation?: string
}

/**
 * Contrôle d'un service : les conflits bloquants (aptitude, habilitation,
 * congé, chevauchement, agent hors activité) refusent l'enregistrement ; les
 * alertes (repos, conduite continue, durée) exigent une dérogation écrite.
 */
async function controlerService(ctx: MutationCtx, saisie: SaisieService, serviceId?: Id<"rhServices">) {
  controlerFormeService(saisie)
  const agent = await ctx.db.get(saisie.agentId)
  if (!agent) throw new Error("Agent introuvable.")
  for (const code of [saisie.gareDebutCode, saisie.gareFinCode]) {
    if (!estGareConnue(code)) throw new Error(`Gare inconnue : ${code}.`)
  }
  if (saisie.tripId && !(await ctx.db.get(saisie.tripId))) throw new Error("Desserte introuvable.")
  const voisins = await servicesVoisins(ctx, agent._id, saisie.debut, saisie.fin)
  const conflits = conflitsService(
    { id: serviceId ?? "nouveau", agentId: agent._id, debut: saisie.debut, fin: saisie.fin, type: saisie.type, pauseMinutes: saisie.pauseMinutes },
    voisins,
    await contexteAgent(ctx, agent)
  )
  const bloquants = conflits.filter((c) => c.bloquant)
  if (bloquants.length > 0) {
    throw new Error(`Service refusé : ${bloquants.map((c) => c.message).join(" ")}`)
  }
  const derogation = texteFacultatif(saisie.derogation, "La justification de dérogation", 500)
  if (conflits.length > 0 && !derogation) {
    throw new Error(`Dérogation requise : ${conflits.map((c) => c.message).join(" ")} Justifiez-la par écrit pour enregistrer.`)
  }
  return {
    agent,
    conflits,
    valeur: {
      agentId: agent._id,
      date: dateLibreville(saisie.debut),
      debut: saisie.debut,
      fin: saisie.fin,
      type: saisie.type,
      pauseMinutes: saisie.pauseMinutes,
      trainNumber: texteFacultatif(saisie.trainNumber, "Le numéro de train", 20),
      desserte: texteFacultatif(saisie.desserte, "La desserte", 120),
      tripId: saisie.tripId,
      gareDebutCode: saisie.gareDebutCode,
      gareFinCode: saisie.gareFinCode,
      decouche: saisie.decouche,
      derogation: conflits.length > 0 ? derogation : undefined,
    },
  }
}

function libelleService(service: { type: Doc<"rhServices">["type"]; date: string; trainNumber?: string }) {
  return `${TYPES_SERVICE[service.type].libelle} du ${service.date}${service.trainNumber ? ` · ${service.trainNumber}` : ""}`
}

export const planifier = mutation({
  args: champsService,
  handler: async (ctx, args) => {
    const acces = await accesRh(ctx, "creer", "roulements.planifier")
    const { agent, conflits, valeur } = await controlerService(ctx, args)
    const now = Date.now()
    const serviceId = await ctx.db.insert("rhServices", {
      ...valeur,
      statut: "planifie",
      creeParNom: acces.nom,
      origine: "saisie",
      createdAt: now,
      updatedAt: now,
    })
    await tracerRh(ctx, acces, {
      entite: "service",
      entiteId: serviceId,
      agentId: agent._id,
      action: "rh.roulement.planifier",
      libelle: `${libelleService(valeur)} planifié`,
      detail: conflits.length > 0 ? `Dérogation : ${valeur.derogation}` : `${nomComplet(agent)} · ${nomGare(valeur.gareDebutCode)} → ${nomGare(valeur.gareFinCode)}`,
      permission: "creer",
      table: "rhServices",
      apres: valeur,
    })
    return { serviceId, alertes: conflits.length }
  },
})

export const modifier = mutation({
  args: { serviceId: v.id("rhServices"), ...champsService },
  handler: async (ctx, { serviceId, ...args }) => {
    const acces = await accesRh(ctx, "modifier", "roulements.planifier")
    const existant = await ctx.db.get(serviceId)
    if (!existant) throw new Error("Service introuvable.")
    if (existant.statut === "annule") throw new Error("Un service annulé ne se modifie pas : planifiez-en un nouveau.")
    if (existant.fin < Date.now()) throw new Error("Un service terminé ne se modifie plus.")
    const { agent, conflits, valeur } = await controlerService(ctx, args, serviceId)
    await ctx.db.patch(serviceId, { ...valeur, statut: "planifie", updatedAt: Date.now() })
    await tracerRh(ctx, acces, {
      entite: "service",
      entiteId: serviceId,
      agentId: agent._id,
      action: "rh.roulement.modifier",
      libelle: `${libelleService(valeur)} modifié`,
      detail: [
        existant.agentId !== agent._id ? `Réaffecté à ${nomComplet(agent)}` : null,
        existant.statut === "publie" ? "Repassé en planifié : à republier" : null,
        conflits.length > 0 ? `Dérogation : ${valeur.derogation}` : null,
      ]
        .filter(Boolean)
        .join(" · ") || undefined,
      permission: "modifier",
      table: "rhServices",
      avant: { agentId: existant.agentId, debut: existant.debut, fin: existant.fin, type: existant.type },
      apres: { agentId: valeur.agentId, debut: valeur.debut, fin: valeur.fin, type: valeur.type },
    })
    if (existant.agentId !== agent._id) {
      await ctx.db.insert("rhJournal", {
        agentId: existant.agentId,
        entite: "service",
        entiteId: serviceId,
        action: "rh.roulement.desaffecter",
        libelle: `Retiré du service du ${existant.date}`,
        detail: `Réaffecté à ${nomComplet(agent)}`,
        confidentiel: false,
        acteurId: acces.user._id,
        acteurNom: acces.nom,
        at: Date.now(),
      })
    }
    return { serviceId, alertes: conflits.length }
  },
})

export const annuler = mutation({
  args: { serviceId: v.id("rhServices"), motif: v.string() },
  handler: async (ctx, { serviceId, motif }) => {
    const acces = await accesRh(ctx, "modifier", "roulements.planifier")
    const service = await ctx.db.get(serviceId)
    if (!service) throw new Error("Service introuvable.")
    if (service.statut === "annule") throw new Error("Ce service est déjà annulé.")
    if (service.fin < Date.now()) throw new Error("Un service terminé ne s'annule plus.")
    const texte = texteRequis(motif, "Le motif d'annulation", 300)
    await ctx.db.patch(serviceId, { statut: "annule", motifAnnulation: texte, updatedAt: Date.now() })
    await tracerRh(ctx, acces, {
      entite: "service",
      entiteId: serviceId,
      agentId: service.agentId,
      action: "rh.roulement.annuler",
      libelle: `${libelleService(service)} annulé`,
      detail: texte,
      permission: "modifier",
      table: "rhServices",
    })
    return { statut: "annule" as const }
  },
})

/**
 * Publie le planning d'une fenêtre : les équipes le reçoivent. Refusé tant
 * qu'un service de la fenêtre porte un conflit bloquant.
 */
export const publier = mutation({
  args: { du: v.string(), au: v.string() },
  handler: async (ctx, args) => {
    const acces = await accesRh(ctx, "modifier", "roulements.planifier")
    const du = dateIso(args.du, "La date de début")
    const au = dateIso(args.au, "La date de fin")
    if (au < du || joursCalendaires(du, au) > FENETRE_MAX_JOURS) {
      throw new Error(`Choisissez une fenêtre valide d'au plus ${FENETRE_MAX_JOURS} jours.`)
    }
    const { services, agents } = await servicesAvecConflits(ctx, du, au)
    const bloques = services.filter(({ conflits }) => conflits.some((c) => c.bloquant))
    if (bloques.length > 0) {
      const exemples = bloques.slice(0, 3).map(({ service }) => {
        const agent = agents.get(service.agentId)
        return `${agent ? nomComplet(agent) : "?"} le ${service.date}`
      })
      throw new Error(`Publication refusée : ${bloques.length} service(s) en conflit bloquant (${exemples.join(", ")}). Résolvez-les d'abord.`)
    }
    const aPublier = services.filter(({ service }) => service.statut === "planifie")
    for (const { service } of aPublier) await ctx.db.patch(service._id, { statut: "publie", updatedAt: Date.now() })
    await tracerRh(ctx, acces, {
      entite: "service",
      entiteId: `planning:${du}:${au}`,
      action: "rh.roulement.publier",
      libelle: `Publication du roulement du ${du} au ${au}`,
      detail: `${aPublier.length} service(s) publiés`,
      permission: "modifier",
      table: "rhServices",
    })
    return { publies: aPublier.length }
  },
})
