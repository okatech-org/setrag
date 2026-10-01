import { defineTable } from "convex/server"
import { v } from "convex/values"

/**
 * Tables du module Infrastructures ferroviaires et travaux PRN.
 *
 * Tout objet de la voie est repéré par son point kilométrique (PK) depuis
 * Owendo, comme les gares du référentiel (`stations.kilometerPoint`). Les
 * numéros lisibles (AN-2026-0031, LTV-2026-004…) sont tirés de la table
 * partagée `sequences`, sous des clés préfixées `infra:`.
 */

export const infraEtatVoieValidator = v.union(
  v.literal("bon"),
  v.literal("moyen"),
  v.literal("degrade"),
  v.literal("critique")
)

export const infraTypeTraverseValidator = v.union(
  v.literal("bois"),
  v.literal("beton_bibloc"),
  v.literal("mixte")
)

export const infraTypeOuvrageValidator = v.union(
  v.literal("pont"),
  v.literal("viaduc"),
  v.literal("tunnel"),
  v.literal("buse"),
  v.literal("dalot"),
  v.literal("mur_soutenement"),
  v.literal("tranchee")
)

/** Cotation IQOA : 1, 2, 2E, 3, 3U — de « bon état » à « urgence ». */
export const infraCotationValidator = v.union(
  v.literal("1"),
  v.literal("2"),
  v.literal("2E"),
  v.literal("3"),
  v.literal("3U")
)

export const infraTypeInspectionValidator = v.union(
  v.literal("visite_annuelle"),
  v.literal("inspection_detaillee"),
  v.literal("inspection_exceptionnelle")
)

export const infraCategorieEquipementValidator = v.union(
  v.literal("signalisation"),
  v.literal("passage_niveau"),
  v.literal("telecoms")
)

export const infraEtatEquipementValidator = v.union(
  v.literal("en_service"),
  v.literal("degrade"),
  v.literal("hors_service")
)

export const infraCategorieAnomalieValidator = v.union(
  v.literal("rail"),
  v.literal("traverses"),
  v.literal("ballast"),
  v.literal("geometrie"),
  v.literal("talus"),
  v.literal("ouvrage"),
  v.literal("signalisation"),
  v.literal("passage_niveau"),
  v.literal("telecoms"),
  v.literal("vegetation"),
  v.literal("autre")
)

export const infraGraviteValidator = v.union(
  v.literal("faible"),
  v.literal("moyenne"),
  v.literal("elevee"),
  v.literal("critique")
)

export const infraStatutAnomalieValidator = v.union(
  v.literal("signalee"),
  v.literal("prise_en_charge"),
  v.literal("traitee"),
  v.literal("close"),
  v.literal("rejetee")
)

export const infraStatutLtvValidator = v.union(
  v.literal("active"),
  v.literal("levee")
)

export const infraNatureChantierValidator = v.union(
  v.literal("renouvellement_voie"),
  v.literal("traverses_beton"),
  v.literal("ballast"),
  v.literal("ouvrage_art"),
  v.literal("stabilisation_talus"),
  v.literal("signalisation"),
  v.literal("telecoms"),
  v.literal("assainissement")
)

export const infraStatutChantierValidator = v.union(
  v.literal("etude"),
  v.literal("en_cours"),
  v.literal("suspendu"),
  v.literal("receptionne")
)

export const infraBailleurValidator = v.union(
  v.literal("afd"),
  v.literal("sfi"),
  v.literal("proparco"),
  v.literal("ue"),
  v.literal("meridiam"),
  v.literal("etat"),
  v.literal("setrag")
)

export const infraTypeInterventionValidator = v.union(
  v.literal("entretien_voie"),
  v.literal("prn"),
  v.literal("ouvrage"),
  v.literal("signalisation"),
  v.literal("telecoms"),
  v.literal("debroussaillage")
)

export const infraStatutInterventionValidator = v.union(
  v.literal("demandee"),
  v.literal("accordee"),
  v.literal("en_cours"),
  v.literal("terminee"),
  v.literal("annulee"),
  v.literal("refusee")
)

export const infraEntiteValidator = v.union(
  v.literal("section"),
  v.literal("ouvrage"),
  v.literal("inspection"),
  v.literal("equipement"),
  v.literal("anomalie"),
  v.literal("ltv"),
  v.literal("chantier"),
  v.literal("intervention")
)

