import { v } from "convex/values"

import type { Doc } from "../../_generated/dataModel"
import { internalQuery, type QueryCtx } from "../../_generated/server"
import { requireUser } from "../../lib/auth"
import { droitsGed, filtrerVisibles, nomAffiche } from "../ged/acces"
import { courrierEnRetard, jourLibreville, normaliser } from "../ged/model"
import { constatEnRetard, constatOuvert, extrait } from "../etudes/model"
import { FRET_DEMO_DATASET_KEY } from "../fret/model"
import { outilOuvert } from "./agent"
import { outilParNom, type SourceCopilot } from "./model"

type Resultat =
  | { ok: true; donnees: unknown; sources: SourceCopilot[] }
  | { ok: false; message: string }

function jourDemande(valeur: unknown): string {
  if (typeof valeur === "string" && /^\d{4}-\d{2}-\d{2}$/.test(valeur)) return valeur
  return jourLibreville(Date.now())
}

const MONTANT_XAF = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "XAF",
  currencyDisplay: "code",
  maximumFractionDigits: 0,
})
/** Montant en XAF, comme le veut la charte. */
const xaf = (montant: number) => MONTANT_XAF.format(montant).replace(/\u202F/g, "\u00A0")

async function ventesDuJour(ctx: QueryCtx, entree: Record<string, unknown>): Promise<Resultat> {
  const date = jourDemande(entree.date)
  const journee = await ctx.db
    .query("accountingDays")
    .withIndex("by_date", (q) => q.eq("date", date))
    .unique()
  if (!journee) {
    return {
      ok: true,
      donnees: { date, journeeComptable: "absente", message: "Aucune journée comptable ouverte à cette date : aucune vente enregistrée." },
      sources: [{ outil: "ventes_du_jour", libelle: `Ventes du ${date}`, detail: "Aucune journée comptable", lien: "/gestion/recettes" }],
    }
  }
  const operations = await ctx.db
    .query("sales")
    .withIndex("by_accounting_day", (q) => q.eq("accountingDayId", journee._id))
    .take(10_000)
  const ventes = operations.filter((sale) => sale.kind === "vente" && sale.status === "confirmee")
  const parCanal = new Map<string, { ventes: number; ttc: number }>()
  for (const vente of ventes) {
    const ligne = parCanal.get(vente.channel) ?? { ventes: 0, ttc: 0 }
    ligne.ventes += 1
    ligne.ttc += vente.amounts.ttc
    parCanal.set(vente.channel, ligne)
  }
  const somme = (lignes: readonly Doc<"sales">[], champ: "ttc" | "received") =>
    lignes.reduce((total, sale) => total + sale.amounts[champ], 0)
  const annulations = operations.filter((sale) => sale.kind === "annulation")
  const remboursements = operations.filter((sale) => sale.kind === "remboursement")
  return {
    ok: true,
    donnees: {
      date,
      journeeComptable: journee.status === "ouverte" ? "ouverte" : "clôturée",
      ventesConfirmees: ventes.length,
      chiffreAffairesTtc: somme(ventes, "ttc"),
      encaisse: somme(ventes, "received"),
      annulations: annulations.length,
      remboursements: remboursements.length,
      montantRembourseTtc: Math.abs(somme(remboursements, "ttc")),
      parCanal: [...parCanal.entries()].map(([canal, ligne]) => ({ canal, ...ligne })),
      limiteLecture: operations.length === 10_000,
    },
    sources: [
      {
        outil: "ventes_du_jour",
        libelle: `Ventes du ${date}`,
        detail: `${ventes.length} ventes confirmées, ${xaf(somme(ventes, "ttc"))} TTC`,
        lien: "/gestion/recettes",
      },
    ],
  }
}

