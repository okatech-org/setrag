import type { Doc, Id } from "../../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../../_generated/server"
import {
  conflitsService,
  dateLibreville,
  debutJournee,
  ajouterJours,
  etatAptitude,
  type Conflit,
  type ContexteAgentRoulement,
  type ServicePlanifie,
  type VisiteRealisee,
} from "./model"

type Ctx = QueryCtx | MutationCtx

/** Dernière visite réalisée de chaque agent : la source du statut d'aptitude. */
export async function dernieresAptitudes(
  ctx: Ctx
): Promise<Map<Id<"rhAgents">, VisiteRealisee & { visiteId: Id<"rhVisitesMedicales">; restrictionFonctionnelle?: string }>> {
  const visites = await ctx.db
    .query("rhVisitesMedicales")
    .withIndex("by_statut_date", (query) => query.eq("statut", "realisee"))
    .collect()
  const parAgent = new Map<
    Id<"rhAgents">,
    VisiteRealisee & { visiteId: Id<"rhVisitesMedicales">; restrictionFonctionnelle?: string }
  >()
  for (const visite of visites) {
    if (!visite.resultat || visite.realiseeLe === undefined) continue
    const courante = parAgent.get(visite.agentId)
    if (!courante || visite.realiseeLe > courante.realiseeLe) {
      parAgent.set(visite.agentId, {
        visiteId: visite._id,
        resultat: visite.resultat,
        valideJusquau: visite.valideJusquau,
        realiseeLe: visite.realiseeLe,
        restrictionFonctionnelle: visite.restrictionFonctionnelle,
      })
    }
  }
  return parAgent
}

export async function derniereAptitude(ctx: Ctx, agentId: Id<"rhAgents">) {
  const visites = await ctx.db
    .query("rhVisitesMedicales")
    .withIndex("by_agent", (query) => query.eq("agentId", agentId))
    .collect()
  return (
    visites
      .filter((visite) => visite.statut === "realisee" && visite.resultat && visite.realiseeLe !== undefined)
      .sort((a, b) => (b.realiseeLe ?? 0) - (a.realiseeLe ?? 0))[0] ?? null
  )
}

export function resumeAptitude(
  visite: Pick<Doc<"rhVisitesMedicales">, "resultat" | "valideJusquau" | "realiseeLe" | "restrictionFonctionnelle"> | null | undefined,
  aujourdhui: string
) {
  const etat = etatAptitude(
    visite?.resultat && visite.realiseeLe !== undefined
      ? { resultat: visite.resultat, valideJusquau: visite.valideJusquau, realiseeLe: visite.realiseeLe }
      : null,
    aujourdhui
  )
  return { ...etat, restrictionFonctionnelle: visite?.restrictionFonctionnelle }
}

export function versServicePlanifie(service: Doc<"rhServices">): ServicePlanifie {
  return {
    id: service._id,
    agentId: service.agentId,
    debut: service.debut,
    fin: service.fin,
    type: service.type,
    pauseMinutes: service.pauseMinutes,
  }
}

/** Situation d'un agent utile aux règles de roulement. */
export async function contexteAgent(
  ctx: Ctx,
  agent: Doc<"rhAgents">,
  aptitude?: VisiteRealisee | null
): Promise<ContexteAgentRoulement> {
  const [habilitations, conges, visite] = await Promise.all([
    ctx.db
      .query("rhHabilitations")
      .withIndex("by_agent", (query) => query.eq("agentId", agent._id))
      .collect(),
    ctx.db
      .query("rhConges")
      .withIndex("by_agent", (query) => query.eq("agentId", agent._id))
      .collect(),
    aptitude === undefined ? derniereAptitude(ctx, agent._id) : Promise.resolve(null),
  ])
  return {
    statut: agent.statut,
    aptitude:
      aptitude !== undefined
        ? aptitude
        : visite?.resultat && visite.realiseeLe !== undefined
          ? { resultat: visite.resultat, valideJusquau: visite.valideJusquau, realiseeLe: visite.realiseeLe }
          : null,
    habilitations: habilitations.map((h) => ({ type: h.type, statut: h.statut, expireLe: h.expireLe })),
    conges: conges.filter((c) => c.statut === "valide").map((c) => ({ du: c.du, au: c.au })),
  }
}

/** Services non annulés d'un agent autour d'un intervalle (± 8 jours). */
export async function servicesVoisins(
  ctx: Ctx,
  agentId: Id<"rhAgents">,
  debut: number,
  fin: number
): Promise<ServicePlanifie[]> {
  const marge = 8 * 86_400_000
  const services = await ctx.db
    .query("rhServices")
    .withIndex("by_agent_debut", (query) =>
      query.eq("agentId", agentId).gte("debut", debut - marge).lte("debut", fin + marge)
    )
    .collect()
  return services.filter((service) => service.statut !== "annule").map(versServicePlanifie)
}

export interface ServiceAvecConflits {
  service: Doc<"rhServices">
  conflits: Conflit[]
}

/**
 * Services d'une fenêtre de dates, chacun avec ses conflits recalculés à la
 * lecture : un congé validé ou une inaptitude survenus après la
 * planification apparaissent aussitôt.
 */
export async function servicesAvecConflits(
  ctx: Ctx,
  du: string,
  au: string
): Promise<{ services: ServiceAvecConflits[]; agents: Map<Id<"rhAgents">, Doc<"rhAgents">> }> {
  const debut = debutJournee(du)
  const fin = debutJournee(ajouterJours(au, 1))
  const marge = 8 * 86_400_000
  const voisins = (
    await ctx.db
      .query("rhServices")
      .withIndex("by_debut", (query) => query.gte("debut", debut - marge).lt("debut", fin + marge))
      .collect()
  ).filter((service) => service.statut !== "annule")
  const dansFenetre = voisins.filter((service) => service.debut >= debut && service.debut < fin)

  const agentIds = [...new Set(dansFenetre.map((service) => service.agentId))]
  const agents = new Map<Id<"rhAgents">, Doc<"rhAgents">>()
  for (const agentId of agentIds) {
    const agent = await ctx.db.get(agentId)
    if (agent) agents.set(agentId, agent)
  }
  const aptitudes = await dernieresAptitudes(ctx)
  const contextes = new Map<Id<"rhAgents">, ContexteAgentRoulement>()
  for (const agent of agents.values()) {
    contextes.set(agent._id, await contexteAgent(ctx, agent, aptitudes.get(agent._id) ?? null))
  }

  const planifies = voisins.map(versServicePlanifie)
  const services = dansFenetre
    .sort((a, b) => a.debut - b.debut)
    .map((service) => {
      const contexte = contextes.get(service.agentId)
      return {
        service,
        conflits: contexte ? conflitsService(versServicePlanifie(service), planifies, contexte) : [],
      }
    })
  return { services, agents }
}

export function aujourdhuiLibreville(): string {
  return dateLibreville(Date.now())
}
