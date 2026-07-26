import { convexTest } from "convex-test"
import { describe, expect, it } from "vitest"
import { api } from "../_generated/api"
import type { Id } from "../_generated/dataModel"
import schema from "../schema"
import { modules } from "../test.setup"
import type { AppRole } from "../model/permissions"

/**
 * Tests d'intégration du référentiel : contrôle d'accès, règles métier,
 * effets de bord en base et journalisation d'audit.
 */

/** Crée un utilisateur et retourne un contexte authentifié en son nom. */
async function asRole(
  t: ReturnType<typeof convexTest>,
  role: AppRole,
  options: { isActive?: boolean } = {},
) {
  const authId = `auth-${role}-${Math.floor(Math.random() * 1e9)}`
  const userId = await t.run(async (ctx) =>
    ctx.db.insert("users", {
      authId,
      firstName: "Agent",
      lastName: role,
      role,
      identitySource: "annuaire",
      isActive: options.isActive ?? true,
    }),
  )
  return { ctx: t.withIdentity({ subject: authId }), userId }
}

const OWENDO = {
  code: "OWE",
  name: "Owendo",
  province: "Estuaire",
  kilometerPoint: 0,
  isEquipped: true,
  isActive: true,
}

const FRANCEVILLE = {
  code: "FCV",
  name: "Franceville",
  province: "Haut-Ogooué",
  kilometerPoint: 648,
  isEquipped: true,
  isActive: true,
}

describe("listStations — accès public", () => {
  it("liste les gares actives sans authentification", async () => {
    const t = convexTest(schema, modules)
    await t.run(async (ctx) => {
      await ctx.db.insert("stations", FRANCEVILLE)
      await ctx.db.insert("stations", OWENDO)
    })
    const gares = await t.query(api.functions.referential.listStations, {})
    expect(gares).toHaveLength(2)
  })

  it("ordonne les gares par point kilométrique", async () => {
    const t = convexTest(schema, modules)
    await t.run(async (ctx) => {
      await ctx.db.insert("stations", FRANCEVILLE)
      await ctx.db.insert("stations", OWENDO)
      await ctx.db.insert("stations", {
        code: "BOO",
        name: "Booué",
        province: "Ogooué-Ivindo",
        kilometerPoint: 340,
        isEquipped: true,
        isActive: true,
      })
    })
    const gares = await t.query(api.functions.referential.listStations, {})
    expect(gares.map((g) => g.code)).toEqual(["OWE", "BOO", "FCV"])
  })

  it("masque les gares fermées par défaut", async () => {
    const t = convexTest(schema, modules)
    await t.run(async (ctx) => {
      await ctx.db.insert("stations", OWENDO)
      await ctx.db.insert("stations", {
        ...FRANCEVILLE,
        isActive: false,
      })
    })
    const actives = await t.query(api.functions.referential.listStations, {})
    expect(actives.map((g) => g.code)).toEqual(["OWE"])

    const toutes = await t.query(api.functions.referential.listStations, {
      includeInactive: true,
    })
    expect(toutes).toHaveLength(2)
  })

  it("retourne une liste vide sur un réseau non initialisé", async () => {
    const t = convexTest(schema, modules)
    expect(await t.query(api.functions.referential.listStations, {})).toEqual([])
  })
})

describe("getStationByCode", () => {
  it("retrouve une gare par son code", async () => {
    const t = convexTest(schema, modules)
    await t.run(async (ctx) => ctx.db.insert("stations", OWENDO))
    const gare = await t.query(api.functions.referential.getStationByCode, {
      code: "OWE",
    })
    expect(gare?.name).toBe("Owendo")
  })

  it("retourne null pour un code inconnu", async () => {
    const t = convexTest(schema, modules)
    const gare = await t.query(api.functions.referential.getStationByCode, {
      code: "XXX",
    })
    expect(gare).toBeNull()
  })
})