async function remplissage(ctx: QueryCtx, entree: Record<string, unknown>): Promise<Resultat> {
  const date = jourDemande(entree.date)
  const [mesures, circulations] = await Promise.all([
    ctx.db
      .query("tripMetrics")
      .withIndex("by_service_date", (q) => q.eq("serviceDate", date))
      .collect(),
    ctx.db
      .query("trips")
      .withIndex("by_service_date", (q) => q.eq("serviceDate", date))
      .collect(),
  ])
  const parTrain = new Map<string, { offert: number; vendu: number; pointe: number; billets: number; recettes: number }>()
  for (const mesure of mesures) {
    const ligne = parTrain.get(mesure.tripId) ?? { offert: 0, vendu: 0, pointe: 0, billets: 0, recettes: 0 }
    ligne.offert += mesure.seatKmOffered
    ligne.vendu += mesure.seatKmSold
    ligne.pointe = Math.max(ligne.pointe, mesure.peakPct)
    ligne.billets += mesure.ticketCount
    ligne.recettes += mesure.revenueTtc
    parTrain.set(mesure.tripId, ligne)
  }
  const trains = circulations
    .sort((a, b) => a.departureAt - b.departureAt)
    .map((trajet) => {
      const ligne = parTrain.get(trajet._id)
      return {
        train: trajet.trainNumber,
        depart: new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Libreville" }).format(trajet.departureAt),
        statut: trajet.status,
        retardMinutes: trajet.delayMinutes,
        remplissagePct: ligne && ligne.offert > 0 ? Math.round((ligne.vendu / ligne.offert) * 100) : null,
        pointePct: ligne ? Math.round(ligne.pointe) : null,
        billets: ligne?.billets ?? null,
        recettesTtc: ligne?.recettes ?? null,
      }
    })
  return {
    ok: true,
    donnees: {
      date,
      circulations: trains.length,
      mesuresDisponibles: mesures.length > 0,
      trains,
      note: mesures.length === 0 ? "Les mesures de remplissage ne sont pas encore calculées pour ce jour." : undefined,
    },
    sources: [
      { outil: "remplissage_dessertes", libelle: `Remplissage du ${date}`, detail: `${trains.length} circulations`, lien: "/gestion/places" },
    ],
  }
}

async function caissesAViser(ctx: QueryCtx): Promise<Resultat> {
  const caisses = await ctx.db
    .query("cashSessions")
    .withIndex("by_status", (q) => q.eq("status", "cloturee"))
    .take(200)
  const lignes = await Promise.all(
    caisses.map(async (caisse) => {
      const [vendeur, point] = await Promise.all([ctx.db.get(caisse.sellerId), ctx.db.get(caisse.pointOfSaleId)])
      return {
        vendeur: nomAffiche(vendeur),
        pointDeVente: point?.name ?? "—",
        clotureeLe: caisse.closedAt
          ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Africa/Libreville" }).format(caisse.closedAt)
          : null,
        ecartFcfa: caisse.varianceXaf ?? 0,
        recomptageDemande: caisse.recountRequestedAt !== undefined,
      }
    })
  )
  return {
    ok: true,
    donnees: { aViser: lignes.length, caisses: lignes, avecEcart: lignes.filter((ligne) => ligne.ecartFcfa !== 0).length },
    sources: [{ outil: "caisses_a_viser", libelle: "Caisses clôturées à viser", detail: `${lignes.length} caisses`, lien: "/gestion/recettes" }],
  }
}

async function incidentsOuverts(ctx: QueryCtx): Promise<Resultat> {
  const [ouverts, enCours] = await Promise.all([
    ctx.db.query("incidents").withIndex("by_status", (q) => q.eq("status", "ouvert")).take(200),
    ctx.db.query("incidents").withIndex("by_status", (q) => q.eq("status", "en_cours")).take(200),
  ])
  const maintenant = Date.now()
  const lignes = [...ouverts, ...enCours]
    .sort((a, b) => b.reportedAt - a.reportedAt)
    .map((incident) => ({
      reference: incident.number ?? "—",
      gravite: incident.severity,
      categorie: incident.category,
      statut: incident.status,
      lieu: incident.location ?? null,
      ancienneteHeures: Math.round((maintenant - incident.reportedAt) / 3_600_000),
      description: incident.description.slice(0, 160),
    }))
  return {
    ok: true,
    donnees: { total: lignes.length, critiques: lignes.filter((ligne) => ligne.gravite === "critique").length, incidents: lignes.slice(0, 30) },
    sources: [{ outil: "incidents_ouverts", libelle: "Incidents non résolus", detail: `${lignes.length} incidents`, lien: "/gestion/incidents" }],
  }
}

