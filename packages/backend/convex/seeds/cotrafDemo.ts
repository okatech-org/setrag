import type { Id } from "../_generated/dataModel"
import { internalMutation, type MutationCtx } from "../_generated/server"
import { COTRAF_DEMO_DATASET_KEY } from "../modules/cotraf/model"

const DATA_ORIGIN = "synthetic_demo" as const
const REFERENCE_AT = Date.parse("2026-09-10T10:30:00+01:00")
const SEEDED_AT = Date.parse("2026-09-10T00:00:00+01:00")

const DATASET = {
  datasetKey: COTRAF_DEMO_DATASET_KEY,
  dataOrigin: DATA_ORIGIN,
  label: "Démonstration COTRAF — graphique espace-temps",
  notice:
    "Scénario entièrement synthétique inspiré du corridor ferroviaire public de la SETRAG. Il ne constitue ni un graphique réel de circulation, ni un ordre de régulation.",
  referenceAt: REFERENCE_AT,
  pkConvention:
    "Points kilométriques lus dans le référentiel applicatif SETRAG ; origine, bornes et distances à valider sur le référentiel officiel avant tout usage opérationnel.",
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

const MOVEMENTS = [
  {
    movementCode: "DEMO-COT-PAX-101",
    trainNumber: "PAX-101",
    serviceType: "voyageurs",
    direction: "croissant",
    status: "en_ligne",
    originStationCode: "OWE",
    destinationStationCode: "FCV",
    siteCodes: ["OWE", "NDJ", "BOO", "MOA", "FCV"],
    currentPk: 290,
    delayMinutes: 15,
    priority: 80,
    lastEventAt: Date.parse("2026-09-10T10:18:00+01:00"),
    trajectory: [
      ["OWE", "2026-09-10T05:45:00+01:00", "2026-09-10T05:52:00+01:00"],
      ["NDJ", "2026-09-10T09:00:00+01:00", "2026-09-10T09:12:00+01:00"],
      ["BOO", "2026-09-10T11:40:00+01:00", "2026-09-10T11:55:00+01:00"],
      ["MOA", "2026-09-10T16:30:00+01:00", "2026-09-10T16:45:00+01:00"],
      ["FCV", "2026-09-10T17:45:00+01:00", "2026-09-10T18:00:00+01:00"],
    ],
  },
  {
    movementCode: "DEMO-COT-MIN-704",
    trainNumber: "MIN-704",
    serviceType: "minerai",
    direction: "decroissant",
    status: "en_ligne",
    originStationCode: "MOA",
    destinationStationCode: "OWE",
    siteCodes: ["MOA", "BOO", "NDJ", "OWE"],
    currentPk: 260,
    delayMinutes: 20,
    priority: 100,
    lastEventAt: Date.parse("2026-09-10T10:22:00+01:00"),
    trajectory: [
      ["MOA", "2026-09-10T01:20:00+01:00", "2026-09-10T01:32:00+01:00"],
      ["BOO", "2026-09-10T07:30:00+01:00", "2026-09-10T07:45:00+01:00"],
      ["NDJ", "2026-09-10T11:00:00+01:00", "2026-09-10T11:20:00+01:00"],
      ["OWE", "2026-09-10T15:50:00+01:00", "2026-09-10T16:10:00+01:00"],
    ],
  },
  {
    movementCode: "DEMO-COT-BOI-203",
    trainNumber: "BOI-203",
    serviceType: "bois",
    direction: "croissant",
    status: "arrive",
    originStationCode: "OWE",
    destinationStationCode: "NDJ",
    siteCodes: ["OWE", "NDJ"],
    currentPk: 182,
    delayMinutes: 0,
    priority: 50,
    lastEventAt: Date.parse("2026-09-10T04:30:00+01:00"),
    trajectory: [
      ["OWE", "2026-09-10T00:15:00+01:00", "2026-09-10T00:15:00+01:00"],
      ["NDJ", "2026-09-10T04:30:00+01:00", "2026-09-10T04:30:00+01:00"],
    ],
  },
  {
    movementCode: "DEMO-COT-SRV-002",
    trainNumber: "SRV-002",
    serviceType: "service",
    direction: "decroissant",
    status: "planifie",
    originStationCode: "FCV",
    destinationStationCode: "MOA",
    siteCodes: ["FCV", "MOA"],
    delayMinutes: 0,
    priority: 40,
    lastEventAt: Date.parse("2026-09-10T09:50:00+01:00"),
    trajectory: [
      ["FCV", "2026-09-10T20:00:00+01:00"],
      ["MOA", "2026-09-10T21:10:00+01:00"],
    ],
  },
] as const

const SEGMENTS = [
  {
    segmentCode: "DEMO-SEG-OWE-NDJ",
    fromStationCode: "OWE",
    toStationCode: "NDJ",
    siteCodes: ["OWE", "NDJ"],
    status: "libre",
    speedLimitKph: 70,
    note: "Section synthétique disponible au moment de référence.",
  },
  {
    segmentCode: "DEMO-SEG-NDJ-BOO",
    fromStationCode: "NDJ",
    toStationCode: "BOO",
    siteCodes: ["NDJ", "BOO"],
    status: "occupe",
    movementCode: "DEMO-COT-MIN-704",
    enteredAt: Date.parse("2026-09-10T07:45:00+01:00"),
    expectedReleaseAt: Date.parse("2026-09-10T11:20:00+01:00"),
    speedLimitKph: 55,
    note: "Occupation synthétique en conflit avec la prévision voyageurs ; arbitrage fictif requis.",
  },
  {
    segmentCode: "DEMO-SEG-BOO-MOA",
    fromStationCode: "BOO",
    toStationCode: "MOA",
    siteCodes: ["BOO", "MOA"],
    status: "reserve",
    movementCode: "DEMO-COT-PAX-101",
    expectedReleaseAt: Date.parse("2026-09-10T16:45:00+01:00"),
    speedLimitKph: 60,
    note: "Réservation synthétique du sillon voyageurs.",
  },
  {
    segmentCode: "DEMO-SEG-MOA-FCV",
    fromStationCode: "MOA",
    toStationCode: "FCV",
    siteCodes: ["MOA", "FCV"],
    status: "libre",
    speedLimitKph: 65,
    note: "Section synthétique disponible au moment de référence.",
  },
] as const

const EVENTS = [
  {
    eventCode: "DEMO-EVT-CONFLIT-NDJ-BOO",
    siteCodes: ["NDJ", "BOO"],
    category: "alerte",
    severity: "critical",
    title: "Chevauchement opposé illustratif",
    message:
      "Les prévisions synthétiques de PAX-101 et MIN-704 se recouvrent sur la section Ndjolé–Booué.",
    siteLabel: "Section Ndjolé–Booué",
    status: "ouverte",
    occurredAt: Date.parse("2026-09-10T09:12:00+01:00"),
    dueAt: Date.parse("2026-09-10T10:45:00+01:00"),
    primaryTrainNumber: "MIN-704",
    secondaryTrainNumber: "PAX-101",
  },
  {
    eventCode: "DEMO-EVT-CROISEMENT-BOO",
    siteCodes: ["BOO"],
    category: "croisement",
    severity: "information",
    title: "Croisement de démonstration préparé",
    message:
      "Le scénario prévoit une retenue en gare de Booué ; cette décision n'est pas un ordre réel.",
    siteLabel: "Booué",
    status: "planifie",
    occurredAt: Date.parse("2026-09-10T10:05:00+01:00"),
    primaryTrainNumber: "MIN-704",
    secondaryTrainNumber: "PAX-101",
    estimatedGainMinutes: 18,
  },
  {
    eventCode: "DEMO-EVT-OTR-SRV-002",
    siteCodes: ["FCV", "MOA"],
    category: "otr",
    severity: "information",
    title: "Ordre de travaux fictif",
    message:
      "Circulation de service SRV-002 réservée à un scénario pédagogique.",
    siteLabel: "Franceville–Moanda",
    status: "confirme",
    occurredAt: Date.parse("2026-09-10T09:50:00+01:00"),
    primaryTrainNumber: "SRV-002",
  },
  {
    eventCode: "DEMO-EVT-JOURNAL-BOI-203",
    siteCodes: ["OWE", "NDJ"],
    category: "journal",
    severity: "information",
    title: "Arrivée bois enregistrée",
    message: "BOI-203 est arrivé à Ndjolé dans le scénario synthétique.",
    siteLabel: "Ndjolé",
    status: "resolue",
    occurredAt: Date.parse("2026-09-10T04:30:00+01:00"),
    primaryTrainNumber: "BOI-203",
  },
] as const

type StationCode = "OWE" | "NDJ" | "BOO" | "MOA" | "FCV"

async function loadStations(ctx: MutationCtx) {
  const stations = new Map<StationCode, Id<"stations">>()
  for (const code of ["OWE", "NDJ", "BOO", "MOA", "FCV"] as const) {
    const station = await ctx.db
      .query("stations")
      .withIndex("by_code", (builder) => builder.eq("code", code))
      .unique()
    if (!station) {
      throw new Error(
        `Peuplement COTRAF refusé : la gare ${code} est absente du référentiel.`
      )
    }
    stations.set(code, station._id)
  }
  return stations
}

function stationId(
  stations: ReadonlyMap<StationCode, Id<"stations">>,
  code: StationCode
) {
  const id = stations.get(code)
  if (!id) throw new Error(`Gare COTRAF non résolue : ${code}.`)
  return id
}

async function upsertMovements(
  ctx: MutationCtx,
  datasetId: Id<"cotrafDatasets">,
  stations: ReadonlyMap<StationCode, Id<"stations">>
) {
  const ids = new Map<string, Id<"cotrafMovements">>()
  for (const movement of MOVEMENTS) {
    const existing = await ctx.db
      .query("cotrafMovements")
      .withIndex("by_dataset_code", (builder) =>
        builder
          .eq("datasetId", datasetId)
          .eq("movementCode", movement.movementCode)
      )
      .unique()
    const value = {
      datasetId,
      dataOrigin: DATA_ORIGIN,
      movementCode: movement.movementCode,
      trainNumber: movement.trainNumber,
      serviceType: movement.serviceType,
      direction: movement.direction,
      status: movement.status,
      originStationId: stationId(stations, movement.originStationCode),
      destinationStationId: stationId(
        stations,
        movement.destinationStationCode
      ),
      siteCodes: [...movement.siteCodes],
      ...("currentPk" in movement ? { currentPk: movement.currentPk } : {}),
      delayMinutes: movement.delayMinutes,
      priority: movement.priority,
      lastEventAt: movement.lastEventAt,
      trajectory: movement.trajectory.map((point) => ({
        stationId: stationId(stations, point[0]),
        plannedAt: Date.parse(point[1]),
        ...(point[2] ? { forecastAt: Date.parse(point[2]) } : {}),
      })),
    }
    const id = existing
      ? existing._id
      : await ctx.db.insert("cotrafMovements", value)
    if (existing) await ctx.db.patch(existing._id, value)
    ids.set(movement.movementCode, id)
  }
  return ids
}

async function upsertSegments(
  ctx: MutationCtx,
  datasetId: Id<"cotrafDatasets">,
  stations: ReadonlyMap<StationCode, Id<"stations">>,
  movements: ReadonlyMap<string, Id<"cotrafMovements">>
) {
  for (const segment of SEGMENTS) {
    const existing = await ctx.db
      .query("cotrafSegments")
      .withIndex("by_dataset_code", (builder) =>
        builder
          .eq("datasetId", datasetId)
          .eq("segmentCode", segment.segmentCode)
      )
      .unique()
    const movementId =
      "movementCode" in segment
        ? movements.get(segment.movementCode)
        : undefined
    if ("movementCode" in segment && !movementId) {
      throw new Error(
        `Circulation COTRAF non résolue : ${segment.movementCode}.`
      )
    }
    const value = {
      datasetId,
      dataOrigin: DATA_ORIGIN,
      segmentCode: segment.segmentCode,
      fromStationId: stationId(stations, segment.fromStationCode),
      toStationId: stationId(stations, segment.toStationCode),
      siteCodes: [...segment.siteCodes],
      status: segment.status,
      ...(movementId ? { movementId } : {}),
      ...("enteredAt" in segment ? { enteredAt: segment.enteredAt } : {}),
      ...("expectedReleaseAt" in segment
        ? { expectedReleaseAt: segment.expectedReleaseAt }
        : {}),
      speedLimitKph: segment.speedLimitKph,
      note: segment.note,
    }
    if (existing) await ctx.db.patch(existing._id, value)
    else await ctx.db.insert("cotrafSegments", value)
  }
}

async function upsertEvents(ctx: MutationCtx, datasetId: Id<"cotrafDatasets">) {
  for (const event of EVENTS) {
    const existing = await ctx.db
      .query("cotrafEvents")
      .withIndex("by_dataset_code", (builder) =>
        builder.eq("datasetId", datasetId).eq("eventCode", event.eventCode)
      )
      .unique()
    const value = {
      datasetId,
      dataOrigin: DATA_ORIGIN,
      eventCode: event.eventCode,
      siteCodes: [...event.siteCodes],
      category: event.category,
      severity: event.severity,
      title: event.title,
      message: event.message,
      siteLabel: event.siteLabel,
      status: event.status,
      occurredAt: event.occurredAt,
      ...("dueAt" in event ? { dueAt: event.dueAt } : {}),
      ...("primaryTrainNumber" in event
        ? { primaryTrainNumber: event.primaryTrainNumber }
        : {}),
      ...("secondaryTrainNumber" in event
        ? { secondaryTrainNumber: event.secondaryTrainNumber }
        : {}),
      ...("estimatedGainMinutes" in event
        ? { estimatedGainMinutes: event.estimatedGainMinutes }
        : {}),
    }
    if (existing) await ctx.db.patch(existing._id, value)
    else await ctx.db.insert("cotrafEvents", value)
  }
}

/**
 * Provisionne une projection COTRAF démonstrative, rejouable et non destructive.
 * Le référentiel des gares doit exister : ses PK sont la seule échelle utilisée.
 */
export const provision = internalMutation({
  args: {},
  handler: async (ctx) => {
    if (process.env.DEMO_ACCOUNTS_ENABLED !== "true") {
      throw new Error(
        "Peuplement refusé : DEMO_ACCOUNTS_ENABLED doit valoir true."
      )
    }

    const stations = await loadStations(ctx)
    const existingDatasets = await ctx.db
      .query("cotrafDatasets")
      .withIndex("by_key", (builder) =>
        builder.eq("datasetKey", COTRAF_DEMO_DATASET_KEY)
      )
      .collect()
    if (existingDatasets.length > 1) {
      throw new Error(
        `Jeu COTRAF ambigu : ${existingDatasets.length} datasets portent la clé ${COTRAF_DEMO_DATASET_KEY}.`
      )
    }
    const existingDataset = existingDatasets[0]
    if (existingDataset && existingDataset.dataOrigin !== DATA_ORIGIN) {
      throw new Error(
        "Peuplement COTRAF refusé : la clé de démonstration est utilisée par un dataset opérationnel."
      )
    }

    const datasetValue = {
      ...DATASET,
      referenceSources: DATASET.referenceSources.map((source) => ({
        ...source,
      })),
    }
    const datasetId = existingDataset
      ? existingDataset._id
      : await ctx.db.insert("cotrafDatasets", datasetValue)
    if (existingDataset) await ctx.db.patch(existingDataset._id, datasetValue)

    const movementIds = await upsertMovements(ctx, datasetId, stations)
    await upsertSegments(ctx, datasetId, stations, movementIds)
    await upsertEvents(ctx, datasetId)

    const stationDocuments = await Promise.all(
      [...stations.values()].map((id) => ctx.db.get(id))
    )
    const kilometerPoints = stationDocuments
      .filter((station) => station !== null)
      .map((station) => station.kilometerPoint)

    return {
      datasetId,
      datasetKey: COTRAF_DEMO_DATASET_KEY,
      dataOrigin: DATA_ORIGIN,
      movements: MOVEMENTS.length,
      segments: SEGMENTS.length,
      events: EVENTS.length,
      conflictsExpected: 1,
      pkRange: {
        from: Math.min(...kilometerPoints),
        to: Math.max(...kilometerPoints),
      },
      created: existingDataset === undefined,
    }
  },
})
