import { v } from "convex/values"

import { internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "../../_generated/server"
import { accesRh, chronologieRh, prochainNumero, tracerRh, type AccesRh } from "./acces"
import { aujourdhuiLibreville } from "./lecture"
import {
  TYPES_CONGE,
  bornesPeriode,
  joursCommuns,
  nomComplet,
  nomGare,
  periodeSuivante,
  texteFacultatif,
  texteRequis,
} from "./model"
import {
  PARAMETRES_PAIE_2026,
  VARIABLES_VIDES,
  calculerBulletin,
  totaliserPeriode,
  type VariablesPaie,
} from "./modelPaie"

/** Délai de l'accusé de réception simulé des organismes sociaux. */
export const DELAI_ACCUSE_SIMULE_MS = 20_000

const LIBELLES_STATUT_PERIODE = {
  ouverte: "ouverte à la saisie",
  calculee: "calculée",
  validee: "validée",
  cloturee: "clôturée",
} as const

/* ═════════════════════════════ Lecture ══════════════════════════════════ */

async function declarationsDe(ctx: QueryCtx, periodeId: Id<"rhPeriodesPaie">) {
  return await ctx.db
    .query("rhDeclarationsSociales")
    .withIndex("by_periode", (q) => q.eq("periodeId", periodeId))
    .collect()
}

export const listerPeriodes = query({
  args: {},
  handler: async (ctx) => {
    const acces = await accesRh(ctx, "consulter")
    const voitPaie = acces.capacites.has("paie.lire")
    if (!voitPaie && !acces.capacites.has("declarations.lire")) {
      throw new Error("Accès refusé : votre profil ne permet pas « consulter la paie ».")
    }
    const periodes = await ctx.db.query("rhPeriodesPaie").collect()
    const visibles = voitPaie ? periodes : periodes.filter((periode) => periode.statut === "cloturee")
    const resultat = []
    for (const periode of visibles.sort((a, b) => b.code.localeCompare(a.code))) {
      const declarations = await declarationsDe(ctx, periode._id)
      resultat.push({
        _id: periode._id,
        code: periode.code,
        libelle: periode.libelle,
        statut: periode.statut,
        totaux: periode.totaux ?? null,
        calculeeLe: periode.calculeeLe,
        valideeLe: periode.valideeLe,
        clotureeLe: periode.clotureeLe,
        declarations: declarations.map((d) => ({
          _id: d._id,
          organisme: d.organisme,
          statut: d.statut,
          numero: d.numero,
          total: d.total,
        })),
      })
    }
    const enCours = periodes.find((periode) => periode.statut !== "cloturee")
    const derniere = [...periodes].sort((a, b) => b.code.localeCompare(a.code))[0]
    return {
      periodes: resultat,
      prochaineAOuvrir: enCours
        ? null
        : derniere
          ? periodeSuivante(derniere.code)
          : aujourdhuiLibreville().slice(0, 7),
    }
  },
})

export const periode = query({
  args: { periodeId: v.id("rhPeriodesPaie") },
  handler: async (ctx, { periodeId }) => {
    const acces = await accesRh(ctx, "consulter", "paie.lire")
    const periode = await ctx.db.get(periodeId)
    if (!periode) return null
    const [bulletins, variables, declarations] = await Promise.all([
      ctx.db.query("rhBulletins").withIndex("by_periode", (q) => q.eq("periodeId", periodeId)).collect(),
      ctx.db.query("rhVariablesPaie").withIndex("by_periode_agent", (q) => q.eq("periodeId", periodeId)).collect(),
      declarationsDe(ctx, periodeId),
    ])
    const agents = await agentsPayables(ctx, periode)
    return {
      periode,
      parametres: { code: PARAMETRES_PAIE_2026.code, libelle: PARAMETRES_PAIE_2026.libelle },
      effectifPayable: agents.length,
      variablesSaisies: variables.length,
      bulletins: bulletins
        .map((bulletin) => ({
          _id: bulletin._id,
          numero: bulletin.numero,
          agentId: bulletin.agentId,
          matricule: bulletin.agent.matricule,
          nomComplet: bulletin.agent.nomComplet,
          poste: bulletin.agent.poste,
          direction: bulletin.agent.direction,
          gareCode: bulletin.agent.gareCode,
          joursPayes: bulletin.joursPayes,
          brut: bulletin.totaux.brut,
          cotisationsSalariales: bulletin.totaux.cnssSalarie + bulletin.totaux.cnamgsSalarie,
          impots: bulletin.totaux.irpp + bulletin.totaux.tcs,
          net: bulletin.totaux.net,
          chargesPatronales: bulletin.totaux.chargesPatronales,
          coutEmployeur: bulletin.totaux.coutEmployeur,
          statut: bulletin.statut,
        }))
        .sort((a, b) => a.matricule.localeCompare(b.matricule)),
      declarations,
      chronologie: await chronologieRh(ctx, { entite: "periode", entiteId: periodeId }, false),
      peutValider: acces.capacites.has("paie.valider"),
    }
  },
})

/** Grille de saisie des éléments variables : un agent payable par ligne. */
export const variables = query({
  args: { periodeId: v.id("rhPeriodesPaie") },
  handler: async (ctx, { periodeId }) => {
    await accesRh(ctx, "consulter", "paie.lire")
    const periode = await ctx.db.get(periodeId)
    if (!periode) return null
    const [agents, saisies] = await Promise.all([
      agentsPayables(ctx, periode),
      ctx.db.query("rhVariablesPaie").withIndex("by_periode_agent", (q) => q.eq("periodeId", periodeId)).collect(),
    ])
    const parAgent = new Map(saisies.map((saisie) => [saisie.agentId, saisie]))
    return agents
      .map((agent) => {
        const saisie = parAgent.get(agent._id)
        return {
          agentId: agent._id,
          matricule: agent.matricule,
          nomComplet: nomComplet(agent),
          metier: agent.metier,
          gareCode: agent.gareCode,
          variables: saisie
            ? {
                heuresSup125: saisie.heuresSup125,
                heuresSup150: saisie.heuresSup150,
                heuresSup200: saisie.heuresSup200,
                kmTraction: saisie.kmTraction,
                nuitsDecouche: saisie.nuitsDecouche,
                primeExceptionnelleFcfa: saisie.primeExceptionnelleFcfa,
                joursAbsence: saisie.joursAbsence,
                avanceSalaireFcfa: saisie.avanceSalaireFcfa,
              }
            : null,
          commentaire: saisie?.commentaire,
          majLe: saisie?.updatedAt,
          majPar: saisie?.updatedByNom,
        }
      })
      .sort((a, b) => a.matricule.localeCompare(b.matricule))
  },
})

export const bulletin = query({
  args: { bulletinId: v.id("rhBulletins") },
  handler: async (ctx, { bulletinId }) => {
    await accesRh(ctx, "consulter", "paie.lire")
    const bulletin = await ctx.db.get(bulletinId)
    if (!bulletin) return null
    const periode = await ctx.db.get(bulletin.periodeId)
    return {
      bulletin: { ...bulletin, agent: { ...bulletin.agent, gareNom: nomGare(bulletin.agent.gareCode) } },
      periode: periode
        ? { _id: periode._id, code: periode.code, libelle: periode.libelle, debut: periode.debut, fin: periode.fin, statut: periode.statut }
        : null,
      employeur: {
        raisonSociale: "Société d'Exploitation du Transgabonais (SETRAG)",
        adresse: "BP 578, Owendo — Libreville, Gabon",
        numeroEmployeurCnss: "Non renseigné (référentiel employeur à paramétrer)",
      },
      chronologie: await chronologieRh(ctx, { entite: "bulletin", entiteId: bulletinId }, false),
    }
  },
})

/**
 * État des charges sociales et fiscales d'une période calculée : une ligne
 * par agent, prête à exporter pour la CNSS, la CNAMGS et la DGI.
 */
export const etatCharges = query({
  args: { periodeId: v.id("rhPeriodesPaie") },
  handler: async (ctx, { periodeId }) => {
    const acces = await accesRh(ctx, "consulter", "declarations.lire")
    const periode = await ctx.db.get(periodeId)
    if (!periode) return null
    if (!acces.capacites.has("paie.lire") && periode.statut !== "cloturee") {
      throw new Error("Accès refusé : seules les périodes clôturées sont communiquées aux organismes.")
    }
    const bulletins = await ctx.db
      .query("rhBulletins")
      .withIndex("by_periode", (q) => q.eq("periodeId", periodeId))
      .collect()
    const lignes = bulletins
      .map((bulletin) => ({
        bulletinId: bulletin._id,
        matricule: bulletin.agent.matricule,
        nomComplet: bulletin.agent.nomComplet,
        numeroCnss: bulletin.agent.numeroCnss ?? null,
        numeroCnamgs: bulletin.agent.numeroCnamgs ?? null,
        brutSoumis: bulletin.totaux.brutSoumis,
        assietteCnss: bulletin.totaux.assietteCnss,
        cnssSalarie: bulletin.totaux.cnssSalarie,
        cnssPatronal: bulletin.totaux.cnssPatronal,
        assietteCnamgs: bulletin.totaux.assietteCnamgs,
        cnamgsSalarie: bulletin.totaux.cnamgsSalarie,
        cnamgsPatronal: bulletin.totaux.cnamgsPatronal,
        irpp: bulletin.totaux.irpp,
        tcs: bulletin.totaux.tcs,
      }))
      .sort((a, b) => a.matricule.localeCompare(b.matricule))
    const total = (cle: keyof (typeof lignes)[number]) =>
      lignes.reduce((somme, ligne) => somme + (typeof ligne[cle] === "number" ? (ligne[cle] as number) : 0), 0)
    return {
      periode: { _id: periode._id, code: periode.code, libelle: periode.libelle, statut: periode.statut },
      lignes,
      totaux: {
        effectif: lignes.length,
        brutSoumis: total("brutSoumis"),
        assietteCnss: total("assietteCnss"),
        cnssSalarie: total("cnssSalarie"),
        cnssPatronal: total("cnssPatronal"),
        assietteCnamgs: total("assietteCnamgs"),
        cnamgsSalarie: total("cnamgsSalarie"),
        cnamgsPatronal: total("cnamgsPatronal"),
        irpp: total("irpp"),
        tcs: total("tcs"),
      },
      declarations: await declarationsDe(ctx, periodeId),
    }
  },
})

/* ════════════════════════════ Écriture ══════════════════════════════════ */

async function periodeExistante(ctx: MutationCtx, periodeId: Id<"rhPeriodesPaie">) {
  const periode = await ctx.db.get(periodeId)
  if (!periode) throw new Error("Période de paie introuvable.")
  return periode
}

/** Agents présents au moins un jour sur la période. */
async function agentsPayables(ctx: QueryCtx | MutationCtx, periode: Pick<Doc<"rhPeriodesPaie">, "debut" | "fin">) {
  const agents = await ctx.db.query("rhAgents").take(5000)
  return agents.filter(
    (agent) =>
      agent.dateEmbauche <= periode.fin &&
      (agent.dateSortie === undefined || agent.dateSortie >= periode.debut) &&
      agent.statut !== "suspendu"
  )
}

export const ouvrirPeriode = mutation({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const acces = await accesRh(ctx, "creer", "paie.preparer")
    const { code, libelle, debut, fin } = bornesPeriode(args.code)
    const periodes = await ctx.db.query("rhPeriodesPaie").collect()
    const enCours = periodes.find((periode) => periode.statut !== "cloturee")
    if (enCours) {
      throw new Error(`La période ${enCours.libelle} est encore ${LIBELLES_STATUT_PERIODE[enCours.statut]} : clôturez-la d'abord.`)
    }
    if (periodes.some((periode) => periode.code === code)) {
      throw new Error(`La période ${libelle} existe déjà.`)
    }
    const derniere = [...periodes].sort((a, b) => b.code.localeCompare(a.code))[0]
    if (derniere && code !== periodeSuivante(derniere.code)) {
      throw new Error(`Les périodes se suivent : la prochaine à ouvrir est ${bornesPeriode(periodeSuivante(derniere.code)).libelle}.`)
    }
    const periodeId = await ctx.db.insert("rhPeriodesPaie", {
      code,
      libelle,
      debut,
      fin,
      statut: "ouverte",
      parametres: PARAMETRES_PAIE_2026.code,
      ouverteLe: Date.now(),
      ouverteParNom: acces.nom,
      origine: "saisie",
    })
    await tracerRh(ctx, acces, {
      entite: "periode",
      entiteId: periodeId,
      action: "rh.paie.ouvrir",
      libelle: `Ouverture de la période ${libelle}`,
      detail: `Paramètres ${PARAMETRES_PAIE_2026.code}`,
      permission: "creer",
      table: "rhPeriodesPaie",
    })
    return { periodeId, code }
  },
})

