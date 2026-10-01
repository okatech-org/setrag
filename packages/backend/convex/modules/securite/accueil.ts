import { query } from "../../_generated/server"
import { isInternalRole } from "../../model/permissions"
import { CAPACITES_ECRITURE_SECURITE, accesSecurite } from "./acces"
import { resumeEvenement } from "./evenements"
import {
  FAMILLES,
  GRAVITES,
  ZONE_LOPE,
  actionEnRetard,
  ajouterJours,
  dateLibreville,
  tauxPourMilleCirculations,
  trimestreDe,
  trimestrePrecedent,
  type Famille,
  type Gravite,
} from "./model"

const JOUR_MS = 86_400_000

export const monAcces = query({
  args: {},
  handler: async (ctx) => {
    const acces = await accesSecurite(ctx, "consulter")
    return {
      nom: acces.nom,
      role: acces.user.role,
      interne: acces.roles.some((role) => isInternalRole(role)),
      capacites: [...acces.capacites],
      lectureSeule: !CAPACITES_ECRITURE_SECURITE.some((capacite) => acces.capacites.has(capacite)),
    }
  },
})

export const tableauDeBord = query({
  args: {},
  handler: async (ctx) => {
    const acces = await accesSecurite(ctx, "consulter", "indicateurs")
    const maintenant = Date.now()
    const aujourdhui = dateLibreville(maintenant)
    const depuis = maintenant - 365 * JOUR_MS
    const [evenements, enquetes, actions, declarations, inspections, circulations] = await Promise.all([
      ctx.db.query("securiteEvenements").withIndex("by_survenu", (q) => q.gte("survenuLe", depuis)).collect(),
      ctx.db.query("securiteEnquetes").collect(),
      ctx.db.query("securiteActions").collect(),
      ctx.db.query("securiteDeclarationsArtf").collect(),
      ctx.db.query("securiteInspections").collect(),
      ctx.db.query("trips").withIndex("by_departure", (q) => q.gte("departureAt", depuis).lte("departureAt", maintenant)).collect(),
    ])
    const circulees = circulations.filter((trip) => trip.status !== "annule")
    const parGravite = Object.fromEntries((Object.keys(GRAVITES) as Gravite[]).map((g) => [g, evenements.filter((e) => e.gravite === g).length])) as Record<Gravite, number>
    const parFamille = Object.fromEntries((Object.keys(FAMILLES) as Famille[]).map((f) => [f, evenements.filter((e) => resumeEvenement(e).famille === f).length])) as Record<Famille, number>
    const parMois: { mois: string; nombre: number; graves: number }[] = []
    for (let i = 11; i >= 0; i -= 1) {
      const mois = new Date(Date.parse(`${aujourdhui.slice(0, 7)}-15T12:00:00Z`) - i * 30.44 * JOUR_MS).toISOString().slice(0, 7)
      if (parMois.some((m) => m.mois === mois)) continue
      const duMois = evenements.filter((e) => dateLibreville(e.survenuLe).startsWith(mois))
      parMois.push({ mois, nombre: duMois.length, graves: duMois.filter((e) => GRAVITES[e.gravite].rang >= 3).length })
    }
    const tousGraves = (await ctx.db.query("securiteEvenements").withIndex("by_survenu").order("desc").take(500)).filter((e) => GRAVITES[e.gravite].rang >= 3)
    const dernierGrave = tousGraves[0]
    const actionsRetard = actions.filter((a) => actionEnRetard(a, aujourdhui))
    const declarationsOuvertes = declarations.filter((d) => d.statut === "a_preparer" || d.statut === "prete")
    const interne = acces.roles.some((role) => isInternalRole(role))
    const voitRegistre = acces.capacites.has("registre.lire")
    const trimestre = trimestrePrecedent(trimestreDe(maintenant))

    return {
      aujourdhui,
      evenements12Mois: evenements.length,
      parGravite,
      parFamille,
      parMois,
      victimes: { blesses: evenements.reduce((t, e) => t + e.blesses, 0), deces: evenements.reduce((t, e) => t + e.deces, 0) },
      circulations12Mois: circulees.length,
      tauxPourMille: tauxPourMilleCirculations(evenements.length, circulees.length),
      joursSansEvenementGrave: dernierGrave ? Math.floor((maintenant - dernierGrave.survenuLe) / JOUR_MS) : null,
      enquetes: {
        ouvertes: enquetes.filter((e) => e.statut !== "cloturee").length,
        enRetard: enquetes.filter((e) => e.statut !== "cloturee" && e.echeanceRapport < aujourdhui).length,
        aCloturer: enquetes.filter((e) => e.statut === "rapport_soumis").length,
      },
      actions: {
        ouvertes: actions.filter((a) => a.statut === "planifiee" || a.statut === "en_cours").length,
        aVerifier: actions.filter((a) => a.statut === "realisee").length,
        enRetard: actionsRetard.length,
        verifiees: actions.filter((a) => a.statut === "verifiee").length,
      },
      artf: {
        aTransmettre: declarationsOuvertes.length,
        enRetard: declarationsOuvertes.filter((d) => d.echeance < maintenant).length,
        transmises12Mois: declarations.filter((d) => d.transmiseLe !== undefined && d.transmiseLe >= depuis).length,
        horsDelai12Mois: declarations.filter((d) => d.transmiseLe !== undefined && d.transmiseLe >= depuis && d.transmiseLe > d.echeance).length,
        bilanAPreparer: interne && !declarations.some((d) => d.periode === trimestre) ? trimestre : null,
      },
      inspections: {
        aVenir30Jours: inspections.filter((i) => i.statut === "programmee" && i.dateProgrammee >= aujourdhui && i.dateProgrammee <= ajouterJours(aujourdhui, 30)).length,
        enRetard: inspections.filter((i) => i.statut === "programmee" && i.dateProgrammee < aujourdhui).length,
        ncSansAction: inspections.reduce((t, i) => t + i.nonConformites.filter((nc) => !nc.actionId).length, 0),
      },
      listes: voitRegistre
        ? {
            aQualifier: evenements.filter((e) => e.statut === "declare").sort((a, b) => b.survenuLe - a.survenuLe).slice(0, 6).map(resumeEvenement),
            actionsEnRetard: actionsRetard
              .sort((a, b) => a.echeance.localeCompare(b.echeance))
              .slice(0, 6)
              .map((a) => ({ _id: a._id, numero: a.numero, libelle: a.libelle, responsableNom: a.responsableNom, echeance: a.echeance, avancement: a.avancement })),
            enquetesEnCours: enquetes
              .filter((e) => e.statut !== "cloturee")
              .sort((a, b) => a.echeanceRapport.localeCompare(b.echeanceRapport))
              .slice(0, 6)
              .map((e) => ({ _id: e._id, numero: e.numero, statut: e.statut, enqueteurNom: e.enqueteurNom, echeanceRapport: e.echeanceRapport, enRetard: e.echeanceRapport < aujourdhui })),
            declarations: interne
              ? declarationsOuvertes
                  .sort((a, b) => a.echeance - b.echeance)
                  .slice(0, 6)
                  .map((d) => ({ _id: d._id, numero: d.numero, nature: d.nature, objet: d.objet, echeance: d.echeance, statut: d.statut, enRetard: d.echeance < maintenant }))
              : [],
          }
        : null,
    }
  },
})

