import { query } from "../../_generated/server"
import { CAPACITES_ECRITURE_RH, accesRh } from "./acces"
import { aujourdhuiLibreville, dernieresAptitudes, servicesAvecConflits } from "./lecture"
import {
  DIRECTIONS,
  METIERS,
  TYPES_HABILITATION,
  ajouterJours,
  etatAptitude,
  etatHabilitation,
  nomComplet,
  type Direction,
  type EtatAptitude,
  type Metier,
} from "./model"

/** Capacités de l'utilisateur courant : l'écran n'offre que ce qu'il peut faire. */
export const monAcces = query({
  args: {},
  handler: async (ctx) => {
    const acces = await accesRh(ctx, "consulter")
    const capacites = [...acces.capacites]
    return {
      nom: acces.nom,
      role: acces.user.role,
      capacites,
      lectureSeule: !CAPACITES_ECRITURE_RH.some((capacite) => acces.capacites.has(capacite)),
    }
  },
})

export const tableauDeBord = query({
  args: {},
  handler: async (ctx) => {
    const acces = await accesRh(ctx, "consulter", "indicateurs")
    const aujourdhui = aujourdhuiLibreville()
    const ilYaUnAn = ajouterJours(aujourdhui, -365)
    const [agents, mouvements, periodes] = await Promise.all([
      ctx.db.query("rhAgents").take(5000),
      ctx.db.query("rhMouvements").withIndex("by_date", (q) => q.gte("dateEffet", ilYaUnAn)).collect(),
      ctx.db.query("rhPeriodesPaie").collect(),
    ])
    const actifs = agents.filter((agent) => agent.statut === "actif")
    const parDirection = new Map<Direction, number>()
    const parMetier = new Map<Metier, number>()
    for (const agent of actifs) {
      parDirection.set(agent.direction, (parDirection.get(agent.direction) ?? 0) + 1)
      parMetier.set(agent.metier, (parMetier.get(agent.metier) ?? 0) + 1)
    }

    const avecTotaux = periodes.filter((p) => p.totaux).sort((a, b) => b.code.localeCompare(a.code))
    const reference = avecTotaux.find((p) => p.statut === "cloturee") ?? avecTotaux[0]
    const enCours = periodes.find((p) => p.statut !== "cloturee")

    const aptitudes = await dernieresAptitudes(ctx)
    const etats = new Map<EtatAptitude, number>()
    const aRenouveler = []
    for (const agent of actifs.filter((a) => METIERS[a.metier].securite)) {
      const etat = etatAptitude(aptitudes.get(agent._id) ?? null, aujourdhui)
      etats.set(etat.etat, (etats.get(etat.etat) ?? 0) + 1)
      if (etat.etat !== "apte" && etat.etat !== "apte_restriction") {
        aRenouveler.push({ agentId: agent._id, matricule: agent.matricule, nomComplet: nomComplet(agent), metier: agent.metier, ...etat })
      }
    }

    const habilitations = await ctx.db.query("rhHabilitations").withIndex("by_expiration", (q) => q.lte("expireLe", ajouterJours(aujourdhui, 60))).collect()
    const actifsParId = new Map(actifs.map((agent) => [agent._id, agent]))
    const habilitationsEnAlerte = habilitations
      .filter((h) => h.statut === "valide" && actifsParId.has(h.agentId))
      .map((h) => {
        const agent = actifsParId.get(h.agentId)!
        return {
          _id: h._id,
          agentId: h.agentId,
          nomComplet: nomComplet(agent),
          matricule: agent.matricule,
          type: h.type,
          libelle: TYPES_HABILITATION[h.type].libelle,
          expireLe: h.expireLe,
          etat: etatHabilitation(h, aujourdhui),
        }
      })
      .sort((a, b) => a.expireLe.localeCompare(b.expireLe))

    const { services, agents: agentsPlanning } = await servicesAvecConflits(ctx, aujourdhui, ajouterJours(aujourdhui, 13))
    const enConflit = services.filter(({ conflits }) => conflits.length > 0)
    const congesEnAttente = (
      await ctx.db.query("rhConges").withIndex("by_statut", (q) => q.eq("statut", "demande")).collect()
    ).sort((a, b) => a.du.localeCompare(b.du))
    const agentsParId = new Map(agents.map((agent) => [agent._id, agent]))

    const voit = (capacite: Parameters<typeof acces.capacites.has>[0]) => acces.capacites.has(capacite)
    return {
      aujourdhui,
      effectif: {
        actifs: actifs.length,
        suspendus: agents.filter((a) => a.statut === "suspendu").length,
        entrees12Mois: mouvements.filter((m) => m.type === "embauche").length,
        sorties12Mois: mouvements.filter((m) => m.type === "sortie").length,
        parDirection: [...parDirection.entries()]
          .map(([code, nombre]) => ({ code, libelle: DIRECTIONS[code], nombre }))
          .sort((a, b) => b.nombre - a.nombre),
        parMetier: [...parMetier.entries()]
          .map(([code, nombre]) => ({ code, libelle: METIERS[code].libelle, nombre }))
          .sort((a, b) => b.nombre - a.nombre),
      },
      masseSalariale: reference?.totaux
        ? { periodeId: reference._id, libelle: reference.libelle, statut: reference.statut, ...reference.totaux }
        : null,
      periodeEnCours: enCours ? { _id: enCours._id, libelle: enCours.libelle, statut: enCours.statut, code: enCours.code } : null,
      aptitudes: {
        postesSecurite: actifs.filter((a) => METIERS[a.metier].securite).length,
        parEtat: Object.fromEntries(etats) as Partial<Record<EtatAptitude, number>>,
        aRenouveler: aRenouveler.length,
        liste: voit("aptitude.lire")
          ? aRenouveler.sort((a, b) => (a.valideJusquau ?? "").localeCompare(b.valideJusquau ?? "")).slice(0, 8)
          : null,
      },
      habilitations: {
        enAlerte: habilitationsEnAlerte.length,
        liste: voit("dossiers.lire") ? habilitationsEnAlerte.slice(0, 8) : null,
      },
      roulement: {
        services: services.length,
        bloquants: enConflit.filter(({ conflits }) => conflits.some((c) => c.bloquant)).length,
        alertes: enConflit.filter(({ conflits }) => !conflits.some((c) => c.bloquant)).length,
        liste: voit("roulements.lire")
          ? enConflit.slice(0, 8).map(({ service, conflits }) => {
              const agent = agentsPlanning.get(service.agentId)
              return {
                serviceId: service._id,
                date: service.date,
                debut: service.debut,
                type: service.type,
                trainNumber: service.trainNumber,
                nomComplet: agent ? nomComplet(agent) : "—",
                bloquant: conflits.some((c) => c.bloquant),
                message: conflits[0]?.message ?? "",
              }
            })
          : null,
      },
      conges: {
        enAttente: congesEnAttente.length,
        liste: voit("conges.lire")
          ? congesEnAttente.slice(0, 8).map((c) => {
              const agent = agentsParId.get(c.agentId)
              return { _id: c._id, numero: c.numero, type: c.type, du: c.du, au: c.au, jours: c.jours, nomComplet: agent ? nomComplet(agent) : "—" }
            })
          : null,
      },
    }
  },
})
