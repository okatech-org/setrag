import { defineTable } from "convex/server"
import { v } from "convex/values"

/**
 * Tables du module Matériel roulant et GMAO ferroviaire.
 *
 * Le parc réutilise le référentiel existant : une voiture voyageurs porte
 * l'identifiant de sa `coaches`, une locomotive peut être affectée à un
 * `trains`, une visite avant départ vise un `trips`. Les numéros lisibles
 * (OT-2026-0042, DA-2026-0007, VT-2026-0118) sont tirés de la table
 * partagée `sequences`, sous des clés préfixées `gmao:`.
 */

export const gmaoFamilleValidator = v.union(
  v.literal("locomotive"),
  v.literal("voiture"),
  v.literal("wagon")
)

export const gmaoStatutEquipementValidator = v.union(
  v.literal("en_service"),
  v.literal("immobilise"),
  v.literal("en_atelier"),
  v.literal("reforme")
)

export const gmaoTypeOtValidator = v.union(
  v.literal("preventif"),
  v.literal("correctif"),
  v.literal("amelioratif")
)

export const gmaoOrigineOtValidator = v.union(
  v.literal("demande"),
  v.literal("plan"),
  v.literal("visite_technique"),
  v.literal("incident")
)

export const gmaoPrioriteValidator = v.union(
  v.literal("urgente"),
  v.literal("haute"),
  v.literal("normale"),
  v.literal("basse")
)

export const gmaoStatutOtValidator = v.union(
  v.literal("demande"),
  v.literal("planifie"),
  v.literal("en_cours"),
  v.literal("travaux_termines"),
  v.literal("cloture"),
  v.literal("annule")
)

export const gmaoSensMouvementValidator = v.union(
  v.literal("entree"),
  v.literal("sortie"),
  v.literal("ajustement")
)

export const gmaoStatutAchatValidator = v.union(
  v.literal("soumise"),
  v.literal("validee"),
  v.literal("commandee"),
  v.literal("recue"),
  v.literal("refusee"),
  v.literal("annulee")
)

export const gmaoResultatControleValidator = v.union(
  v.literal("ok"),
  v.literal("defaut"),
  v.literal("non_applicable")
)

export const gmaoGraviteDefautValidator = v.union(
  v.literal("mineur"),
  v.literal("majeur"),
  v.literal("bloquant")
)

export const gmaoAptitudeValidator = v.union(
  v.literal("apte"),
  v.literal("apte_sous_reserve"),
  v.literal("inapte")
)

export const gmaoEntiteValidator = v.union(
  v.literal("equipement"),
  v.literal("ordre_travail"),
  v.literal("visite"),
  v.literal("article"),
  v.literal("demande_achat"),
  v.literal("plan")
)

export const gmaoSourceReleveValidator = v.union(
  v.literal("saisie"),
  v.literal("visite"),
  v.literal("cloture_ot"),
  v.literal("telemetrie_simulee")
)

