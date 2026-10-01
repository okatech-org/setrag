import { defineTable } from "convex/server"
import { v, type VLiteral, type VUnion } from "convex/values"

import {
  CATEGORIES,
  CONTRATS,
  DIRECTIONS,
  METIERS,
  MODES_PAIEMENT,
  MOTIFS_SORTIE,
  RESULTATS_APTITUDE,
  SITUATIONS_FAMILIALES,
  STATUTS_AGENT,
  STATUTS_CONGE,
  STATUTS_HABILITATION,
  TYPES_CONGE,
  TYPES_HABILITATION,
  TYPES_MOUVEMENT,
  TYPES_SERVICE,
  TYPES_VISITE,
} from "./model"

/** Validateur d'union littérale construit à partir des clés d'un catalogue. */
export function enumeration<T extends string>(
  catalogue: Readonly<Record<T, unknown>>
): VUnion<T, VLiteral<T, "required">[], "required", never> {
  const valeurs = Object.keys(catalogue) as T[]
  return v.union(...valeurs.map((valeur) => v.literal(valeur))) as VUnion<
    T,
    VLiteral<T, "required">[],
    "required",
    never
  >
}

export const directionValidator = enumeration(DIRECTIONS)
export const metierValidator = enumeration(METIERS)
export const categorieValidator = enumeration(CATEGORIES)
export const contratValidator = enumeration(CONTRATS)
export const situationFamilialeValidator = enumeration(SITUATIONS_FAMILIALES)
export const modePaiementValidator = enumeration(MODES_PAIEMENT)
export const statutAgentValidator = enumeration(STATUTS_AGENT)
export const typeMouvementValidator = enumeration(TYPES_MOUVEMENT)
export const motifSortieValidator = enumeration(MOTIFS_SORTIE)
export const typeHabilitationValidator = enumeration(TYPES_HABILITATION)
export const statutHabilitationValidator = enumeration(STATUTS_HABILITATION)
export const typeServiceValidator = enumeration(TYPES_SERVICE)
export const typeVisiteValidator = enumeration(TYPES_VISITE)
export const resultatAptitudeValidator = enumeration(RESULTATS_APTITUDE)
export const typeCongeValidator = enumeration(TYPES_CONGE)
export const statutCongeValidator = enumeration(STATUTS_CONGE)

/** Données saisies au portail ou jeu de démonstration (purgeable). */
export const origineValidator = v.union(
  v.literal("saisie"),
  v.literal("demo")
)

export const statutPeriodeValidator = v.union(
  v.literal("ouverte"),
  v.literal("calculee"),
  v.literal("validee"),
  v.literal("cloturee")
)

export const totauxPeriodeValidator = v.object({
  effectif: v.number(),
  brut: v.number(),
  net: v.number(),
  cnssSalarie: v.number(),
  cnssPatronal: v.number(),
  cnamgsSalarie: v.number(),
  cnamgsPatronal: v.number(),
  irpp: v.number(),
  tcs: v.number(),
  coutEmployeur: v.number(),
})

const ligneBulletinValidator = v.object({
  code: v.string(),
  libelle: v.string(),
  sens: v.union(
    v.literal("gain"),
    v.literal("gain_non_soumis"),
    v.literal("retenue"),
    v.literal("patronal")
  ),
  base: v.optional(v.number()),
  taux: v.optional(v.number()),
  quantite: v.optional(v.number()),
  montant: v.number(),
})

const totauxBulletinValidator = v.object({
  brutSoumis: v.number(),
  nonSoumis: v.number(),
  brut: v.number(),
  assietteCnss: v.number(),
  assietteCnamgs: v.number(),
  cnssSalarie: v.number(),
  cnamgsSalarie: v.number(),
  tcs: v.number(),
  revenuImposable: v.number(),
  parts: v.number(),
  irpp: v.number(),
  autresRetenues: v.number(),
  totalRetenues: v.number(),
  net: v.number(),
  cnssPatronal: v.number(),
  cnamgsPatronal: v.number(),
  chargesPatronales: v.number(),
  coutEmployeur: v.number(),
})

