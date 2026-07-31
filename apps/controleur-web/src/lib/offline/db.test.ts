import { beforeEach, describe, expect, it } from "vitest"

import {
  commitOperation,
  getManifest,
  listPending,
  listTickets,
  markFailed,
  markSent,
  openDb,
  purgeLocalData,
  putManifest,
  putTicketBatch,
  queueSummary,
  closeDb,
  scansForTicket,
} from "./db"
import type { EmbarkedManifest, LocalIncident, LocalScan } from "./types"

/** Repart d'une base vierge : les tests ne doivent pas se contaminer. */
async function freshDb(): Promise<void> {
  await closeDb()
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase("setrag-controle")
    request.onsuccess = () => resolve()
    request.onerror = () => resolve()
    request.onblocked = () => resolve()
  })
  await openDb()
}

const TRIP = "trip_1"

function manifest(): EmbarkedManifest {
  return {
    tripId: TRIP,
    trainNumber: "TR-201",
    trainType: "EXPRESS",
    serviceDate: "2026-08-14",
    departureAt: Date.now(),
    originName: "Owendo",
    destinationName: "Franceville",
    segmentCount: 3,
    stops: [],
    fare: null,
    penalties: [],
    signing: { publicKey: "00", keyVersion: 1, isDemoKey: true },
    ticketCount: 3,
    downloadedCount: 0,
    cursor: null,
    complete: false,
    updatedAt: Date.now(),
  }
}

function scan(id: string, ticketNumber = "B-4821"): LocalScan {
  return {
    clientScanId: id,
    tripId: TRIP,
    ticketNumber,
    result: "valide",
    verdict: "valide",
    scannedAt: Date.now(),
    offline: true,
    state: "pending",
  }
}

function incident(id: string, severity: LocalIncident["severity"]): LocalIncident {
  return {
    clientId: id,
    tripId: TRIP,
    category: "technique",
    severity,
    description: "Porte bloquée",
    photoIds: [],
    reportedAt: Date.now(),
    offline: true,
    localNumber: "INC-0001",
    state: "pending",
  }
}

describe("Base embarquée", () => {
  beforeEach(freshDb)

  it("écrit l'opération et sa mise en file d'un seul tenant", async () => {
    await commitOperation("scan", "c1", scan("c1"))
    const pending = await listPending()
    expect(pending).toHaveLength(1)
    expect(pending[0]).toMatchObject({ id: "c1", kind: "scan", attempts: 0 })
  })

  it("classe la file par priorité d'exploitation, pas par ordre d'arrivée", async () => {
    await commitOperation("scan", "c1", scan("c1"))
    await commitOperation("sale", "v1", {
      clientSaleId: "v1",
      tripId: TRIP,
      originStationId: "s0",
      destinationStationId: "s1",
      originName: "Owendo",
      destinationName: "Booué",
      serviceClass: "DEUXIEME",
      passengers: [],
      distanceKm: 340,
      quotedXaf: 14_000,
      method: "especes",
      localRef: "B-9002",
      soldAt: Date.now(),
      state: "pending",
    })
    // L'incident arrive en dernier mais part en premier : sa gravité prime.
    await commitOperation("incident", "i1", incident("i1", "critique"), {
      priority: 0,
    })

    const ordre = (await listPending()).map((e) => e.id)
    expect(ordre).toEqual(["i1", "v1", "c1"])
  })

  it("conserve une écriture en échec, avec son motif et ses tentatives", async () => {
    await commitOperation("scan", "c1", scan("c1"))
    await markFailed("scan", "c1", "délai dépassé")
    await markFailed("scan", "c1", "refus serveur")

    const [entry] = await listPending()
    expect(entry).toMatchObject({
      state: "failed",
      attempts: 2,
      lastError: "refus serveur",
    })
  })

  it("compte séparément ce qui attend, ce qui a échoué et ce qui est parti", async () => {
    await commitOperation("scan", "c1", scan("c1"))
    await commitOperation("scan", "c2", scan("c2", "B-4830"))
    await commitOperation("incident", "i1", incident("i1", "critique"), {
      priority: 0,
    })
    await markSent("scan", "c1")
    await markFailed("scan", "c2", "réseau perdu")

    const summary = await queueSummary()
    expect(summary.byKind.scan).toEqual({ pending: 0, failed: 1, sent: 1 })
    expect(summary.failed).toBe(1)
    expect(summary.criticalPending).toBe(1)
    expect(summary.total).toBe(2)
  })

  it("retrouve les contrôles d'un titre pour l'anti-repassage", async () => {
    await commitOperation("scan", "c1", scan("c1"))
    await commitOperation("scan", "c2", scan("c2", "B-4830"))
    const precedents = await scansForTicket("B-4821")
    expect(precedents).toHaveLength(1)
    expect(precedents[0]!.clientScanId).toBe("c1")
  })
})

describe("Téléchargement par lots", () => {
  beforeEach(freshDb)

  it("avance le curseur avec les titres qu'il accompagne", async () => {
    await putManifest(manifest())
    await putTicketBatch(
      TRIP,
      [
        {
          _id: "t1",
          number: "B-1",
          passenger: { lastName: "OBAME", firstName: "Jean", gender: "M" },
          serviceClass: "DEUXIEME",
          fromStopIndex: 0,
          toStopIndex: 3,
          status: "valide",
        },
      ],
      { cursor: "curseur-1", complete: false }
    )

    const apres = await getManifest(TRIP)
    expect(apres).toMatchObject({
      downloadedCount: 1,
      cursor: "curseur-1",
      complete: false,
    })
  })

  it("ne gonfle pas le compteur quand un lot est rejoué", async () => {
    await putManifest(manifest())
    const lot = [
      {
        _id: "t1",
        number: "B-1",
        passenger: { lastName: "OBAME", firstName: "Jean", gender: "M" as const },
        serviceClass: "DEUXIEME",
        fromStopIndex: 0,
        toStopIndex: 3,
        status: "valide",
      },
    ]
    await putTicketBatch(TRIP, lot, { cursor: "c1", complete: false })
    await putTicketBatch(TRIP, lot, { cursor: "c1", complete: false })

    expect((await getManifest(TRIP))?.downloadedCount).toBe(1)
    expect(await listTickets(TRIP)).toHaveLength(1)
  })
})

describe("Purge de fin de tournée", () => {
  beforeEach(freshDb)

  it("refuse tant qu'une écriture n'est pas confirmée", async () => {
    await commitOperation("scan", "c1", scan("c1"))
    await expect(purgeLocalData()).rejects.toThrow(/1 écritures/)
  })

  it("efface les données voyageurs une fois tout confirmé", async () => {
    await putManifest(manifest())
    await commitOperation("scan", "c1", scan("c1"))
    await markSent("scan", "c1")

    await purgeLocalData()
    expect(await getManifest(TRIP)).toBeUndefined()
    expect(await listPending()).toHaveLength(0)
  })
})