/** Suivi environnemental, centré sur la traversée du parc national de la Lopé. */
export const environnement = query({
  args: {},
  handler: async (ctx) => {
    const acces = await accesSecurite(ctx, "consulter", "environnement.lire")
    const maintenant = Date.now()
    const aujourdhui = dateLibreville(maintenant)
    const depuis = maintenant - 365 * JOUR_MS
    const [evenements, inspections, actions] = await Promise.all([
      ctx.db.query("securiteEvenements").withIndex("by_survenu", (q) => q.gte("survenuLe", depuis)).collect(),
      ctx.db.query("securiteInspections").collect(),
      ctx.db.query("securiteActions").collect(),
    ])
    const concernes = evenements.filter((e) => e.zoneLope || resumeEvenement(e).famille === "environnement" || e.type === "heurt_animal")
    const ids = new Set(concernes.map((e) => e._id as string))
    const inspectionsEnv = inspections.filter((i) => i.type === "inspection_environnementale" || i.zoneLope)
    const idsInspections = new Set(inspectionsEnv.map((i) => i._id as string))
    const actionsEnv = actions.filter((a) => (a.evenementId && ids.has(a.evenementId)) || (a.inspectionId && idsInspections.has(a.inspectionId)))
    return {
      zone: ZONE_LOPE,
      peutGerer: acces.capacites.has("environnement.gerer"),
      indicateurs: {
        evenementsZone: concernes.filter((e) => e.zoneLope).length,
        heurtsFaune: concernes.filter((e) => e.type === "heurt_animal").length,
        feux: concernes.filter((e) => e.type === "feu_brousse").length,
        pollutions: concernes.filter((e) => e.type === "atteinte_environnement").length,
        actionsOuvertes: actionsEnv.filter((a) => a.statut === "planifiee" || a.statut === "en_cours").length,
        actionsEnRetard: actionsEnv.filter((a) => actionEnRetard(a, aujourdhui)).length,
      },
      evenements: concernes.sort((a, b) => b.survenuLe - a.survenuLe).map(resumeEvenement),
      inspections: inspectionsEnv
        .sort((a, b) => b.dateProgrammee.localeCompare(a.dateProgrammee))
        .map((i) => ({ _id: i._id, numero: i.numero, type: i.type, objet: i.objet, lieu: i.lieu, pk: i.pk, dateProgrammee: i.dateProgrammee, statut: i.statut, resultat: i.resultat, nonConformites: i.nonConformites.length })),
      actions: actionsEnv
        .sort((a, b) => a.echeance.localeCompare(b.echeance))
        .map((a) => ({ _id: a._id, numero: a.numero, libelle: a.libelle, responsableNom: a.responsableNom, responsableDirection: a.responsableDirection, priorite: a.priorite, echeance: a.echeance, statut: a.statut, avancement: a.avancement, enRetard: actionEnRetard(a, aujourdhui) })),
    }
  },
})
