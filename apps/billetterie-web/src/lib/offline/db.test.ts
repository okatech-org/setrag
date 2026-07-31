import { beforeEach, describe, expect, it } from "vitest"

import {
  chercherParcours,
  closeDb,
  declarerProprietaire,
  DB_NAME,
  effacerDonneesLocales,
  elaguerParcours,
  enregistrerParcours,
  lireDossier,
  lireEtat,
  lireParcours,
  listerDossiers,
  listerParcours,
  openDb,
  remplacerDossiers,
} from "./db"
import type { DetailTrajet, Dossier } from "./types"

/** Repart d'une base vierge : les tests ne doivent pas se contaminer. */
async function baseNeuve(): Promise<void> {
  await closeDb()
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(DB_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () => resolve()
    request.onblocked = () => resolve()
  })
  await openDb()
}

/**
 * Dossier minimal.
 *
 * Seuls les champs que la base indexe ou relit sont posés ; le reste passe en
 * bloc, ce qui est exactement le contrat de la copie locale.
 */
function dossier(
  reference: string,
  options: { departureAt?: number; tripId?: string } = {}
): Dossier {
  const { departureAt = 1_800_000_000_000, tripId = "trip-1" } = options
  return {
    sale: { number: reference, status: "confirmee" },
    tickets: [{ number: `${reference}-1`, barcodePayload: "AZTEC" }],
    trip: { _id: tripId, trainNumber: "T101", departureAt },
    origin: { name: "Owendo" },
    destination: { name: "Franceville" },
  } as unknown as Dossier
}

function parcours(
  tripId: string,
  trainNumber: string,
  serviceDate: string
): DetailTrajet {
  return {
    trip: { _id: tripId, trainNumber, serviceDate, delayMinutes: 12 },
    stops: [{ _id: "stop-1", sequence: 1, station: { name: "Ndjolé" } }],
    counters: [],
  } as unknown as DetailTrajet
}

beforeEach(async () => {
  await baseNeuve()
})

describe("dossiers", () => {
  it("relit un dossier enregistré, avec le code de son billet", async () => {
    await remplacerDossiers([dossier("RS-2026-1")], 1_000)

    const relu = await lireDossier("RS-2026-1")
    expect(relu?.dossier.tickets[0]?.barcodePayload).toBe("AZTEC")
    expect(relu?.enregistreLe).toBe(1_000)
  })

  it("trie les dossiers par heure de départ", async () => {
    await remplacerDossiers(
      [
        dossier("RS-2", { departureAt: 3_000 }),
        dossier("RS-1", { departureAt: 1_000 }),
      ],
      1_000
    )

    const liste = await listerDossiers()
    expect(liste.map((item) => item.reference)).toEqual(["RS-1", "RS-2"])
  })

  it("oublie un dossier absent du dernier envoi du serveur", async () => {
    await remplacerDossiers([dossier("RS-1"), dossier("RS-2")], 1_000)
    // Le voyageur a annulé RS-2 depuis un autre appareil : le serveur ne le
    // renvoie plus, il doit disparaître du téléphone.
    await remplacerDossiers([dossier("RS-1")], 2_000)

    expect(await lireDossier("RS-2")).toBeUndefined()
    expect((await lireEtat()).billetsRecusLe).toBe(2_000)
  })
})

describe("parcours", () => {
  it("se retrouve par numéro de train et date de circulation", async () => {
    await enregistrerParcours(parcours("trip-1", "T101", "2026-08-02"), 1_000)

    const trouve = await chercherParcours("T101", "2026-08-02")
    expect(trouve?.tripId).toBe("trip-1")
    expect(trouve?.detail.trip.delayMinutes).toBe(12)
  })

  it("ne confond pas deux circulations du même train", async () => {
    await enregistrerParcours(parcours("trip-1", "T101", "2026-08-02"), 1_000)
    await enregistrerParcours(parcours("trip-2", "T101", "2026-08-03"), 1_000)

    expect((await chercherParcours("T101", "2026-08-03"))?.tripId).toBe("trip-2")
  })

  it("ne retourne rien pour une circulation jamais téléchargée", async () => {
    expect(await chercherParcours("T999", "2026-08-02")).toBeUndefined()
  })

  it("élague les parcours dont plus aucun billet ne dépend", async () => {
    await enregistrerParcours(parcours("trip-1", "T101", "2026-08-02"), 1_000)
    await enregistrerParcours(parcours("trip-2", "T202", "2026-08-02"), 1_000)

    const retires = await elaguerParcours(["trip-1"])

    expect(retires).toBe(1)
    expect(await lireParcours("trip-1")).toBeDefined()
    expect(await lireParcours("trip-2")).toBeUndefined()
  })
})

describe("propriétaire des données", () => {
  it("efface les billets quand un autre voyageur se connecte", async () => {
    await declarerProprietaire("voyageur-a")
    await remplacerDossiers([dossier("RS-1")], 1_000)
    await enregistrerParcours(parcours("trip-1", "T101", "2026-08-02"), 1_000)

    const efface = await declarerProprietaire("voyageur-b")

    expect(efface).toBe(true)
    expect(await listerDossiers()).toEqual([])
    expect(await listerParcours()).toEqual([])
    expect(await lireEtat()).toEqual({
      utilisateur: "voyageur-b",
      billetsRecusLe: null,
    })
  })

  it("conserve les billets quand le même voyageur revient", async () => {
    await declarerProprietaire("voyageur-a")
    await remplacerDossiers([dossier("RS-1")], 1_000)

    const efface = await declarerProprietaire("voyageur-a")

    expect(efface).toBe(false)
    expect(await listerDossiers()).toHaveLength(1)
  })

  it("ne laisse rien derrière lui à la déconnexion", async () => {
    await declarerProprietaire("voyageur-a")
    await remplacerDossiers([dossier("RS-1")], 1_000)
    await enregistrerParcours(parcours("trip-1", "T101", "2026-08-02"), 1_000)

    await effacerDonneesLocales()

    expect(await listerDossiers()).toEqual([])
    expect(await listerParcours()).toEqual([])
    expect(await lireEtat()).toEqual({
      utilisateur: null,
      billetsRecusLe: null,
    })
  })
})