/** Supprime les bulletins d'une période revenue à la saisie. */
async function retirerBulletins(ctx: MutationCtx, periodeId: Id<"rhPeriodesPaie">) {
  const bulletins = await ctx.db.query("rhBulletins").withIndex("by_periode", (q) => q.eq("periodeId", periodeId)).collect()
  for (const bulletin of bulletins) await ctx.db.delete(bulletin._id)
  return bulletins.length
}

const variablesValidator = {
  heuresSup125: v.number(),
  heuresSup150: v.number(),
  heuresSup200: v.number(),
  kmTraction: v.number(),
  nuitsDecouche: v.number(),
  primeExceptionnelleFcfa: v.number(),
  joursAbsence: v.number(),
  avanceSalaireFcfa: v.number(),
}

export const enregistrerVariables = mutation({
  args: {
    periodeId: v.id("rhPeriodesPaie"),
    agentId: v.id("rhAgents"),
    ...variablesValidator,
    commentaire: v.optional(v.string()),
  },
  handler: async (ctx, { periodeId, agentId, commentaire, ...saisie }) => {
    const acces = await accesRh(ctx, "modifier", "paie.preparer")
    const periode = await periodeExistante(ctx, periodeId)
    if (periode.statut !== "ouverte" && periode.statut !== "calculee") {
      throw new Error(`La période ${periode.libelle} est ${LIBELLES_STATUT_PERIODE[periode.statut]} : ses éléments variables sont figés.`)
    }
    const agent = await ctx.db.get(agentId)
    if (!agent) throw new Error("Agent introuvable.")
    // Le moteur contrôle les bornes : on l'appelle à blanc avant d'écrire.
    calculerBulletin(agent, periode, saisie)
    const existante = await ctx.db
      .query("rhVariablesPaie")
      .withIndex("by_periode_agent", (q) => q.eq("periodeId", periodeId).eq("agentId", agentId))
      .unique()
    const valeur = {
      ...saisie,
      commentaire: texteFacultatif(commentaire, "Le commentaire", 300),
      updatedAt: Date.now(),
      updatedByNom: acces.nom,
    }
    if (existante) await ctx.db.patch(existante._id, valeur)
    else await ctx.db.insert("rhVariablesPaie", { periodeId, agentId, ...valeur })

    let aRecalculer = false
    if (periode.statut === "calculee") {
      await retirerBulletins(ctx, periodeId)
      await ctx.db.patch(periodeId, { statut: "ouverte", totaux: undefined, calculeeLe: undefined, calculeePar: undefined, calculeeParNom: undefined })
      aRecalculer = true
    }
    await tracerRh(ctx, acces, {
      entite: "periode",
      entiteId: periodeId,
      agentId,
      action: "rh.paie.variables",
      libelle: `Éléments variables de ${nomComplet(agent)} (${agent.matricule})`,
      detail: aRecalculer ? "La période revient à la saisie : relancez le calcul." : undefined,
      permission: "modifier",
      table: "rhVariablesPaie",
      avant: existante
        ? Object.fromEntries(Object.keys(variablesValidator).map((cle) => [cle, existante[cle as keyof VariablesPaie]]))
        : VARIABLES_VIDES,
      apres: saisie,
    })
    return { aRecalculer }
  },
})

