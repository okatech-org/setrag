import { v } from "convex/values"

import type { Doc, Id } from "../../_generated/dataModel"
import { mutation, query, type MutationCtx, type QueryCtx } from "../../_generated/server"
import { accesRh, chronologieRh, prochainNumero, tracerRh } from "./acces"
import { aujourdhuiLibreville } from "./lecture"
import {
  METIERS,
  STATUTS_CONGE,
  TYPES_CONGE,
  dateIso,
  debutJournee,
  ajouterJours,
  droitsCongeAnnuel,
  joursCalendaires,
  joursOuvrables,
  nomComplet,
  nomGare,
  texteFacultatif,
  texteRequis,
} from "./model"
import { typeCongeValidator } from "./tables"

/** Solde de congé annuel d'un agent pour une année civile. */
export async function soldeConge(ctx: QueryCtx | MutationCtx, agent: Doc<"rhAgents">, annee: number) {
  const conges = await ctx.db.query("rhConges").withIndex("by_agent", (q) => q.eq("agentId", agent._id)).collect()
  const deLAnnee = conges.filter((c) => c.type === "annuel" && c.du.startsWith(String(annee)))
  const pris = deLAnnee.filter((c) => c.statut === "valide").reduce((t, c) => t + c.jours, 0)
  const enAttente = deLAnnee.filter((c) => c.statut === "demande").reduce((t, c) => t + c.jours, 0)
  const droits = droitsCongeAnnuel(agent.dateEmbauche, annee)
  return { annee, droits, pris, enAttente, disponible: droits - pris - enAttente }
}

function resumeAgent(agent: Doc<"rhAgents">) {
  return {
    _id: agent._id,
    matricule: agent.matricule,
    nomComplet: nomComplet(agent),
    metier: agent.metier,
    metierLibelle: METIERS[agent.metier].libelle,
    gareNom: nomGare(agent.gareCode),
    statut: agent.statut,
  }
}

/* ═════════════════════════════ Lecture ══════════════════════════════════ */

export const lister = query({
  args: {},
  handler: async (ctx) => {
    await accesRh(ctx, "consulter", "conges.lire")
    const conges = await ctx.db.query("rhConges").collect()
    const agents = new Map<Id<"rhAgents">, Doc<"rhAgents"> | null>()
    for (const conge of conges) {
      if (!agents.has(conge.agentId)) agents.set(conge.agentId, await ctx.db.get(conge.agentId))
    }
    return conges
      .map((conge) => {
        const agent = agents.get(conge.agentId)
        return { ...conge, agent: agent ? resumeAgent(agent) : null }
      })
      .sort((a, b) => b.du.localeCompare(a.du))
  },
})

export const conge = query({
  args: { congeId: v.id("rhConges") },
  handler: async (ctx, { congeId }) => {
    const acces = await accesRh(ctx, "consulter", "conges.lire")
    const conge = await ctx.db.get(congeId)
    if (!conge) return null
    const agent = await ctx.db.get(conge.agentId)
    if (!agent) return null
    const services = acces.capacites.has("roulements.lire")
      ? (
          await ctx.db
            .query("rhServices")
            .withIndex("by_agent_debut", (q) =>
              q.eq("agentId", agent._id).gte("debut", debutJournee(conge.du)).lt("debut", debutJournee(ajouterJours(conge.au, 1)))
            )
            .collect()
        ).filter((s) => s.statut !== "annule")
      : null
    return {
      conge,
      agent: resumeAgent(agent),
      solde: await soldeConge(ctx, agent, Number(conge.du.slice(0, 4))),
      servicesImpactes: services?.map((s) => ({ _id: s._id, date: s.date, debut: s.debut, fin: s.fin, type: s.type, trainNumber: s.trainNumber })) ?? null,
      chronologie: await chronologieRh(ctx, { entite: "conge", entiteId: congeId }, false),
      peutStatuer:
        acces.capacites.has("conges.valider") && conge.statut === "demande" && conge.demandePar !== acces.user._id,
      estDemandeur: conge.demandePar === acces.user._id,
    }
  },
})

/** Solde et chevauchements, pour le formulaire de demande. */
export const solde = query({
  args: { agentId: v.id("rhAgents"), annee: v.number() },
  handler: async (ctx, { agentId, annee }) => {
    await accesRh(ctx, "consulter", "conges.lire")
    const agent = await ctx.db.get(agentId)
    if (!agent) return null
    return await soldeConge(ctx, agent, annee)
  },
})

/* ════════════════════════════ Écriture ══════════════════════════════════ */

async function congeExistant(ctx: MutationCtx, congeId: Id<"rhConges">) {
  const conge = await ctx.db.get(congeId)
  if (!conge) throw new Error("Congé introuvable.")
  return conge
}

