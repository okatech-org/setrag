import { v } from "convex/values"

import type { Doc, Id } from "../../_generated/dataModel"
import { mutation, query, type MutationCtx } from "../../_generated/server"
import { accesRh, chronologieRh, prochainNumero, tracerRh } from "./acces"
import { aujourdhuiLibreville, dernieresAptitudes, resumeAptitude } from "./lecture"
import {
  METIERS,
  RESULTATS_APTITUDE,
  TYPES_VISITE,
  ajouterMois,
  dateIso,
  dateLibreville,
  etatAptitude,
  nomComplet,
  nomGare,
  periodiciteVisiteMois,
  texteFacultatif,
  texteRequis,
} from "./model"
import { resultatAptitudeValidator, typeVisiteValidator } from "./tables"

const LIEUX = ["Centre médical SETRAG — Owendo", "Antenne médicale — Booué", "Antenne médicale — Franceville"] as const

function resumeAgent(agent: Doc<"rhAgents">) {
  return {
    _id: agent._id,
    matricule: agent.matricule,
    nomComplet: nomComplet(agent),
    metier: agent.metier,
    metierLibelle: METIERS[agent.metier].libelle,
    posteSecurite: METIERS[agent.metier].securite,
    gareNom: nomGare(agent.gareCode),
    statut: agent.statut,
  }
}

/* ═════════════════════════════ Lecture ══════════════════════════════════ */

/**
 * Suivi des aptitudes : une ligne par agent en activité, avec son statut
 * (jamais le détail médical) et sa prochaine visite programmée.
 */
export const suivi = query({
  args: {},
  handler: async (ctx) => {
    const acces = await accesRh(ctx, "consulter", "aptitude.lire")
    const aujourdhui = aujourdhuiLibreville()
    const [agents, aptitudes, programmees] = await Promise.all([
      ctx.db.query("rhAgents").withIndex("by_statut", (q) => q.eq("statut", "actif")).collect(),
      dernieresAptitudes(ctx),
      ctx.db.query("rhVisitesMedicales").withIndex("by_statut_date", (q) => q.eq("statut", "programmee")).collect(),
    ])
    const prochaine = new Map<Id<"rhAgents">, Doc<"rhVisitesMedicales">>()
    for (const visite of programmees.sort((a, b) => a.dateProgrammee.localeCompare(b.dateProgrammee))) {
      if (!prochaine.has(visite.agentId)) prochaine.set(visite.agentId, visite)
    }
    return {
      peutProgrammer: acces.capacites.has("medical.programmer"),
      agents: agents.map((agent) => {
        const derniere = aptitudes.get(agent._id) ?? null
        const visite = prochaine.get(agent._id)
        return {
          ...resumeAgent(agent),
          ...etatAptitude(derniere, aujourdhui),
          restrictionFonctionnelle: derniere?.restrictionFonctionnelle,
          derniereVisiteLe: derniere ? dateLibreville(derniere.realiseeLe) : undefined,
          prochaineVisite: visite ? { _id: visite._id, date: visite.dateProgrammee, numero: visite.numero } : null,
        }
      }),
    }
  },
})

export const listerVisites = query({
  args: {},
  handler: async (ctx) => {
    await accesRh(ctx, "consulter", "aptitude.lire")
    const visites = await ctx.db.query("rhVisitesMedicales").collect()
    const agents = new Map<Id<"rhAgents">, Doc<"rhAgents"> | null>()
    for (const visite of visites) {
      if (!agents.has(visite.agentId)) agents.set(visite.agentId, await ctx.db.get(visite.agentId))
    }
    return visites
      .map((visite) => {
        const agent = agents.get(visite.agentId)
        return {
          _id: visite._id,
          numero: visite.numero,
          type: visite.type,
          statut: visite.statut,
          dateProgrammee: visite.dateProgrammee,
          heureProgrammee: visite.heureProgrammee,
          lieu: visite.lieu,
          resultat: visite.resultat,
          valideJusquau: visite.valideJusquau,
          agent: agent ? resumeAgent(agent) : null,
        }
      })
      .sort((a, b) => b.dateProgrammee.localeCompare(a.dateProgrammee))
  },
})