async function operationsFret(ctx: QueryCtx): Promise<Resultat> {
  const jeu = await ctx.db
    .query("fretDatasets")
    .withIndex("by_key", (q) => q.eq("datasetKey", FRET_DEMO_DATASET_KEY))
    .unique()
  if (!jeu || !jeu.isActive) {
    return { ok: true, donnees: { operations: [], message: "Aucune opération fret disponible." }, sources: [] }
  }
  const operations = await ctx.db
    .query("fretOperations")
    .withIndex("by_dataset_departure", (q) => q.eq("datasetId", jeu._id))
    .collect()
  return {
    ok: true,
    donnees: {
      synthetique: jeu.dataOrigin === "synthetic_demo",
      jeu: jeu.label,
      operations: operations.map((operation) => ({
        code: operation.operationCode,
        train: operation.trainNumber,
        marchandise: operation.cargoLabel,
        trajet: `${operation.origin} → ${operation.destination}`,
        position: operation.currentLocation,
        progressionPct: operation.routeProgressPct,
        statut: operation.status,
        quantite: `${new Intl.NumberFormat("fr-FR").format(operation.quantity)} ${operation.quantityUnit}`,
        securite: operation.safetyStatus,
        documents: operation.documentStatus,
      })),
    },
    sources: [{ outil: "operations_fret", libelle: jeu.label, detail: `${operations.length} opérations`, lien: "/fret" }],
  }
}

const OT_OUVERTS = ["demande", "planifie", "en_cours"] as const

async function otEnRetard(ctx: QueryCtx): Promise<Resultat> {
  const maintenant = Date.now()
  const ouverts = (
    await Promise.all(
      OT_OUVERTS.map((statut) =>
        ctx.db
          .query("gmaoOrdresTravail")
          .withIndex("by_statut", (q) => q.eq("statut", statut))
          .take(500)
      )
    )
  ).flat()
  const retards = ouverts
    .filter((ot) => ot.finPrevue !== undefined && ot.finPrevue < maintenant)
    .sort((a, b) => (a.finPrevue ?? 0) - (b.finPrevue ?? 0))
  const engins = await Promise.all(retards.slice(0, 25).map((ot) => ctx.db.get(ot.equipementId)))
  const jour = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Africa/Libreville" })
  return {
    ok: true,
    donnees: {
      otOuverts: ouverts.length,
      enRetard: retards.length,
      immobilisants: ouverts.filter((ot) => ot.immobilisant).length,
      ordres: retards.slice(0, 25).map((ot, index) => ({
        numero: ot.numero,
        titre: ot.titre,
        engin: engins[index]?.numero ?? "—",
        priorite: ot.priorite,
        statut: ot.statut,
        finPrevue: ot.finPrevue ? jour.format(ot.finPrevue) : null,
        retardJours: ot.finPrevue ? Math.floor((maintenant - ot.finPrevue) / 86_400_000) : null,
        immobilisant: ot.immobilisant,
      })),
    },
    sources: [
      { outil: "ot_en_retard", libelle: "Ordres de travail GMAO", detail: `${retards.length} en retard sur ${ouverts.length} ouverts`, lien: "/materiel" },
    ],
  }
}

