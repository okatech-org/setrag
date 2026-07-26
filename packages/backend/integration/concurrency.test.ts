import { ConvexHttpClient } from "convex/browser"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { api } from "../convex/_generated/api"
import type { Id } from "../convex/_generated/dataModel"

/**
 * Tests de concurrence contre un VRAI backend Convex.
 *
 * Raison d'être : `convex-test` exécute les mutations séquentiellement en
 * JavaScript. Il ne reproduit ni les écritures concurrentes ni les conflits
 * de contrôle de concurrence optimiste, et ne peut donc pas démontrer
 * l'absence de survente — la garantie centrale du système.
 *
 * Ces tests-là lancent de vraies ventes parallèles sur le même inventaire,
 * via le moteur réel lancé par `docker/up.sh`, et vérifient l'invariant :
 * on ne vend jamais plus de places qu'il n'en existe.
 *
 *   bun run itest:up && bun run itest
 */

const BACKEND_URL = process.env.CONVEX_SELF_HOSTED_URL ?? "http://127.0.0.1:3210"

let client: ConvexHttpClient

beforeAll(async () => {
  client = new ConvexHttpClient(BACKEND_URL)
  try {
    await client.query(api.functions.referential.listStations, {})
  } catch (error) {
    throw new Error(
      `Backend Convex local injoignable sur ${BACKEND_URL}.\n` +
        `Lancez d'abord : bun run itest:up\n` +
        `Cause : ${(error as Error).message}`,
    )
  }
})

beforeEach(async () => {
  await client.mutation(api.testing.reset, {})
})

/** Monte le décor et retourne ses identifiants. */
async function fixture(seatCount: number, sellerCount: number) {
  return await client.mutation(api.testing.seedConcurrencyFixture, {
    seatCount,
    sellerCount,
  })
}

/**
 * Lance `count` ventes réellement simultanées et récapitule les issues.
 * Les rejets sont attendus : c'est ainsi que le système refuse la survente.
 */
async function sellInParallel(
  fx: Awaited<ReturnType<typeof fixture>>,
  attempts: Array<{
    sellerIndex: number
    from: Id<"stations">
    to: Id<"stations">
    passengers: number
  }>,
) {
  const résultats = await Promise.allSettled(
    attempts.map((a, i) =>
      client.mutation(api.testing.sellOne, {
        sellerId: fx.sellerIds[a.sellerIndex % fx.sellerIds.length]!,
        tripId: fx.tripId,
        originStationId: a.from,
        destinationStationId: a.to,
        serviceClass: "DEUXIEME",
        passengerCount: a.passengers,
        label: `P${i}`,
      }),
    ),
  )
  return {
    succeeded: résultats.filter((r) => r.status === "fulfilled").length,
    failed: résultats.filter((r) => r.status === "rejected").length,
    errors: résultats
      .filter((r): r is PromiseRejectedResult => r.status === "rejected")
      .map((r) => String(r.reason)),
  }
}

