/**
 * Jeux de données des tests du module (voie, anomalies, LTV, tableau de
 * bord). Formes calquées sur `presentation.ts` ; aucun écran ne les importe.
 */
import type { AccueilInfra, DossierAnomalie, DossierLtv, DossierSection, LigneAnomalie, LigneLtv, LigneSection } from "../commun"

export const MAINTENANT = Date.parse("2026-10-01T08:00:00+01:00")
const JOUR = 86_400_000

/** Surcharge libre d'un jeu de données : les identifiants restent des chaînes. */
type Surcharge<T> = { [K in keyof T]?: unknown }

export const GARES = [
  { id: "g0", code: "OWE", nom: "Owendo", km: 0, majeure: true },
  { id: "g1", code: "NDJ", nom: "Ndjolé", km: 182, majeure: true },
  { id: "g2", code: "BOO", nom: "Booué", km: 338, majeure: true },
  { id: "g3", code: "FCV", nom: "Franceville", km: 669, majeure: true },
]

export function droits(capacites: string[]) {
  return { peutEcrire: capacites.length > 0, capacites, partenaire: false, role: "agent_voie" }
}

export function accueil(surcharge: Partial<AccueilInfra["indicateurs"]> = {}, priorites: AccueilInfra["priorites"] = []): AccueilInfra {
  return {
    genereLe: MAINTENANT,
    indicateurs: {
      longueurKm: 669,
      partBetonPct: 62.4,
      nbSections: 12,
      sectionsParEtat: { bon: 6, moyen: 3, degrade: 2, critique: 1 },
      anomalies: { ouvertes: 9, parGravite: { critique: 1, elevee: 3, moyenne: 4, faible: 1 }, enRetard: 2, aClore: 1 },
      ltv: { actives: 3, kmSousLtv: 4.6, perteTempsMinutes: 11.5 },
      ouvrages: { total: 40, cotes3: 2, cotes3U: 1, inspectionsEnRetard: 4 },
      equipements: { total: 80, degrades: 3, horsService: 1, maintenancesEnRetard: 5 },
      prn: {
        chantiers: 6,
        chantiersEnCours: 4,
        budgetFcfa: 84_000_000_000,
        engageFcfa: 51_000_000_000,
        payeFcfa: 38_500_000_000,
        avancementPhysiquePct: 47.2,
        avancementFinancierPct: 45.8,
        jalonsEnRetard: 2,
      },
      ...surcharge,
    },
    priorites,
    ligne: {
      longueurKm: 669,
      gares: GARES,
      ltv: [{ id: "ltv1", numero: "LTV-2026-0007", pkDebut: 201.2, pkFin: 201.8, vitesseKmh: 30 }],
    },
  } as unknown as AccueilInfra
}

export function ligneAnomalie(surcharge: Surcharge<LigneAnomalie> = {}): LigneAnomalie {
  return {
    id: "an1",
    numero: "AN-2026-0042",
    pk: 201.4,
    sectionId: "s3",
    sectionLibelle: "Ndjolé – Booué",
    categorie: "rail",
    categorieLibelle: "Rail",
    gravite: "elevee",
    graviteLibelle: "Élevée",
    description: "Rail fissuré en file gauche, sortie de courbe.",
    statut: "signalee",
    statutLibelle: "Signalée",
    ouverte: true,
    signaleLe: MAINTENANT - 10 * JOUR,
    signaleParId: "u1",
    signaleParNom: "Jean Ndong",
    echeanceLe: MAINTENANT - 3 * JOUR,
    enRetard: true,
    brigade: "Brigade de Ndjolé",
    nbPhotos: 2,
    ouvrageId: null,
    equipementId: null,
    incidentId: null,
    ltvId: null,
    interventionId: null,
    majLe: MAINTENANT,
    ...surcharge,
  } as unknown as LigneAnomalie
}

