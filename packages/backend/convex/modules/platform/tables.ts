import { defineTable } from "convex/server"
import { v } from "convex/values"

import {
  appRoleValidator,
  moduleCodeValidator,
  organizationTypeValidator,
  platformEnvironmentValidator,
  siteTypeValidator,
} from "./validators"

/** Tables transverses possédées par le noyau de la plateforme. */
export const platformTables = {
  /**
   * Destinations techniques de la plateforme. Les secrets restent hors base
   * et sont résolus par les actions d'envoi au moment de l'appel réseau.
   */
  integrationEndpoints: defineTable({
    code: v.string(),
    name: v.string(),
    transport: v.union(
      v.literal("api"),
      v.literal("file"),
      v.literal("webhook")
    ),
    isActive: v.boolean(),
    maxAttempts: v.number(),
    baseBackoffMs: v.number(),
    createdBy: v.id("users"),
    updatedBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_code", ["code"]),

  /**
   * Outbox transactionnelle commune aux modules métier. La mutation métier
   * et l'insertion de l'événement partagent la même transaction Convex.
   */
  integrationEvents: defineTable({
    endpointId: v.id("integrationEndpoints"),
    type: v.string(),
    schemaVersion: v.number(),
    idempotencyKey: v.string(),
    entityType: v.string(),
    entityId: v.string(),
    payload: v.string(),
    status: v.union(
      v.literal("en_attente"),
      v.literal("en_cours"),
      v.literal("envoye"),
      v.literal("rejete")
    ),
    attempts: v.number(),
    maxAttempts: v.number(),
    nextAttemptAt: v.number(),
    error: v.optional(
      v.object({
        code: v.string(),
        message: v.string(),
        retryable: v.boolean(),
        occurredAt: v.number(),
      })
    ),
    correlationId: v.string(),
    causationId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    sentAt: v.optional(v.number()),
    rejectedAt: v.optional(v.number()),
  })
    .index("by_endpoint_idempotency", ["endpointId", "idempotencyKey"])
    .index("by_status_next_attempt", ["status", "nextAttemptAt"])
    .index("by_endpoint_created", ["endpointId", "createdAt"])
    .index("by_endpoint_status_created", ["endpointId", "status", "createdAt"]),

  /** Acquittement externe associé à un événement livré. */
  integrationReceipts: defineTable({
    eventId: v.id("integrationEvents"),
    endpointId: v.id("integrationEndpoints"),
    receiptKey: v.string(),
    payload: v.optional(v.string()),
    correlationId: v.string(),
    receivedAt: v.number(),
  })
    .index("by_event", ["eventId"])
    .index("by_endpoint_receipt", ["endpointId", "receiptKey"]),

  /** Dossier documentaire stable ; chaque remplacement crée une version. */
  documentRecords: defineTable({
    moduleCode: moduleCodeValidator,
    entityType: v.string(),
    entityId: v.string(),
    siteId: v.optional(v.id("sites")),
    title: v.string(),
    classification: v.union(
      v.literal("public"),
      v.literal("interne"),
      v.literal("confidentiel"),
      v.literal("restreint")
    ),
    status: v.union(v.literal("actif"), v.literal("archive")),
    currentVersion: v.number(),
    correlationId: v.string(),
    archiveCorrelationId: v.optional(v.string()),
    createdBy: v.id("users"),
    updatedBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_entity", ["moduleCode", "entityType", "entityId"])
    .index("by_entity_site", ["moduleCode", "entityType", "entityId", "siteId"])
    .index("by_entity_status", [
      "moduleCode",
      "entityType",
      "entityId",
      "status",
    ])
    .index("by_entity_site_status", [
      "moduleCode",
      "entityType",
      "entityId",
      "siteId",
      "status",
    ])
    .index("by_correlation", ["correlationId"])
    .index("by_status_updated", ["status", "updatedAt"]),

  /** Contenu immuable d'une version, stocké dans Convex Storage. */
  documentVersions: defineTable({
    documentId: v.id("documentRecords"),
    version: v.number(),
    storageId: v.id("_storage"),
    fileName: v.string(),
    mimeType: v.string(),
    sizeBytes: v.number(),
    checksumSha256: v.optional(v.string()),
    correlationId: v.string(),
    createdBy: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_document_version", ["documentId", "version"])
    .index("by_document_correlation", ["documentId", "correlationId"])
    .index("by_storage", ["storageId"]),

  /** Instance générique d'un circuit séquentiel d'approbation. */
  approvalInstances: defineTable({
    moduleCode: moduleCodeValidator,
    entityType: v.string(),
    entityId: v.string(),
    siteId: v.optional(v.id("sites")),
    workflowCode: v.string(),
    status: v.union(
      v.literal("en_attente"),
      v.literal("approuve"),
      v.literal("rejete"),
      v.literal("annule")
    ),
    requestedBy: v.id("users"),
    requesterAssignmentId: v.optional(v.id("userAssignments")),
    currentStep: v.number(),
    totalSteps: v.number(),
    reason: v.string(),
    correlationId: v.string(),
    causationId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    resolvedAt: v.optional(v.number()),
  })
    .index("by_entity", ["moduleCode", "entityType", "entityId"])
    .index("by_correlation", ["correlationId"])
    .index("by_status_created", ["status", "createdAt"])
    .index("by_requester", ["requestedBy", "createdAt"]),

  /** Étape immuable après décision ; le commentaire de rejet est obligatoire. */
  approvalSteps: defineTable({
    instanceId: v.id("approvalInstances"),
    sequence: v.number(),
    label: v.string(),
    assignedUserId: v.optional(v.id("users")),
    status: v.union(
      v.literal("en_attente"),
      v.literal("approuve"),
      v.literal("rejete"),
      v.literal("ignore")
    ),
    decidedBy: v.optional(v.id("users")),
    decisionAssignmentId: v.optional(v.id("userAssignments")),
    comment: v.optional(v.string()),
    decidedAt: v.optional(v.number()),
  })
    .index("by_instance_sequence", ["instanceId", "sequence"])
    .index("by_assignee_status", ["assignedUserId", "status"]),

  organizations: defineTable({
    code: v.string(),
    name: v.string(),
    type: organizationTypeValidator,
    parentOrganizationId: v.optional(v.id("organizations")),
    isActive: v.boolean(),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_code", ["code"])
    .index("by_type", ["type"])
    .index("by_parent", ["parentOrganizationId"]),

  sites: defineTable({
    code: v.string(),
    name: v.string(),
    type: siteTypeValidator,
    organizationId: v.id("organizations"),
    stationId: v.optional(v.id("stations")),
    isActive: v.boolean(),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_code", ["code"])
    .index("by_organization", ["organizationId"])
    .index("by_type", ["type"]),

  positions: defineTable({
    code: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    organizationId: v.optional(v.id("organizations")),
    isActive: v.boolean(),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_code", ["code"])
    .index("by_organization", ["organizationId"]),

  userAssignments: defineTable({
    userId: v.id("users"),
    role: appRoleValidator,
    positionId: v.optional(v.id("positions")),
    organizationId: v.optional(v.id("organizations")),
    siteId: v.optional(v.id("sites")),
    validFrom: v.number(),
    validUntil: v.optional(v.number()),
    isActive: v.boolean(),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId", "validFrom"])
    .index("by_user_site", ["userId", "siteId", "validFrom"])
    .index("by_organization", ["organizationId", "validFrom"])
    .index("by_site", ["siteId", "validFrom"]),

  moduleActivations: defineTable({
    moduleCode: moduleCodeValidator,
    environment: platformEnvironmentValidator,
    siteId: v.optional(v.id("sites")),
    userId: v.optional(v.id("users")),
    isEnabled: v.boolean(),
    reason: v.string(),
    correlationId: v.string(),
    changedBy: v.id("users"),
    updatedAt: v.number(),
  })
    .index("by_environment_module", ["environment", "moduleCode"])
    .index("by_environment_module_site", [
      "environment",
      "moduleCode",
      "siteId",
    ])
    .index("by_environment_module_user", [
      "environment",
      "moduleCode",
      "userId",
    ]),
} as const