export const calculerPeriode = mutation({
  args: { periodeId: v.id("rhPeriodesPaie") },
  handler: async (ctx, { periodeId }) => {
    const acces = await accesRh(ctx, "modifier", "paie.preparer")
    const periode = await periodeExistante(ctx, periodeId)
    if (periode.statut !== "ouverte" && periode.statut !== "calculee") {
      throw new Error(`La période ${periode.libelle} est ${LIBELLES_STATUT_PERIODE[periode.statut]} : elle ne peut plus être recalculée.`)
    }
    const resultat = await genererBulletins(ctx, periode)
    await ctx.db.patch(periodeId, {
      statut: "calculee",
      calculeeLe: Date.now(),
      calculeePar: acces.user._id,
      calculeeParNom: acces.nom,
      totaux: resultat.totaux,
    })
    await tracerRh(ctx, acces, {
      entite: "periode",
      entiteId: periodeId,
      action: "rh.paie.calculer",
      libelle: `Calcul de la paie : ${resultat.totaux.effectif} bulletins`,
      detail: `Masse brute ${resultat.totaux.brut.toLocaleString("fr-FR")} XAF · net ${resultat.totaux.net.toLocaleString("fr-FR")} XAF`,
      permission: "modifier",
      table: "rhPeriodesPaie",
      apres: resultat.totaux,
    })
    return resultat
  },
})