export function dossierAnomalie(surcharge: Surcharge<DossierAnomalie["anomalie"]> = {}): DossierAnomalie {
  return {
    anomalie: {
      ...ligneAnomalie(),
      priseEnChargeParNom: null,
      priseEnChargeLe: null,
      traitement: null,
      traiteParId: null,
      traiteParNom: null,
      traiteLe: null,
      closParNom: null,
      closLe: null,
      motifRejet: null,
      ...surcharge,
    },
    photos: [{ id: "ph1", url: "https://stockage.test/ph1.jpg" }],
    ouvrage: null,
    equipement: null,
    incident: null,
    ltv: null,
    intervention: null,
    chronologie: [{ id: "ev1", type: "anomalie_signalee", libelle: "Anomalie élevée signalée au PK 201.4", detail: null, auteurNom: "Jean Ndong", creeLe: MAINTENANT - 10 * JOUR }],
  } as unknown as DossierAnomalie
}

export function ligneLtv(surcharge: Surcharge<LigneLtv> = {}): LigneLtv {
  return {
    id: "ltv1",
    numero: "LTV-2026-0007",
    pkDebut: 201.2,
    pkFin: 201.8,
    longueurKm: 0.6,
    sectionId: "s3",
    sectionLibelle: "Ndjolé – Booué",
    vitesseKmh: 30,
    vitesseNominaleKmh: 60,
    perteTempsMinutes: 1.6,
    motif: "Rail fissuré, en attente de remplacement.",
    anomalieId: "an1",
    anomalieNumero: "AN-2026-0042",
    statut: "active",
    statutLibelle: "Active",
    debutLe: MAINTENANT - 5 * JOUR,
    finPrevueLe: MAINTENANT - JOUR,
    echeanceDepassee: true,
    poseeParNom: "Paul Mba",
    leveeLe: null,
    leveeParNom: null,
    motifLevee: null,
    majLe: MAINTENANT,
    ...surcharge,
  } as unknown as LigneLtv
}

export function dossierLtv(surcharge: Surcharge<LigneLtv> = {}): DossierLtv {
  return {
    ltv: ligneLtv(surcharge),
    anomalie: null,
    trainsImpactes: [
      {
        id: "t1",
        trainNumber: "T401",
        trainType: "EXPRESS",
        serviceDate: "2026-10-02",
        departureAt: MAINTENANT + JOUR,
        arrivalAt: MAINTENANT + JOUR + 10 * 3_600_000,
        origine: "Owendo",
        destination: "Franceville",
        statut: "programme",
        perteTempsMinutes: 1.6,
      },
    ],
    perteTempsCumuleeMinutes: 1.6,
    chronologie: [],
  } as unknown as DossierLtv
}

export function ligneSection(surcharge: Surcharge<LigneSection> = {}): LigneSection {
  return {
    id: "s3",
    code: "S03",
    libelle: "Ndjolé – Booué",
    pkDebut: 182,
    pkFin: 338,
    longueurKm: 156,
    district: "District centre",
    brigade: "Brigade de Ndjolé",
    vitesseNominaleKmh: 60,
    vitesseLimiteKmh: 30,
    typeTraverse: "mixte",
    typeTraverseLibelle: "Mixte bois et béton",
    partBetonPct: 48,
    armement: "UIC 50",
    etat: "degrade",
    etatLibelle: "Dégradé",
    noteEtat: "Nivellement à reprendre.",
    derniereAuscultationLe: MAINTENANT - 40 * JOUR,
    anomaliesOuvertes: 3,
    ltvActives: 1,
    ouvrages: 4,
    majLe: MAINTENANT,
    gareDebutId: null,
    gareFinId: null,
    ...surcharge,
  } as unknown as LigneSection
}

export function dossierSection(): DossierSection {
  return {
    section: ligneSection(),
    ouvrages: [],
    equipements: [],
    anomalies: [ligneAnomalie()],
    ltv: [ligneLtv()],
    interventions: [],
    chantiers: [],
    chronologie: [],
  } as unknown as DossierSection
}
