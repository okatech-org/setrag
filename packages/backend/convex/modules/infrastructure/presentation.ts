import type { Doc, Id } from "../../_generated/dataModel"
import type { QueryCtx } from "../../_generated/server"
import { nomAgent } from "./acces"
import {
  ajouterMois,
  anomalieEnRetard,
  anomalieOuverte,
  bornesJourLibreville,
  circulationImpactee,
  HEURE,
  JOUR,
  LIBELLES_CATEGORIE_ANOMALIE,
  LIBELLES_CATEGORIE_EQUIPEMENT,
  LIBELLES_COTATION,
  LIBELLES_ETAT_EQUIPEMENT,
  LIBELLES_ETAT_VOIE,
  LIBELLES_GRAVITE,
  LIBELLES_STATUT_ANOMALIE,
  LIBELLES_STATUT_INTERVENTION,
  LIBELLES_STATUT_LTV,
  LIBELLES_TYPE_INTERVENTION,
  LIBELLES_TYPE_OUVRAGE,
  LIBELLES_TYPE_TRAVERSE,
  maintenanceEnRetard,
  perteTempsLtvMinutes,
  plagesSeChevauchent,
  prochaineMaintenance,
  type Plage,
} from "./model"

/**
 * Mise en forme des dossiers pour l'affichage : noms d'agents résolus,
 * libellés de section, indicateurs calculés. Les requêtes ne renvoient que
 * des objets déjà prêts à afficher.
 */

export interface Contexte {
  ctx: QueryCtx
  maintenant: number
  sections: Doc<"infraSections">[]
  sectionParId: Map<string, Doc<"infraSections">>
  nom: (id: Id<"users"> | undefined) => Promise<string | null>
}

export async function creerContexte(ctx: QueryCtx): Promise<Contexte> {
  const sections = await ctx.db
    .query("infraSections")
    .withIndex("by_pk")
    .collect()
  const cache = new Map<string, Promise<string | null>>()
  return {
    ctx,
    maintenant: Date.now(),
    sections,
    sectionParId: new Map(sections.map((section) => [section._id, section])),
    nom: (id) => {
      if (!id) return Promise.resolve(null)
      let resultat = cache.get(id)
      if (!resultat) {
        resultat = ctx.db.get(id).then(nomAgent)
        cache.set(id, resultat)
      }
      return resultat
    },
  }
}

export function libelleSection(
  c: Contexte,
  sectionId: Id<"infraSections"> | undefined
): string | null {
  if (!sectionId) return null
  return c.sectionParId.get(sectionId)?.libelle ?? null
}

/** Rattachement à une section : par identifiant, ou par PK à défaut. */
export function dansSection(
  section: Doc<"infraSections">,
  objet: { sectionId?: Id<"infraSections">; pk: number }
): boolean {
  if (objet.sectionId) return objet.sectionId === section._id
  return objet.pk >= section.pkDebut && objet.pk <= section.pkFin
}

export function recoupe(
  a: { pkDebut: number; pkFin: number },
  b: { pkDebut: number; pkFin: number }
): boolean {
  return plagesSeChevauchent(
    { debut: a.pkDebut, fin: a.pkFin },
    { debut: b.pkDebut, fin: b.pkFin }
  )
}

/* ─────────────────────────── Chronologie ──────────────────────────────── */

export async function chronologie(
  c: Contexte,
  entite: Doc<"infraEvenements">["entite"],
  entiteId: string
) {
  const evenements = await c.ctx.db
    .query("infraEvenements")
    .withIndex("by_entite", (q) => q.eq("entite", entite).eq("entiteId", entiteId))
    .order("desc")
    .take(200)
  return await Promise.all(
    evenements.map(async (evenement) => ({
      id: evenement._id,
      type: evenement.type,
      libelle: evenement.libelle,
      detail: evenement.detail ?? null,
      auteurNom: await c.nom(evenement.auteurId),
      creeLe: evenement.creeLe,
    }))
  )
}

/* ─────────────────────────── Sections ─────────────────────────────────── */