/**
 * Calcule et enregistre les bulletins d'une période. Exportée pour le jeu de
 * démonstration, qui produit ses trois mois de paie par le même moteur.
 */
export async function genererBulletins(ctx: MutationCtx, periode: Doc<"rhPeriodesPaie">) {
  await retirerBulletins(ctx, periode._id)
  const [agents, saisies, conges] = await Promise.all([
    agentsPayables(ctx, periode),
    ctx.db.query("rhVariablesPaie").withIndex("by_periode_agent", (q) => q.eq("periodeId", periode._id)).collect(),
    ctx.db.query("rhConges").withIndex("by_statut", (q) => q.eq("statut", "valide")).collect(),
  ])
  const variablesParAgent = new Map(saisies.map((saisie) => [saisie.agentId, saisie]))
  const absencesParAgent = new Map<Id<"rhAgents">, number>()
  for (const conge of conges) {
    if (TYPES_CONGE[conge.type].paye) continue
    const jours = joursCommuns(conge, { du: periode.debut, au: periode.fin })
    if (jours > 0) absencesParAgent.set(conge.agentId, (absencesParAgent.get(conge.agentId) ?? 0) + jours)
  }
  const totaux = []
  const erreurs: string[] = []
  let rang = 0
  for (const agent of agents.sort((a, b) => a.matricule.localeCompare(b.matricule))) {
    const saisie = variablesParAgent.get(agent._id)
    let calcul
    try {
      calcul = calculerBulletin(agent, periode, saisie ?? VARIABLES_VIDES, absencesParAgent.get(agent._id) ?? 0)
    } catch (cause) {
      erreurs.push(`${agent.matricule} : ${cause instanceof Error ? cause.message : String(cause)}`)
      continue
    }
    rang += 1
    await ctx.db.insert("rhBulletins", {
      periodeId: periode._id,
      agentId: agent._id,
      numero: `BP-${periode.code}-${String(rang).padStart(4, "0")}`,
      parametres: calcul.parametres,
      agent: {
        matricule: agent.matricule,
        nomComplet: nomComplet(agent),
        poste: agent.poste,
        direction: agent.direction,
        gareCode: agent.gareCode,
        categorie: agent.categorie,
        echelon: agent.echelon,
        contrat: agent.contrat,
        dateEmbauche: agent.dateEmbauche,
        situationFamiliale: agent.situationFamiliale,
        enfantsACharge: agent.enfantsACharge,
        numeroCnss: agent.numeroCnss,
        numeroCnamgs: agent.numeroCnamgs,
        modePaiement: agent.modePaiement,
        comptePaiement: agent.comptePaiement,
      },
      joursPayes: calcul.joursPayes,
      joursAbsenceNonPayee: calcul.joursAbsenceNonPayee,
      ancienneteAnnees: calcul.ancienneteAnnees,
      lignes: calcul.lignes,
      totaux: calcul.totaux,
      statut: "calcule",
      calculeLe: Date.now(),
    })
    totaux.push(calcul.totaux)
  }
  if (erreurs.length > 0) {
    throw new Error(`Calcul interrompu, corrigez d'abord : ${erreurs.slice(0, 5).join(" ; ")}`)
  }
  return { totaux: totaliserPeriode(totaux) }
}

