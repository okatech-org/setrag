import { v } from "convex/values"

import type { Doc, Id } from "../../_generated/dataModel"
import { mutation, query, type MutationCtx } from "../../_generated/server"
import { accesSecurite, chronologieSecurite, tracerSecurite, type AccesSecurite } from "./acces"
import { resumeEvenement } from "./evenements"
import {
  CATEGORIES_CAUSE,
  GRAVITES,
  STATUTS_ENQUETE,
  TYPES_EVENEMENT,
  actionEnRetard,
  dateLibreville,
  manquesRapport,
  texteFacultatif,
  texteRequis,
} from "./model"
import { causeValidator, recommandationValidator } from "./tables"

/* ═════════════════════════════ Lecture ══════════════════════════════════ */

export const lister = query({
  args: {},
  handler: async (ctx) => {
    await accesSecurite(ctx, "consulter", "registre.lire")
    const aujourdhui = dateLibreville(Date.now())
    const [enquetes, actions] = await Promise.all([ctx.db.query("securiteEnquetes").collect(), ctx.db.query("securiteActions").collect()])
    const resultat = []
    for (const enquete of enquetes) {
      const evenement = await ctx.db.get(enquete.evenementId)
      const liees = actions.filter((a) => a.enqueteId === enquete._id)
      resultat.push({
        _id: enquete._id,
        numero: enquete.numero,
        statut: enquete.statut,
        enqueteurNom: enquete.enqueteurNom,
        ouverteLe: enquete.ouverteLe,
        echeanceRapport: enquete.echeanceRapport,
        clotureeLe: enquete.clotureeLe,
        enRetard: enquete.statut !== "cloturee" && enquete.echeanceRapport < aujourdhui,
        causesRacines: enquete.causes.filter((c) => c.racine).map((c) => c.categorie),
        actions: liees.length,
        actionsEnRetard: liees.filter((a) => actionEnRetard(a, aujourdhui)).length,
        evenement: evenement ? resumeEvenement(evenement) : null,
      })
    }
    return resultat.sort((a, b) => b.ouverteLe - a.ouverteLe)
  },
})

function droitsSurEnquete(acces: AccesSecurite, enquete: Doc<"securiteEnquetes">) {
  const designe = enquete.enqueteurId === acces.user._id
  const encadrement = acces.roles.includes("inspecteur_securite") || acces.roles.includes("admin_fonctionnel")
  return {
    instruire: acces.capacites.has("enquete.instruire") && (designe || encadrement),
    cloturer: acces.capacites.has("enquete.cloturer") && !designe,
    gererActions: acces.capacites.has("actions.gerer"),
    designe,
  }
}

export const dossier = query({
  args: { enqueteId: v.id("securiteEnquetes") },
  handler: async (ctx, { enqueteId }) => {
    const acces = await accesSecurite(ctx, "consulter", "registre.lire")
    const enquete = await ctx.db.get(enqueteId)
    if (!enquete) return null
    const evenement = await ctx.db.get(enquete.evenementId)
    if (!evenement) return null
    const aujourdhui = dateLibreville(Date.now())
    const [actions, declarations] = await Promise.all([
      ctx.db.query("securiteActions").withIndex("by_enquete", (q) => q.eq("enqueteId", enqueteId)).collect(),
      ctx.db.query("securiteDeclarationsArtf").withIndex("by_enquete", (q) => q.eq("enqueteId", enqueteId)).collect(),
    ])
    return {
      enquete,
      evenement: { ...resumeEvenement(evenement), description: evenement.description, mesuresImmediates: evenement.mesuresImmediates, degats: evenement.degats, interruptionMinutes: evenement.interruptionMinutes, declarantNom: evenement.declarantNom },
      actions: actions.map((a) => ({ ...a, enRetard: actionEnRetard(a, aujourdhui) })).sort((a, b) => a.echeance.localeCompare(b.echeance)),
      declarations,
      manques: manquesRapport(enquete),
      enRetard: enquete.statut !== "cloturee" && enquete.echeanceRapport < aujourdhui,
      droits: droitsSurEnquete(acces, enquete),
      chronologie: await chronologieSecurite(ctx, { entite: "enquete", entiteId: enqueteId }),
    }
  },
})

/* ════════════════════════════ Écriture ══════════════════════════════════ */