export const gmaoTables = {
  /** Ateliers et dépôts : chacun tient un magasin de pièces. */
  gmaoAteliers: defineTable({
    code: v.string(),
    nom: v.string(),
    stationId: v.optional(v.id("stations")),
    kilometerPoint: v.number(),
    description: v.string(),
    /** Coût horaire chargé de la main-d'œuvre, en XAF. */
    tauxHoraireFcfa: v.number(),
    isActive: v.boolean(),
  }).index("by_code", ["code"]),

  /** Fiche de vie d'un engin : locomotive, voiture voyageurs ou wagon. */
  gmaoEquipements: defineTable({
    numero: v.string(),
    famille: gmaoFamilleValidator,
    /** Série ou sous-type : « CC GT46MAC », « Trémie minéralière »… */
    serie: v.string(),
    constructeur: v.string(),
    anneeMiseEnService: v.number(),
    numeroSerie: v.optional(v.string()),
    /** Voiture voyageurs : la voiture du référentiel commercial. */
    coachId: v.optional(v.id("coaches")),
    /** Affectation courante à un train du référentiel. */
    trainId: v.optional(v.id("trains")),
    atelierId: v.id("gmaoAteliers"),
    statut: gmaoStatutEquipementValidator,
    motifStatut: v.optional(v.string()),
    /** Immobilisation décidée hors OT (motif) : un OT clôturé ne la lève pas. */
    immobilisationManuelle: v.optional(v.string()),
    statutDepuis: v.number(),
    compteurKm: v.number(),
    /** Heures moteur (locomotives) ; 0 pour le matériel remorqué. */
    compteurHeures: v.number(),
    compteurReleveLe: v.number(),
    proprietaire: v.string(),
    tareTonnes: v.optional(v.number()),
    chargeUtileTonnes: v.optional(v.number()),
    notes: v.optional(v.string()),
    creeLe: v.number(),
    majLe: v.number(),
  })
    .index("by_numero", ["numero"])
    .index("by_famille", ["famille"])
    .index("by_statut", ["statut"])
    .index("by_coach", ["coachId"])
    .index("by_train", ["trainId"])
    .index("by_atelier", ["atelierId"]),

  /** Relevés de compteurs : l'historique qui fonde les échéances km. */
  gmaoReleves: defineTable({
    equipementId: v.id("gmaoEquipements"),
    km: v.number(),
    heures: v.number(),
    releveLe: v.number(),
    source: gmaoSourceReleveValidator,
    auteurId: v.optional(v.id("users")),
  }).index("by_equipement", ["equipementId", "releveLe"]),

  /** Gamme de maintenance préventive : seuils kilométriques et calendaires. */
  gmaoPlans: defineTable({
    code: v.string(),
    libelle: v.string(),
    famille: gmaoFamilleValidator,
    /** Séries visées ; vide = toute la famille. */
    series: v.array(v.string()),
    seuilKm: v.optional(v.number()),
    seuilJours: v.optional(v.number()),
    /** Marge d'alerte avant l'échéance, en pourcentage du seuil. */
    alertePct: v.number(),
    dureeHeures: v.number(),
    immobilisant: v.boolean(),
    operations: v.array(v.string()),
    isActive: v.boolean(),
    creeLe: v.number(),
    majLe: v.number(),
  }).index("by_code", ["code"]),

  /** Rattachement d'un plan à un engin, avec la dernière réalisation. */
  gmaoPlansEquipements: defineTable({
    planId: v.id("gmaoPlans"),
    equipementId: v.id("gmaoEquipements"),
    derniereRealisationLe: v.number(),
    derniereRealisationKm: v.number(),
    /** OT préventif ouvert pour cette échéance, s'il existe. */
    otOuvertId: v.optional(v.id("gmaoOrdresTravail")),
  })
    .index("by_plan", ["planId"])
    .index("by_equipement", ["equipementId"])
    .index("by_plan_equipement", ["planId", "equipementId"]),

  gmaoOrdresTravail: defineTable({
    numero: v.string(),
    equipementId: v.id("gmaoEquipements"),
    type: gmaoTypeOtValidator,
    origine: gmaoOrigineOtValidator,
    planId: v.optional(v.id("gmaoPlans")),
    planEquipementId: v.optional(v.id("gmaoPlansEquipements")),
    visiteId: v.optional(v.id("gmaoVisites")),
    incidentId: v.optional(v.id("incidents")),
    priorite: gmaoPrioriteValidator,
    titre: v.string(),
    description: v.string(),
    statut: gmaoStatutOtValidator,
    atelierId: v.id("gmaoAteliers"),
    equipe: v.optional(v.string()),
    debutPrevu: v.optional(v.number()),
    finPrevue: v.optional(v.number()),
    debutReel: v.optional(v.number()),
    finReelle: v.optional(v.number()),
    /** L'engin est indisponible tant que l'OT n'est pas clôturé. */
    immobilisant: v.boolean(),
    kmDebut: v.optional(v.number()),
    coutMainOeuvreFcfa: v.number(),
    coutPiecesFcfa: v.number(),
    coutExterneFcfa: v.number(),
    heuresPassees: v.number(),
    compteRendu: v.optional(v.string()),
    /** Organe défaillant, pour le MTBF et l'analyse des pannes. */
    organe: v.optional(v.string()),
    demandeurId: v.optional(v.id("users")),
    demandeLe: v.number(),
    planifieParId: v.optional(v.id("users")),
    termineParId: v.optional(v.id("users")),
    clotureParId: v.optional(v.id("users")),
    clotureLe: v.optional(v.number()),
    motifAnnulation: v.optional(v.string()),
    majLe: v.number(),
  })
    .index("by_numero", ["numero"])
    .index("by_statut", ["statut"])
    .index("by_equipement", ["equipementId", "demandeLe"])
    .index("by_atelier_statut", ["atelierId", "statut"])
    .index("by_demande", ["demandeLe"]),

  gmaoTempsPasses: defineTable({
    otId: v.id("gmaoOrdresTravail"),
    intervenant: v.string(),
    matricule: v.optional(v.string()),
    date: v.number(),
    heures: v.number(),
    tauxHoraireFcfa: v.number(),
    commentaire: v.optional(v.string()),
    saisiParId: v.optional(v.id("users")),
    saisiLe: v.number(),
  }).index("by_ot", ["otId"]),

  gmaoArticles: defineTable({
    reference: v.string(),
    designation: v.string(),
    famille: v.string(),
    unite: v.string(),
    prixUnitaireFcfa: v.number(),
    fournisseur: v.string(),
    delaiApproJours: v.number(),
    critique: v.boolean(),
    /** Séries d'engins compatibles, en clair. */
    compatibilite: v.string(),
    isActive: v.boolean(),
    creeLe: v.number(),
    majLe: v.number(),
  })
    .index("by_reference", ["reference"])
    .index("by_famille", ["famille"]),

  /** Stock d'un article dans le magasin d'un atelier. */
  gmaoStocks: defineTable({
    articleId: v.id("gmaoArticles"),
    atelierId: v.id("gmaoAteliers"),
    quantite: v.number(),
    seuilReappro: v.number(),
    quantiteReappro: v.number(),
    emplacement: v.string(),
    majLe: v.number(),
  })
    .index("by_article_atelier", ["articleId", "atelierId"])
    .index("by_atelier", ["atelierId"])
    .index("by_article", ["articleId"]),

  gmaoMouvements: defineTable({
    articleId: v.id("gmaoArticles"),
    atelierId: v.id("gmaoAteliers"),
    sens: gmaoSensMouvementValidator,
    /** Toujours positive ; le sens dit si elle entre ou sort. */
    quantite: v.number(),
    /** Ajustement d'inventaire : écart signé. */
    ecart: v.optional(v.number()),
    quantiteApres: v.number(),
    valeurFcfa: v.number(),
    motif: v.string(),
    otId: v.optional(v.id("gmaoOrdresTravail")),
    demandeAchatId: v.optional(v.id("gmaoDemandesAchat")),
    auteurId: v.optional(v.id("users")),
    creeLe: v.number(),
  })
    .index("by_article", ["articleId", "creeLe"])
    .index("by_ot", ["otId"])
    .index("by_date", ["creeLe"]),

  gmaoDemandesAchat: defineTable({
    numero: v.string(),
    articleId: v.id("gmaoArticles"),
    atelierId: v.id("gmaoAteliers"),
    quantite: v.number(),
    prixUnitaireFcfa: v.number(),
    montantFcfa: v.number(),
    motif: v.string(),
    origine: v.union(v.literal("seuil"), v.literal("manuelle"), v.literal("ot")),
    otId: v.optional(v.id("gmaoOrdresTravail")),
    statut: gmaoStatutAchatValidator,
    demandeurId: v.optional(v.id("users")),
    demandeLe: v.number(),
    valideurId: v.optional(v.id("users")),
    valideLe: v.optional(v.number()),
    motifRefus: v.optional(v.string()),
    /** Commande transmise au fournisseur : simulée tant qu'aucun ERP achats n'est raccordé. */
    commande: v.optional(
      v.object({
        numero: v.string(),
        fournisseur: v.string(),
        passeeLe: v.number(),
        livraisonPrevueLe: v.number(),
        simulee: v.boolean(),
      })
    ),
    quantiteRecue: v.optional(v.number()),
    recueLe: v.optional(v.number()),
    majLe: v.number(),
  })
    .index("by_numero", ["numero"])
    .index("by_statut", ["statut"])
    .index("by_article", ["articleId"]),

  /** Visite technique avant départ : le visiteur de rames prononce l'aptitude. */
  gmaoVisites: defineTable({
    numero: v.string(),
    tripId: v.optional(v.id("trips")),
    /** Libellé du convoi : numéro de train ou de rame fret. */
    convoi: v.string(),
    atelierId: v.id("gmaoAteliers"),
    equipementIds: v.array(v.id("gmaoEquipements")),
    controles: v.array(
      v.object({
        code: v.string(),
        libelle: v.string(),
        resultat: gmaoResultatControleValidator,
      })
    ),
    defauts: v.array(
      v.object({
        equipementId: v.id("gmaoEquipements"),
        organe: v.string(),
        description: v.string(),
        gravite: gmaoGraviteDefautValidator,
      })
    ),
    statut: v.union(v.literal("en_cours"), v.literal("signee")),
    aptitude: v.optional(gmaoAptitudeValidator),
    observations: v.optional(v.string()),
    visiteurId: v.optional(v.id("users")),
    debutLe: v.number(),
    signeeLe: v.optional(v.number()),
    otIds: v.array(v.id("gmaoOrdresTravail")),
  })
    .index("by_numero", ["numero"])
    .index("by_trip", ["tripId"])
    .index("by_debut", ["debutLe"]),

  /** Chronologie de chaque dossier du module. */
  gmaoEvenements: defineTable({
    entite: gmaoEntiteValidator,
    entiteId: v.string(),
    type: v.string(),
    libelle: v.string(),
    detail: v.optional(v.string()),
    auteurId: v.optional(v.id("users")),
    creeLe: v.number(),
  }).index("by_entite", ["entite", "entiteId", "creeLe"]),
} as const