export const visite = query({
  args: { visiteId: v.id("rhVisitesMedicales") },
  handler: async (ctx, { visiteId }) => {
    const acces = await accesRh(ctx, "consulter", "aptitude.lire")
    const visite = await ctx.db.get(visiteId)
    if (!visite) return null
    const agent = await ctx.db.get(visite.agentId)
    if (!agent) return null
    const voitMedical = acces.capacites.has("medical.detail")
    const examen = voitMedical
      ? await ctx.db.query("rhExamensMedicaux").withIndex("by_visite", (q) => q.eq("visiteId", visiteId)).unique()
      : null
    const historique = await ctx.db.query("rhVisitesMedicales").withIndex("by_agent", (q) => q.eq("agentId", agent._id)).collect()
    const derniere = historique
      .filter((h) => h.statut === "realisee" && h.resultat)
      .sort((a, b) => (b.realiseeLe ?? 0) - (a.realiseeLe ?? 0))[0]
    return {
      visite: {
        _id: visite._id,
        numero: visite.numero,
        type: visite.type,
        statut: visite.statut,
        dateProgrammee: visite.dateProgrammee,
        heureProgrammee: visite.heureProgrammee,
        lieu: visite.lieu,
        realiseeLe: visite.realiseeLe,
        resultat: visite.resultat,
        restrictionFonctionnelle: visite.restrictionFonctionnelle,
        valideJusquau: visite.valideJusquau,
        prononceeParNom: visite.prononceeParNom,
        motifAnnulation: visite.motifAnnulation,
      },
      agent: resumeAgent(agent),
      aptitudeCourante: resumeAptitude(derniere, aujourdhuiLibreville()),
      periodiciteMois: periodiciteVisiteMois(agent.metier),
      /** Présence d'examens saisis — leur contenu reste derrière `consulterExamens`. */
      examensSaisis: voitMedical ? examen !== null : null,
      historique: historique
        .sort((a, b) => b.dateProgrammee.localeCompare(a.dateProgrammee))
        .map((h) => ({ _id: h._id, numero: h.numero, type: h.type, statut: h.statut, dateProgrammee: h.dateProgrammee, resultat: h.resultat })),
      chronologie: await chronologieRh(ctx, { entite: "visite", entiteId: visiteId }, voitMedical),
      lieux: LIEUX,
    }
  },
})

/* ════════════════════════════ Écriture ══════════════════════════════════ */

async function visiteExistante(ctx: MutationCtx, visiteId: Id<"rhVisitesMedicales">) {
  const visite = await ctx.db.get(visiteId)
  if (!visite) throw new Error("Visite introuvable.")
  return visite
}

function heure(valeur: string | undefined) {
  const texte = texteFacultatif(valeur, "L'heure", 5)
  if (texte && !/^([01]\d|2[0-3]):[0-5]\d$/.test(texte)) throw new Error("L'heure doit être au format HH:MM.")
  return texte
}

