import { internalMutation } from "../_generated/server"

/**
 * Jeu de données de démarrage : gares voyageurs du Transgabonais, rames et
 * dessertes des 14 prochains jours.
 *
 * ⚠️ Les points kilométriques et horaires sont indicatifs — à remplacer par les
 * données d'exploitation officielles SETRAG avant toute mise en production.
 *
 * Exécution : `bunx convex run seeds/seed:run`
 */

const STATIONS = [
  { code: "OWE", name: "Owendo", province: "Estuaire", kilometerPoint: 0 },
  { code: "NTM", name: "Ntoum", province: "Estuaire", kilometerPoint: 40 },
  { code: "NDJ", name: "Ndjolé", province: "Moyen-Ogooué", kilometerPoint: 175 },
  { code: "ALB", name: "Alembé", province: "Moyen-Ogooué", kilometerPoint: 220 },
  { code: "BOU", name: "Booué", province: "Ogooué-Ivindo", kilometerPoint: 340 },
  { code: "LOP", name: "Lopé", province: "Ogooué-Ivindo", kilometerPoint: 390 },
  { code: "IVI", name: "Ivindo", province: "Ogooué-Ivindo", kilometerPoint: 470 },
  {
    code: "LTV",
    name: "Lastoursville",
    province: "Ogooué-Lolo",
    kilometerPoint: 530,
  },
  { code: "MOA", name: "Moanda", province: "Haut-Ogooué", kilometerPoint: 610 },
  {
    code: "FCV",
    name: "Franceville",
    province: "Haut-Ogooué",
    kilometerPoint: 648,
  },
] as const

const TRAINS = [
  {
    number: "TR-201",
    name: "Transgabonais Express",
    capacityByClass: { economique: 240, confort: 96, vip: 32 },
  },
  {
    number: "TR-202",
    name: "Transgabonais Omnibus",
    capacityByClass: { economique: 320, confort: 64, vip: 16 },
  },
] as const

export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("stations").first()
    if (existing) {
      return { skipped: true, reason: "Base déjà initialisée" }
    }

    const stationIds = new Map<string, string>()
    for (const station of STATIONS) {
      const id = await ctx.db.insert("stations", { ...station, isActive: true })
      stationIds.set(station.code, id)
    }

    const trainIds = []
    for (const train of TRAINS) {
      trainIds.push({
        id: await ctx.db.insert("trains", { ...train, isActive: true }),
        ...train,
      })
    }

    // Une desserte aller et une desserte retour par jour, sur 14 jours.
    const owendo = stationIds.get("OWE")! as never
    const franceville = stationIds.get("FCV")! as never

    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)

    let created = 0
    for (let day = 0; day < 14; day++) {
      const base = startOfToday.getTime() + day * 24 * 3600_000

      for (const [index, train] of trainIds.entries()) {
        // Aller : départ Owendo 18 h, ~14 h de trajet.
        await ctx.db.insert("trips", {
          trainId: train.id,
          trainNumber: train.number,
          originStationId: owendo,
          destinationStationId: franceville,
          departureAt: base + 18 * 3600_000 + index * 3600_000,
          arrivalAt: base + 32 * 3600_000 + index * 3600_000,
          status: "planifie",
          basePriceXaf: 18_000,
          seatsAvailable: { ...train.capacityByClass },
        })

        // Retour : départ Franceville 17 h.
        await ctx.db.insert("trips", {
          trainId: train.id,
          trainNumber: `${train.number}R`,
          originStationId: franceville,
          destinationStationId: owendo,
          departureAt: base + 17 * 3600_000 + index * 3600_000,
          arrivalAt: base + 31 * 3600_000 + index * 3600_000,
          status: "planifie",
          basePriceXaf: 18_000,
          seatsAvailable: { ...train.capacityByClass },
        })

        created += 2
      }
    }

    return {
      skipped: false,
      stations: STATIONS.length,
      trains: TRAINS.length,
      trips: created,
    }
  },
})