export const infrastructureTables = {
  /** Section de voie entre deux gares : le canton de surveillance d'une brigade. */
  infraSections: defineTable({
    code: v.string(),
    libelle: v.string(),
    pkDebut: v.number(),
    pkFin: v.number(),
    gareDebutId: v.optional(v.id("stations")),
    gareFinId: v.optional(v.id("stations")),
    district: v.string(),
    brigade: v.string(),
    vitesseNominaleKmh: v.number(),
    typeTraverse: infraTypeTraverseValidator,
    /** Part de traverses béton bibloc posées, 0 → 100. */
    partBetonPct: v.number(),
    armement: v.string(),
    etat: infraEtatVoieValidator,
    noteEtat: v.optional(v.string()),
    derniereAuscultationLe: v.optional(v.number()),
    majLe: v.number(),
  })
    .index("by_code", ["code"])
    .index("by_pk", ["pkDebut"]),

  /** Ouvrage d'art : pont, tunnel, buse, mur… */
  infraOuvrages: defineTable({
    code: v.string(),
    nom: v.string(),
    type: infraTypeOuvrageValidator,
    pk: v.number(),
    sectionId: v.optional(v.id("infraSections")),
    longueurM: v.number(),
    materiau: v.string(),
    anneeConstruction: v.number(),
    franchissement: v.optional(v.string()),
    cotation: infraCotationValidator,
    surveillanceRenforcee: v.boolean(),
    periodiciteMois: v.number(),
    derniereInspectionLe: v.optional(v.number()),
    prochaineInspectionLe: v.number(),
    majLe: v.number(),
  })
    .index("by_code", ["code"])
    .index("by_pk", ["pk"]),

  infraInspections: defineTable({
    numero: v.string(),
    ouvrageId: v.id("infraOuvrages"),
    type: infraTypeInspectionValidator,
    dateInspection: v.number(),
    inspecteurId: v.optional(v.id("users")),
    inspecteurNom: v.string(),
    constats: v.string(),
    desordres: v.array(
      v.object({
        partie: v.string(),
        description: v.string(),
        gravite: infraGraviteValidator,
      })
    ),
    cotationAvant: infraCotationValidator,
    cotationProposee: infraCotationValidator,
    recommandations: v.optional(v.string()),
    statut: v.union(v.literal("brouillon"), v.literal("validee")),
    valideParId: v.optional(v.id("users")),
    valideLe: v.optional(v.number()),
    creeLe: v.number(),
  })
    .index("by_numero", ["numero"])
    .index("by_ouvrage", ["ouvrageId", "dateInspection"])
    .index("by_date", ["dateInspection"]),

  /** Signalisation, passages à niveau, radio sol-train et fibre. */
  infraEquipements: defineTable({
    code: v.string(),
    libelle: v.string(),
    categorie: infraCategorieEquipementValidator,
    /** Précision : « Signal d'entrée », « PN automatique », « Relais VHF »… */
    type: v.string(),
    pk: v.number(),
    /** Fin du tronçon pour un équipement linéaire (fibre). */
    pkFin: v.optional(v.number()),
    sectionId: v.optional(v.id("infraSections")),
    etat: infraEtatEquipementValidator,
    alimentation: v.optional(v.string()),
    derniereMaintenanceLe: v.optional(v.number()),
    periodiciteJours: v.number(),
    notes: v.optional(v.string()),
    majLe: v.number(),
  })
    .index("by_code", ["code"])
    .index("by_categorie", ["categorie"]),

  /** Défaut constaté sur le terrain par une brigade ou un cantonnier. */
  infraAnomalies: defineTable({
    numero: v.string(),
    pk: v.number(),
    sectionId: v.optional(v.id("infraSections")),
    categorie: infraCategorieAnomalieValidator,
    gravite: infraGraviteValidator,
    description: v.string(),
    photoIds: v.array(v.id("_storage")),
    ouvrageId: v.optional(v.id("infraOuvrages")),
    equipementId: v.optional(v.id("infraEquipements")),
    incidentId: v.optional(v.id("incidents")),
    brigade: v.optional(v.string()),
    signaleParId: v.optional(v.id("users")),
    signaleLe: v.number(),
    /** Délai de traitement attendu, déduit de la gravité. */
    echeanceLe: v.number(),
    statut: infraStatutAnomalieValidator,
    priseEnChargeParId: v.optional(v.id("users")),
    priseEnChargeLe: v.optional(v.number()),
    traitement: v.optional(v.string()),
    traiteParId: v.optional(v.id("users")),
    traiteLe: v.optional(v.number()),
    closParId: v.optional(v.id("users")),
    closLe: v.optional(v.number()),
    motifRejet: v.optional(v.string()),
    ltvId: v.optional(v.id("infraLtv")),
    interventionId: v.optional(v.id("infraInterventions")),
    majLe: v.number(),
  })
    .index("by_numero", ["numero"])
    .index("by_statut", ["statut"])
    .index("by_pk", ["pk"])
    .index("by_signalement", ["signaleLe"]),

  /** Limitation temporaire de vitesse. */
  infraLtv: defineTable({
    numero: v.string(),
    pkDebut: v.number(),
    pkFin: v.number(),
    sectionId: v.optional(v.id("infraSections")),
    vitesseKmh: v.number(),
    vitesseNominaleKmh: v.number(),
    motif: v.string(),
    anomalieId: v.optional(v.id("infraAnomalies")),
    statut: infraStatutLtvValidator,
    debutLe: v.number(),
    finPrevueLe: v.optional(v.number()),
    poseeParId: v.optional(v.id("users")),
    leveeLe: v.optional(v.number()),
    leveeParId: v.optional(v.id("users")),
    motifLevee: v.optional(v.string()),
    majLe: v.number(),
  })
    .index("by_numero", ["numero"])
    .index("by_statut", ["statut", "pkDebut"]),

  /** Chantier du programme de remise à niveau (PRN). */
  infraChantiers: defineTable({
    code: v.string(),
    libelle: v.string(),
    description: v.string(),
    nature: infraNatureChantierValidator,
    pkDebut: v.number(),
    pkFin: v.number(),
    entreprise: v.string(),
    maitreOeuvre: v.string(),
    budgetFcfa: v.number(),
    financements: v.array(
      v.object({ bailleur: infraBailleurValidator, montantFcfa: v.number() })
    ),
    uniteQuantite: v.string(),
    quantitePrevue: v.number(),
    statut: infraStatutChantierValidator,
    debutLe: v.number(),
    finPrevueLe: v.number(),
    finReelleLe: v.optional(v.number()),
    responsableId: v.optional(v.id("users")),
    majLe: v.number(),
  })
    .index("by_code", ["code"])
    .index("by_statut", ["statut"]),

  /** Lot d'un chantier, confié à une entreprise. */
  infraLots: defineTable({
    chantierId: v.id("infraChantiers"),
    code: v.string(),
    libelle: v.string(),
    entreprise: v.string(),
    montantFcfa: v.number(),
    pkDebut: v.number(),
    pkFin: v.number(),
    quantitePrevue: v.number(),
  }).index("by_chantier", ["chantierId"]),

  /**
   * Situation d'avancement : quantité posée et montants de la période.
   * Seule une situation validée compte dans l'avancement publié aux bailleurs.
   */
  infraAvancements: defineTable({
    chantierId: v.id("infraChantiers"),
    lotId: v.optional(v.id("infraLots")),
    periode: v.string(),
    quantite: v.number(),
    montantTravauxFcfa: v.number(),
    montantPayeFcfa: v.number(),
    bailleur: v.optional(infraBailleurValidator),
    commentaire: v.optional(v.string()),
    statut: v.union(
      v.literal("saisie"),
      v.literal("validee"),
      v.literal("rejetee")
    ),
    saisiParId: v.optional(v.id("users")),
    saisiLe: v.number(),
    valideParId: v.optional(v.id("users")),
    valideLe: v.optional(v.number()),
    motifRejet: v.optional(v.string()),
  })
    .index("by_chantier", ["chantierId", "saisiLe"])
    .index("by_statut", ["statut"]),

  infraJalons: defineTable({
    chantierId: v.id("infraChantiers"),
    libelle: v.string(),
    prevuLe: v.number(),
    atteintLe: v.optional(v.number()),
    /** Jalon dont l'atteinte déclenche un décaissement du bailleur. */
    conditionDecaissement: v.boolean(),
    bailleur: v.optional(infraBailleurValidator),
    preuve: v.optional(v.string()),
  }).index("by_chantier", ["chantierId", "prevuLe"]),

  /** Plage travaux : intervention planifiée sur une portion de voie. */
  infraInterventions: defineTable({
    numero: v.string(),
    libelle: v.string(),
    type: infraTypeInterventionValidator,
    pkDebut: v.number(),
    pkFin: v.number(),
    debutLe: v.number(),
    finLe: v.number(),
    /** Coupure de voie (aucune circulation) ou travaux sous circulation. */
    interruption: v.boolean(),
    equipe: v.string(),
    statut: infraStatutInterventionValidator,
    chantierId: v.optional(v.id("infraChantiers")),
    anomalieId: v.optional(v.id("infraAnomalies")),
    demandeurId: v.optional(v.id("users")),
    demandeLe: v.number(),
    accordeParId: v.optional(v.id("users")),
    accordeLe: v.optional(v.number()),
    motifRefus: v.optional(v.string()),
    compteRendu: v.optional(v.string()),
    majLe: v.number(),
  })
    .index("by_numero", ["numero"])
    .index("by_debut", ["debutLe"])
    .index("by_statut", ["statut"]),

  /** Chronologie de chaque dossier du module. */
  infraEvenements: defineTable({
    entite: infraEntiteValidator,
    entiteId: v.string(),
    type: v.string(),
    libelle: v.string(),
    detail: v.optional(v.string()),
    auteurId: v.optional(v.id("users")),
    creeLe: v.number(),
  }).index("by_entite", ["entite", "entiteId", "creeLe"]),
} as const
