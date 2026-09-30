import {
  defineSchema,
  defineTable,
  type DataModelFromSchemaDefinition,
} from "convex/server"
import { v } from "convex/values"

export const cotrafDataOriginValidator = v.union(
  v.literal("synthetic_demo"),
  v.literal("operational")
)

export const cotrafServiceTypeValidator = v.union(
  v.literal("voyageurs"),
  v.literal("minerai"),
  v.literal("bois"),
  v.literal("hydrocarbures"),
  v.literal("service")
)

export const cotrafDirectionValidator = v.union(
  v.literal("croissant"),
  v.literal("decroissant")
)

export const cotrafMovementStatusValidator = v.union(
  v.literal("planifie"),
  v.literal("en_ligne"),
  v.literal("retenu"),
  v.literal("arrive")
)

export const cotrafSegmentStatusValidator = v.union(
  v.literal("libre"),
  v.literal("reserve"),
  v.literal("occupe"),
  v.literal("bloque")
)

export const cotrafEventCategoryValidator = v.union(
  v.literal("croisement"),
  v.literal("alerte"),
  v.literal("otr"),
  v.literal("journal")
)

export const cotrafEventSeverityValidator = v.union(
  v.literal("information"),
  v.literal("warning"),
  v.literal("critical")
)

export const cotrafEventStatusValidator = v.union(
  v.literal("planifie"),
  v.literal("confirme"),
  v.literal("ouverte"),
  v.literal("resolue")
)

/**
 * Projection de régulation COTRAF.
 *
 * Le domaine conserve sa propre projection temporelle afin d'unifier les
 * circulations voyageurs, fret et de service sans modifier leurs agrégats
 * sources. Les données de démonstration restent isolées par `datasetId` et
 * `dataOrigin`; elles ne peuvent donc pas être confondues avec un futur flux
 * opérationnel.
 */
export const cotrafTables = {
  cotrafDatasets: defineTable({
    datasetKey: v.string(),
    dataOrigin: cotrafDataOriginValidator,
    label: v.string(),
    notice: v.string(),
    referenceAt: v.number(),
    pkConvention: v.string(),
    referenceSources: v.array(
      v.object({
        label: v.string(),
        url: v.string(),
      })
    ),
    isActive: v.boolean(),
    seededAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_key", ["datasetKey"])
    .index("by_origin_active", ["dataOrigin", "isActive", "referenceAt"]),

  cotrafMovements: defineTable({
    datasetId: v.id("cotrafDatasets"),
    dataOrigin: cotrafDataOriginValidator,
    movementCode: v.string(),
    trainNumber: v.string(),
    serviceType: cotrafServiceTypeValidator,
    direction: cotrafDirectionValidator,
    status: cotrafMovementStatusValidator,
    originStationId: v.id("stations"),
    destinationStationId: v.id("stations"),
    siteCodes: v.array(v.string()),
    currentPk: v.optional(v.number()),
    delayMinutes: v.number(),
    priority: v.number(),
    lastEventAt: v.number(),
    trajectory: v.array(
      v.object({
        stationId: v.id("stations"),
        plannedAt: v.number(),
        forecastAt: v.optional(v.number()),
      })
    ),
  })
    .index("by_dataset_code", ["datasetId", "movementCode"])
    .index("by_dataset_status", ["datasetId", "status", "lastEventAt"]),

  cotrafSegments: defineTable({
    datasetId: v.id("cotrafDatasets"),
    dataOrigin: cotrafDataOriginValidator,
    segmentCode: v.string(),
    fromStationId: v.id("stations"),
    toStationId: v.id("stations"),
    siteCodes: v.array(v.string()),
    status: cotrafSegmentStatusValidator,
    movementId: v.optional(v.id("cotrafMovements")),
    enteredAt: v.optional(v.number()),
    expectedReleaseAt: v.optional(v.number()),
    speedLimitKph: v.optional(v.number()),
    note: v.string(),
  })
    .index("by_dataset_code", ["datasetId", "segmentCode"])
    .index("by_dataset_status", ["datasetId", "status"]),

  cotrafEvents: defineTable({
    datasetId: v.id("cotrafDatasets"),
    dataOrigin: cotrafDataOriginValidator,
    eventCode: v.string(),
    siteCodes: v.array(v.string()),
    category: cotrafEventCategoryValidator,
    severity: cotrafEventSeverityValidator,
    title: v.string(),
    message: v.string(),
    siteLabel: v.string(),
    status: cotrafEventStatusValidator,
    occurredAt: v.number(),
    dueAt: v.optional(v.number()),
    primaryTrainNumber: v.optional(v.string()),
    secondaryTrainNumber: v.optional(v.string()),
    estimatedGainMinutes: v.optional(v.number()),
  })
    .index("by_dataset_code", ["datasetId", "eventCode"])
    .index("by_dataset_occurred", ["datasetId", "occurredAt"]),
} as const

const cotrafSchema = defineSchema(cotrafTables)

export type CotrafDataModel = DataModelFromSchemaDefinition<typeof cotrafSchema>
