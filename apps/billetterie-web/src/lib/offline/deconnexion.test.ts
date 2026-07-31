import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  closeDb,
  DB_NAME,
  declarerProprietaire,
  enregistrerParcours,
  lireEtat,
  listerDossiers,
  listerParcours,
  openDb,
  remplacerDossiers,
} from "./db"
import type { DetailTrajet, Dossier } from "./types"

const { signOutMock } = vi.hoisted(() => ({
  signOutMock: vi.fn().mockResolvedValue({}),
}))

vi.mock("@workspace/api/auth-client", () => ({
  authClient: { signOut: signOutMock },
}))

const { seDeconnecter } = await import("./deconnexion")

function dossier(reference: string): Dossier {
  return {
    sale: { number: reference, status: "confirmee" },
    tickets: [{ number: "BLT-1", barcodePayload: "AZTEC" }],
    trip: { _id: "trip-1", departureAt: 1_000 },
    origin: null,
    destination: null,
  } as unknown as Dossier
}

function parcours(): DetailTrajet {
  return {
    trip: {
      _id: "trip-1",
      trainNumber: "TR-201",
      serviceDate: "2026-08-02",
    },
    stops: [],
    counters: [],
  } as unknown as DetailTrajet
}

beforeEach(async () => {
  await closeDb()
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(DB_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () => resolve()
    request.onblocked = () => resolve()
  })
  await openDb()
  signOutMock.mockClear()
})

describe("déconnexion du voyageur", () => {
  it("efface billets et parcours avant de fermer la session", async () => {
    await declarerProprietaire("voyageur-a")
    await remplacerDossiers([dossier("RS-1")], 1_000)
    await enregistrerParcours(parcours(), 1_000)

    await seDeconnecter()

    expect(await listerDossiers()).toEqual([])
    expect(await listerParcours()).toEqual([])
    expect(await lireEtat()).toEqual({
      utilisateur: null,
      billetsRecusLe: null,
    })
    expect(signOutMock).toHaveBeenCalledOnce()
  })

  it("ferme la session même si la base locale est inaccessible", async () => {
    // Navigation privée, quota refusé : la déconnexion doit aboutir, sans quoi
    // le voyageur resterait connecté sur un appareil qu'il quitte.
    const indexedDBReel = globalThis.indexedDB
    await closeDb()
    Object.defineProperty(globalThis, "indexedDB", {
      configurable: true,
      value: undefined,
    })

    try {
      await expect(seDeconnecter()).resolves.toBeUndefined()
      expect(signOutMock).toHaveBeenCalledOnce()
    } finally {
      Object.defineProperty(globalThis, "indexedDB", {
        configurable: true,
        value: indexedDBReel,
      })
    }
  })
})
