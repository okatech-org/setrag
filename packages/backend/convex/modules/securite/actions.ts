import { v } from "convex/values"

import type { Doc, Id } from "../../_generated/dataModel"
import { mutation, query, type MutationCtx, type QueryCtx } from "../../_generated/server"
import { accesSecurite, chronologieSecurite, prochainNumeroSecurite, tracerSecurite } from "./acces"
import { STATUTS_ACTION, actionEnRetard, dateIso, dateLibreville, texteFacultatif, texteRequis } from "./model"
import { directionResponsableValidator } from "./tables"

/** Source lisible d'une action : enquête, inspection ou événement. */
async function sourceAction(ctx: QueryCtx | MutationCtx, action: Doc<"securiteActions">) {
  if (action.enqueteId) {
    const enquete = await ctx.db.get(action.enqueteId)
    if (enquete) return { nature: "enquete" as const, id: enquete._id as string, numero: enquete.numero, evenementId: enquete.evenementId }
  }
  if (action.inspectionId) {
    const inspection = await ctx.db.get(action.inspectionId)
    if (inspection) return { nature: "inspection" as const, id: inspection._id as string, numero: inspection.numero, evenementId: undefined }
  }
  if (action.evenementId) {
    const evenement = await ctx.db.get(action.evenementId)
    if (evenement) return { nature: "evenement" as const, id: evenement._id as string, numero: evenement.numero, evenementId: evenement._id }
  }
  return null
}

export const lister = query({
  args: {},
  handler: async (ctx) => {
    await accesSecurite(ctx, "consulter", "registre.lire")
    const aujourdhui = dateLibreville(Date.now())
    const actions = await ctx.db.query("securiteActions").collect()
    const resultat = []
    for (const action of actions) {
      resultat.push({ ...action, enRetard: actionEnRetard(action, aujourdhui), source: await sourceAction(ctx, action) })
    }
    return resultat.sort((a, b) => a.echeance.localeCompare(b.echeance))
  },
})

export const dossier = query({
  args: { actionId: v.id("securiteActions") },
  handler: async (ctx, { actionId }) => {
    const acces = await accesSecurite(ctx, "consulter", "registre.lire")
    const action = await ctx.db.get(actionId)
    if (!action) return null
    return {
      action,
      enRetard: actionEnRetard(action, dateLibreville(Date.now())),
      source: await sourceAction(ctx, action),
      chronologie: await chronologieSecurite(ctx, { entite: "action", entiteId: actionId }),
      droits: { gerer: acces.capacites.has("actions.gerer"), verifier: acces.capacites.has("actions.verifier") },
    }
  },
})

async function actionExistante(ctx: MutationCtx, actionId: Id<"securiteActions">) {
  const action = await ctx.db.get(actionId)
  if (!action) throw new Error("Action introuvable.")
  return action
}

