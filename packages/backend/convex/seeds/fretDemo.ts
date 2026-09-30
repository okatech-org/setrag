import type { Id } from "../_generated/dataModel"
import { internalMutation } from "../_generated/server"
import type { MutationCtx } from "../_generated/server"
import { FRET_DEMO_DATASET_KEY } from "../modules/fret/model"

const DATA_ORIGIN = "synthetic_demo" as const
const SCENARIO_DATE = "2026-09-10"
const SEEDED_AT = Date.parse("2026-09-10T00:00:00+01:00")

const DATASET = {
  datasetKey: FRET_DEMO_DATASET_KEY,
  dataOrigin: DATA_ORIGIN,
  label: "Démonstration Fret — corridor transgabonais",
  description:
    "Scénario entièrement synthétique inspiré des familles de trafic publiques de la SETRAG ; il ne constitue ni un relevé d'exploitation ni une donnée contractuelle.",
  scenarioDate: SCENARIO_DATE,
  referencePeriod: "Calibrage public 2024, scénario du 10 septembre 2026",
  routeLabel: "Owendo — Franceville",
  routeLengthKm: 648,
  referenceSources: [
    {
      label: "SETRAG — chiffres clés 2024",
      url: "https://setrag.eramet.com/setrag/la-setrag-en-un-clin-doeil/chiffres-cles/",
    },
    {
      label: "SETRAG — activité Fret",
      url: "https://setrag.eramet.com/setrag/notre-chemin-de-fer/fret/",
    },
    {
      label: "SETRAG — gares du Transgabonais",
      url: "https://mobile.setrag.ga/pages/gares",
    },
  ],
  isActive: true,
  seededAt: SEEDED_AT,
  updatedAt: SEEDED_AT,
} as const

const OPERATIONS = [
  {
    operationCode: "DEMO-FRT-MIN-001",
    trainNumber: "MIN-704",
    cargoType: "manganese",
    cargoLabel: "Minerai de manganèse — lot synthétique",
    clientSegment: "Opérateur minier",
    origin: "Moanda",
    destination: "Owendo",
    currentLocation: "Secteur de Booué",
    siteCodes: ["MOA", "BOO", "OWE"],
    routeProgressPct: 46,
    status: "en_ligne",
    scheduledDepartureAt: Date.parse("2026-09-10T01:20:00+01:00"),
    scheduledArrivalAt: Date.parse("2026-09-10T15:50:00+01:00"),
    actualDepartureAt: Date.parse("2026-09-10T01:32:00+01:00"),
    quantity: 9_240,
    quantityUnit: "t",
    wagonCount: 96,
    locomotiveCount: 3,
    priority: 1,
    safetyStatus: "conforme",
    documentStatus: "complet",
    operationalNote:
      "Croisement régulé avec le trafic voyageurs ; pesée et composition simulées.",
    lastEventAt: Date.parse("2026-09-10T08:42:00+01:00"),
  },
  {
    operationCode: "DEMO-FRT-BOI-002",
    trainNumber: "BOI-318",
    cargoType: "bois",
    cargoLabel: "Bois transformé et grumes tracées — lot synthétique",
    clientSegment: "Filière forêt-bois",
    origin: "Lastoursville",
    destination: "Nkok",
    currentLocation: "Terminal bois de Lastoursville",
    siteCodes: ["LTV", "NKK", "OWE"],
    routeProgressPct: 8,
    status: "chargement",
    scheduledDepartureAt: Date.parse("2026-09-10T10:30:00+01:00"),
    scheduledArrivalAt: Date.parse("2026-09-10T22:10:00+01:00"),
    quantity: 1_180,
    quantityUnit: "m3",
    wagonCount: 44,
    locomotiveCount: 2,
    priority: 3,
    safetyStatus: "conforme",
    documentStatus: "a_completer",
    operationalNote:
      "Contrôle de cubage et rapprochement du bordereau de suivi forestier simulés.",
    lastEventAt: Date.parse("2026-09-10T08:28:00+01:00"),
  },
  {
    operationCode: "DEMO-FRT-HYD-003",
    trainNumber: "HYD-112",
    cargoType: "hydrocarbures",
    cargoLabel: "Produits pétroliers — convoi TMD synthétique",
    clientSegment: "Distribution énergétique",
    origin: "Owendo",
    destination: "Franceville",
    currentLocation: "Faisceau marchandises d’Owendo",
    siteCodes: ["OWE", "FCV"],
    routeProgressPct: 0,
    status: "planifie",
    scheduledDepartureAt: Date.parse("2026-09-10T13:40:00+01:00"),
    scheduledArrivalAt: Date.parse("2026-09-11T04:25:00+01:00"),
    quantity: 1_920,
    quantityUnit: "t",
    wagonCount: 24,
    locomotiveCount: 2,
    priority: 2,
    safetyStatus: "controle_requis",
    documentStatus: "complet",
    operationalNote:
      "Inspection TMD avant départ et confirmation de la voie de réception requises.",
    lastEventAt: Date.parse("2026-09-10T08:15:00+01:00"),
  },
  {
    operationCode: "DEMO-FRT-CTN-004",
    trainNumber: "CTN-226",
    cargoType: "conteneurs",
    cargoLabel: "Conteneurs et marchandises diverses — lot synthétique",
    clientSegment: "Logistique multimodale",
    origin: "Owendo",
    destination: "Moanda",
    currentLocation: "Terminal de Moanda",
    siteCodes: ["OWE", "MOA"],
    routeProgressPct: 100,
    status: "livre",
    scheduledDepartureAt: Date.parse("2026-09-09T14:10:00+01:00"),
    scheduledArrivalAt: Date.parse("2026-09-10T04:35:00+01:00"),
    actualDepartureAt: Date.parse("2026-09-09T14:18:00+01:00"),
    quantity: 48,
    quantityUnit: "evp",
    wagonCount: 22,
    locomotiveCount: 2,
    priority: 3,
    safetyStatus: "conforme",
    documentStatus: "complet",
    operationalNote:
      "Livraison simulée, scellés et unités intermodales rapprochés sans écart.",
    lastEventAt: Date.parse("2026-09-10T04:41:00+01:00"),
  },
] as const