export const validerPeriode = mutation({
  args: { periodeId: v.id("rhPeriodesPaie") },
  handler: async (ctx, { periodeId }) => {
    const acces = await accesRh(ctx, "valider", "paie.valider")
    const periode = await periodeExistante(ctx, periodeId)
    if (periode.statut !== "calculee") {
      throw new Error(`Seule une période calculée se valide ; ${periode.libelle} est ${LIBELLES_STATUT_PERIODE[periode.statut]}.`)
    }
    if (periode.calculeePar === acces.user._id) {
      throw new Error("Séparation des tâches : la personne qui a calculé la paie ne peut pas la valider.")
    }
    const bulletins = await ctx.db.query("rhBulletins").withIndex("by_periode", (q) => q.eq("periodeId", periodeId)).collect()
    if (bulletins.length === 0) throw new Error("Aucun bulletin à valider.")
    for (const bulletin of bulletins) await ctx.db.patch(bulletin._id, { statut: "valide" })
    await ctx.db.patch(periodeId, { statut: "validee", valideeLe: Date.now(), valideePar: acces.user._id, valideeParNom: acces.nom })
    await tracerRh(ctx, acces, {
      entite: "periode",
      entiteId: periodeId,
      action: "rh.paie.valider",
      libelle: `Validation de la paie ${periode.libelle}`,
      detail: `${bulletins.length} bulletins validés`,
      permission: "valider",
      table: "rhPeriodesPaie",
    })
    return { bulletins: bulletins.length }
  },
})

