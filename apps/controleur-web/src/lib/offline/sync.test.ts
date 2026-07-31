import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  closeDb,
  commitOperation,
  getRecord,
  listPending,
  openDb,
} from "./db"
import { synchronize, type SyncTransport } from "./sync"
import type { LocalIncident, LocalPenalty, LocalSale, LocalScan } from "./types"

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

function transport(overrides: Partial<SyncTransport> = {}): SyncTransport {
  return {
    syncScans: vi.fn(async () => ({
      created: 1,
      duplicates: 0,
      conflicts: 0,
    })),
    syncSale: vi.fn(async () => ({
      status: "cree" as const,
      saleNumber: "V-2026-000123",
      ticketNumbers: ["B-000456"],
      serverXaf: 14_000,
    })),
    syncPenalties: vi.fn(async () => ({
      created: 1,
      duplicates: 0,
      numbers: ["PV-000117"],
    })),
    syncIncidents: vi.fn(async () => ({
      created: 1,
      duplicates: 0,
      critical: 1,
    })),
    uploadUrl: vi.fn(async () => "https://exemple.test/upload"),
    ...overrides,
  }
}

function scan(id: string): LocalScan {
  return {
    clientScanId: id,
    tripId: TRIP,
    ticketId: "t1",
    ticketNumber: "B-4821",
    result: "valide",
    verdict: "valide",
    scannedAt: Date.now(),
    offline: true,
    state: "pending",
  }
}

function sale(id: string): LocalSale {
  return {
    clientSaleId: id,
    tripId: TRIP,
    originStationId: "s0",
    destinationStationId: "s1",
    originName: "Booué",
    destinationName: "Franceville",
    serviceClass: "DEUXIEME",
    passengers: [{ lastName: "NGUEMA", firstName: "Serge", gender: "M" }],
    distanceKm: 313,
    quotedXaf: 13_120,
    method: "especes",
    localRef: "B-9002",
    soldAt: Date.now(),
    state: "pending",
  }
}

function penalty(id: string): LocalPenalty {
  return {
    clientId: id,
    tripId: TRIP,
    offender: { lastName: "NGUEMA", declined: false },
    reason: "sans_titre",
    fineXaf: 25_000,
    legXaf: 5_160,
    amountXaf: 30_160,
    paidOnBoard: true,
    signature: "signe",
    issuedAt: Date.now(),
    offline: true,
    localNumber: "PV-0117",
    state: "pending",
  }
}

function incident(id: string): LocalIncident {
  return {
    clientId: id,
    tripId: TRIP,
    category: "technique",
    severity: "critique",
    description: "Porte de la voiture 3 bloquée",
    photoIds: [],
    reportedAt: Date.now(),
    offline: true,
    localNumber: "INC-0042",
    state: "pending",
  }
}

describe("Synchronisation", () => {
  beforeEach(freshDb)

  it("envoie l'incident critique avant les contrôles", async () => {
    await commitOperation("scan", "c1", scan("c1"))
    await commitOperation("penalty", "p1", penalty("p1"))
    await commitOperation("incident", "i1", incident("i1"), { priority: 0 })

    const ordre: string[] = []
    const t = transport({
      syncScans: vi.fn(async () => {
        ordre.push("scan")
        return { created: 1, duplicates: 0, conflicts: 0 }
      }),
      syncPenalties: vi.fn(async () => {
        ordre.push("penalty")
        return { created: 1, duplicates: 0, numbers: ["PV-000117"] }
      }),
      syncIncidents: vi.fn(async () => {
        ordre.push("incident")
        return { created: 1, duplicates: 0, critical: 1 }
      }),
    })

    const report = await synchronize(t)
    expect(ordre).toEqual(["incident", "penalty", "scan"])
    expect(report.sent).toBe(3)
    expect(await listPending()).toHaveLength(0)
  })

  it("inscrit sur la vente le numéro rendu par le serveur", async () => {
    await commitOperation("sale", "v1", sale("v1"))
    await synchronize(transport())

    const stored = await getRecord<LocalSale>("sale", "v1")
    expect(stored).toMatchObject({
      state: "sent",
      serverSaleNumber: "V-2026-000123",
      serverTicketNumbers: ["B-000456"],
    })
  })

  it("garde une vente refusée sans bloquer les autres", async () => {
    await commitOperation("sale", "v1", sale("v1"))
    await commitOperation("sale", "v2", { ...sale("v2"), localRef: "B-9003" })

    let appel = 0
    const report = await synchronize(
      transport({
        syncSale: vi.fn(async () => {
          appel += 1
          if (appel === 1) throw new Error("Plus de place sur le segment")
          return {
            status: "cree" as const,
            saleNumber: "V-2026-000124",
            ticketNumbers: ["B-000457"],
            serverXaf: 13_120,
          }
        }),
      })
    )

    expect(report.sent).toBe(1)
    expect(report.failed).toBe(1)
    expect(report.errors[0]).toMatch(/Plus de place/)

    const restants = await listPending()
    expect(restants).toHaveLength(1)
    expect(restants[0]).toMatchObject({ id: "v1", state: "failed", attempts: 1 })
  })

  it("ne supprime rien quand le réseau lâche en plein envoi", async () => {
    await commitOperation("scan", "c1", scan("c1"))
    const report = await synchronize(
      transport({
        syncScans: vi.fn(async () => {
          throw new Error("réseau perdu")
        }),
      })
    )

    expect(report.failed).toBe(1)
    const restants = await listPending()
    expect(restants[0]).toMatchObject({
      id: "c1",
      state: "failed",
      lastError: "réseau perdu",
    })
    // L'écriture métier reste consultable : elle est due, pas perdue.
    expect(await getRecord<LocalScan>("scan", "c1")).toBeDefined()
  })

  it("rejoue un lot sans le dupliquer, l'idempotence tenant côté serveur", async () => {
    await commitOperation("scan", "c1", scan("c1"))
    const t = transport({
      syncScans: vi.fn(async () => {
        throw new Error("délai dépassé")
      }),
    })
    await synchronize(t)

    const t2 = transport()
    const report = await synchronize(t2)
    expect(report.sent).toBe(1)
    expect(t2.syncScans).toHaveBeenCalledWith({
      scans: [expect.objectContaining({ clientScanId: "c1" })],
    })
    // Un second passage n'a plus rien à envoyer.
    const rien = await synchronize(t2)
    expect(rien.sent).toBe(0)
  })

  it("remonte les conflits signalés par le serveur", async () => {
    await commitOperation("scan", "c1", scan("c1"))
    const report = await synchronize(
      transport({
        syncScans: vi.fn(async () => ({
          created: 1,
          duplicates: 0,
          conflicts: 1,
        })),
      })
    )
    expect(report.conflicts).toBe(1)
  })
})