export function presenterSection(
  c: Contexte,
  section: Doc<"infraSections">,
  ltvActives: readonly Doc<"infraLtv">[],
  anomaliesOuvertes: readonly Doc<"infraAnomalies">[],
  ouvrages: readonly Doc<"infraOuvrages">[]
) {
  const ltv = ltvActives.filter((l) => recoupe(l, section))
  const vitesses = ltv.map((l) => l.vitesseKmh)
  return {
    id: section._id,
    code: section.code,
    libelle: section.libelle,
    pkDebut: section.pkDebut,
    pkFin: section.pkFin,
    longueurKm: section.pkFin - section.pkDebut,
    district: section.district,
    brigade: section.brigade,
    vitesseNominaleKmh: section.vitesseNominaleKmh,
    vitesseLimiteKmh: Math.min(section.vitesseNominaleKmh, ...vitesses),
    typeTraverse: section.typeTraverse,
    typeTraverseLibelle: LIBELLES_TYPE_TRAVERSE[section.typeTraverse],
    partBetonPct: section.partBetonPct,
    armement: section.armement,
    etat: section.etat,
    etatLibelle: LIBELLES_ETAT_VOIE[section.etat],
    noteEtat: section.noteEtat ?? null,
    derniereAuscultationLe: section.derniereAuscultationLe ?? null,
    anomaliesOuvertes: anomaliesOuvertes.filter((a) => dansSection(section, a)).length,
    ltvActives: ltv.length,
    ouvrages: ouvrages.filter((o) => dansSection(section, o)).length,
    majLe: section.majLe,
    gareDebutId: section.gareDebutId ?? null,
    gareFinId: section.gareFinId ?? null,
  }
}

/* ─────────────────────────── Anomalies ────────────────────────────────── */

export async function presenterAnomalie(c: Contexte, anomalie: Doc<"infraAnomalies">) {
  return {
    id: anomalie._id,
    numero: anomalie.numero,
    pk: anomalie.pk,
    sectionId: anomalie.sectionId ?? null,
    sectionLibelle: libelleSection(c, anomalie.sectionId),
    categorie: anomalie.categorie,
    categorieLibelle: LIBELLES_CATEGORIE_ANOMALIE[anomalie.categorie],
    gravite: anomalie.gravite,
    graviteLibelle: LIBELLES_GRAVITE[anomalie.gravite],
    description: anomalie.description,
    statut: anomalie.statut,
    statutLibelle: LIBELLES_STATUT_ANOMALIE[anomalie.statut],
    ouverte: anomalieOuverte(anomalie.statut),
    signaleLe: anomalie.signaleLe,
    signaleParId: anomalie.signaleParId ?? null,
    signaleParNom: await c.nom(anomalie.signaleParId),
    echeanceLe: anomalie.echeanceLe,
    enRetard: anomalieEnRetard(anomalie, c.maintenant),
    brigade: anomalie.brigade ?? null,
    nbPhotos: anomalie.photoIds.length,
    ouvrageId: anomalie.ouvrageId ?? null,
    equipementId: anomalie.equipementId ?? null,
    incidentId: anomalie.incidentId ?? null,
    ltvId: anomalie.ltvId ?? null,
    interventionId: anomalie.interventionId ?? null,
    majLe: anomalie.majLe,
  }
}

/* ─────────────────────────── LTV ──────────────────────────────────────── */

export async function presenterLtv(c: Contexte, ltv: Doc<"infraLtv">) {
  const anomalie = ltv.anomalieId ? await c.ctx.db.get(ltv.anomalieId) : null
  const longueurKm = Math.round((ltv.pkFin - ltv.pkDebut) * 1000) / 1000
  return {
    id: ltv._id,
    numero: ltv.numero,
    pkDebut: ltv.pkDebut,
    pkFin: ltv.pkFin,
    longueurKm,
    sectionId: ltv.sectionId ?? null,
    sectionLibelle: libelleSection(c, ltv.sectionId),
    vitesseKmh: ltv.vitesseKmh,
    vitesseNominaleKmh: ltv.vitesseNominaleKmh,
    perteTempsMinutes: perteTempsLtvMinutes({
      longueurKm,
      vitesseKmh: ltv.vitesseKmh,
      vitesseNominaleKmh: ltv.vitesseNominaleKmh,
    }),
    motif: ltv.motif,
    anomalieId: ltv.anomalieId ?? null,
    anomalieNumero: anomalie?.numero ?? null,
    statut: ltv.statut,
    statutLibelle: LIBELLES_STATUT_LTV[ltv.statut],
    debutLe: ltv.debutLe,
    finPrevueLe: ltv.finPrevueLe ?? null,
    echeanceDepassee:
      ltv.statut === "active" &&
      ltv.finPrevueLe !== undefined &&
      ltv.finPrevueLe < c.maintenant,
    poseeParNom: await c.nom(ltv.poseeParId),
    leveeLe: ltv.leveeLe ?? null,
    leveeParNom: await c.nom(ltv.leveeParId),
    motifLevee: ltv.motifLevee ?? null,
    majLe: ltv.majLe,
  }
}

