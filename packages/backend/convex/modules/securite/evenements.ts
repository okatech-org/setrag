import { v } from "convex/values"

import type { Doc, Id } from "../../_generated/dataModel"
import { mutation, query, type MutationCtx } from "../../_generated/server"
import { GARES, estGareConnue, nomGare } from "../rh/model"
import { accesSecurite, chronologieSecurite, prochainNumeroSecurite, tracerSecurite, type AccesSecurite } from "./acces"
import {
  DELAI_ENQUETE_JOURS,
  GRAVITES,
  NATURES_ARTF,
  STATUTS_EVENEMENT,
  TYPES_EVENEMENT,
  actionEnRetard,
  ajouterJours,
  controlerPk,
  dansZoneLope,
  dateIso,
  dateLibreville,
  echeanceNotification,
  echeanceRapportEnquete,
  obligationNotification,
  texteFacultatif,
  texteRequis,
} from "./model"
import { graviteValidator, typeEvenementValidator } from "./tables"

/* ═════════════════════════════ Lecture ══════════════════════════════════ */

export function resumeEvenement(evenement: Doc<"securiteEvenements">) {
  return {
    _id: evenement._id,
    numero: evenement.numero,
    type: evenement.type,
    famille: TYPES_EVENEMENT[evenement.type].famille,
    gravite: evenement.gravite,
    survenuLe: evenement.survenuLe,
    lieu: evenement.lieu,
    gareCode: evenement.gareCode,
    gareNom: evenement.gareCode ? nomGare(evenement.gareCode) : undefined,
    pk: evenement.pk,
    zoneLope: evenement.zoneLope,
    trainNumber: evenement.trainNumber,
    statut: evenement.statut,
    blesses: evenement.blesses,
    deces: evenement.deces,
    notificationRequise: evenement.notificationRequise,
  }
}

export const lister = query({
  args: {},
  handler: async (ctx) => {
    await accesSecurite(ctx, "consulter", "registre.lire")
    const aujourdhui = dateLibreville(Date.now())
    const [evenements, enquetes, actions, declarations] = await Promise.all([
      ctx.db.query("securiteEvenements").withIndex("by_survenu").order("desc").take(2000),
      ctx.db.query("securiteEnquetes").collect(),
      ctx.db.query("securiteActions").collect(),
      ctx.db.query("securiteDeclarationsArtf").collect(),
    ])
    const enqueteParEvenement = new Map(enquetes.map((e) => [e.evenementId, e]))
    return evenements.map((evenement) => {
      const enquete = enqueteParEvenement.get(evenement._id)
      const liees = actions.filter((a) => a.evenementId === evenement._id || (enquete && a.enqueteId === enquete._id))
      const notification = declarations.find((d) => d.evenementId === evenement._id && d.nature === "notification_immediate")
      return {
        ...resumeEvenement(evenement),
        enquete: enquete ? { _id: enquete._id, numero: enquete.numero, statut: enquete.statut } : null,
        actionsOuvertes: liees.filter((a) => a.statut === "planifiee" || a.statut === "en_cours" || a.statut === "realisee").length,
        actionsEnRetard: liees.filter((a) => actionEnRetard(a, aujourdhui)).length,
        notification: notification ? { statut: notification.statut, echeance: notification.echeance } : null,
      }
    })
  },
})