export const programmer = mutation({
  args: {
    agentId: v.id("rhAgents"),
    type: typeVisiteValidator,
    dateProgrammee: v.string(),
    heureProgrammee: v.optional(v.string()),
    lieu: v.string(),
  },
  handler: async (ctx, args) => {
    const acces = await accesRh(ctx, "creer", "medical.programmer")
    const agent = await ctx.db.get(args.agentId)
    if (!agent) throw new Error("Agent introuvable.")
    if (agent.statut === "sorti") throw new Error("L'agent est sorti des effectifs.")
    const date = dateIso(args.dateProgrammee, "La date de visite")
    if (date < aujourdhuiLibreville()) throw new Error("Une visite se programme à une date à venir.")
    const deja = await ctx.db.query("rhVisitesMedicales").withIndex("by_agent", (q) => q.eq("agentId", agent._id)).collect()
    if (deja.some((visite) => visite.statut === "programmee")) {
      throw new Error("Une visite est déjà programmée pour cet agent : reprogrammez-la plutôt.")
    }
    const numero = await prochainNumero(ctx, `VM-${date.slice(0, 4)}`)
    const now = Date.now()
    const visiteId = await ctx.db.insert("rhVisitesMedicales", {
      agentId: agent._id,
      numero,
      type: args.type,
      statut: "programmee",
      dateProgrammee: date,
      heureProgrammee: heure(args.heureProgrammee),
      lieu: texteRequis(args.lieu, "Le lieu", 120),
      origine: "saisie",
      createdAt: now,
      updatedAt: now,
    })
    await tracerRh(ctx, acces, {
      entite: "visite",
      entiteId: visiteId,
      agentId: agent._id,
      action: "rh.medical.programmer",
      libelle: `${TYPES_VISITE[args.type]} programmée le ${date}`,
      detail: args.lieu,
      permission: "creer",
      table: "rhVisitesMedicales",
    })
    return { visiteId, numero }
  },
})

export const reprogrammer = mutation({
  args: {
    visiteId: v.id("rhVisitesMedicales"),
    dateProgrammee: v.string(),
    heureProgrammee: v.optional(v.string()),
    lieu: v.string(),
    motif: v.string(),
  },
  handler: async (ctx, args) => {
    const acces = await accesRh(ctx, "modifier", "medical.programmer")
    const visite = await visiteExistante(ctx, args.visiteId)
    if (visite.statut !== "programmee") throw new Error("Seule une visite programmée se reprogramme.")
    const date = dateIso(args.dateProgrammee, "La date de visite")
    if (date < aujourdhuiLibreville()) throw new Error("Une visite se programme à une date à venir.")
    const motif = texteRequis(args.motif, "Le motif", 300)
    await ctx.db.patch(visite._id, {
      dateProgrammee: date,
      heureProgrammee: heure(args.heureProgrammee),
      lieu: texteRequis(args.lieu, "Le lieu", 120),
      updatedAt: Date.now(),
    })
    await tracerRh(ctx, acces, {
      entite: "visite",
      entiteId: visite._id,
      agentId: visite.agentId,
      action: "rh.medical.reprogrammer",
      libelle: `Visite reportée au ${date}`,
      detail: `${visite.dateProgrammee} → ${date} · ${motif}`,
      permission: "modifier",
      table: "rhVisitesMedicales",
    })
    return { dateProgrammee: date }
  },
})

export const annuler = mutation({
  args: { visiteId: v.id("rhVisitesMedicales"), motif: v.string() },
  handler: async (ctx, { visiteId, motif }) => {
    const acces = await accesRh(ctx, "modifier", "medical.programmer")
    const visite = await visiteExistante(ctx, visiteId)
    if (visite.statut !== "programmee") throw new Error("Seule une visite programmée s'annule.")
    const texte = texteRequis(motif, "Le motif", 300)
    await ctx.db.patch(visiteId, { statut: "annulee", motifAnnulation: texte, updatedAt: Date.now() })
    await tracerRh(ctx, acces, {
      entite: "visite",
      entiteId: visiteId,
      agentId: visite.agentId,
      action: "rh.medical.annuler",
      libelle: "Visite annulée",
      detail: texte,
      permission: "modifier",
      table: "rhVisitesMedicales",
    })
    return { statut: "annulee" as const }
  },
})

const optionNormale = v.optional(v.union(v.literal("normale"), v.literal("anomalie")))
const optionDepistage = v.optional(v.union(v.literal("negatif"), v.literal("positif"), v.literal("non_realise")))

