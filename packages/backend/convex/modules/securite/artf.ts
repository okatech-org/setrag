import { v } from "convex/values"

import { internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "../../_generated/server"
import { isInternalRole } from "../../model/permissions"
import { accesSecurite, chronologieSecurite, prochainNumeroSecurite, tracerSecurite, type AccesSecurite } from "./acces"
import { composerRapport } from "./enquetes"
import {
  FAMILLES,
  GRAVITES,
  NATURES_ARTF,
  STATUTS_ARTF,
  TYPES_EVENEMENT,
  actionEnRetard,
  bornesTrimestre,
  dateLibreville,
  texteRequis,
  type Famille,
  type Gravite,
} from "./model"

/** Délai de l'accusé de réception simulé du portail ARTF. */
export const DELAI_ACCUSE_ARTF_MS = 30_000

const heureLibreville = (instant: number) =>
  new Date(instant + 3_600_000).toISOString().slice(0, 16).replace("T", " à ")

/** Proposition de texte pour une notification d'événement. */
function composerNotification(evenement: Doc<"securiteEvenements">) {
  return [
    `Le ${heureLibreville(evenement.survenuLe)} (heure de Libreville), ${TYPES_EVENEMENT[evenement.type].libelle.toLowerCase()} de gravité ${GRAVITES[evenement.gravite].libelle.toLowerCase()} — ${evenement.lieu}${evenement.pk !== undefined ? `, PK ${evenement.pk}` : ""}${evenement.trainNumber ? `, train ${evenement.trainNumber}` : ""}.`,
    `Victimes : ${evenement.blesses} blessé(s), ${evenement.deces} décès.${evenement.interruptionMinutes ? ` Interruption de circulation : ${evenement.interruptionMinutes} min.` : ""}`,
    `Faits : ${evenement.description}`,
    evenement.mesuresImmediates ? `Mesures conservatoires : ${evenement.mesuresImmediates}` : null,
    `Référence interne : ${evenement.numero}. Une enquête interne est ${evenement.statut === "en_enquete" ? "ouverte" : "à l'étude"}.`,
  ]
    .filter(Boolean)
    .join("\n")
}

function estInterne(acces: AccesSecurite) {
  return acces.roles.some((role) => isInternalRole(role))
}

async function proposition(ctx: QueryCtx, declaration: Doc<"securiteDeclarationsArtf">) {
  if (declaration.nature === "notification_immediate" && declaration.evenementId) {
    const evenement = await ctx.db.get(declaration.evenementId)
    return evenement ? composerNotification(evenement) : null
  }
  if (declaration.nature === "rapport_enquete" && declaration.enqueteId) {
    const enquete = await ctx.db.get(declaration.enqueteId)
    const evenement = enquete ? await ctx.db.get(enquete.evenementId) : null
    return enquete && evenement ? composerRapport(enquete, evenement) : null
  }
  return null
}

export const lister = query({
  args: {},
  handler: async (ctx) => {
    const acces = await accesSecurite(ctx, "consulter", "artf.lire")
    const interne = estInterne(acces)
    const declarations = await ctx.db.query("securiteDeclarationsArtf").collect()
    const maintenant = Date.now()
    return declarations
      .filter((d) => interne || d.statut === "transmise" || d.statut === "accusee")
      .map((d) => ({
        _id: d._id,
        numero: d.numero,
        nature: d.nature,
        objet: d.objet,
        periode: d.periode,
        evenementId: d.evenementId,
        echeance: d.echeance,
        statut: d.statut,
        transmiseLe: d.transmiseLe,
        accuseLe: d.accuseLe,
        enRetard: (d.statut === "a_preparer" || d.statut === "prete") && d.echeance < maintenant,
        horsDelai: d.transmiseLe !== undefined && d.transmiseLe > d.echeance,
      }))
      .sort((a, b) => b.echeance - a.echeance)
  },
})

export const dossier = query({
  args: { declarationId: v.id("securiteDeclarationsArtf") },
  handler: async (ctx, { declarationId }) => {
    const acces = await accesSecurite(ctx, "consulter", "artf.lire")
    const declaration = await ctx.db.get(declarationId)
    if (!declaration) return null
    if (!estInterne(acces) && declaration.statut !== "transmise" && declaration.statut !== "accusee") {
      throw new Error("Accès refusé : cette déclaration n'a pas été transmise.")
    }
    const [evenement, enquete] = await Promise.all([
      declaration.evenementId ? ctx.db.get(declaration.evenementId) : Promise.resolve(null),
      declaration.enqueteId ? ctx.db.get(declaration.enqueteId) : Promise.resolve(null),
    ])
    return {
      declaration,
      evenement: evenement ? { _id: evenement._id, numero: evenement.numero, type: evenement.type, gravite: evenement.gravite, lieu: evenement.lieu, survenuLe: evenement.survenuLe } : null,
      enquete: enquete ? { _id: enquete._id, numero: enquete.numero, statut: enquete.statut } : null,
      proposition: declaration.contenu ? null : await proposition(ctx, declaration),
      enRetard: (declaration.statut === "a_preparer" || declaration.statut === "prete") && declaration.echeance < Date.now(),
      chronologie: await chronologieSecurite(ctx, { entite: "declaration", entiteId: declarationId }),
      droits: { gerer: acces.capacites.has("artf.gerer") },
    }
  },
})

async function declarationExistante(ctx: MutationCtx, declarationId: Id<"securiteDeclarationsArtf">) {
  const declaration = await ctx.db.get(declarationId)
  if (!declaration) throw new Error("Déclaration introuvable.")
  return declaration
}

export const rediger = mutation({
  args: { declarationId: v.id("securiteDeclarationsArtf"), objet: v.string(), contenu: v.string() },
  handler: async (ctx, args) => {
    const acces = await accesSecurite(ctx, "modifier", "artf.gerer")
    const declaration = await declarationExistante(ctx, args.declarationId)
    if (declaration.statut !== "a_preparer" && declaration.statut !== "prete") {
      throw new Error("Une déclaration transmise ne se modifie plus.")
    }
    if (declaration.nature === "rapport_enquete" && declaration.enqueteId) {
      const enquete = await ctx.db.get(declaration.enqueteId)
      if (enquete && enquete.statut !== "cloturee") throw new Error(`L'enquête ${enquete.numero} n'est pas clôturée : le rapport attendra sa clôture.`)
    }
    const contenu = texteRequis(args.contenu, "Le contenu", 12_000)
    if (contenu.length < 40) throw new Error("Le contenu est trop court pour une déclaration réglementaire.")
    await ctx.db.patch(declaration._id, {
      objet: texteRequis(args.objet, "L'objet", 300),
      contenu,
      statut: "prete",
      prepareeLe: Date.now(),
      prepareeParNom: acces.nom,
    })
    await tracerSecurite(ctx, acces, {
      entite: "declaration",
      entiteId: declaration._id,
      evenementId: declaration.evenementId,
      action: "securite.artf.rediger",
      libelle: `${declaration.numero} rédigée, prête à transmettre`,
      permission: "modifier",
      table: "securiteDeclarationsArtf",
    })
    return { statut: "prete" as const }
  },
})

/** Bilan trimestriel : statistiques calculées sur le registre, prêtes à relire. */
export async function composerBilan(ctx: QueryCtx | MutationCtx, trimestre: string) {
  const bornes = bornesTrimestre(trimestre)
  const evenements = await ctx.db
    .query("securiteEvenements")
    .withIndex("by_survenu", (q) => q.gte("survenuLe", bornes.debut).lt("survenuLe", bornes.fin))
    .collect()
  const parFamille = new Map<Famille, number>()
  const parGravite = new Map<Gravite, number>()
  for (const e of evenements) {
    const famille = TYPES_EVENEMENT[e.type].famille
    parFamille.set(famille, (parFamille.get(famille) ?? 0) + 1)
    parGravite.set(e.gravite, (parGravite.get(e.gravite) ?? 0) + 1)
  }
  const [enquetes, actions, inspections, notifications] = await Promise.all([
    ctx.db.query("securiteEnquetes").collect(),
    ctx.db.query("securiteActions").collect(),
    ctx.db.query("securiteInspections").collect(),
    ctx.db.query("securiteDeclarationsArtf").collect(),
  ])
  const finTrimestre = dateLibreville(bornes.fin - 1)
  const inspectionsFaites = inspections.filter((i) => i.realiseeLe !== undefined && i.realiseeLe >= bornes.debut && i.realiseeLe < bornes.fin)
  const notificationsTrimestre = notifications.filter(
    (d) => d.nature === "notification_immediate" && d.transmiseLe !== undefined && d.transmiseLe >= bornes.debut && d.transmiseLe < bornes.fin
  )
  const lignes = [
    `Bilan de sécurité ferroviaire — ${bornes.libelle}, ligne Owendo — Franceville.`,
    `Événements : ${evenements.length} (${(Object.keys(FAMILLES) as Famille[]).map((f) => `${FAMILLES[f].toLowerCase()} ${parFamille.get(f) ?? 0}`).join(", ")}).`,
    `Par gravité : ${(Object.keys(GRAVITES) as Gravite[]).map((g) => `${GRAVITES[g].libelle.toLowerCase()} ${parGravite.get(g) ?? 0}`).join(", ")}.`,
    `Victimes : ${evenements.reduce((t, e) => t + e.blesses, 0)} blessé(s), ${evenements.reduce((t, e) => t + e.deces, 0)} décès.`,
    `Enquêtes ouvertes sur la période : ${enquetes.filter((e) => e.ouverteLe >= bornes.debut && e.ouverteLe < bornes.fin).length} ; clôturées : ${enquetes.filter((e) => e.clotureeLe !== undefined && e.clotureeLe >= bornes.debut && e.clotureeLe < bornes.fin).length}.`,
    `Actions correctives : ${actions.filter((a) => a.statut === "verifiee").length} vérifiées efficaces au total, ${actions.filter((a) => actionEnRetard(a, finTrimestre)).length} en retard à la fin du trimestre.`,
    `Inspections réalisées : ${inspectionsFaites.length}, dont ${inspectionsFaites.filter((i) => i.resultat === "non_conforme").length} non conformes ; ${inspectionsFaites.reduce((t, i) => t + i.nonConformites.length, 0)} non-conformités relevées.`,
    `Notifications transmises : ${notificationsTrimestre.length}, dont ${notificationsTrimestre.filter((d) => d.transmiseLe! > d.echeance).length} hors délai.`,
  ]
  return { bornes, contenu: lignes.join("\n"), evenements: evenements.length }
}

export const preparerBilan = mutation({
  args: { trimestre: v.string() },
  handler: async (ctx, { trimestre }) => {
    const acces = await accesSecurite(ctx, "creer", "artf.gerer")
    const { bornes, contenu } = await composerBilan(ctx, trimestre)
    if (bornes.fin > Date.now()) throw new Error(`Le ${bornes.libelle} n'est pas terminé.`)
    const existant = await ctx.db.query("securiteDeclarationsArtf").withIndex("by_periode", (q) => q.eq("periode", bornes.code)).first()
    if (existant) throw new Error(`Le bilan du ${bornes.libelle} existe déjà : ${existant.numero}.`)
    const numero = await prochainNumeroSecurite(ctx, `ARTF-${dateLibreville(Date.now()).slice(0, 4)}`, 3)
    const declarationId = await ctx.db.insert("securiteDeclarationsArtf", {
      numero,
      nature: "bilan_trimestriel",
      periode: bornes.code,
      objet: `Bilan de sécurité — ${bornes.libelle}`,
      contenu,
      echeance: bornes.echeance,
      statut: "prete",
      prepareeLe: Date.now(),
      prepareeParNom: acces.nom,
      mode: "simulation",
      createdAt: Date.now(),
      origine: "saisie",
    })
    await tracerSecurite(ctx, acces, {
      entite: "declaration",
      entiteId: declarationId,
      action: "securite.artf.bilan",
      libelle: `Bilan du ${bornes.libelle} préparé`,
      permission: "creer",
      table: "securiteDeclarationsArtf",
    })
    return { declarationId, numero }
  },
})

/**
 * Transmission à l'ARTF. SIMULATION : le portail de l'ARTF n'est pas
 * raccordé ; la déclaration reçoit une référence locale et l'accusé de
 * réception arrive après un court délai simulé.
 */
export const transmettre = mutation({
  args: { declarationId: v.id("securiteDeclarationsArtf") },
  handler: async (ctx, { declarationId }) => {
    const acces = await accesSecurite(ctx, "modifier", "artf.gerer")
    const declaration = await declarationExistante(ctx, declarationId)
    if (declaration.statut !== "prete") {
      throw new Error(declaration.statut === "a_preparer" ? "Rédigez la déclaration avant de la transmettre." : "Cette déclaration est déjà transmise.")
    }
    const now = Date.now()
    const reference = `ARTF-SIM-${String(now).slice(-8)}`
    await ctx.db.patch(declarationId, { statut: "transmise", transmiseLe: now, transmiseParNom: acces.nom, referenceTransmission: reference })
    await tracerSecurite(ctx, acces, {
      entite: "declaration",
      entiteId: declarationId,
      evenementId: declaration.evenementId,
      action: "securite.artf.transmettre",
      libelle: `${NATURES_ARTF[declaration.nature]} transmise à l'ARTF (simulation)`,
      detail: `${declaration.numero} · réf. ${reference}${now > declaration.echeance ? " · hors délai" : ""}`,
      permission: "modifier",
      table: "securiteDeclarationsArtf",
    })
    await ctx.scheduler.runAfter(DELAI_ACCUSE_ARTF_MS, internal.modules.securite.artf.accuserSimule, { declarationId })
    return { reference, horsDelai: now > declaration.echeance }
  },
})

export const accuserSimule = internalMutation({
  args: { declarationId: v.id("securiteDeclarationsArtf") },
  handler: async (ctx, { declarationId }) => {
    const declaration = await ctx.db.get(declarationId)
    if (!declaration || declaration.statut !== "transmise") return null
    const accuseLe = Date.now()
    const referenceAccuse = `AR-ARTF-${String(accuseLe).slice(-8)}`
    await ctx.db.patch(declarationId, { statut: "accusee", accuseLe, referenceAccuse })
    await ctx.db.insert("securiteJournal", {
      entite: "declaration",
      entiteId: declarationId,
      evenementId: declaration.evenementId,
      action: "securite.artf.accuser",
      libelle: "Accusé de réception de l'ARTF (simulation)",
      detail: referenceAccuse,
      acteurNom: "ARTF — portail simulé",
      at: accuseLe,
    })
    return { referenceAccuse }
  },
})

/** Accusé reçu hors portail (courrier, courriel) : saisi à la main. */
export const enregistrerAccuse = mutation({
  args: { declarationId: v.id("securiteDeclarationsArtf"), reference: v.string() },
  handler: async (ctx, args) => {
    const acces = await accesSecurite(ctx, "modifier", "artf.gerer")
    const declaration = await declarationExistante(ctx, args.declarationId)
    if (declaration.statut !== "transmise") {
      throw new Error(`La déclaration est « ${STATUTS_ARTF[declaration.statut].toLowerCase()} » : aucun accusé n'est attendu.`)
    }
    const reference = texteRequis(args.reference, "La référence de l'accusé", 80)
    await ctx.db.patch(declaration._id, { statut: "accusee", accuseLe: Date.now(), referenceAccuse: reference })
    await tracerSecurite(ctx, acces, {
      entite: "declaration",
      entiteId: declaration._id,
      evenementId: declaration.evenementId,
      action: "securite.artf.accuser",
      libelle: "Accusé de réception enregistré",
      detail: reference,
      permission: "modifier",
      table: "securiteDeclarationsArtf",
    })
    return { statut: "accusee" as const }
  },
})
