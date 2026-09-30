import {
  defineSchema,
  defineTable,
  type DataModelFromSchemaDefinition,
} from "convex/server"
import { v } from "convex/values"

export const fretDataOriginValidator = v.literal("synthetic_demo")

export const fretCargoTypeValidator = v.union(
  v.literal("manganese"),
  v.literal("bois"),
  v.literal("hydrocarbures"),
  v.literal("conteneurs")
)

export const fretQuantityUnitValidator = v.union(
  v.literal("t"),
  v.literal("m3"),
  v.literal("evp")
)

export const fretOperationStatusValidator = v.union(
  v.literal("planifie"),
  v.literal("chargement"),
  v.literal("en_ligne"),
  v.literal("livraison"),
  v.literal("livre"),
  v.literal("retarde")
)

export const fretSafetyStatusValidator = v.union(
  v.literal("conforme"),
  v.literal("controle_requis"),
  v.literal("bloque")
)

export const fretDocumentStatusValidator = v.union(
  v.literal("complet"),
  v.literal("a_completer"),
  v.literal("bloque")
)

export const fretAlertSeverityValidator = v.union(
  v.literal("information"),
  v.literal("warning"),
  v.literal("critical")
)

export const fretAlertCategoryValidator = v.union(
  v.literal("exploitation"),
  v.literal("securite"),
  v.literal("documentation"),
  v.literal("capacite")
)

/**
 * Tables du domaine Fret.
 *
 * Le premier lot ne reçoit volontairement que des scénarios synthétiques. Le
 * triplet `datasetId` / `datasetKey` / `dataOrigin` empêche une requête de
 * tableau de bord d'agréger ces exemples avec de futures données de terrain.
 */
export const fretTables = {
  fretDatasets: defineTable({
    datasetKey: v.string(),
    dataOrigin: fretDataOriginValidator,
    label: v.string(),
    description: v.string(),
    scenarioDate: v.string(),
    referencePeriod: v.string(),
    routeLabel: v.string(),
    routeLengthKm: v.number(),
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
    .index("by_origin_active", ["dataOrigin", "isActive"]),

  fretOperations: defineTable({
    datasetId: v.id("fretDatasets"),
    dataOrigin: fretDataOriginValidator,
    operationCode: v.string(),
    trainNumber: v.string(),
    cargoType: fretCargoTypeValidator,
    cargoLabel: v.string(),
    clientSegment: v.string(),
    origin: v.string(),
    destination: v.string(),
    currentLocation: v.string(),
    siteCodes: v.array(v.string()),
    routeProgressPct: v.number(),
    status: fretOperationStatusValidator,
    scheduledDepartureAt: v.number(),
    scheduledArrivalAt: v.number(),
    actualDepartureAt: v.optional(v.number()),
    quantity: v.number(),
    quantityUnit: fretQuantityUnitValidator,
    wagonCount: v.number(),
    locomotiveCount: v.number(),
    priority: v.number(),
    safetyStatus: fretSafetyStatusValidator,
    documentStatus: fretDocumentStatusValidator,
    operationalNote: v.string(),
    lastEventAt: v.number(),
  })
    .index("by_dataset_code", ["datasetId", "operationCode"])
    .index("by_dataset_status", ["datasetId", "status"])
    .index("by_dataset_departure", ["datasetId", "scheduledDepartureAt"]),

  fretAlerts: defineTable({
    datasetId: v.id("fretDatasets"),
    dataOrigin: fretDataOriginValidator,
    alertCode: v.string(),
    operationId: v.optional(v.id("fretOperations")),
    siteCodes: v.array(v.string()),
    severity: fretAlertSeverityValidator,
    category: fretAlertCategoryValidator,
    title: v.string(),
    message: v.string(),
    siteLabel: v.string(),
    status: v.union(v.literal("ouverte"), v.literal("acquittee")),
    detectedAt: v.number(),
    dueAt: v.optional(v.number()),
  })
    .index("by_dataset_code", ["datasetId", "alertCode"])
    .index("by_dataset_status", ["datasetId", "status", "detectedAt"]),
} as const

const fretSchema = defineSchema(fretTables)

export type FretDataModel = DataModelFromSchemaDefinition<typeof fretSchema>