/** Saisie des examens (infirmier ou médecin). Secret médical : journal masqué. */
export const saisirExamens = mutation({
  args: {
    visiteId: v.id("rhVisitesMedicales"),
    acuiteVisuelle: v.optional(v.string()),
    visionCouleurs: optionNormale,
    audition: v.optional(v.union(v.literal("normale"), v.literal("deficit_leger"), v.literal("deficit"))),
    tensionArterielle: v.optional(v.string()),
    frequenceCardiaque: v.optional(v.number()),
    glycemie: v.optional(v.string()),
    depistageAlcool: optionDepistage,
    depistageStupefiants: optionDepistage,
    observations: v.optional(v.string()),
  },
  handler: async (ctx, { visiteId, ...examen }) => {
    const acces = await accesRh(ctx, "modifier", "medical.programmer")
    const visite = await visiteExistante(ctx, visiteId)
    if (visite.statut === "annulee") throw new Error("La visite est annulée.")
    if (visite.statut === "realisee") throw new Error("L'aptitude est prononcée : les examens sont figés.")
    if (examen.frequenceCardiaque !== undefined && (!Number.isInteger(examen.frequenceCardiaque) || examen.frequenceCardiaque < 20 || examen.frequenceCardiaque > 250)) {
      throw new Error("La fréquence cardiaque doit être comprise entre 20 et 250.")
    }
    if (examen.tensionArterielle && !/^\d{2,3}\/\d{2,3}$/.test(examen.tensionArterielle.trim())) {
      throw new Error("La tension s'écrit « 120/80 ».")
    }
    const valeur = {
      ...examen,
      acuiteVisuelle: texteFacultatif(examen.acuiteVisuelle, "L'acuité visuelle", 40),
      tensionArterielle: texteFacultatif(examen.tensionArterielle, "La tension", 10),
      glycemie: texteFacultatif(examen.glycemie, "La glycémie", 20),
      observations: texteFacultatif(examen.observations, "Les observations", 2000),
      saisiParNom: acces.nom,
      saisiLe: Date.now(),
    }
    const existant = await ctx.db.query("rhExamensMedicaux").withIndex("by_visite", (q) => q.eq("visiteId", visiteId)).unique()
    if (existant) await ctx.db.patch(existant._id, valeur)
    else await ctx.db.insert("rhExamensMedicaux", { visiteId, agentId: visite.agentId, ...valeur })
    await tracerRh(ctx, acces, {
      entite: "visite",
      entiteId: visiteId,
      agentId: visite.agentId,
      action: "rh.medical.examens",
      libelle: existant ? "Examens complétés" : "Examens saisis",
      confidentiel: true,
      permission: "modifier",
      table: "rhExamensMedicaux",
    })
    return { enregistre: true }
  },
})

/**
 * Décision d'aptitude, réservée au médecin du travail. Seuls le résultat, la
 * consigne fonctionnelle et l'échéance sortent du service médical.
 */