export const dossier = query({
  args: { evenementId: v.id("securiteEvenements") },
  handler: async (ctx, { evenementId }) => {
    const acces = await accesSecurite(ctx, "consulter", "registre.lire")
    const evenement = await ctx.db.get(evenementId)
    if (!evenement) return null
    const aujourdhui = dateLibreville(Date.now())
    const [enquete, actionsDirectes, declarations, incident, trip] = await Promise.all([
      ctx.db.query("securiteEnquetes").withIndex("by_evenement", (q) => q.eq("evenementId", evenementId)).first(),
      ctx.db.query("securiteActions").withIndex("by_evenement", (q) => q.eq("evenementId", evenementId)).collect(),
      ctx.db.query("securiteDeclarationsArtf").withIndex("by_evenement", (q) => q.eq("evenementId", evenementId)).collect(),
      evenement.incidentId ? ctx.db.get(evenement.incidentId) : Promise.resolve(null),
      evenement.tripId ? ctx.db.get(evenement.tripId) : Promise.resolve(null),
    ])
    const actionsEnquete = enquete
      ? await ctx.db.query("securiteActions").withIndex("by_enquete", (q) => q.eq("enqueteId", enquete._id)).collect()
      : []
    const actions = [...actionsDirectes, ...actionsEnquete.filter((a) => !actionsDirectes.some((d) => d._id === a._id))]
    const obligation = obligationNotification(evenement)
    return {
      evenement: {
        ...evenement,
        gareNom: evenement.gareCode ? nomGare(evenement.gareCode) : undefined,
      },
      obligation,
      incident: incident
        ? { _id: incident._id, numero: incident.number ?? null, description: incident.description, severity: incident.severity, status: incident.status, reportedAt: incident.reportedAt }
        : null,
      desserte: trip ? { trainNumber: trip.trainNumber, serviceDate: trip.serviceDate } : null,
      enquete,
      actions: actions
        .map((a) => ({ ...a, enRetard: actionEnRetard(a, aujourdhui) }))
        .sort((a, b) => a.echeance.localeCompare(b.echeance)),
      declarations: declarations.sort((a, b) => a.echeance - b.echeance),
      chronologie: await chronologieSecurite(ctx, { evenementId }),
      droits: {
        qualifier: acces.capacites.has("evenement.qualifier"),
        gererActions: acces.capacites.has("actions.gerer"),
      },
    }
  },
})

/** Incidents d'exploitation remontés du terrain, pas encore qualifiés en événement. */
export const incidentsAQualifier = query({
  args: {},
  handler: async (ctx) => {
    await accesSecurite(ctx, "consulter", "evenement.declarer")
    const depuis = Date.now() - 120 * 86_400_000
    const incidents = await ctx.db.query("incidents").withIndex("by_reported_at", (q) => q.gte("reportedAt", depuis)).order("desc").take(300)
    const candidats = incidents.filter((i) => i.category === "securite" || i.severity === "critique")
    const resultat = []
    for (const incident of candidats) {
      const lie = await ctx.db.query("securiteEvenements").withIndex("by_incident", (q) => q.eq("incidentId", incident._id)).first()
      if (lie) continue
      const [station, trip] = await Promise.all([
        incident.stationId ? ctx.db.get(incident.stationId) : Promise.resolve(null),
        incident.tripId ? ctx.db.get(incident.tripId) : Promise.resolve(null),
      ])
      resultat.push({
        _id: incident._id,
        numero: incident.number ?? null,
        category: incident.category,
        severity: incident.severity,
        description: incident.description,
        reportedAt: incident.reportedAt,
        location: incident.location ?? null,
        gareCode: station?.code ?? null,
        gareNom: station?.name ?? null,
        trainNumber: trip?.trainNumber ?? null,
        tripId: trip?._id ?? null,
      })
    }
    return resultat
  },
})