async function enqueteExistante(ctx: MutationCtx, enqueteId: Id<"securiteEnquetes">) {
  const enquete = await ctx.db.get(enqueteId)
  if (!enquete) throw new Error("Enquête introuvable.")
  return enquete
}

export const enregistrer = mutation({
  args: {
    enqueteId: v.id("securiteEnquetes"),
    constats: v.optional(v.string()),
    causes: v.array(causeValidator),
    recommandations: v.array(recommandationValidator),
    conclusion: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const acces = await accesSecurite(ctx, "modifier", "enquete.instruire")
    const enquete = await enqueteExistante(ctx, args.enqueteId)
    if (!droitsSurEnquete(acces, enquete).instruire) {
      throw new Error("Accès refusé : seul l'enquêteur désigné ou l'encadrement sécurité instruit cette enquête.")
    }
    if (enquete.statut !== "ouverte" && enquete.statut !== "instruction") {
      throw new Error(`L'enquête est ${STATUTS_ENQUETE[enquete.statut].toLowerCase()} : son contenu est figé.`)
    }
    if (args.causes.length > 20 || args.recommandations.length > 20) throw new Error("Vingt causes et vingt recommandations au plus.")
    const causes = args.causes.map((cause, index) => ({
      categorie: cause.categorie,
      description: texteRequis(cause.description, `La cause n° ${index + 1}`, 1000),
      racine: cause.racine,
    }))
    const recommandations = args.recommandations.map((r, index) => ({ texte: texteRequis(r.texte, `La recommandation n° ${index + 1}`, 1000) }))
    await ctx.db.patch(enquete._id, {
      constats: texteFacultatif(args.constats, "Les constats", 8000),
      causes,
      recommandations,
      conclusion: texteFacultatif(args.conclusion, "La conclusion", 4000),
      statut: "instruction",
    })
    await tracerSecurite(ctx, acces, {
      entite: "enquete",
      entiteId: enquete._id,
      evenementId: enquete.evenementId,
      action: "securite.enquete.instruire",
      libelle: enquete.statut === "ouverte" ? "Début de l'instruction" : "Instruction mise à jour",
      detail: `${causes.length} cause(s) · ${recommandations.length} recommandation(s)`,
      permission: "modifier",
      table: "securiteEnquetes",
    })
    return { manques: manquesRapport({ ...args, causes, recommandations }) }
  },
})

export const soumettre = mutation({
  args: { enqueteId: v.id("securiteEnquetes") },
  handler: async (ctx, { enqueteId }) => {
    const acces = await accesSecurite(ctx, "modifier", "enquete.instruire")
    const enquete = await enqueteExistante(ctx, enqueteId)
    if (!droitsSurEnquete(acces, enquete).instruire) {
      throw new Error("Accès refusé : seul l'enquêteur désigné ou l'encadrement sécurité soumet ce rapport.")
    }
    if (enquete.statut !== "instruction") throw new Error("Seule une enquête en instruction se soumet.")
    const manques = manquesRapport(enquete)
    if (manques.length > 0) throw new Error(`Rapport incomplet : il manque ${manques.join(", ")}.`)
    await ctx.db.patch(enqueteId, { statut: "rapport_soumis", soumiseLe: Date.now(), motifRenvoi: undefined })
    await tracerSecurite(ctx, acces, {
      entite: "enquete",
      entiteId: enqueteId,
      evenementId: enquete.evenementId,
      action: "securite.enquete.soumettre",
      libelle: "Rapport soumis pour clôture",
      permission: "modifier",
      table: "securiteEnquetes",
    })
    return { statut: "rapport_soumis" as const }
  },
})

export const renvoyer = mutation({
  args: { enqueteId: v.id("securiteEnquetes"), motif: v.string() },
  handler: async (ctx, { enqueteId, motif }) => {
    const acces = await accesSecurite(ctx, "modifier", "enquete.cloturer")
    const enquete = await enqueteExistante(ctx, enqueteId)
    if (enquete.statut !== "rapport_soumis") throw new Error("Seul un rapport soumis se renvoie à l'instruction.")
    const texte = texteRequis(motif, "Le motif du renvoi", 1000)
    await ctx.db.patch(enqueteId, { statut: "instruction", motifRenvoi: texte })
    await tracerSecurite(ctx, acces, {
      entite: "enquete",
      entiteId: enqueteId,
      evenementId: enquete.evenementId,
      action: "securite.enquete.renvoyer",
      libelle: "Rapport renvoyé à l'instruction",
      detail: texte,
      permission: "modifier",
      table: "securiteEnquetes",
    })
    return { statut: "instruction" as const }
  },
})