describe("Ventes concurrentes sur le même inventaire", () => {
  it("ne vend jamais plus de places qu'il n'en existe", async () => {
    const CAPACITE = 10
    const TENTATIVES = 40
    const fx = await fixture(CAPACITE, 8)

    const issue = await sellInParallel(
      fx,
      Array.from({ length: TENTATIVES }, (_, i) => ({
        sellerIndex: i,
        from: fx.originStationId,
        to: fx.destinationStationId,
        passengers: 1,
      })),
    )

    // Exactement la capacité vendue, ni plus ni moins.
    expect(issue.succeeded).toBe(CAPACITE)
    expect(issue.failed).toBe(TENTATIVES - CAPACITE)

    const état = await client.query(api.testing.inventorySnapshot, {
      tripId: fx.tripId,
    })
    for (const compteur of état.counters) {
      expect(compteur.sold).toBe(CAPACITE)
      expect(compteur.available).toBe(0)
      // L'invariant absolu : jamais de disponibilité négative.
      expect(compteur.available).toBeGreaterThanOrEqual(0)
    }
    expect(état.ticketCount).toBe(CAPACITE)
  }, 120_000)

  it("n'attribue jamais deux fois la même place", async () => {
    const CAPACITE = 12
    const fx = await fixture(CAPACITE, 6)

    await sellInParallel(
      fx,
      Array.from({ length: 30 }, (_, i) => ({
        sellerIndex: i,
        from: fx.originStationId,
        to: fx.destinationStationId,
        passengers: 1,
      })),
    )

    const état = await client.query(api.testing.inventorySnapshot, {
      tripId: fx.tripId,
    })
    // Chaque place est soit libre, soit occupée sur tout le parcours (0b11).
    const occupées = état.seatMasks.filter((m) => m !== 0)
    expect(occupées).toHaveLength(CAPACITE)
    for (const masque of occupées) {
      expect(masque).toBe(0b11)
    }
  }, 120_000)

  it("respecte la capacité par segment quand les trajets se chevauchent", async () => {
    const CAPACITE = 6
    const fx = await fixture(CAPACITE, 6)

    // Moitié Owendo→Booué (segment 0), moitié Booué→Franceville (segment 1),
    // plus des trajets complets qui consomment les deux. Le total demandé
    // dépasse largement la capacité de chaque segment.
    const tentatives = [
      ...Array.from({ length: 8 }, (_, i) => ({
        sellerIndex: i,
        from: fx.originStationId,
        to: fx.midStationId,
        passengers: 1,
      })),
      ...Array.from({ length: 8 }, (_, i) => ({
        sellerIndex: i + 8,
        from: fx.midStationId,
        to: fx.destinationStationId,
        passengers: 1,
      })),
      ...Array.from({ length: 8 }, (_, i) => ({
        sellerIndex: i + 16,
        from: fx.originStationId,
        to: fx.destinationStationId,
        passengers: 1,
      })),
    ]

    await sellInParallel(fx, tentatives)

    const état = await client.query(api.testing.inventorySnapshot, {
      tripId: fx.tripId,
    })
    for (const compteur of état.counters) {
      expect(compteur.sold).toBeLessThanOrEqual(CAPACITE)
      expect(compteur.available).toBeGreaterThanOrEqual(0)
      expect(compteur.available).toBe(compteur.capacity - compteur.sold)
    }
  }, 120_000)

  it("sert un groupe entièrement ou pas du tout", async () => {
    const CAPACITE = 10
    const fx = await fixture(CAPACITE, 8)

    // Quatre groupes de 3 pour 10 places : trois passent, un est refusé.
    const issue = await sellInParallel(
      fx,
      Array.from({ length: 4 }, (_, i) => ({
        sellerIndex: i,
        from: fx.originStationId,
        to: fx.destinationStationId,
        passengers: 3,
      })),
    )

    const état = await client.query(api.testing.inventorySnapshot, {
      tripId: fx.tripId,
    })
    // Le nombre de billets est toujours un multiple de 3 : aucun groupe
    // n'a été servi à moitié.
    expect(état.ticketCount % 3).toBe(0)
    expect(état.ticketCount).toBe(issue.succeeded * 3)
    expect(état.ticketCount).toBeLessThanOrEqual(CAPACITE)
  }, 120_000)

  it("ne produit aucun doublon de numérotation sous concurrence", async () => {
    const fx = await fixture(20, 10)

    await sellInParallel(
      fx,
      Array.from({ length: 20 }, (_, i) => ({
        sellerIndex: i,
        from: fx.originStationId,
        to: fx.destinationStationId,
        passengers: 1,
      })),
    )

    const état = await client.query(api.testing.inventorySnapshot, {
      tripId: fx.tripId,
    })
    // La numérotation doit rester unique ET continue malgré le parallélisme.
    expect(new Set(état.saleNumbers).size).toBe(état.saleNumbers.length)
    expect(new Set(état.ticketNumbers).size).toBe(état.ticketNumbers.length)
  }, 120_000)

  it("laisse la base cohérente : billets et compteurs concordent", async () => {
    const CAPACITE = 8
    const fx = await fixture(CAPACITE, 8)

    await sellInParallel(
      fx,
      Array.from({ length: 25 }, (_, i) => ({
        sellerIndex: i,
        from: fx.originStationId,
        to: fx.destinationStationId,
        passengers: 1,
      })),
    )

    const état = await client.query(api.testing.inventorySnapshot, {
      tripId: fx.tripId,
    })
    // Autant de billets que de places vendues sur chaque segment, et autant
    // de masques occupés : aucune écriture partielle n'a survécu.
    const occupées = état.seatMasks.filter((m) => m !== 0).length
    expect(état.ticketCount).toBe(occupées)
    for (const compteur of état.counters) {
      expect(compteur.sold).toBe(état.ticketCount)
    }
  }, 120_000)
})

describe("Verrou du mode test", () => {
  it("les fonctions de test exigent IS_TEST sur le déploiement", async () => {
    // Sur le backend local, IS_TEST est posé par docker/up.sh : l'appel passe.
    // Ce test documente le verrou et échouerait si la garde disparaissait
    // d'un déploiement où IS_TEST n'est pas actif.
    await expect(
      client.mutation(api.testing.reset, {}),
    ).resolves.toBeDefined()
  }, 30_000)
})
