import { defineTable } from "convex/server"
import { v } from "convex/values"

import { enumeration } from "../rh/tables"
import {
  CATEGORIES_CAUSE,
  DIRECTIONS_RESPONSABLES,
  GRAVITES,
  GRAVITES_NC,
  NATURES_ARTF,
  RESULTATS_INSPECTION,
  STATUTS_ACTION,
  STATUTS_ARTF,
  STATUTS_ENQUETE,
  STATUTS_EVENEMENT,
  TYPES_EVENEMENT,
  TYPES_INSPECTION,
} from "./model"

export const typeEvenementValidator = enumeration(TYPES_EVENEMENT)
export const graviteValidator = enumeration(GRAVITES)
export const statutEvenementValidator = enumeration(STATUTS_EVENEMENT)
export const statutEnqueteValidator = enumeration(STATUTS_ENQUETE)
export const categorieCauseValidator = enumeration(CATEGORIES_CAUSE)
export const statutActionValidator = enumeration(STATUTS_ACTION)
export const directionResponsableValidator = enumeration(DIRECTIONS_RESPONSABLES)
export const typeInspectionValidator = enumeration(TYPES_INSPECTION)
export const resultatInspectionValidator = enumeration(RESULTATS_INSPECTION)
export const graviteNcValidator = enumeration(GRAVITES_NC)
export const natureArtfValidator = enumeration(NATURES_ARTF)
export const statutArtfValidator = enumeration(STATUTS_ARTF)

const origineValidator = v.union(v.literal("saisie"), v.literal("demo"))

export const causeValidator = v.object({
  categorie: categorieCauseValidator,
  description: v.string(),
  racine: v.boolean(),
})

export const recommandationValidator = v.object({ texte: v.string() })

export const nonConformiteValidator = v.object({
  code: v.string(),
  description: v.string(),
  gravite: graviteNcValidator,
  actionId: v.optional(v.id("securiteActions")),
})

/**
 * Tables du module Sécurité ferroviaire, sûreté et conformité ARTF. Un
 * événement peut naître d'un incident d'exploitation (`incidents`) remonté
 * du terrain ; il en garde le lien.
 */