/** Enquêteurs désignables : comptes actifs des profils d'enquête. */
export const enqueteursPossibles = query({
  args: {},
  handler: async (ctx) => {
    await accesSecurite(ctx, "consulter", "evenement.qualifier")
    const resultat = []
    for (const role of ["enqueteur_accidents", "inspecteur_securite"] as const) {
      const users = await ctx.db.query("users").withIndex("by_role", (q) => q.eq("role", role)).collect()
      for (const user of users.filter((u) => u.isActive)) {
        resultat.push({
          _id: user._id,
          nom: [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || "Compte sans nom",
          role,
        })
      }
    }
    return resultat
  },
})

/* ════════════════════════════ Écriture ══════════════════════════════════ */

async function evenementExistant(ctx: MutationCtx, evenementId: Id<"securiteEvenements">) {
  const evenement = await ctx.db.get(evenementId)
  if (!evenement) throw new Error("Événement introuvable.")
  return evenement
}

function compte(valeur: number, libelle: string) {
  if (!Number.isInteger(valeur) || valeur < 0 || valeur > 1000) throw new Error(`${libelle} doit être un entier entre 0 et 1000.`)
  return valeur
}

/**
 * Tient l'obligation de notification à jour : création à échéance quand
 * l'événement la déclenche, retrait d'une notification non transmise quand
 * une requalification la lève.
 */
export async function synchroniserNotification(
  ctx: MutationCtx,
  acces: Pick<AccesSecurite, "user" | "nom"> | null,
  evenement: Doc<"securiteEvenements">
) {
  const obligation = obligationNotification(evenement)
  await ctx.db.patch(evenement._id, { notificationRequise: obligation.requise, motifNotification: obligation.requise ? obligation.motif : undefined })
  const existante = (
    await ctx.db.query("securiteDeclarationsArtf").withIndex("by_evenement", (q) => q.eq("evenementId", evenement._id)).collect()
  ).find((d) => d.nature === "notification_immediate")
  if (obligation.requise && obligation.delaiHeures && !existante) {
    const numero = await prochainNumeroSecurite(ctx, `ARTF-${dateLibreville(evenement.survenuLe).slice(0, 4)}`, 3)
    const echeance = echeanceNotification(evenement.survenuLe, obligation.delaiHeures)
    const declarationId = await ctx.db.insert("securiteDeclarationsArtf", {
      numero,
      nature: "notification_immediate",
      evenementId: evenement._id,
      objet: `${TYPES_EVENEMENT[evenement.type].libelle} — ${evenement.lieu} (${evenement.numero})`,
      echeance,
      statut: "a_preparer",
      mode: "simulation",
      createdAt: Date.now(),
      origine: acces ? "saisie" : "demo",
    })
    if (acces) {
      await tracerSecurite(ctx, acces, {
        entite: "declaration",
        entiteId: declarationId,
        evenementId: evenement._id,
        action: "securite.artf.obligation",
        libelle: `${NATURES_ARTF.notification_immediate} à l'ARTF exigée`,
        detail: `${obligation.motif} · échéance ${new Date(echeance).toISOString().slice(0, 16).replace("T", " ")} UTC`,
        permission: "creer",
        table: "securiteDeclarationsArtf",
      })
    }
    return { creee: true }
  }
  if (!obligation.requise && existante && (existante.statut === "a_preparer" || existante.statut === "prete")) {
    await ctx.db.delete(existante._id)
    if (acces) {
      await tracerSecurite(ctx, acces, {
        entite: "evenement",
        entiteId: evenement._id,
        evenementId: evenement._id,
        action: "securite.artf.obligation_levee",
        libelle: "Obligation de notification levée par la requalification",
        detail: existante.numero,
        permission: "modifier",
        table: "securiteDeclarationsArtf",
      })
    }
  }
  return { creee: false }
}

function localisation(args: { gareCode?: string; pk?: number; lieu?: string }) {
  const gareCode = args.gareCode ? args.gareCode.trim().toUpperCase() : undefined
  if (gareCode && !estGareConnue(gareCode)) throw new Error(`Gare inconnue : ${args.gareCode}.`)
  const pk = controlerPk(args.pk ?? (gareCode ? GARES.find((g) => g.code === gareCode)?.pk : undefined))
  const lieu =
    texteFacultatif(args.lieu, "Le lieu", 200) ??
    (gareCode ? `Gare de ${nomGare(gareCode)}` : pk !== undefined ? `PK ${String(pk).replace(".", ",")}` : undefined)
  if (!lieu) throw new Error("Indiquez une gare, un point kilométrique ou un lieu.")
  return { gareCode, pk, lieu, zoneLope: dansZoneLope(pk) }
}

export const declarer = mutation({
  args: {
    type: typeEvenementValidator,
    gravite: graviteValidator,
    survenuLe: v.number(),
    gareCode: v.optional(v.string()),
    pk: v.optional(v.number()),
    lieu: v.optional(v.string()),
    trainNumber: v.optional(v.string()),
    tripId: v.optional(v.id("trips")),
    incidentId: v.optional(v.id("incidents")),
    description: v.string(),
    mesuresImmediates: v.optional(v.string()),
    blesses: v.number(),
    deces: v.number(),
    degats: v.optional(v.string()),
    interruptionMinutes: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const acces = await accesSecurite(ctx, "creer", "evenement.declarer")
    const now = Date.now()
    if (!Number.isFinite(args.survenuLe) || args.survenuLe > now + 5 * 60_000) {
      throw new Error("La date de survenue ne peut pas être dans le futur.")
    }
    if (args.survenuLe < now - 400 * 86_400_000) throw new Error("La date de survenue remonte à plus d'un an.")
    if (args.incidentId) {
      const incident = await ctx.db.get(args.incidentId)
      if (!incident) throw new Error("Incident source introuvable.")
      const deja = await ctx.db.query("securiteEvenements").withIndex("by_incident", (q) => q.eq("incidentId", args.incidentId)).first()
      if (deja) throw new Error(`Cet incident est déjà qualifié en ${deja.numero}.`)
    }
    if (args.tripId && !(await ctx.db.get(args.tripId))) throw new Error("Desserte introuvable.")
    if (args.interruptionMinutes !== undefined && (!Number.isInteger(args.interruptionMinutes) || args.interruptionMinutes < 0 || args.interruptionMinutes > 100_000)) {
      throw new Error("L'interruption de circulation s'exprime en minutes entières.")
    }
    const lieu = localisation(args)
    const numero = await prochainNumeroSecurite(ctx, `EVS-${dateLibreville(args.survenuLe).slice(0, 4)}`)
    const evenementId = await ctx.db.insert("securiteEvenements", {
      numero,
      type: args.type,
      gravite: args.gravite,
      survenuLe: args.survenuLe,
      declareLe: now,
      declarantId: acces.user._id,
      declarantNom: acces.nom,
      ...lieu,
      trainNumber: texteFacultatif(args.trainNumber, "Le numéro de train", 20),
      tripId: args.tripId,
      incidentId: args.incidentId,
      description: texteRequis(args.description, "La description", 4000),
      mesuresImmediates: texteFacultatif(args.mesuresImmediates, "Les mesures immédiates", 2000),
      blesses: compte(args.blesses, "Le nombre de blessés"),
      deces: compte(args.deces, "Le nombre de décès"),
      degats: texteFacultatif(args.degats, "Les dégâts", 1000),
      interruptionMinutes: args.interruptionMinutes,
      statut: "declare",
      notificationRequise: false,
      origine: "saisie",
    })
    await tracerSecurite(ctx, acces, {
      entite: "evenement",
      entiteId: evenementId,
      evenementId,
      action: "securite.evenement.declarer",
      libelle: `Déclaration : ${TYPES_EVENEMENT[args.type].libelle.toLowerCase()}`,
      detail: `${GRAVITES[args.gravite].libelle} · ${lieu.lieu}${args.incidentId ? " · issu d'un incident d'exploitation" : ""}`,
      permission: "creer",
      table: "securiteEvenements",
    })
    const evenement = (await ctx.db.get(evenementId))!
    await synchroniserNotification(ctx, acces, evenement)
    return { evenementId, numero }
  },
})

export const qualifier = mutation({
  args: {
    evenementId: v.id("securiteEvenements"),
    type: typeEvenementValidator,
    gravite: graviteValidator,
    blesses: v.number(),
    deces: v.number(),
    gareCode: v.optional(v.string()),
    pk: v.optional(v.number()),
    lieu: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const acces = await accesSecurite(ctx, "modifier", "evenement.qualifier")
    const evenement = await evenementExistant(ctx, args.evenementId)
    if (evenement.statut === "cloture" || evenement.statut === "classe") {
      throw new Error(`L'événement est ${STATUTS_EVENEMENT[evenement.statut].toLowerCase()} : il ne se requalifie plus.`)
    }
    const lieu = localisation({ gareCode: args.gareCode ?? evenement.gareCode, pk: args.pk ?? evenement.pk, lieu: args.lieu ?? evenement.lieu })
    const avant = { type: evenement.type, gravite: evenement.gravite, blesses: evenement.blesses, deces: evenement.deces }
    await ctx.db.patch(evenement._id, {
      type: args.type,
      gravite: args.gravite,
      blesses: compte(args.blesses, "Le nombre de blessés"),
      deces: compte(args.deces, "Le nombre de décès"),
      ...lieu,
      statut: evenement.statut === "declare" ? "qualifie" : evenement.statut,
      qualifieLe: Date.now(),
      qualifieParNom: acces.nom,
    })
    const note = texteFacultatif(args.note, "La note", 1000)
    await tracerSecurite(ctx, acces, {
      entite: "evenement",
      entiteId: evenement._id,
      evenementId: evenement._id,
      action: "securite.evenement.qualifier",
      libelle: evenement.statut === "declare" ? "Qualification de l'événement" : "Requalification de l'événement",
      detail: [`${TYPES_EVENEMENT[args.type].libelle} · ${GRAVITES[args.gravite].libelle}`, note].filter(Boolean).join(" · "),
      permission: "modifier",
      table: "securiteEvenements",
      avant,
      apres: { type: args.type, gravite: args.gravite, blesses: args.blesses, deces: args.deces },
    })
    const misAJour = (await ctx.db.get(evenement._id))!
    await synchroniserNotification(ctx, acces, misAJour)
    return { notificationRequise: obligationNotification(misAJour).requise }
  },
})

export const classer = mutation({
  args: { evenementId: v.id("securiteEvenements"), motif: v.string() },
  handler: async (ctx, { evenementId, motif }) => {
    const acces = await accesSecurite(ctx, "modifier", "evenement.qualifier")
    const evenement = await evenementExistant(ctx, evenementId)
    if (evenement.statut !== "declare" && evenement.statut !== "qualifie") {
      throw new Error("Seul un événement non instruit se classe sans suite.")
    }
    if (obligationNotification(evenement).requise) {
      throw new Error("Un événement soumis à déclaration ARTF ne se classe pas sans suite.")
    }
    const texte = texteRequis(motif, "Le motif", 1000)
    await ctx.db.patch(evenementId, { statut: "classe", clotureLe: Date.now(), clotureParNom: acces.nom, noteCloture: texte })
    await tracerSecurite(ctx, acces, {
      entite: "evenement",
      entiteId: evenementId,
      evenementId,
      action: "securite.evenement.classer",
      libelle: "Classement sans suite",
      detail: texte,
      permission: "modifier",
      table: "securiteEvenements",
    })
    return { statut: "classe" as const }
  },
})

/** Clôture d'un événement qualifié qui n'appelle pas d'enquête. */
export const cloturer = mutation({
  args: { evenementId: v.id("securiteEvenements"), note: v.string() },
  handler: async (ctx, { evenementId, note }) => {
    const acces = await accesSecurite(ctx, "modifier", "evenement.qualifier")
    const evenement = await evenementExistant(ctx, evenementId)
    if (evenement.statut !== "qualifie") {
      throw new Error(
        evenement.statut === "en_enquete"
          ? "L'événement est en enquête : il se clôture avec l'enquête."
          : "Seul un événement qualifié se clôture directement."
      )
    }
    const declarations = await ctx.db.query("securiteDeclarationsArtf").withIndex("by_evenement", (q) => q.eq("evenementId", evenementId)).collect()
    const enAttente = declarations.find((d) => d.statut === "a_preparer" || d.statut === "prete")
    if (enAttente) throw new Error(`Transmettez d'abord ${enAttente.numero} à l'ARTF.`)
    const texte = texteRequis(note, "La note de clôture", 1000)
    await ctx.db.patch(evenementId, { statut: "cloture", clotureLe: Date.now(), clotureParNom: acces.nom, noteCloture: texte })
    await tracerSecurite(ctx, acces, {
      entite: "evenement",
      entiteId: evenementId,
      evenementId,
      action: "securite.evenement.cloturer",
      libelle: "Clôture sans enquête",
      detail: texte,
      permission: "modifier",
      table: "securiteEvenements",
    })
    return { statut: "cloture" as const }
  },
})

export const ouvrirEnquete = mutation({
  args: {
    evenementId: v.id("securiteEvenements"),
    enqueteurId: v.id("users"),
    echeanceRapport: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const acces = await accesSecurite(ctx, "creer", "evenement.qualifier")
    const evenement = await evenementExistant(ctx, args.evenementId)
    if (evenement.statut !== "declare" && evenement.statut !== "qualifie") {
      throw new Error(`L'événement est ${STATUTS_EVENEMENT[evenement.statut].toLowerCase()} : aucune enquête ne peut s'ouvrir.`)
    }
    const deja = await ctx.db.query("securiteEnquetes").withIndex("by_evenement", (q) => q.eq("evenementId", evenement._id)).first()
    if (deja) throw new Error(`Une enquête est déjà ouverte : ${deja.numero}.`)
    const enqueteur = await ctx.db.get(args.enqueteurId)
    if (!enqueteur || !enqueteur.isActive) throw new Error("Enquêteur introuvable ou désactivé.")
    if (enqueteur.role !== "enqueteur_accidents" && enqueteur.role !== "inspecteur_securite") {
      throw new Error("L'enquêteur doit être enquêteur accidents ou inspecteur sécurité.")
    }
    const aujourdhui = dateLibreville(Date.now())
    const echeanceRapport = args.echeanceRapport ? dateIso(args.echeanceRapport, "L'échéance du rapport") : ajouterJours(aujourdhui, DELAI_ENQUETE_JOURS)
    if (echeanceRapport <= aujourdhui) throw new Error("L'échéance du rapport doit être à venir.")
    const numero = await prochainNumeroSecurite(ctx, `ENQ-${aujourdhui.slice(0, 4)}`, 3)
    const enqueteurNom = [enqueteur.firstName, enqueteur.lastName].filter(Boolean).join(" ") || enqueteur.email || "Enquêteur"
    const enqueteId = await ctx.db.insert("securiteEnquetes", {
      numero,
      evenementId: evenement._id,
      enqueteurId: enqueteur._id,
      enqueteurNom,
      ouverteLe: Date.now(),
      ouverteParNom: acces.nom,
      echeanceRapport,
      statut: "ouverte",
      causes: [],
      recommandations: [],
      origine: "saisie",
    })
    await ctx.db.patch(evenement._id, {
      statut: "en_enquete",
      qualifieLe: evenement.qualifieLe ?? Date.now(),
      qualifieParNom: evenement.qualifieParNom ?? acces.nom,
    })
    await tracerSecurite(ctx, acces, {
      entite: "enquete",
      entiteId: enqueteId,
      evenementId: evenement._id,
      action: "securite.enquete.ouvrir",
      libelle: `Ouverture de l'enquête ${numero}`,
      detail: `Enquêteur : ${enqueteurNom} · rapport attendu le ${echeanceRapport}`,
      permission: "creer",
      table: "securiteEnquetes",
    })
    if (obligationNotification(evenement).requise) {
      const numeroArtf = await prochainNumeroSecurite(ctx, `ARTF-${aujourdhui.slice(0, 4)}`, 3)
      await ctx.db.insert("securiteDeclarationsArtf", {
        numero: numeroArtf,
        nature: "rapport_enquete",
        evenementId: evenement._id,
        enqueteId,
        objet: `Rapport d'enquête ${numero} — ${TYPES_EVENEMENT[evenement.type].libelle} (${evenement.numero})`,
        echeance: echeanceRapportEnquete(evenement.survenuLe),
        statut: "a_preparer",
        mode: "simulation",
        createdAt: Date.now(),
        origine: "saisie",
      })
    }
    return { enqueteId, numero }
  },
})