export const prononcer = mutation({
  args: {
    visiteId: v.id("rhVisitesMedicales"),
    resultat: resultatAptitudeValidator,
    restrictionFonctionnelle: v.optional(v.string()),
    valideJusquau: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const acces = await accesRh(ctx, "modifier", "medical.prononcer")
    const visite = await visiteExistante(ctx, args.visiteId)
    if (visite.statut !== "programmee") throw new Error("L'aptitude se prononce sur une visite programmée.")
    const agent = await ctx.db.get(visite.agentId)
    if (!agent) throw new Error("Agent introuvable.")
    const aujourdhui = aujourdhuiLibreville()
    if (visite.dateProgrammee > aujourdhui) throw new Error("La visite n'a pas encore eu lieu.")
    const examen = await ctx.db.query("rhExamensMedicaux").withIndex("by_visite", (q) => q.eq("visiteId", visite._id)).unique()
    if (!examen && METIERS[agent.metier].securite) {
      throw new Error("Poste de sécurité : saisissez les examens avant de prononcer l'aptitude.")
    }
    const restriction = texteFacultatif(args.restrictionFonctionnelle, "La restriction", 200)
    if (args.resultat === "apte_restriction" && !restriction) {
      throw new Error("Une aptitude avec restriction exige la consigne fonctionnelle (sans motif médical).")
    }
    let valideJusquau: string | undefined
    if (args.resultat === "inapte_definitif") {
      valideJusquau = undefined
    } else if (args.resultat === "inapte_temporaire") {
      if (!args.valideJusquau) throw new Error("Indiquez la date de réexamen de l'inaptitude temporaire.")
      valideJusquau = dateIso(args.valideJusquau, "La date de réexamen")
      if (valideJusquau <= aujourdhui) throw new Error("La date de réexamen doit être à venir.")
    } else {
      valideJusquau = args.valideJusquau
        ? dateIso(args.valideJusquau, "La date d'échéance")
        : ajouterMois(aujourdhui, periodiciteVisiteMois(agent.metier))
      if (valideJusquau <= aujourdhui) throw new Error("L'échéance de l'aptitude doit être à venir.")
      if (valideJusquau > ajouterMois(aujourdhui, 24)) throw new Error("Une aptitude ne peut excéder 24 mois.")
    }
    await ctx.db.patch(visite._id, {
      statut: "realisee",
      realiseeLe: Date.now(),
      resultat: args.resultat,
      restrictionFonctionnelle: args.resultat === "apte_restriction" ? restriction : undefined,
      valideJusquau,
      prononceeParNom: acces.nom,
      updatedAt: Date.now(),
    })
    await tracerRh(ctx, acces, {
      entite: "visite",
      entiteId: visite._id,
      agentId: agent._id,
      action: "rh.medical.prononcer",
      libelle: `Aptitude prononcée : ${RESULTATS_APTITUDE[args.resultat].toLowerCase()}`,
      detail: [valideJusquau ? `Échéance ${valideJusquau}` : null, restriction ? `Consigne : ${restriction}` : null].filter(Boolean).join(" · ") || undefined,
      permission: "modifier",
      table: "rhVisitesMedicales",
      apres: { resultat: args.resultat, valideJusquau },
    })
    let services = 0
    if (args.resultat === "inapte_temporaire" || args.resultat === "inapte_definitif") {
      const futurs = await ctx.db
        .query("rhServices")
        .withIndex("by_agent_debut", (q) => q.eq("agentId", agent._id).gte("debut", Date.now()))
        .collect()
      services = futurs.filter((s) => s.statut !== "annule").length
    }
    return { valideJusquau, servicesAReaffecter: services }
  },
})

/**
 * Lecture du détail médical d'un agent. C'est une mutation, pour que chaque
 * consultation laisse une trace au journal d'audit (document 07 : « audit de
 * consultation » des données médicales).
 */
export const consulterExamens = mutation({
  args: { agentId: v.id("rhAgents") },
  handler: async (ctx, { agentId }) => {
    const acces = await accesRh(ctx, "consulter", "medical.detail")
    const agent = await ctx.db.get(agentId)
    if (!agent) throw new Error("Agent introuvable.")
    const examens = await ctx.db.query("rhExamensMedicaux").withIndex("by_agent", (q) => q.eq("agentId", agentId)).collect()
    const visites = await Promise.all(examens.map((examen) => ctx.db.get(examen.visiteId)))
    await tracerRh(ctx, acces, {
      entite: "agent",
      entiteId: agentId,
      agentId,
      action: "rh.medical.consulter",
      libelle: "Consultation du dossier médical",
      confidentiel: true,
      permission: "consulter",
      table: "rhExamensMedicaux",
    })
    return examens
      .map((examen, index) => ({
        ...examen,
        visite: visites[index] ? { numero: visites[index]!.numero, type: visites[index]!.type, dateProgrammee: visites[index]!.dateProgrammee } : null,
      }))
      .sort((a, b) => b.saisiLe - a.saisiLe)
  },
})