export const renvoyerALaSaisie = mutation({
  args: { periodeId: v.id("rhPeriodesPaie"), motif: v.string() },
  handler: async (ctx, { periodeId, motif }) => {
    const acces = await accesRh(ctx, "valider", "paie.valider")
    const periode = await periodeExistante(ctx, periodeId)
    if (periode.statut !== "calculee" && periode.statut !== "validee") {
      throw new Error(`La période ${periode.libelle} est ${LIBELLES_STATUT_PERIODE[periode.statut]} : elle ne peut pas revenir à la saisie.`)
    }
    const texte = texteRequis(motif, "Le motif du renvoi", 500)
    const retires = await retirerBulletins(ctx, periodeId)
    await ctx.db.patch(periodeId, {
      statut: "ouverte",
      totaux: undefined,
      calculeeLe: undefined,
      calculeePar: undefined,
      calculeeParNom: undefined,
      valideeLe: undefined,
      valideePar: undefined,
      valideeParNom: undefined,
    })
    await tracerRh(ctx, acces, {
      entite: "periode",
      entiteId: periodeId,
      action: "rh.paie.renvoyer",
      libelle: "Renvoi de la paie à la saisie",
      detail: `${texte} · ${retires} bulletins retirés`,
      permission: "valider",
      table: "rhPeriodesPaie",
    })
    return { bulletinsRetires: retires }
  },
})

