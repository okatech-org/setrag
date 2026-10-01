import { v } from "convex/values"

import type { Id } from "../../_generated/dataModel"
import { mutation, query, type MutationCtx } from "../../_generated/server"
import { GARES, estGareConnue, nomGare } from "../rh/model"
import { accesSecurite, chronologieSecurite, prochainNumeroSecurite, tracerSecurite } from "./acces"
import {
  GRAVITES_NC,
  RESULTATS_INSPECTION,
  TYPES_INSPECTION,
  actionEnRetard,
  controlerPk,
  dansZoneLope,
  dateIso,
  dateLibreville,
  texteFacultatif,
  texteRequis,
} from "./model"
import { graviteNcValidator, resultatInspectionValidator, typeInspectionValidator } from "./tables"

export const lister = query({
  args: {},
  handler: async (ctx) => {
    const acces = await accesSecurite(ctx, "consulter")
    if (!acces.capacites.has("registre.lire") && !acces.capacites.has("environnement.lire")) {
      throw new Error("Accès refusé : votre profil ne permet pas « consulter les inspections ».")
    }
    const aujourdhui = dateLibreville(Date.now())
    const inspections = await ctx.db.query("securiteInspections").collect()
    const visibles = acces.capacites.has("registre.lire") ? inspections : inspections.filter((i) => i.type === "inspection_environnementale" || i.zoneLope)
    return visibles
      .map((inspection) => ({
        _id: inspection._id,
        numero: inspection.numero,
        type: inspection.type,
        objet: inspection.objet,
        lieu: inspection.lieu,
        gareNom: inspection.gareCode ? nomGare(inspection.gareCode) : undefined,
        pk: inspection.pk,
        zoneLope: inspection.zoneLope,
        dateProgrammee: inspection.dateProgrammee,
        inspecteurNom: inspection.inspecteurNom,
        statut: inspection.statut,
        resultat: inspection.resultat,
        nonConformites: inspection.nonConformites.length,
        ncSansAction: inspection.nonConformites.filter((nc) => !nc.actionId).length,
        enRetard: inspection.statut === "programmee" && inspection.dateProgrammee < aujourdhui,
      }))
      .sort((a, b) => b.dateProgrammee.localeCompare(a.dateProgrammee))
  },
})

export const dossier = query({
  args: { inspectionId: v.id("securiteInspections") },
  handler: async (ctx, { inspectionId }) => {
    const acces = await accesSecurite(ctx, "consulter")
    const inspection = await ctx.db.get(inspectionId)
    if (!inspection) return null
    const environnementSeul = !acces.capacites.has("registre.lire")
    if (environnementSeul && (!acces.capacites.has("environnement.lire") || (inspection.type !== "inspection_environnementale" && !inspection.zoneLope))) {
      throw new Error("Accès refusé : votre profil ne permet pas « consulter cette inspection ».")
    }
    const aujourdhui = dateLibreville(Date.now())
    const actions = await ctx.db.query("securiteActions").withIndex("by_inspection", (q) => q.eq("inspectionId", inspectionId)).collect()
    return {
      inspection: { ...inspection, gareNom: inspection.gareCode ? nomGare(inspection.gareCode) : undefined },
      enRetard: inspection.statut === "programmee" && inspection.dateProgrammee < aujourdhui,
      actions: actions.map((a) => ({ ...a, enRetard: actionEnRetard(a, aujourdhui) })),
      chronologie: await chronologieSecurite(ctx, { entite: "inspection", entiteId: inspectionId }),
      droits: { gerer: acces.capacites.has("inspections.gerer"), gererActions: acces.capacites.has("actions.gerer") },
    }
  },
})

async function inspectionExistante(ctx: MutationCtx, inspectionId: Id<"securiteInspections">) {
  const inspection = await ctx.db.get(inspectionId)
  if (!inspection) throw new Error("Inspection introuvable.")
  return inspection
}

export const programmer = mutation({
  args: {
    type: typeInspectionValidator,
    objet: v.string(),
    gareCode: v.optional(v.string()),
    pk: v.optional(v.number()),
    lieu: v.optional(v.string()),
    dateProgrammee: v.string(),
    inspecteurNom: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const acces = await accesSecurite(ctx, "creer", "inspections.gerer")
    const date = dateIso(args.dateProgrammee, "La date")
    if (date < dateLibreville(Date.now())) throw new Error("Une inspection se programme à une date à venir.")
    const gareCode = args.gareCode?.trim().toUpperCase() || undefined
    if (gareCode && !estGareConnue(gareCode)) throw new Error(`Gare inconnue : ${args.gareCode}.`)
    const pk = controlerPk(args.pk ?? (gareCode ? GARES.find((g) => g.code === gareCode)?.pk : undefined))
    const lieu = texteFacultatif(args.lieu, "Le lieu", 200) ?? (gareCode ? `Gare de ${nomGare(gareCode)}` : pk !== undefined ? `PK ${pk}` : undefined)
    if (!lieu) throw new Error("Indiquez une gare, un point kilométrique ou un lieu.")
    const numero = await prochainNumeroSecurite(ctx, `INS-${date.slice(0, 4)}`, 3)
    const now = Date.now()
    const inspectionId = await ctx.db.insert("securiteInspections", {
      numero,
      type: args.type,
      objet: texteRequis(args.objet, "L'objet", 300),
      gareCode,
      pk,
      lieu,
      zoneLope: dansZoneLope(pk),
      dateProgrammee: date,
      inspecteurId: acces.user._id,
      inspecteurNom: texteFacultatif(args.inspecteurNom, "L'inspecteur", 120) ?? acces.nom,
      statut: "programmee",
      nonConformites: [],
      createdAt: now,
      updatedAt: now,
      origine: "saisie",
    })
    await tracerSecurite(ctx, acces, {
      entite: "inspection",
      entiteId: inspectionId,
      action: "securite.inspection.programmer",
      libelle: `${TYPES_INSPECTION[args.type]} programmée le ${date}`,
      detail: lieu,
      permission: "creer",
      table: "securiteInspections",
    })
    return { inspectionId, numero }
  },
})