const ALERTS = [
  {
    alertCode: "DEMO-ALT-DOC-001",
    operationCode: "DEMO-FRT-BOI-002",
    siteCodes: ["LTV", "NKK"],
    severity: "warning",
    category: "documentation",
    title: "Pièce forestière à rapprocher",
    message:
      "Le scénario attend la concordance finale entre cubage et bordereau de suivi avant départ.",
    siteLabel: "Lastoursville",
    status: "ouverte",
    detectedAt: Date.parse("2026-09-10T08:28:00+01:00"),
    dueAt: Date.parse("2026-09-10T09:45:00+01:00"),
  },
  {
    alertCode: "DEMO-ALT-TMD-002",
    operationCode: "DEMO-FRT-HYD-003",
    siteCodes: ["OWE"],
    severity: "critical",
    category: "securite",
    title: "Contrôle TMD avant mise en ligne",
    message:
      "La checklist citernes et la confirmation de la voie de réception restent à valider dans le scénario.",
    siteLabel: "Owendo",
    status: "ouverte",
    detectedAt: Date.parse("2026-09-10T08:15:00+01:00"),
    dueAt: Date.parse("2026-09-10T11:40:00+01:00"),
  },
  {
    alertCode: "DEMO-ALT-CIRC-003",
    operationCode: "DEMO-FRT-MIN-001",
    siteCodes: ["BOO"],
    severity: "information",
    category: "exploitation",
    title: "Croisement voyageurs confirmé",
    message:
      "Le jalon de croisement à voie unique est acquitté dans ce scénario synthétique.",
    siteLabel: "Booué",
    status: "acquittee",
    detectedAt: Date.parse("2026-09-10T07:55:00+01:00"),
  },
] as const

/**
 * Provisionne le scénario Fret sans jamais toucher aux autres jeux de données.
 * La clé fixe permet de rejouer la mutation sans duplication.
 */