export const creer = mutation({
  args: {
    libelle: v.string(),
    responsableNom: v.string(),
    responsableDirection: directionResponsableValidator,
    echeance: v.string(),
    priorite: v.union(v.literal("haute"), v.literal("normale")),
    enqueteId: v.optional(v.id("securiteEnquetes")),
    evenementId: v.optional(v.id("securiteEvenements")),
    inspectionId: v.optional(v.id("securiteInspections")),
    nonConformiteCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const acces = await accesSecurite(ctx, "creer", "actions.gerer")
    const sources = [args.enqueteId, args.evenementId, args.inspectionId].filter(Boolean)
    if (sources.length !== 1) throw new Error("Une action se rattache à une enquête, une inspection ou un événement, et à un seul.")
    const echeance = dateIso(args.echeance, "L'échéance")
    const aujourdhui = dateLibreville(Date.now())
    if (echeance < aujourdhui) throw new Error("L'échéance d'une nouvelle action ne peut pas être passée.")
    let evenementId: Id<"securiteEvenements"> | undefined = args.evenementId
    if (args.enqueteId) {
      const enquete = await ctx.db.get(args.enqueteId)
      if (!enquete) throw new Error("Enquête introuvable.")
      evenementId = enquete.evenementId
    }
    if (args.evenementId && !(await ctx.db.get(args.evenementId))) throw new Error("Événement introuvable.")
    const inspection = args.inspectionId ? await ctx.db.get(args.inspectionId) : null
    if (args.inspectionId && !inspection) throw new Error("Inspection introuvable.")
    if (args.nonConformiteCode && !inspection?.nonConformites.some((nc) => nc.code === args.nonConformiteCode)) {
      throw new Error("Non-conformité introuvable sur cette inspection.")
    }
    if (inspection && args.nonConformiteCode) {
      const nc = inspection.nonConformites.find((n) => n.code === args.nonConformiteCode)
      if (nc?.actionId) throw new Error("Cette non-conformité a déjà son action corrective.")
    }
    const numero = await prochainNumeroSecurite(ctx, `ACT-${aujourdhui.slice(0, 4)}`, 3)
    const now = Date.now()
    const actionId = await ctx.db.insert("securiteActions", {
      numero,
      libelle: texteRequis(args.libelle, "Le libellé", 500),
      enqueteId: args.enqueteId,
      evenementId,
      inspectionId: args.inspectionId,
      responsableNom: texteRequis(args.responsableNom, "Le responsable", 120),
      responsableDirection: args.responsableDirection,
      echeance,
      priorite: args.priorite,
      statut: "planifiee",
      avancement: 0,
      createdAt: now,
      updatedAt: now,
      origine: "saisie",
    })
    if (inspection && args.nonConformiteCode) {
      await ctx.db.patch(inspection._id, {
        nonConformites: inspection.nonConformites.map((nc) => (nc.code === args.nonConformiteCode ? { ...nc, actionId } : nc)),
        updatedAt: now,
      })
    }
    await tracerSecurite(ctx, acces, {
      entite: "action",
      entiteId: actionId,
      evenementId,
      action: "securite.action.creer",
      libelle: `Action corrective ${numero} inscrite au plan`,
      detail: `${args.libelle.trim()} · ${args.responsableNom.trim()} · échéance ${echeance}`,
      permission: "creer",
      table: "securiteActions",
    })
    if (args.enqueteId) {
      await ctx.db.insert("securiteJournal", { entite: "enquete", entiteId: args.enqueteId, evenementId, action: "securite.action.creer", libelle: `Action ${numero} ajoutée au plan`, detail: args.libelle.trim(), acteurId: acces.user._id, acteurNom: acces.nom, at: now })
    }
    if (args.inspectionId) {
      await ctx.db.insert("securiteJournal", { entite: "inspection", entiteId: args.inspectionId, action: "securite.action.creer", libelle: `Action ${numero} ouverte${args.nonConformiteCode ? ` pour ${args.nonConformiteCode}` : ""}`, detail: args.libelle.trim(), acteurId: acces.user._id, acteurNom: acces.nom, at: now })
    }
    return { actionId, numero }
  },
})

export const mettreAJour = mutation({
  args: {
    actionId: v.id("securiteActions"),
    statut: v.union(v.literal("en_cours"), v.literal("realisee")),
    avancement: v.number(),
    commentaire: v.optional(v.string()),
    preuve: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const acces = await accesSecurite(ctx, "modifier", "actions.gerer")
    const action = await actionExistante(ctx, args.actionId)
    if (action.statut === "verifiee" || action.statut === "annulee") {
      throw new Error(`L'action est ${STATUTS_ACTION[action.statut].toLowerCase()} : elle ne se modifie plus.`)
    }
    if (!Number.isInteger(args.avancement) || args.avancement < 0 || args.avancement > 100) {
      throw new Error("L'avancement est un pourcentage entier.")
    }
    const preuve = texteFacultatif(args.preuve, "La preuve", 1000)
    if (args.statut === "realisee") {
      if (args.avancement !== 100) throw new Error("Une action réalisée est avancée à 100 %.")
      if (!preuve) throw new Error("Décrivez la preuve de réalisation (procès-verbal, photo, attestation…).")
    }
    const commentaire = texteFacultatif(args.commentaire, "Le commentaire", 1000)
    await ctx.db.patch(action._id, {
      statut: args.statut,
      avancement: args.avancement,
      commentaire: commentaire ?? action.commentaire,
      preuve: preuve ?? action.preuve,
      realiseeLe: args.statut === "realisee" ? Date.now() : undefined,
      updatedAt: Date.now(),
    })
    await tracerSecurite(ctx, acces, {
      entite: "action",
      entiteId: action._id,
      evenementId: action.evenementId,
      action: `securite.action.${args.statut === "realisee" ? "realiser" : "avancer"}`,
      libelle: args.statut === "realisee" ? "Action déclarée réalisée" : `Avancement porté à ${args.avancement} %`,
      detail: [commentaire, preuve ? `Preuve : ${preuve}` : null].filter(Boolean).join(" · ") || undefined,
      permission: "modifier",
      table: "securiteActions",
      avant: { statut: action.statut, avancement: action.avancement },
      apres: { statut: args.statut, avancement: args.avancement },
    })
    return { statut: args.statut }
  },
})