export const reprogrammer = mutation({
  args: { inspectionId: v.id("securiteInspections"), dateProgrammee: v.string(), motif: v.string() },
  handler: async (ctx, args) => {
    const acces = await accesSecurite(ctx, "modifier", "inspections.gerer")
    const inspection = await inspectionExistante(ctx, args.inspectionId)
    if (inspection.statut !== "programmee") throw new Error("Seule une inspection programmée se reporte.")
    const date = dateIso(args.dateProgrammee, "La date")
    if (date < dateLibreville(Date.now())) throw new Error("La nouvelle date doit être à venir.")
    const motif = texteRequis(args.motif, "Le motif", 500)
    await ctx.db.patch(inspection._id, { dateProgrammee: date, updatedAt: Date.now() })
    await tracerSecurite(ctx, acces, {
      entite: "inspection",
      entiteId: inspection._id,
      action: "securite.inspection.reprogrammer",
      libelle: `Inspection reportée au ${date}`,
      detail: `${inspection.dateProgrammee} → ${date} · ${motif}`,
      permission: "modifier",
      table: "securiteInspections",
    })
    return { dateProgrammee: date }
  },
})

export const annuler = mutation({
  args: { inspectionId: v.id("securiteInspections"), motif: v.string() },
  handler: async (ctx, args) => {
    const acces = await accesSecurite(ctx, "modifier", "inspections.gerer")
    const inspection = await inspectionExistante(ctx, args.inspectionId)
    if (inspection.statut !== "programmee") throw new Error("Seule une inspection programmée s'annule.")
    const motif = texteRequis(args.motif, "Le motif", 500)
    await ctx.db.patch(inspection._id, { statut: "annulee", motifAnnulation: motif, updatedAt: Date.now() })
    await tracerSecurite(ctx, acces, {
      entite: "inspection",
      entiteId: inspection._id,
      action: "securite.inspection.annuler",
      libelle: "Inspection annulée",
      detail: motif,
      permission: "modifier",
      table: "securiteInspections",
    })
    return { statut: "annulee" as const }
  },
})

export const enregistrerResultat = mutation({
  args: {
    inspectionId: v.id("securiteInspections"),
    resultat: resultatInspectionValidator,
    constats: v.string(),
    nonConformites: v.array(v.object({ description: v.string(), gravite: graviteNcValidator })),
  },
  handler: async (ctx, args) => {
    const acces = await accesSecurite(ctx, "modifier", "inspections.gerer")
    const inspection = await inspectionExistante(ctx, args.inspectionId)
    if (inspection.statut !== "programmee") throw new Error("Le résultat se saisit sur une inspection programmée.")
    if (inspection.dateProgrammee > dateLibreville(Date.now())) throw new Error("L'inspection n'a pas encore eu lieu.")
    const constats = texteRequis(args.constats, "Les constats", 4000)
    if (args.resultat === "conforme" && args.nonConformites.length > 0) {
      throw new Error("Une inspection conforme ne porte pas de non-conformité : choisissez « conforme avec réserves ».")
    }
    if (args.resultat !== "conforme" && args.nonConformites.length === 0) {
      throw new Error("Décrivez au moins une non-conformité ou une réserve.")
    }
    if (args.resultat === "conforme_reserves" && args.nonConformites.some((nc) => nc.gravite !== "mineure")) {
      throw new Error("Une non-conformité majeure ou critique rend l'inspection non conforme.")
    }
    if (args.nonConformites.length > 30) throw new Error("Trente non-conformités au plus.")
    const nonConformites = args.nonConformites.map((nc, index) => ({
      code: `${inspection.numero}-NC${index + 1}`,
      description: texteRequis(nc.description, `La non-conformité n° ${index + 1}`, 1000),
      gravite: nc.gravite,
    }))
    await ctx.db.patch(inspection._id, {
      statut: "realisee",
      realiseeLe: Date.now(),
      resultat: args.resultat,
      constats,
      nonConformites,
      updatedAt: Date.now(),
    })
    await tracerSecurite(ctx, acces, {
      entite: "inspection",
      entiteId: inspection._id,
      action: "securite.inspection.resultat",
      libelle: `Résultat : ${RESULTATS_INSPECTION[args.resultat].toLowerCase()}`,
      detail:
        nonConformites.length > 0
          ? nonConformites.map((nc) => `${nc.code} (${GRAVITES_NC[nc.gravite].toLowerCase()})`).join(", ")
          : "Aucune non-conformité",
      permission: "modifier",
      table: "securiteInspections",
      apres: { resultat: args.resultat, nonConformites: nonConformites.length },
    })
    return { nonConformites: nonConformites.length }
  },
})