export const cloturerPeriode = mutation({
  args: { periodeId: v.id("rhPeriodesPaie") },
  handler: async (ctx, { periodeId }) => {
    const acces = await accesRh(ctx, "modifier", "paie.preparer")
    const periode = await periodeExistante(ctx, periodeId)
    if (periode.statut !== "validee") {
      throw new Error(`Seule une période validée se clôture ; ${periode.libelle} est ${LIBELLES_STATUT_PERIODE[periode.statut]}.`)
    }
    await ctx.db.patch(periodeId, { statut: "cloturee", clotureeLe: Date.now(), clotureeParNom: acces.nom })
    await tracerRh(ctx, acces, {
      entite: "periode",
      entiteId: periodeId,
      action: "rh.paie.cloturer",
      libelle: `Clôture de la période ${periode.libelle}`,
      detail: "Bulletins définitifs ; les déclarations sociales peuvent partir.",
      permission: "modifier",
      table: "rhPeriodesPaie",
    })
    return { statut: "cloturee" as const }
  },
})

/**
 * Télédéclaration CNSS ou CNAMGS d'une période clôturée.
 *
 * SIMULATION : le guichet des organismes n'est pas raccordé. La déclaration
 * est calculée sur les bulletins réels, « transmise » avec une référence
 * locale, et l'accusé de réception arrive après un court délai simulé.
 */
export const transmettreDeclaration = mutation({
  args: {
    periodeId: v.id("rhPeriodesPaie"),
    organisme: v.union(v.literal("CNSS"), v.literal("CNAMGS")),
  },
  handler: async (ctx, { periodeId, organisme }) => {
    const acces = await accesRh(ctx, "creer", "declarations.transmettre")
    const periode = await periodeExistante(ctx, periodeId)
    if (periode.statut !== "cloturee") {
      throw new Error("Seule une période clôturée se déclare aux organismes sociaux.")
    }
    const existantes = await ctx.db.query("rhDeclarationsSociales").withIndex("by_periode", (q) => q.eq("periodeId", periodeId)).collect()
    if (existantes.some((d) => d.organisme === organisme && d.statut !== "rejetee")) {
      throw new Error(`La déclaration ${organisme} de ${periode.libelle} a déjà été transmise.`)
    }
    return await creerDeclaration(ctx, acces, periode, organisme, true)
  },
})

export async function creerDeclaration(
  ctx: MutationCtx,
  acces: Pick<AccesRh, "user" | "nom"> | null,
  periode: Doc<"rhPeriodesPaie">,
  organisme: "CNSS" | "CNAMGS",
  planifierAccuse: boolean,
  instant = Date.now()
) {
  const bulletins = await ctx.db.query("rhBulletins").withIndex("by_periode", (q) => q.eq("periodeId", periode._id)).collect()
  if (bulletins.length === 0) throw new Error("Aucun bulletin : rien à déclarer.")
  const somme = (selecteur: (b: Doc<"rhBulletins">) => number) => bulletins.reduce((total, b) => total + selecteur(b), 0)
  const assiette = somme((b) => (organisme === "CNSS" ? b.totaux.assietteCnss : b.totaux.assietteCnamgs))
  const partSalariale = somme((b) => (organisme === "CNSS" ? b.totaux.cnssSalarie : b.totaux.cnamgsSalarie))
  const partPatronale = somme((b) => (organisme === "CNSS" ? b.totaux.cnssPatronal : b.totaux.cnamgsPatronal))
  const numero = `DS-${organisme}-${periode.code}`
  const declarationId = await ctx.db.insert("rhDeclarationsSociales", {
    periodeId: periode._id,
    organisme,
    numero,
    effectif: bulletins.length,
    assiette,
    partSalariale,
    partPatronale,
    total: partSalariale + partPatronale,
    statut: "transmise",
    mode: "simulation",
    transmiseLe: instant,
    transmiseParNom: acces?.nom ?? "Jeu de démonstration",
    referenceTransmission: `SIM-${organisme}-${periode.code.replace("-", "")}-${String(instant).slice(-6)}`,
    origine: acces ? "saisie" : "demo",
  })
  if (acces) {
    await tracerRh(ctx, acces, {
      entite: "periode",
      entiteId: periode._id,
      action: "rh.declaration.transmettre",
      libelle: `Déclaration ${organisme} transmise (simulation)`,
      detail: `${bulletins.length} salariés · ${(partSalariale + partPatronale).toLocaleString("fr-FR")} XAF`,
      permission: "creer",
      table: "rhDeclarationsSociales",
      apres: { organisme, assiette, partSalariale, partPatronale },
    })
  }
  if (planifierAccuse) {
    await ctx.scheduler.runAfter(DELAI_ACCUSE_SIMULE_MS, internal.modules.rh.paie.accuserDeclarationSimulee, { declarationId })
  }
  return { declarationId, numero, total: partSalariale + partPatronale }
}