export const demander = mutation({
  args: {
    agentId: v.id("rhAgents"),
    type: typeCongeValidator,
    du: v.string(),
    au: v.string(),
    motif: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const acces = await accesRh(ctx, "creer", "conges.demander")
    const agent = await ctx.db.get(args.agentId)
    if (!agent) throw new Error("Agent introuvable.")
    if (agent.statut === "sorti") throw new Error("L'agent est sorti des effectifs.")
    const du = dateIso(args.du, "La date de début")
    const au = dateIso(args.au, "La date de fin")
    if (au < du) throw new Error("La fin du congé précède son début.")
    if (du < agent.dateEmbauche) throw new Error("Le congé précède l'embauche de l'agent.")
    if (joursCalendaires(du, au) > 180) throw new Error("Une absence ne peut dépasser 180 jours d'un seul tenant.")
    if (du.slice(0, 4) !== au.slice(0, 4) && args.type === "annuel") {
      throw new Error("Un congé annuel se pose sur une seule année civile : scindez la demande.")
    }
    const motif = texteFacultatif(args.motif, "Le motif", 500)
    if ((args.type === "maladie" || args.type === "evenement_familial" || args.type === "absence_injustifiee") && !motif) {
      throw new Error(`Le motif est obligatoire pour : ${TYPES_CONGE[args.type].libelle.toLowerCase()}.`)
    }
    const jours = args.type === "annuel" ? joursOuvrables(du, au) : joursCalendaires(du, au)
    if (jours === 0) throw new Error("La période choisie ne compte aucun jour ouvrable.")

    const existants = await ctx.db.query("rhConges").withIndex("by_agent", (q) => q.eq("agentId", agent._id)).collect()
    const chevauche = existants.find((c) => (c.statut === "demande" || c.statut === "valide") && c.du <= au && c.au >= du)
    if (chevauche) {
      throw new Error(`Cette période chevauche ${chevauche.numero} (${chevauche.du} → ${chevauche.au}).`)
    }
    if (args.type === "annuel") {
      const solde = await soldeConge(ctx, agent, Number(du.slice(0, 4)))
      if (jours > solde.disponible) {
        throw new Error(`Solde insuffisant : ${jours} jours demandés pour ${Math.max(0, solde.disponible)} disponibles.`)
      }
    }
    const numero = await prochainNumero(ctx, `CG-${du.slice(0, 4)}`)
    const congeId = await ctx.db.insert("rhConges", {
      agentId: agent._id,
      numero,
      type: args.type,
      du,
      au,
      jours,
      motif,
      statut: "demande",
      demandeLe: Date.now(),
      demandePar: acces.user._id,
      demandeParNom: acces.nom,
      origine: "saisie",
    })
    await tracerRh(ctx, acces, {
      entite: "conge",
      entiteId: congeId,
      agentId: agent._id,
      action: "rh.conge.demander",
      libelle: `Demande de ${TYPES_CONGE[args.type].libelle.toLowerCase()}`,
      detail: `${numero} · du ${du} au ${au} · ${jours} jour(s)`,
      permission: "creer",
      table: "rhConges",
    })
    return { congeId, numero, jours }
  },
})

export const statuer = mutation({
  args: {
    congeId: v.id("rhConges"),
    decision: v.union(v.literal("valide"), v.literal("refuse")),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const acces = await accesRh(ctx, "modifier", "conges.valider")
    const conge = await congeExistant(ctx, args.congeId)
    if (conge.statut !== "demande") throw new Error(`Ce congé est déjà ${STATUTS_CONGE[conge.statut].toLowerCase()}.`)
    if (conge.demandePar === acces.user._id) {
      throw new Error("Séparation des tâches : la personne qui a saisi la demande ne peut pas la valider.")
    }
    const note = texteFacultatif(args.note, "La note", 500)
    if (args.decision === "refuse" && !note) throw new Error("Un refus doit être motivé.")
    if (args.decision === "valide" && conge.type === "annuel") {
      const agent = await ctx.db.get(conge.agentId)
      if (agent) {
        const solde = await soldeConge(ctx, agent, Number(conge.du.slice(0, 4)))
        // La demande figure déjà dans « en attente » : le solde reste positif ou nul.
        if (solde.disponible < 0) {
          throw new Error("Solde insuffisant pour valider ce congé.")
        }
      }
    }
    await ctx.db.patch(conge._id, { statut: args.decision, decisionLe: Date.now(), decisionParNom: acces.nom, decisionNote: note })
    const servicesEnConflit =
      args.decision === "valide"
        ? (
            await ctx.db
              .query("rhServices")
              .withIndex("by_agent_debut", (q) =>
                q.eq("agentId", conge.agentId).gte("debut", debutJournee(conge.du)).lt("debut", debutJournee(ajouterJours(conge.au, 1)))
              )
              .collect()
          ).filter((s) => s.statut !== "annule").length
        : 0
    await tracerRh(ctx, acces, {
      entite: "conge",
      entiteId: conge._id,
      agentId: conge.agentId,
      action: `rh.conge.${args.decision === "valide" ? "valider" : "refuser"}`,
      libelle: args.decision === "valide" ? "Congé validé" : "Congé refusé",
      detail: [note, servicesEnConflit > 0 ? `${servicesEnConflit} service(s) planifié(s) à réaffecter` : null].filter(Boolean).join(" · ") || undefined,
      permission: "modifier",
      table: "rhConges",
    })
    return { statut: args.decision, servicesEnConflit }
  },
})

export const annuler = mutation({
  args: { congeId: v.id("rhConges"), motif: v.string() },
  handler: async (ctx, { congeId, motif }) => {
    const acces = await accesRh(ctx, "modifier", "conges.demander")
    const conge = await congeExistant(ctx, congeId)
    if (conge.statut !== "demande" && conge.statut !== "valide") {
      throw new Error(`Ce congé est déjà ${STATUTS_CONGE[conge.statut].toLowerCase()}.`)
    }
    if (conge.statut === "valide" && conge.du <= aujourdhuiLibreville()) {
      throw new Error("Un congé commencé ne s'annule plus : enregistrez une reprise anticipée par un nouveau congé raccourci.")
    }
    const texte = texteRequis(motif, "Le motif", 300)
    await ctx.db.patch(congeId, { statut: "annule", decisionLe: Date.now(), decisionParNom: acces.nom, decisionNote: texte })
    await tracerRh(ctx, acces, {
      entite: "conge",
      entiteId: congeId,
      agentId: conge.agentId,
      action: "rh.conge.annuler",
      libelle: "Congé annulé",
      detail: texte,
      permission: "modifier",
      table: "rhConges",
    })
    return { statut: "annule" as const }
  },
})