describe("distanceBetweenStations", () => {
  it("calcule la distance à partir des points kilométriques", async () => {
    const t = convexTest(schema, modules)
    await t.run(async (ctx) => {
      await ctx.db.insert("stations", OWENDO)
      await ctx.db.insert("stations", FRANCEVILLE)
    })
    const distance = await t.query(
      api.functions.referential.distanceBetweenStations,
      { originCode: "OWE", destinationCode: "FCV" },
    )
    expect(distance).toBe(648)
  })

  it("donne le même résultat dans les deux sens", async () => {
    const t = convexTest(schema, modules)
    await t.run(async (ctx) => {
      await ctx.db.insert("stations", OWENDO)
      await ctx.db.insert("stations", FRANCEVILLE)
    })
    const aller = await t.query(
      api.functions.referential.distanceBetweenStations,
      { originCode: "OWE", destinationCode: "FCV" },
    )
    const retour = await t.query(
      api.functions.referential.distanceBetweenStations,
      { originCode: "FCV", destinationCode: "OWE" },
    )
    expect(aller).toBe(retour)
  })

  it("signale une gare inconnue", async () => {
    const t = convexTest(schema, modules)
    await t.run(async (ctx) => ctx.db.insert("stations", OWENDO))
    await expect(
      t.query(api.functions.referential.distanceBetweenStations, {
        originCode: "OWE",
        destinationCode: "XXX",
      }),
    ).rejects.toThrow(/Gare inconnue/)
  })
})

describe("upsertStation — contrôle d'accès", () => {
  it("refuse un appel non authentifié", async () => {
    const t = convexTest(schema, modules)
    await expect(
      t.mutation(api.functions.referential.upsertStation, OWENDO),
    ).rejects.toThrow(/Non authentifié/)
  })

  it("refuse un vendeur guichet, qui n'a que la consultation", async () => {
    const t = convexTest(schema, modules)
    const { ctx } = await asRole(t, "vendeur_guichet")
    await expect(
      ctx.mutation(api.functions.referential.upsertStation, OWENDO),
    ).rejects.toThrow(/Accès refusé/)
  })

  it("refuse un contrôleur de train", async () => {
    const t = convexTest(schema, modules)
    const { ctx } = await asRole(t, "controleur_train")
    await expect(
      ctx.mutation(api.functions.referential.upsertStation, OWENDO),
    ).rejects.toThrow(/Accès refusé/)
  })

  it("refuse un compte désactivé, même administrateur", async () => {
    const t = convexTest(schema, modules)
    const { ctx } = await asRole(t, "admin_fonctionnel", { isActive: false })
    await expect(
      ctx.mutation(api.functions.referential.upsertStation, OWENDO),
    ).rejects.toThrow(/Compte désactivé/)
  })

  it("autorise l'administrateur fonctionnel", async () => {
    const t = convexTest(schema, modules)
    const { ctx } = await asRole(t, "admin_fonctionnel")
    const id = await ctx.mutation(
      api.functions.referential.upsertStation,
      OWENDO,
    )
    expect(id).toBeDefined()
  })
})

describe("upsertStation — comportement", () => {
  it("crée puis met à jour la même gare sans doublon", async () => {
    const t = convexTest(schema, modules)
    const { ctx } = await asRole(t, "admin_fonctionnel")

    const premier = await ctx.mutation(
      api.functions.referential.upsertStation,
      OWENDO,
    )
    const second = await ctx.mutation(api.functions.referential.upsertStation, {
      ...OWENDO,
      name: "Owendo Virié",
    })
    expect(second).toBe(premier)

    const gares = await t.run(async (c) => c.db.query("stations").collect())
    expect(gares).toHaveLength(1)
    expect(gares[0]?.name).toBe("Owendo Virié")
  })

  it("refuse un point kilométrique négatif", async () => {
    const t = convexTest(schema, modules)
    const { ctx } = await asRole(t, "admin_fonctionnel")
    await expect(
      ctx.mutation(api.functions.referential.upsertStation, {
        ...OWENDO,
        kilometerPoint: -10,
      }),
    ).rejects.toThrow(/Point kilométrique invalide/)
  })

  it("journalise la création avec l'auteur et la valeur après", async () => {
    const t = convexTest(schema, modules)
    const { ctx, userId } = await asRole(t, "admin_fonctionnel")
    await ctx.mutation(api.functions.referential.upsertStation, OWENDO)

    const logs = await t.run(async (c) => c.db.query("auditLogs").collect())
    expect(logs).toHaveLength(1)
    expect(logs[0]?.action).toBe("referentiel.station.creer")
    expect(logs[0]?.actorId).toBe(userId)
    expect(logs[0]?.entityTable).toBe("stations")
    expect(logs[0]?.after).toContain("Owendo")
  })

  it("journalise la modification avec l'avant et l'après", async () => {
    const t = convexTest(schema, modules)
    const { ctx } = await asRole(t, "admin_fonctionnel")
    await ctx.mutation(api.functions.referential.upsertStation, OWENDO)
    await ctx.mutation(api.functions.referential.upsertStation, {
      ...OWENDO,
      name: "Owendo Virié",
    })

    const logs = await t.run(async (c) => c.db.query("auditLogs").collect())
    const modification = logs.find(
      (l) => l.action === "referentiel.station.modifier",
    )
    expect(modification?.before).toContain("Owendo")
    expect(modification?.after).toContain("Owendo Virié")
  })
})