async function documentsGed(ctx: QueryCtx, entree: Record<string, unknown>): Promise<Resultat> {
  const recherche = typeof entree.recherche === "string" ? normaliser(entree.recherche).trim().slice(0, 200) : ""
  if (!recherche) return { ok: false, message: "Précise des mots-clés." }
  const droits = await droitsGed(ctx)
  const candidats = await ctx.db
    .query("gedDocuments")
    .withSearchIndex("recherche", (q) => q.search("texteRecherche", recherche))
    .take(30)
  const accessibles = await filtrerVisibles(ctx, droits, candidats)
  const visibles = accessibles.slice(0, 8)
  return {
    ok: true,
    donnees: {
      trouvees: accessibles.length,
      nonAccessibles: candidats.length - accessibles.length,
      pieces: visibles.map((piece) => ({
        reference: piece.reference,
        titre: piece.titre,
        type: piece.type,
        statut: piece.statut,
        date: piece.dateDocument,
        classification: piece.classification,
        demonstration: piece.origine === "demo",
      })),
    },
    sources: visibles.map((piece) => ({
      outil: "rechercher_documents",
      libelle: `${piece.reference} — ${piece.titre}`,
      lien: `/bureautique/documents/${piece._id}`,
    })),
  }
}

async function monParapheur(ctx: QueryCtx): Promise<Resultat> {
  const droits = await droitsGed(ctx)
  const etapes = await ctx.db
    .query("gedEtapes")
    .withIndex("by_assigne_statut", (q) => q.eq("assigneId", droits.user._id).eq("statut", "en_attente"))
    .collect()
  const pieces = await Promise.all(etapes.map((etape) => ctx.db.get(etape.documentId)))
  const courriers = await ctx.db.query("gedCourriers").withIndex("by_enregistre").order("desc").take(2_000)
  const aujourdhui = jourLibreville(Date.now())
  const retards = courriers.filter((courrier) => courrierEnRetard(courrier, aujourdhui))
  const sources: SourceCopilot[] = [
    { outil: "mon_parapheur", libelle: "Mon parapheur", detail: `${etapes.length} étapes en attente`, lien: "/bureautique/parapheur" },
  ]
  if (retards.length > 0) {
    sources.push({ outil: "mon_parapheur", libelle: "Registre du courrier", detail: `${retards.length} en retard`, lien: "/bureautique/courrier" })
  }
  return {
    ok: true,
    donnees: {
      enAttente: etapes.map((etape, index) => ({
        nature: etape.nature,
        etape: etape.libelle,
        piece: pieces[index] ? `${pieces[index]!.reference} — ${pieces[index]!.titre}` : "—",
        depuisJours: etape.ouverteLe ? Math.floor((Date.now() - etape.ouverteLe) / 86_400_000) : null,
      })),
      courriersEnRetard: retards.slice(0, 10).map((courrier) => ({
        numero: courrier.numero,
        objet: courrier.objet,
        correspondant: courrier.correspondant,
        echeance: courrier.echeanceReponse,
        direction: courrier.directionAffectee,
      })),
      totalCourriersEnRetard: retards.length,
    },
    sources,
  }
}

async function rechercherEtudes(ctx: QueryCtx, entree: Record<string, unknown>): Promise<Resultat> {
  const recherche = typeof entree.recherche === "string" ? entree.recherche.trim().slice(0, 200) : ""
  if (recherche.length < 2) return { ok: false, message: "Précise des mots-clés." }
  const sections = await ctx.db
    .query("etudesSections")
    .withSearchIndex("recherche", (q) => q.search("texte", recherche))
    .take(6)
  const resultats = []
  for (const section of sections) {
    const document = await ctx.db.get(section.documentId)
    if (!document) continue
    resultats.push({ document, section })
  }
  return {
    ok: true,
    donnees: {
      extraits: resultats.map(({ document, section }) => ({
        etude: document.titre,
        section: section.titre,
        extrait: extrait(section.texte, recherche, 600),
      })),
      rappel: "Études internes de cadrage : elles ne valent pas texte officiel.",
    },
    sources: resultats.map(({ document, section }) => ({
      outil: "rechercher_etudes",
      libelle: `${document.titre} — ${section.titre}`,
      lien: `/etudes/${document.code}#${section.ancre}`,
    })),
  }
}