export const verifier = mutation({
  args: { actionId: v.id("securiteActions"), efficace: v.boolean(), commentaire: v.string() },
  handler: async (ctx, args) => {
    const acces = await accesSecurite(ctx, "modifier", "actions.verifier")
    const action = await actionExistante(ctx, args.actionId)
    if (action.statut !== "realisee") throw new Error("Seule une action réalisée se vérifie.")
    const commentaire = texteRequis(args.commentaire, "Le constat de vérification", 1000)
    await ctx.db.patch(action._id, args.efficace
      ? { statut: "verifiee", verifieeLe: Date.now(), verifieeParNom: acces.nom, commentaire, updatedAt: Date.now() }
      : { statut: "en_cours", avancement: 75, realiseeLe: undefined, commentaire, updatedAt: Date.now() })
    await tracerSecurite(ctx, acces, {
      entite: "action",
      entiteId: action._id,
      evenementId: action.evenementId,
      action: "securite.action.verifier",
      libelle: args.efficace ? "Efficacité vérifiée — action soldée" : "Efficacité insuffisante — action rouverte",
      detail: commentaire,
      permission: "valider",
      table: "securiteActions",
    })
    return { statut: args.efficace ? ("verifiee" as const) : ("en_cours" as const) }
  },
})

export const replanifier = mutation({
  args: { actionId: v.id("securiteActions"), echeance: v.string(), motif: v.string() },
  handler: async (ctx, args) => {
    const acces = await accesSecurite(ctx, "modifier", "actions.gerer")
    const action = await actionExistante(ctx, args.actionId)
    if (action.statut !== "planifiee" && action.statut !== "en_cours") throw new Error("Seule une action en cours se replanifie.")
    const echeance = dateIso(args.echeance, "L'échéance")
    if (echeance < dateLibreville(Date.now())) throw new Error("La nouvelle échéance doit être à venir.")
    const motif = texteRequis(args.motif, "Le motif", 500)
    await ctx.db.patch(action._id, { echeance, updatedAt: Date.now() })
    await tracerSecurite(ctx, acces, {
      entite: "action",
      entiteId: action._id,
      evenementId: action.evenementId,
      action: "securite.action.replanifier",
      libelle: `Échéance reportée au ${echeance}`,
      detail: `${action.echeance} → ${echeance} · ${motif}`,
      permission: "modifier",
      table: "securiteActions",
    })
    return { echeance }
  },
})

export const annuler = mutation({
  args: { actionId: v.id("securiteActions"), motif: v.string() },
  handler: async (ctx, args) => {
    const acces = await accesSecurite(ctx, "modifier", "actions.gerer")
    const action = await actionExistante(ctx, args.actionId)
    if (action.statut === "verifiee" || action.statut === "annulee") throw new Error("Cette action est déjà soldée.")
    const motif = texteRequis(args.motif, "Le motif", 500)
    await ctx.db.patch(action._id, { statut: "annulee", motifAnnulation: motif, updatedAt: Date.now() })
    await tracerSecurite(ctx, acces, {
      entite: "action",
      entiteId: action._id,
      evenementId: action.evenementId,
      action: "securite.action.annuler",
      libelle: "Action annulée",
      detail: motif,
      permission: "modifier",
      table: "securiteActions",
    })
    return { statut: "annulee" as const }
  },
})