export const provision = internalMutation({
  args: {},
  handler: async (ctx) => {
    if (process.env.DEMO_ACCOUNTS_ENABLED !== "true") {
      throw new Error(
        "Peuplement refusé : DEMO_ACCOUNTS_ENABLED doit valoir true."
      )
    }

    const existingDatasets = await ctx.db
      .query("fretDatasets")
      .withIndex("by_key", (builder) =>
        builder.eq("datasetKey", FRET_DEMO_DATASET_KEY)
      )
      .collect()
    if (existingDatasets.length > 1) {
      throw new Error(
        `Jeu Fret ambigu : ${existingDatasets.length} datasets portent la clé ${FRET_DEMO_DATASET_KEY}.`
      )
    }

    const existingDataset = existingDatasets[0]
    const datasetValue = {
      ...DATASET,
      referenceSources: DATASET.referenceSources.map((source) => ({
        ...source,
      })),
    }
    const datasetId = existingDataset
      ? existingDataset._id
      : await ctx.db.insert("fretDatasets", datasetValue)
    if (existingDataset) await ctx.db.patch(existingDataset._id, datasetValue)

    const operationIds = await upsertOperations(ctx, datasetId)
    await upsertAlerts(ctx, datasetId, operationIds)

    return {
      datasetId,
      datasetKey: FRET_DEMO_DATASET_KEY,
      dataOrigin: DATA_ORIGIN,
      operations: OPERATIONS.length,
      alerts: ALERTS.length,
      created: existingDataset === undefined,
    }
  },
})

async function upsertOperations(
  ctx: MutationCtx,
  datasetId: Id<"fretDatasets">
): Promise<Map<string, Id<"fretOperations">>> {
  const existing = await ctx.db
    .query("fretOperations")
    .withIndex("by_dataset_departure", (builder) =>
      builder.eq("datasetId", datasetId)
    )
    .collect()
  const byCode = new Map(existing.map((row) => [row.operationCode, row]))
  const operationIds = new Map<string, Id<"fretOperations">>()

  for (const operation of OPERATIONS) {
    const current = byCode.get(operation.operationCode)
    const value = {
      ...operation,
      siteCodes: [...operation.siteCodes],
      datasetId,
      dataOrigin: DATA_ORIGIN,
    }
    const operationId = current
      ? current._id
      : await ctx.db.insert("fretOperations", value)
    if (current) await ctx.db.patch(current._id, value)
    operationIds.set(operation.operationCode, operationId)
  }

  const expectedCodes = new Set(
    OPERATIONS.map((operation) => operation.operationCode)
  )
  for (const stale of existing) {
    if (
      stale.dataOrigin === DATA_ORIGIN &&
      !expectedCodes.has(
        stale.operationCode as (typeof OPERATIONS)[number]["operationCode"]
      )
    ) {
      await ctx.db.delete(stale._id)
    }
  }
  return operationIds
}

async function upsertAlerts(
  ctx: MutationCtx,
  datasetId: Id<"fretDatasets">,
  operationIds: ReadonlyMap<string, Id<"fretOperations">>
) {
  const existing = await ctx.db
    .query("fretAlerts")
    .withIndex("by_dataset_status", (builder) =>
      builder.eq("datasetId", datasetId)
    )
    .collect()
  const byCode = new Map(existing.map((row) => [row.alertCode, row]))

  for (const alert of ALERTS) {
    const { operationCode, ...fields } = alert
    const operationId = operationIds.get(operationCode)
    if (!operationId) {
      throw new Error(
        `Opération Fret de démonstration absente : ${operationCode}`
      )
    }
    const value = {
      ...fields,
      siteCodes: [...fields.siteCodes],
      operationId,
      datasetId,
      dataOrigin: DATA_ORIGIN,
    }
    const current = byCode.get(alert.alertCode)
    if (current) await ctx.db.patch(current._id, value)
    else await ctx.db.insert("fretAlerts", value)
  }

  const expectedCodes = new Set(ALERTS.map((alert) => alert.alertCode))
  for (const stale of existing) {
    if (
      stale.dataOrigin === DATA_ORIGIN &&
      !expectedCodes.has(
        stale.alertCode as (typeof ALERTS)[number]["alertCode"]
      )
    ) {
      await ctx.db.delete(stale._id)
    }
  }
}