/** Situation d'un agent avant / après un mouvement de carrière. */
const situationValidator = v.object({
  direction: v.optional(directionValidator),
  metier: v.optional(metierValidator),
  poste: v.optional(v.string()),
  gareCode: v.optional(v.string()),
  categorie: v.optional(categorieValidator),
  echelon: v.optional(v.number()),
  salaireBaseFcfa: v.optional(v.number()),
  statut: v.optional(statutAgentValidator),
})

/**
 * Tables du module Ressources humaines. Le détail médical est isolé dans
 * `rhExamensMedicaux`, lu seulement par le service de santé au travail ; les
 * autres tables ne portent qu'un statut d'aptitude.
 */
export const rhTables = {
  rhAgents: defineTable({
    matricule: v.string(),
    nom: v.string(),
    prenom: v.string(),
    sexe: v.union(v.literal("F"), v.literal("M")),
    dateNaissance: v.string(),
    lieuNaissance: v.optional(v.string()),
    telephone: v.optional(v.string()),
    email: v.optional(v.string()),
    adresse: v.optional(v.string()),
    situationFamiliale: situationFamilialeValidator,
    enfantsACharge: v.number(),
    direction: directionValidator,
    metier: metierValidator,
    poste: v.string(),
    gareCode: v.string(),
    categorie: categorieValidator,
    echelon: v.number(),
    contrat: contratValidator,
    dateEmbauche: v.string(),
    dateFinContrat: v.optional(v.string()),
    salaireBaseFcfa: v.number(),
    primeFonctionFcfa: v.number(),
    primeSujetionFcfa: v.number(),
    modePaiement: modePaiementValidator,
    /** Coordonnées de paiement masquées (« GA21 •••• 4471 »). */
    comptePaiement: v.optional(v.string()),
    numeroCnss: v.optional(v.string()),
    numeroCnamgs: v.optional(v.string()),
    statut: statutAgentValidator,
    dateSortie: v.optional(v.string()),
    motifSortie: v.optional(motifSortieValidator),
    /** Compte du portail, quand l'agent en possède un. */
    userId: v.optional(v.id("users")),
    origine: origineValidator,
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_matricule", ["matricule"])
    .index("by_statut", ["statut"])
    .index("by_gare", ["gareCode"])
    .index("by_metier", ["metier"])
    .index("by_user", ["userId"]),

  rhHabilitations: defineTable({
    agentId: v.id("rhAgents"),
    type: typeHabilitationValidator,
    numero: v.string(),
    delivreeLe: v.string(),
    expireLe: v.string(),
    organisme: v.string(),
    statut: statutHabilitationValidator,
    note: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_agent", ["agentId"])
    .index("by_expiration", ["expireLe"]),

  rhMouvements: defineTable({
    agentId: v.id("rhAgents"),
    type: typeMouvementValidator,
    dateEffet: v.string(),
    avant: v.optional(situationValidator),
    apres: v.optional(situationValidator),
    motif: v.string(),
    acteurId: v.optional(v.id("users")),
    acteurNom: v.string(),
    createdAt: v.number(),
  })
    .index("by_agent", ["agentId", "dateEffet"])
    .index("by_date", ["dateEffet"]),

  rhPeriodesPaie: defineTable({
    code: v.string(),
    libelle: v.string(),
    debut: v.string(),
    fin: v.string(),
    statut: statutPeriodeValidator,
    parametres: v.string(),
    ouverteLe: v.number(),
    ouverteParNom: v.string(),
    calculeeLe: v.optional(v.number()),
    calculeePar: v.optional(v.id("users")),
    calculeeParNom: v.optional(v.string()),
    valideeLe: v.optional(v.number()),
    valideePar: v.optional(v.id("users")),
    valideeParNom: v.optional(v.string()),
    clotureeLe: v.optional(v.number()),
    clotureeParNom: v.optional(v.string()),
    totaux: v.optional(totauxPeriodeValidator),
    origine: origineValidator,
  })
    .index("by_code", ["code"])
    .index("by_statut", ["statut"]),

  rhVariablesPaie: defineTable({
    periodeId: v.id("rhPeriodesPaie"),
    agentId: v.id("rhAgents"),
    heuresSup125: v.number(),
    heuresSup150: v.number(),
    heuresSup200: v.number(),
    kmTraction: v.number(),
    nuitsDecouche: v.number(),
    primeExceptionnelleFcfa: v.number(),
    joursAbsence: v.number(),
    avanceSalaireFcfa: v.number(),
    commentaire: v.optional(v.string()),
    updatedAt: v.number(),
    updatedByNom: v.string(),
  }).index("by_periode_agent", ["periodeId", "agentId"]),

  rhBulletins: defineTable({
    periodeId: v.id("rhPeriodesPaie"),
    agentId: v.id("rhAgents"),
    numero: v.string(),
    parametres: v.string(),
    agent: v.object({
      matricule: v.string(),
      nomComplet: v.string(),
      poste: v.string(),
      direction: directionValidator,
      gareCode: v.string(),
      categorie: categorieValidator,
      echelon: v.number(),
      contrat: contratValidator,
      dateEmbauche: v.string(),
      situationFamiliale: situationFamilialeValidator,
      enfantsACharge: v.number(),
      numeroCnss: v.optional(v.string()),
      numeroCnamgs: v.optional(v.string()),
      modePaiement: modePaiementValidator,
      comptePaiement: v.optional(v.string()),
    }),
    joursPayes: v.number(),
    joursAbsenceNonPayee: v.number(),
    ancienneteAnnees: v.number(),
    lignes: v.array(ligneBulletinValidator),
    totaux: totauxBulletinValidator,
    statut: v.union(v.literal("calcule"), v.literal("valide")),
    calculeLe: v.number(),
  })
    .index("by_periode", ["periodeId"])
    .index("by_agent", ["agentId"])
    .index("by_numero", ["numero"]),

  rhDeclarationsSociales: defineTable({
    periodeId: v.id("rhPeriodesPaie"),
    organisme: v.union(v.literal("CNSS"), v.literal("CNAMGS")),
    numero: v.string(),
    effectif: v.number(),
    assiette: v.number(),
    partSalariale: v.number(),
    partPatronale: v.number(),
    total: v.number(),
    statut: v.union(
      v.literal("transmise"),
      v.literal("accusee"),
      v.literal("rejetee")
    ),
    /** Le guichet de télédéclaration n'est pas raccordé : envoi simulé. */
    mode: v.literal("simulation"),
    transmiseLe: v.number(),
    transmiseParNom: v.string(),
    referenceTransmission: v.string(),
    accuseLe: v.optional(v.number()),
    referenceAccuse: v.optional(v.string()),
    origine: origineValidator,
  })
    .index("by_periode", ["periodeId"])
    .index("by_numero", ["numero"]),

  rhServices: defineTable({
    agentId: v.id("rhAgents"),
    /** Jour de prise de service à Libreville. */
    date: v.string(),
    debut: v.number(),
    fin: v.number(),
    type: typeServiceValidator,
    pauseMinutes: v.number(),
    trainNumber: v.optional(v.string()),
    desserte: v.optional(v.string()),
    tripId: v.optional(v.id("trips")),
    gareDebutCode: v.string(),
    gareFinCode: v.string(),
    decouche: v.boolean(),
    statut: v.union(
      v.literal("planifie"),
      v.literal("publie"),
      v.literal("annule")
    ),
    /** Justification écrite d'une dérogation aux règles non bloquantes. */
    derogation: v.optional(v.string()),
    motifAnnulation: v.optional(v.string()),
    creeParNom: v.string(),
    origine: origineValidator,
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_agent_debut", ["agentId", "debut"])
    .index("by_debut", ["debut"])
    .index("by_date", ["date"]),

  rhVisitesMedicales: defineTable({
    agentId: v.id("rhAgents"),
    numero: v.string(),
    type: typeVisiteValidator,
    statut: v.union(
      v.literal("programmee"),
      v.literal("realisee"),
      v.literal("annulee")
    ),
    dateProgrammee: v.string(),
    heureProgrammee: v.optional(v.string()),
    lieu: v.string(),
    realiseeLe: v.optional(v.number()),
    resultat: v.optional(resultatAptitudeValidator),
    /** Consigne fonctionnelle, sans motif médical (« pas de conduite de nuit »). */
    restrictionFonctionnelle: v.optional(v.string()),
    valideJusquau: v.optional(v.string()),
    prononceeParNom: v.optional(v.string()),
    motifAnnulation: v.optional(v.string()),
    origine: origineValidator,
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_agent", ["agentId", "dateProgrammee"])
    .index("by_statut_date", ["statut", "dateProgrammee"])
    .index("by_numero", ["numero"]),

  /** Secret médical : constantes et observations, réservées au service médical. */
  rhExamensMedicaux: defineTable({
    visiteId: v.id("rhVisitesMedicales"),
    agentId: v.id("rhAgents"),
    acuiteVisuelle: v.optional(v.string()),
    visionCouleurs: v.optional(
      v.union(v.literal("normale"), v.literal("anomalie"))
    ),
    audition: v.optional(
      v.union(v.literal("normale"), v.literal("deficit_leger"), v.literal("deficit"))
    ),
    tensionArterielle: v.optional(v.string()),
    frequenceCardiaque: v.optional(v.number()),
    glycemie: v.optional(v.string()),
    depistageAlcool: v.optional(
      v.union(v.literal("negatif"), v.literal("positif"), v.literal("non_realise"))
    ),
    depistageStupefiants: v.optional(
      v.union(v.literal("negatif"), v.literal("positif"), v.literal("non_realise"))
    ),
    observations: v.optional(v.string()),
    saisiParNom: v.string(),
    saisiLe: v.number(),
  })
    .index("by_visite", ["visiteId"])
    .index("by_agent", ["agentId"]),

  rhConges: defineTable({
    agentId: v.id("rhAgents"),
    numero: v.string(),
    type: typeCongeValidator,
    du: v.string(),
    au: v.string(),
    jours: v.number(),
    motif: v.optional(v.string()),
    statut: statutCongeValidator,
    demandeLe: v.number(),
    demandePar: v.optional(v.id("users")),
    demandeParNom: v.string(),
    decisionLe: v.optional(v.number()),
    decisionParNom: v.optional(v.string()),
    decisionNote: v.optional(v.string()),
    origine: origineValidator,
  })
    .index("by_agent", ["agentId", "du"])
    .index("by_statut", ["statut", "du"])
    .index("by_du", ["du"])
    .index("by_numero", ["numero"]),

  /** Chronologie de chaque dossier ; le journal d'audit en garde la trace légale. */
  rhJournal: defineTable({
    agentId: v.optional(v.id("rhAgents")),
    entite: v.union(
      v.literal("agent"),
      v.literal("periode"),
      v.literal("bulletin"),
      v.literal("service"),
      v.literal("visite"),
      v.literal("conge"),
      v.literal("declaration")
    ),
    entiteId: v.string(),
    action: v.string(),
    libelle: v.string(),
    detail: v.optional(v.string()),
    /** Entrée du service médical, masquée hors de ce service. */
    confidentiel: v.boolean(),
    acteurId: v.optional(v.id("users")),
    acteurNom: v.string(),
    at: v.number(),
  })
    .index("by_entite", ["entite", "entiteId", "at"])
    .index("by_agent", ["agentId", "at"]),

  rhSequences: defineTable({
    cle: v.string(),
    valeur: v.number(),
  }).index("by_cle", ["cle"]),
} as const