async function planActions(ctx: QueryCtx, entree: Record<string, unknown>): Promise<Resultat> {
  const filtre = entree.filtre === "toutes" || entree.filtre === "en_retard" ? entree.filtre : "ouvertes"
  const constats = await ctx.db.query("etudesConstats").collect()
  const aujourdhui = jourLibreville(Date.now())
  const retenus = constats.filter((constat) =>
    filtre === "toutes" ? true : filtre === "en_retard" ? constatEnRetard(constat, aujourdhui) : constatOuvert(constat.statut)
  )
  const responsables = await Promise.all(retenus.map((constat) => ctx.db.get(constat.responsableId)))
  return {
    ok: true,
    donnees: {
      filtre,
      total: retenus.length,
      actions: retenus.slice(0, 25).map((constat, index) => ({
        reference: constat.reference,
        titre: constat.titre,
        gravite: constat.gravite,
        statut: constat.statut,
        avancementPct: constat.avancement,
        echeance: constat.echeance,
        enRetard: constatEnRetard(constat, aujourdhui),
        responsable: nomAffiche(responsables[index]),
        direction: constat.direction,
        demonstration: constat.origine === "demo",
      })),
    },
    sources: [{ outil: "plan_actions_audit", libelle: "Plan d'actions d'audit", detail: `${retenus.length} actions (${filtre})`, lien: "/etudes/plan-actions" }],
  }
}

/**
 * Exécute un outil de lecture pour l'agent authentifié (identité propagée
 * par l'action). Les droits sont revérifiés ici, outil par outil : une liste
 * d'outils périmée côté modèle n'ouvre jamais une donnée fermée.
 */
export const executer = internalQuery({
  args: { nom: v.string(), entreeJson: v.string() },
  handler: async (
    ctx,
    args
  ): Promise<{ ok: true; donneesJson: string; sources: SourceCopilot[] } | { ok: false; message: string }> => {
    const resultat = await executerOutil(ctx, args)
    return resultat.ok
      ? { ok: true, donneesJson: JSON.stringify(resultat.donnees), sources: resultat.sources }
      : resultat
  },
})

async function executerOutil(ctx: QueryCtx, args: { nom: string; entreeJson: string }): Promise<Resultat> {
  const user = await requireUser(ctx)
  const outil = outilParNom(args.nom)
  if (!outil || outil.requiresApproval || outil.name === "hors_perimetre") {
    return { ok: false, message: "Outil inconnu ou non exécutable en lecture." }
  }
  if (!(await outilOuvert(ctx, user, outil))) {
    return { ok: false, message: `Accès refusé : ce compte n'a pas le droit « ${outil.droitRequis} ».` }
  }
  let entree: Record<string, unknown> = {}
  try {
    const lue = JSON.parse(args.entreeJson) as unknown
    if (lue && typeof lue === "object" && !Array.isArray(lue)) entree = lue as Record<string, unknown>
  } catch {
    return { ok: false, message: "Paramètres illisibles." }
  }
  switch (outil.name) {
    case "ventes_du_jour":
      return await ventesDuJour(ctx, entree)
    case "remplissage_dessertes":
      return await remplissage(ctx, entree)
    case "caisses_a_viser":
      return await caissesAViser(ctx)
    case "incidents_ouverts":
      return await incidentsOuverts(ctx)
    case "operations_fret":
      return await operationsFret(ctx)
    case "ot_en_retard":
      return await otEnRetard(ctx)
    case "rechercher_documents":
      return await documentsGed(ctx, entree)
    case "mon_parapheur":
      return await monParapheur(ctx)
    case "rechercher_etudes":
      return await rechercherEtudes(ctx, entree)
    case "plan_actions_audit":
      return await planActions(ctx, entree)
    default:
      return { ok: false, message: "Outil non disponible." }
  }
}