/* ─────────────────────────── Ouvrages ─────────────────────────────────── */

export function presenterOuvrage(
  c: Contexte,
  ouvrage: Doc<"infraOuvrages">,
  anomaliesOuvertes = 0
) {
  return {
    id: ouvrage._id,
    code: ouvrage.code,
    nom: ouvrage.nom,
    type: ouvrage.type,
    typeLibelle: LIBELLES_TYPE_OUVRAGE[ouvrage.type],
    pk: ouvrage.pk,
    sectionId: ouvrage.sectionId ?? null,
    sectionLibelle: libelleSection(c, ouvrage.sectionId),
    longueurM: ouvrage.longueurM,
    materiau: ouvrage.materiau,
    anneeConstruction: ouvrage.anneeConstruction,
    franchissement: ouvrage.franchissement ?? null,
    cotation: ouvrage.cotation,
    cotationLibelle: LIBELLES_COTATION[ouvrage.cotation],
    surveillanceRenforcee: ouvrage.surveillanceRenforcee,
    periodiciteMois: ouvrage.periodiciteMois,
    derniereInspectionLe: ouvrage.derniereInspectionLe ?? null,
    prochaineInspectionLe: ouvrage.prochaineInspectionLe,
    inspectionEnRetard: ouvrage.prochaineInspectionLe < c.maintenant,
    anomaliesOuvertes,
    majLe: ouvrage.majLe,
  }
}

export async function presenterInspectionResume(
  c: Contexte,
  inspection: Doc<"infraInspections">
) {
  return {
    id: inspection._id,
    numero: inspection.numero,
    ouvrageId: inspection.ouvrageId,
    type: inspection.type,
    dateInspection: inspection.dateInspection,
    inspecteurId: inspection.inspecteurId ?? null,
    inspecteurNom: inspection.inspecteurNom,
    cotationAvant: inspection.cotationAvant,
    cotationProposee: inspection.cotationProposee,
    statut: inspection.statut,
    statutLibelle: inspection.statut === "validee" ? "Validée" : "Brouillon",
    valideParNom: await c.nom(inspection.valideParId),
    valideLe: inspection.valideLe ?? null,
    nbDesordres: inspection.desordres.length,
  }
}

/** Prochaine inspection théorique après une inspection donnée. */
export function prochaineInspectionApres(dateInspection: number, periodiciteMois: number) {
  return ajouterMois(dateInspection, periodiciteMois)
}

/* ─────────────────────────── Équipements ──────────────────────────────── */

export function presenterEquipement(c: Contexte, equipement: Doc<"infraEquipements">) {
  return {
    id: equipement._id,
    code: equipement.code,
    libelle: equipement.libelle,
    categorie: equipement.categorie,
    categorieLibelle: LIBELLES_CATEGORIE_EQUIPEMENT[equipement.categorie],
    type: equipement.type,
    pk: equipement.pk,
    pkFin: equipement.pkFin ?? null,
    sectionId: equipement.sectionId ?? null,
    sectionLibelle: libelleSection(c, equipement.sectionId),
    etat: equipement.etat,
    etatLibelle: LIBELLES_ETAT_EQUIPEMENT[equipement.etat],
    alimentation: equipement.alimentation ?? null,
    derniereMaintenanceLe: equipement.derniereMaintenanceLe ?? null,
    periodiciteJours: equipement.periodiciteJours,
    prochaineMaintenanceLe: prochaineMaintenance(
      equipement.derniereMaintenanceLe,
      equipement.periodiciteJours
    ),
    maintenanceEnRetard: maintenanceEnRetard(
      equipement.derniereMaintenanceLe,
      equipement.periodiciteJours,
      c.maintenant
    ),
    notes: equipement.notes ?? null,
    majLe: equipement.majLe,
  }
}