export const securiteTables = {
  securiteEvenements: defineTable({
    numero: v.string(),
    type: typeEvenementValidator,
    gravite: graviteValidator,
    survenuLe: v.number(),
    declareLe: v.number(),
    declarantId: v.optional(v.id("users")),
    declarantNom: v.string(),
    gareCode: v.optional(v.string()),
    pk: v.optional(v.number()),
    lieu: v.string(),
    zoneLope: v.boolean(),
    trainNumber: v.optional(v.string()),
    tripId: v.optional(v.id("trips")),
    incidentId: v.optional(v.id("incidents")),
    description: v.string(),
    mesuresImmediates: v.optional(v.string()),
    blesses: v.number(),
    deces: v.number(),
    degats: v.optional(v.string()),
    interruptionMinutes: v.optional(v.number()),
    statut: statutEvenementValidator,
    notificationRequise: v.boolean(),
    motifNotification: v.optional(v.string()),
    qualifieLe: v.optional(v.number()),
    qualifieParNom: v.optional(v.string()),
    clotureLe: v.optional(v.number()),
    clotureParNom: v.optional(v.string()),
    noteCloture: v.optional(v.string()),
    origine: origineValidator,
  })
    .index("by_numero", ["numero"])
    .index("by_statut", ["statut", "survenuLe"])
    .index("by_survenu", ["survenuLe"])
    .index("by_incident", ["incidentId"]),

  securiteEnquetes: defineTable({
    numero: v.string(),
    evenementId: v.id("securiteEvenements"),
    enqueteurId: v.optional(v.id("users")),
    enqueteurNom: v.string(),
    ouverteLe: v.number(),
    ouverteParNom: v.string(),
    echeanceRapport: v.string(),
    statut: statutEnqueteValidator,
    constats: v.optional(v.string()),
    causes: v.array(causeValidator),
    recommandations: v.array(recommandationValidator),
    conclusion: v.optional(v.string()),
    soumiseLe: v.optional(v.number()),
    motifRenvoi: v.optional(v.string()),
    clotureeLe: v.optional(v.number()),
    clotureeParNom: v.optional(v.string()),
    origine: origineValidator,
  })
    .index("by_numero", ["numero"])
    .index("by_evenement", ["evenementId"])
    .index("by_statut", ["statut"]),

  securiteActions: defineTable({
    numero: v.string(),
    libelle: v.string(),
    enqueteId: v.optional(v.id("securiteEnquetes")),
    evenementId: v.optional(v.id("securiteEvenements")),
    inspectionId: v.optional(v.id("securiteInspections")),
    responsableNom: v.string(),
    responsableDirection: directionResponsableValidator,
    echeance: v.string(),
    priorite: v.union(v.literal("haute"), v.literal("normale")),
    statut: statutActionValidator,
    avancement: v.number(),
    commentaire: v.optional(v.string()),
    preuve: v.optional(v.string()),
    realiseeLe: v.optional(v.number()),
    verifieeLe: v.optional(v.number()),
    verifieeParNom: v.optional(v.string()),
    motifAnnulation: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    origine: origineValidator,
  })
    .index("by_numero", ["numero"])
    .index("by_statut", ["statut", "echeance"])
    .index("by_enquete", ["enqueteId"])
    .index("by_evenement", ["evenementId"])
    .index("by_inspection", ["inspectionId"]),

  securiteInspections: defineTable({
    numero: v.string(),
    type: typeInspectionValidator,
    objet: v.string(),
    gareCode: v.optional(v.string()),
    pk: v.optional(v.number()),
    lieu: v.string(),
    zoneLope: v.boolean(),
    dateProgrammee: v.string(),
    inspecteurId: v.optional(v.id("users")),
    inspecteurNom: v.string(),
    statut: v.union(v.literal("programmee"), v.literal("realisee"), v.literal("annulee")),
    realiseeLe: v.optional(v.number()),
    resultat: v.optional(resultatInspectionValidator),
    constats: v.optional(v.string()),
    nonConformites: v.array(nonConformiteValidator),
    motifAnnulation: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    origine: origineValidator,
  })
    .index("by_numero", ["numero"])
    .index("by_statut_date", ["statut", "dateProgrammee"]),

  securiteDeclarationsArtf: defineTable({
    numero: v.string(),
    nature: natureArtfValidator,
    evenementId: v.optional(v.id("securiteEvenements")),
    enqueteId: v.optional(v.id("securiteEnquetes")),
    periode: v.optional(v.string()),
    objet: v.string(),
    contenu: v.optional(v.string()),
    echeance: v.number(),
    statut: statutArtfValidator,
    prepareeLe: v.optional(v.number()),
    prepareeParNom: v.optional(v.string()),
    /** Le portail de l'ARTF n'est pas raccordé : transmission simulée. */
    mode: v.literal("simulation"),
    transmiseLe: v.optional(v.number()),
    transmiseParNom: v.optional(v.string()),
    referenceTransmission: v.optional(v.string()),
    accuseLe: v.optional(v.number()),
    referenceAccuse: v.optional(v.string()),
    createdAt: v.number(),
    origine: origineValidator,
  })
    .index("by_numero", ["numero"])
    .index("by_statut", ["statut", "echeance"])
    .index("by_evenement", ["evenementId"])
    .index("by_enquete", ["enqueteId"])
    .index("by_periode", ["periode"]),

  securiteJournal: defineTable({
    entite: v.union(
      v.literal("evenement"),
      v.literal("enquete"),
      v.literal("action"),
      v.literal("inspection"),
      v.literal("declaration")
    ),
    entiteId: v.string(),
    /** Dossier d'événement auquel l'entrée se rattache, pour sa chronologie. */
    evenementId: v.optional(v.id("securiteEvenements")),
    action: v.string(),
    libelle: v.string(),
    detail: v.optional(v.string()),
    acteurId: v.optional(v.id("users")),
    acteurNom: v.string(),
    at: v.number(),
  })
    .index("by_entite", ["entite", "entiteId", "at"])
    .index("by_evenement", ["evenementId", "at"]),

  securiteSequences: defineTable({
    cle: v.string(),
    valeur: v.number(),
  }).index("by_cle", ["cle"]),
} as const