describe("Trains et composition", () => {
  async function withTrain(t: ReturnType<typeof convexTest>) {
    const { ctx, userId } = await asRole(t, "admin_fonctionnel")
    const trainId = await ctx.mutation(api.functions.referential.upsertTrain, {
      number: "TR-201",
      name: "Express Transgabonais",
      type: "EXPRESS",
      isActive: true,
    })
    return { ctx, userId, trainId: trainId as Id<"trains"> }
  }

  it("crée un train et le retrouve dans la liste", async () => {
    const t = convexTest(schema, modules)
    await withTrain(t)
    const trains = await t.query(api.functions.referential.listTrains, {})
    expect(trains).toHaveLength(1)
    expect(trains[0]?.number).toBe("TR-201")
  })

  it("met à jour un train existant sans le dupliquer", async () => {
    const t = convexTest(schema, modules)
    const { ctx } = await withTrain(t)
    await ctx.mutation(api.functions.referential.upsertTrain, {
      number: "TR-201",
      name: "Express rénové",
      type: "EXPRESS",
      isActive: false,
    })

    const trains = await t.run(async (c) => c.db.query("trains").collect())
    expect(trains).toHaveLength(1)
    expect(trains[0]?.name).toBe("Express rénové")

    const logs = await t.run(async (c) => c.db.query("auditLogs").collect())
    expect(
      logs.some((l) => l.action === "referentiel.train.modifier"),
    ).toBe(true)
  })

  it("masque un train désactivé dans la liste par défaut", async () => {
    const t = convexTest(schema, modules)
    const { ctx } = await withTrain(t)
    await ctx.mutation(api.functions.referential.upsertTrain, {
      number: "TR-201",
      name: "Express Transgabonais",
      type: "EXPRESS",
      isActive: false,
    })
    expect(await t.query(api.functions.referential.listTrains, {})).toHaveLength(
      0,
    )
    expect(
      await t.query(api.functions.referential.listTrains, {
        includeInactive: true,
      }),
    ).toHaveLength(1)
  })

  it("refuse un contingent de places debout négatif", async () => {
    const t = convexTest(schema, modules)
    const { ctx, trainId } = await withTrain(t)
    await expect(
      ctx.mutation(api.functions.referential.addCoach, {
        trainId,
        label: "V1",
        serviceClass: "DEUXIEME",
        rowCount: 1,
        columnCount: 1,
        seatCount: 1,
        standingCapacity: -5,
        position: 1,
      }),
    ).rejects.toThrow(/places debout invalide/)
  })

  it("signale un train introuvable à la consultation de composition", async () => {
    const t = convexTest(schema, modules)
    const { ctx } = await asRole(t, "admin_fonctionnel")
    const fantome = await t.run(async (c) => {
      const id = await c.db.insert("trains", {
        number: "TMP",
        name: "Temporaire",
        type: "OMNIBUS",
        isActive: true,
      })
      await c.db.delete(id)
      return id
    })
    await expect(
      ctx.query(api.functions.referential.getTrainComposition, {
        trainId: fantome,
      }),
    ).rejects.toThrow(/Train introuvable/)
  })

  it("engendre les places à la création d'une voiture", async () => {
    const t = convexTest(schema, modules)
    const { ctx, trainId } = await withTrain(t)

    const coachId = await ctx.mutation(api.functions.referential.addCoach, {
      trainId,
      label: "V1",
      serviceClass: "DEUXIEME",
      rowCount: 20,
      columnCount: 4,
      seatCount: 80,
      standingCapacity: 20,
      position: 1,
    })

    const places = await ctx.query(api.functions.referential.listSeats, {
      coachId: coachId as Id<"coaches">,
    })
    expect(places).toHaveLength(80)
    expect(places[0]?.label).toBe("1A")
    expect(places[79]?.label).toBe("20D")
  })

  it("refuse un plan de sièges incohérent", async () => {
    const t = convexTest(schema, modules)
    const { ctx, trainId } = await withTrain(t)
    await expect(
      ctx.mutation(api.functions.referential.addCoach, {
        trainId,
        label: "V1",
        serviceClass: "DEUXIEME",
        rowCount: 20,
        columnCount: 4,
        seatCount: 79,
        standingCapacity: 0,
        position: 1,
      }),
    ).rejects.toThrow(/Plan incohérent/)
  })

  it("n'écrit aucune place si le plan est refusé", async () => {
    const t = convexTest(schema, modules)
    const { ctx, trainId } = await withTrain(t)
    await expect(
      ctx.mutation(api.functions.referential.addCoach, {
        trainId,
        label: "V1",
        serviceClass: "DEUXIEME",
        rowCount: 5,
        columnCount: 5,
        seatCount: 30,
        standingCapacity: 0,
        position: 1,
      }),
    ).rejects.toThrow()

    const places = await t.run(async (c) => c.db.query("seats").collect())
    const voitures = await t.run(async (c) => c.db.query("coaches").collect())
    expect(places).toHaveLength(0)
    expect(voitures).toHaveLength(0)
  })

  it("refuse deux voitures de même repère dans une composition", async () => {
    const t = convexTest(schema, modules)
    const { ctx, trainId } = await withTrain(t)
    const voiture = {
      trainId,
      label: "V1",
      serviceClass: "DEUXIEME" as const,
      rowCount: 2,
      columnCount: 2,
      seatCount: 4,
      standingCapacity: 0,
      position: 1,
    }
    await ctx.mutation(api.functions.referential.addCoach, voiture)
    await expect(
      ctx.mutation(api.functions.referential.addCoach, {
        ...voiture,
        position: 2,
      }),
    ).rejects.toThrow(/existe déjà/)
  })

  it("refuse une voiture rattachée à un train inexistant", async () => {
    const t = convexTest(schema, modules)
    const { ctx } = await asRole(t, "admin_fonctionnel")
    const fantome = await t.run(async (c) => {
      const id = await c.db.insert("trains", {
        number: "TMP",
        name: "Temporaire",
        type: "OMNIBUS",
        isActive: true,
      })
      await c.db.delete(id)
      return id
    })
    await expect(
      ctx.mutation(api.functions.referential.addCoach, {
        trainId: fantome,
        label: "V1",
        serviceClass: "DEUXIEME",
        rowCount: 1,
        columnCount: 1,
        seatCount: 1,
        standingCapacity: 0,
        position: 1,
      }),
    ).rejects.toThrow(/Train introuvable/)
  })

  it("agrège la capacité par classe de service", async () => {
    const t = convexTest(schema, modules)
    const { ctx, trainId } = await withTrain(t)
    await ctx.mutation(api.functions.referential.addCoach, {
      trainId,
      label: "V1",
      serviceClass: "DEUXIEME",
      rowCount: 20,
      columnCount: 4,
      seatCount: 80,
      standingCapacity: 20,
      position: 1,
    })
    await ctx.mutation(api.functions.referential.addCoach, {
      trainId,
      label: "V2",
      serviceClass: "PREMIERE",
      rowCount: 12,
      columnCount: 4,
      seatCount: 48,
      standingCapacity: 0,
      position: 2,
    })

    const composition = await ctx.query(
      api.functions.referential.getTrainComposition,
      { trainId },
    )
    expect(composition.coaches).toHaveLength(2)
    expect(composition.capacity.DEUXIEME).toEqual({
      seated: 80,
      standing: 20,
      total: 100,
    })
    expect(composition.capacity.PREMIERE).toEqual({
      seated: 48,
      standing: 0,
      total: 48,
    })
  })

  it("ordonne les voitures par position dans la composition", async () => {
    const t = convexTest(schema, modules)
    const { ctx, trainId } = await withTrain(t)
    for (const [label, position] of [
      ["V3", 3],
      ["V1", 1],
      ["V2", 2],
    ] as const) {
      await ctx.mutation(api.functions.referential.addCoach, {
        trainId,
        label,
        serviceClass: "DEUXIEME",
        rowCount: 1,
        columnCount: 2,
        seatCount: 2,
        standingCapacity: 0,
        position,
      })
    }
    const composition = await ctx.query(
      api.functions.referential.getTrainComposition,
      { trainId },
    )
    expect(composition.coaches.map((c) => c.label)).toEqual(["V1", "V2", "V3"])
  })

  it("supprime une voiture et ses places", async () => {
    const t = convexTest(schema, modules)
    const { ctx, trainId } = await withTrain(t)
    const coachId = (await ctx.mutation(api.functions.referential.addCoach, {
      trainId,
      label: "V1",
      serviceClass: "DEUXIEME",
      rowCount: 2,
      columnCount: 2,
      seatCount: 4,
      standingCapacity: 0,
      position: 1,
    })) as Id<"coaches">

    await ctx.mutation(api.functions.referential.removeCoach, { coachId })

    const places = await t.run(async (c) => c.db.query("seats").collect())
    const voitures = await t.run(async (c) => c.db.query("coaches").collect())
    expect(places).toHaveLength(0)
    expect(voitures).toHaveLength(0)
  })

  it("refuse de supprimer une voiture engagée sur une desserte", async () => {
    const t = convexTest(schema, modules)
    const { ctx, trainId } = await withTrain(t)
    const coachId = (await ctx.mutation(api.functions.referential.addCoach, {
      trainId,
      label: "V1",
      serviceClass: "DEUXIEME",
      rowCount: 1,
      columnCount: 2,
      seatCount: 2,
      standingCapacity: 0,
      position: 1,
    })) as Id<"coaches">

    // Simule une desserte ouverte utilisant cette voiture.
    await t.run(async (c) => {
      const seat = await c.db
        .query("seats")
        .withIndex("by_coach", (q) => q.eq("coachId", coachId))
        .first()
      const stationId = await c.db.insert("stations", OWENDO)
      const destinationId = await c.db.insert("stations", FRANCEVILLE)
      const adminId = await c.db.insert("users", {
        authId: "seed-admin",
        role: "admin_fonctionnel",
        identitySource: "annuaire",
        isActive: true,
      })
      const bookletId = await c.db.insert("timetableBooklets", {
        label: "Test",
        validFrom: 0,
        validUntil: 1,
        status: "actif",
        createdBy: adminId,
      })
      const tripId = await c.db.insert("trips", {
        bookletId,
        trainId,
        trainNumber: "TR-201",
        trainType: "EXPRESS",
        serviceDate: "2026-08-14",
        departureAt: 1,
        arrivalAt: 2,
        originStationId: stationId,
        destinationStationId: destinationId,
        status: "planifie",
        delayMinutes: 0,
        segmentCount: 1,
        isOpenForSale: true,
      })
      await c.db.insert("seatOccupancy", {
        tripId,
        seatId: seat!._id,
        coachId,
        serviceClass: "DEUXIEME",
        soldMask: 0,
        heldMask: 0,
        blockedMask: 0,
      })
    })

    await expect(
      ctx.mutation(api.functions.referential.removeCoach, { coachId }),
    ).rejects.toThrow(/engagée sur une desserte/)
  })

  it("réserve la suppression aux rôles habilités", async () => {
    const t = convexTest(schema, modules)
    const { ctx, trainId } = await withTrain(t)
    const coachId = (await ctx.mutation(api.functions.referential.addCoach, {
      trainId,
      label: "V1",
      serviceClass: "DEUXIEME",
      rowCount: 1,
      columnCount: 1,
      seatCount: 1,
      standingCapacity: 0,
      position: 1,
    })) as Id<"coaches">

    const { ctx: chefGare } = await asRole(t, "chef_gare")
    await expect(
      chefGare.mutation(api.functions.referential.removeCoach, { coachId }),
    ).rejects.toThrow(/Accès refusé/)
  })
})