/* ─────────────────────────── Interventions ────────────────────────────── */

export async function presenterIntervention(
  c: Contexte,
  intervention: Doc<"infraInterventions">
) {
  const [chantier, anomalie] = await Promise.all([
    intervention.chantierId ? c.ctx.db.get(intervention.chantierId) : null,
    intervention.anomalieId ? c.ctx.db.get(intervention.anomalieId) : null,
  ])
  const jour = bornesJourLibreville(c.maintenant)
  return {
    id: intervention._id,
    numero: intervention.numero,
    libelle: intervention.libelle,
    type: intervention.type,
    typeLibelle: LIBELLES_TYPE_INTERVENTION[intervention.type],
    pkDebut: intervention.pkDebut,
    pkFin: intervention.pkFin,
    debutLe: intervention.debutLe,
    finLe: intervention.finLe,
    dureeHeures:
      Math.round(((intervention.finLe - intervention.debutLe) / HEURE) * 10) / 10,
    interruption: intervention.interruption,
    equipe: intervention.equipe,
    statut: intervention.statut,
    statutLibelle: LIBELLES_STATUT_INTERVENTION[intervention.statut],
    chantierId: intervention.chantierId ?? null,
    chantierCode: chantier?.code ?? null,
    anomalieId: intervention.anomalieId ?? null,
    anomalieNumero: anomalie?.numero ?? null,
    demandeurId: intervention.demandeurId ?? null,
    demandeurNom: await c.nom(intervention.demandeurId),
    demandeLe: intervention.demandeLe,
    accordeParNom: await c.nom(intervention.accordeParId),
    accordeLe: intervention.accordeLe ?? null,
    motifRefus: intervention.motifRefus ?? null,
    compteRendu: intervention.compteRendu ?? null,
    aujourdHui: plagesSeChevauchent(
      { debut: intervention.debutLe, fin: intervention.finLe },
      jour
    ),
    majLe: intervention.majLe,
  }
}

/* ─────────────────────────── Trains impactés ──────────────────────────── */

export interface TrainImpacte {
  id: Id<"trips">
  trainNumber: string
  trainType: Doc<"trips">["trainType"]
  serviceDate: string
  departureAt: number
  arrivalAt: number
  origine: string
  destination: string
  statut: Doc<"trips">["status"]
}

/** Circulation la plus longue envisagée : sert à élargir la fenêtre de lecture. */
const DUREE_MAX_CIRCULATION_MS = 2 * JOUR

/**
 * Circulations dont le parcours recoupe la plage PK pendant la fenêtre
 * [depuis, jusqua) — et le créneau s'il est fourni. Les trains supprimés
 * sont ignorés.
 */
export async function trainsImpactes(
  ctx: QueryCtx,
  params: { plage: Plage; depuis: number; jusqua: number; creneau?: Plage; limite?: number }
): Promise<TrainImpacte[]> {
  const trips = await ctx.db
    .query("trips")
    .withIndex("by_departure", (q) =>
      q
        .gte("departureAt", params.depuis - DUREE_MAX_CIRCULATION_MS)
        .lt("departureAt", params.jusqua)
    )
    .collect()
  if (trips.length === 0) return []
  const stations = await ctx.db.query("stations").collect()
  const gares = new Map(stations.map((station) => [station._id, station]))
  const resultat: TrainImpacte[] = []
  for (const trip of trips) {
    if (trip.status === "annule") continue
    if (trip.arrivalAt <= params.depuis) continue
    const origine = gares.get(trip.originStationId)
    const destination = gares.get(trip.destinationStationId)
    if (!origine || !destination) continue
    const impacte = circulationImpactee(
      {
        pkOrigine: origine.kilometerPoint,
        pkDestination: destination.kilometerPoint,
        departureAt: trip.departureAt,
        arrivalAt: trip.arrivalAt,
      },
      params.plage,
      params.creneau
    )
    if (!impacte) continue
    resultat.push({
      id: trip._id,
      trainNumber: trip.trainNumber,
      trainType: trip.trainType,
      serviceDate: trip.serviceDate,
      departureAt: trip.departureAt,
      arrivalAt: trip.arrivalAt,
      origine: origine.name,
      destination: destination.name,
      statut: trip.status,
    })
    if (resultat.length >= (params.limite ?? 300)) break
  }
  return resultat
}