/** Accusé de réception simulé de l'organisme social. */
export const accuserDeclarationSimulee = internalMutation({
  args: { declarationId: v.id("rhDeclarationsSociales") },
  handler: async (ctx, { declarationId }) => {
    const declaration = await ctx.db.get(declarationId)
    if (!declaration || declaration.statut !== "transmise") return null
    const accuseLe = Date.now()
    const referenceAccuse = `AR-${declaration.organisme}-${String(accuseLe).slice(-8)}`
    await ctx.db.patch(declarationId, { statut: "accusee", accuseLe, referenceAccuse })
    await ctx.db.insert("rhJournal", {
      entite: "periode",
      entiteId: declaration.periodeId,
      action: "rh.declaration.accuser",
      libelle: `Accusé de réception ${declaration.organisme} (simulation)`,
      detail: referenceAccuse,
      confidentiel: false,
      acteurNom: `${declaration.organisme} — guichet simulé`,
      at: accuseLe,
    })
    return { referenceAccuse }
  },
})

/** Trace l'impression ou l'export d'un document de paie nominatif. */
export const tracerDocument = mutation({
  args: {
    objet: v.union(v.literal("bulletin"), v.literal("livre_paie"), v.literal("etat_charges")),
    bulletinId: v.optional(v.id("rhBulletins")),
    periodeId: v.optional(v.id("rhPeriodesPaie")),
    format: v.union(v.literal("impression"), v.literal("csv")),
  },
  handler: async (ctx, args) => {
    const acces = await accesRh(ctx, "consulter", args.objet === "etat_charges" ? "declarations.lire" : "paie.lire")
    const libelles = { bulletin: "Bulletin de paie", livre_paie: "Livre de paie", etat_charges: "État des charges sociales" }
    const libelle = `${libelles[args.objet]} — ${args.format === "csv" ? "export CSV" : "impression"}`
    if (args.bulletinId) {
      const bulletin = await ctx.db.get(args.bulletinId)
      if (!bulletin) throw new Error("Bulletin introuvable.")
      await tracerRh(ctx, acces, {
        entite: "bulletin",
        entiteId: bulletin._id,
        agentId: bulletin.agentId,
        action: `rh.paie.document.${args.format}`,
        libelle,
        detail: bulletin.numero,
        permission: "consulter",
        table: "rhBulletins",
      })
      return null
    }
    if (!args.periodeId) throw new Error("La période est requise.")
    await tracerRh(ctx, acces, {
      entite: "periode",
      entiteId: args.periodeId,
      action: `rh.paie.document.${args.format}`,
      libelle,
      permission: "consulter",
      table: "rhPeriodesPaie",
    })
    return null
  },
})