/** Texte du rapport transmis à l'ARTF, composé à partir de l'enquête. */
export function composerRapport(enquete: Doc<"securiteEnquetes">, evenement: Doc<"securiteEvenements">) {
  return [
    `Événement ${evenement.numero} — ${TYPES_EVENEMENT[evenement.type].libelle}, gravité ${GRAVITES[evenement.gravite].libelle.toLowerCase()}, survenu le ${new Date(evenement.survenuLe).toISOString().slice(0, 10)} (${evenement.lieu}).`,
    `Enquête ${enquete.numero} conduite par ${enquete.enqueteurNom}.`,
    `Constats : ${enquete.constats ?? "—"}`,
    `Causes : ${enquete.causes.map((c) => `${c.racine ? "[racine] " : ""}${CATEGORIES_CAUSE[c.categorie]} — ${c.description}`).join(" ; ") || "—"}`,
    `Recommandations : ${enquete.recommandations.map((r, i) => `${i + 1}. ${r.texte}`).join(" ") || "—"}`,
    `Conclusion : ${enquete.conclusion ?? "—"}`,
  ].join("\n")
}

export const cloturer = mutation({
  args: { enqueteId: v.id("securiteEnquetes"), note: v.optional(v.string()) },
  handler: async (ctx, { enqueteId, note }) => {
    const acces = await accesSecurite(ctx, "modifier", "enquete.cloturer")
    const enquete = await enqueteExistante(ctx, enqueteId)
    if (enquete.statut !== "rapport_soumis") throw new Error("Seul un rapport soumis se clôture.")
    if (enquete.enqueteurId === acces.user._id) {
      throw new Error("Séparation des tâches : l'enquêteur désigné ne clôture pas sa propre enquête.")
    }
    const evenement = await ctx.db.get(enquete.evenementId)
    if (!evenement) throw new Error("Événement introuvable.")
    const actions = await ctx.db.query("securiteActions").withIndex("by_enquete", (q) => q.eq("enqueteId", enqueteId)).collect()
    if (enquete.recommandations.length > 0 && actions.length === 0) {
      throw new Error("Le plan d'actions correctives est vide : traduisez les recommandations en actions avant de clôturer.")
    }
    const texte = texteFacultatif(note, "La note", 1000)
    const now = Date.now()
    await ctx.db.patch(enqueteId, { statut: "cloturee", clotureeLe: now, clotureeParNom: acces.nom })
    await ctx.db.patch(evenement._id, { statut: "cloture", clotureLe: now, clotureParNom: acces.nom, noteCloture: texte ?? `Clôturé avec l'enquête ${enquete.numero}.` })
    const rapport = (await ctx.db.query("securiteDeclarationsArtf").withIndex("by_enquete", (q) => q.eq("enqueteId", enqueteId)).collect()).find(
      (d) => d.nature === "rapport_enquete"
    )
    if (rapport && rapport.statut === "a_preparer") {
      await ctx.db.patch(rapport._id, { contenu: composerRapport(enquete, evenement), statut: "prete", prepareeLe: now, prepareeParNom: acces.nom })
    }
    await tracerSecurite(ctx, acces, {
      entite: "enquete",
      entiteId: enqueteId,
      evenementId: evenement._id,
      action: "securite.enquete.cloturer",
      libelle: `Clôture de l'enquête ${enquete.numero}`,
      detail: [texte, `${actions.length} action(s) au plan`, rapport ? `${rapport.numero} prêt à transmettre` : null].filter(Boolean).join(" · "),
      permission: "modifier",
      table: "securiteEnquetes",
    })
    return { statut: "cloturee" as const, rapportArtf: rapport?.numero ?? null }
  },
})

export const tracerImpression = mutation({
  args: { enqueteId: v.id("securiteEnquetes") },
  handler: async (ctx, { enqueteId }) => {
    const acces = await accesSecurite(ctx, "consulter", "registre.lire")
    const enquete = await enqueteExistante(ctx, enqueteId)
    await tracerSecurite(ctx, acces, {
      entite: "enquete",
      entiteId: enqueteId,
      evenementId: enquete.evenementId,
      action: "securite.enquete.imprimer",
      libelle: "Impression du rapport d'enquête",
      permission: "consulter",
      table: "securiteEnquetes",
    })
    return null
  },
})
