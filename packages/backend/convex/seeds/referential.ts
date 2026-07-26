import { internalMutation } from "../_generated/server"
import { v } from "convex/values"
import { generateSeats } from "../model/seating"
import { buildProvisionalFares } from "./provisionalFares"

/**
 * Amorçage du référentiel du Transgabonais.
 *
 * Idempotent : relancer le seed met à jour l'existant sans créer de doublon.
 * S'exécute en mutation interne, donc hors du contrôle d'accès — c'est un
 * outil d'exploitation, pas une fonction applicative.
 *
 *   bunx convex run seeds/referential:run
 *
 * ⚠️ POINTS KILOMÉTRIQUES — DONNÉE À FIABILISER
 *
 * L'ordre des gares ci-dessous est celui du tableau des points de vente du
 * CDC « Projet billettique SETRAG » (§7.4), qui suit la ligne d'Owendo vers
 * Franceville. Il est fiable.
 *
 * Les points kilométriques, eux, ne figurent PAS dans le cahier des charges.
 * Seuls les extrêmes sont certains : Owendo au PK 0 et Franceville au PK 648.
 * Les valeurs intermédiaires marquées `approx: true` sont des interpolations
 * de travail destinées à faire tourner le système ; elles NE DOIVENT PAS
 * servir à facturer un voyageur, puisque le barème kilométrique en dépend
 * directement. Le tableau officiel des distances doit être obtenu auprès de
 * SETRAG avant toute mise en service.
 */

/** Gare du réseau, avec l'origine de son point kilométrique. */
interface StationSeed {
  code: string
  name: string
  province: string
  kilometerPoint: number
  /** Vrai si le PK est une interpolation de travail, faux s'il est certain. */
  approx: boolean
  /** Nombre de guichets déclarés au CDC §7.4 — détermine l'équipement. */
  counters: { passengers: number; baggage: number; parcels: number }
}

const STATIONS: StationSeed[] = [
  {
    code: "OWE",
    name: "Owendo Virié",
    province: "Estuaire",
    kilometerPoint: 0,
    approx: false,
    counters: { passengers: 4, baggage: 2, parcels: 2 },
  },
  {
    code: "NTM",
    name: "Ntoum",
    province: "Estuaire",
    kilometerPoint: 40,
    approx: true,
    counters: { passengers: 1, baggage: 1, parcels: 1 },
  },
  {
    code: "AND",
    name: "Andem",
    province: "Estuaire",
    kilometerPoint: 62,
    approx: true,
    counters: { passengers: 1, baggage: 1, parcels: 1 },
  },
  {
    code: "MBE",
    name: "Mbel",
    province: "Estuaire",
    kilometerPoint: 85,
    approx: true,
    counters: { passengers: 1, baggage: 1, parcels: 1 },
  },
  {
    code: "OYA",
    name: "Oyan",
    province: "Moyen-Ogooué",
    kilometerPoint: 108,
    approx: true,
    counters: { passengers: 1, baggage: 1, parcels: 1 },
  },
  {
    code: "ABA",
    name: "Abanga",
    province: "Moyen-Ogooué",
    kilometerPoint: 140,
    approx: true,
    counters: { passengers: 1, baggage: 1, parcels: 1 },
  },
  {
    code: "NDJ",
    name: "Ndjolé",
    province: "Moyen-Ogooué",
    kilometerPoint: 175,
    approx: true,
    counters: { passengers: 1, baggage: 1, parcels: 1 },
  },
  {
    code: "ALE",
    name: "Alembé",
    province: "Moyen-Ogooué",
    kilometerPoint: 205,
    approx: true,
    counters: { passengers: 1, baggage: 1, parcels: 1 },
  },
  {
    code: "OTO",
    name: "Otoumbi",
    province: "Moyen-Ogooué",
    kilometerPoint: 232,
    approx: true,
    counters: { passengers: 1, baggage: 1, parcels: 1 },
  },
  {
    code: "BIS",
    name: "Bissouma",
    province: "Ogooué-Ivindo",
    kilometerPoint: 258,
    approx: true,
    counters: { passengers: 0, baggage: 0, parcels: 0 },
  },
  {
    code: "AYE",
    name: "Ayem",
    province: "Ogooué-Ivindo",
    kilometerPoint: 282,
    approx: true,
    counters: { passengers: 0, baggage: 0, parcels: 0 },
  },
  {
    code: "LOP",
    name: "Lopé",
    province: "Ogooué-Ivindo",
    kilometerPoint: 308,
    approx: true,
    counters: { passengers: 1, baggage: 1, parcels: 1 },
  },
  {
    code: "OFF",
    name: "Offoué",
    province: "Ogooué-Ivindo",
    kilometerPoint: 325,
    approx: true,
    counters: { passengers: 0, baggage: 0, parcels: 0 },
  },
  {
    code: "BOO",
    name: "Booué",
    province: "Ogooué-Ivindo",
    kilometerPoint: 340,
    approx: true,
    counters: { passengers: 1, baggage: 1, parcels: 1 },
  },
  {
    code: "IVI",
    name: "Ivindo",
    province: "Ogooué-Ivindo",
    kilometerPoint: 390,
    approx: true,
    counters: { passengers: 1, baggage: 1, parcels: 1 },
  },
  {
    code: "MOU",
    name: "Mouyabi",
    province: "Ogooué-Lolo",
    kilometerPoint: 430,
    approx: true,
    counters: { passengers: 1, baggage: 1, parcels: 1 },
  },
  {
    code: "MIL",
    name: "Milolé",
    province: "Ogooué-Lolo",
    kilometerPoint: 470,
    approx: true,
    counters: { passengers: 1, baggage: 0, parcels: 0 },
  },
  {
    code: "LTV",
    name: "Lastourville",
    province: "Ogooué-Lolo",
    kilometerPoint: 508,
    approx: true,
    counters: { passengers: 2, baggage: 2, parcels: 2 },
  },
  {
    code: "DOU",
    name: "Doumé",
    province: "Ogooué-Lolo",
    kilometerPoint: 540,
    approx: true,
    counters: { passengers: 1, baggage: 0, parcels: 0 },
  },
  {
    code: "LIF",
    name: "Lifouta",
    province: "Ogooué-Lolo",
    kilometerPoint: 565,
    approx: true,
    counters: { passengers: 1, baggage: 0, parcels: 0 },
  },
  {
    code: "MBA",
    name: "Mboungou Badouma",
    province: "Ogooué-Lolo",
    kilometerPoint: 588,
    approx: true,
    counters: { passengers: 0, baggage: 0, parcels: 0 },
  },
  {
    code: "MOA",
    name: "Moanda",
    province: "Haut-Ogooué",
    kilometerPoint: 612,
    approx: true,
    counters: { passengers: 1, baggage: 1, parcels: 1 },
  },
  {
    code: "FCV",
    name: "Franceville",
    province: "Haut-Ogooué",
    kilometerPoint: 648,
    approx: false,
    counters: { passengers: 3, baggage: 2, parcels: 2 },
  },
]

/** Compositions de référence, conformes aux types de train du CDC §7.3. */
interface CoachSeed {
  label: string
  serviceClass: "DEUXIEME" | "PREMIERE" | "VIP"
  rowCount: number
  columnCount: number
  standingCapacity: number
}

interface TrainSeed {
  number: string
  name: string
  type: "EXPRESS" | "OMNIBUS" | "AUTORAIL" | "SPECIAL"
  coaches: CoachSeed[]
}

const TRAINS: TrainSeed[] = [
  {
    number: "TR-201",
    name: "Express Transgabonais",
    type: "EXPRESS",
    coaches: [
      {
        label: "V1",
        serviceClass: "VIP",
        rowCount: 8,
        columnCount: 4,
        standingCapacity: 0,
      },
      {
        label: "V2",
        serviceClass: "PREMIERE",
        rowCount: 12,
        columnCount: 4,
        standingCapacity: 0,
      },
      {
        label: "V3",
        serviceClass: "PREMIERE",
        rowCount: 12,
        columnCount: 4,
        standingCapacity: 0,
      },
      {
        label: "V4",
        serviceClass: "DEUXIEME",
        rowCount: 20,
        columnCount: 4,
        standingCapacity: 20,
      },
      {
        label: "V5",
        serviceClass: "DEUXIEME",
        rowCount: 20,
        columnCount: 4,
        standingCapacity: 20,
      },
      {
        label: "V6",
        serviceClass: "DEUXIEME",
        rowCount: 20,
        columnCount: 4,
        standingCapacity: 20,
      },
    ],
  },
  {
    number: "TR-202",
    name: "Omnibus Transgabonais",
    type: "OMNIBUS",
    coaches: [
      {
        label: "V1",
        serviceClass: "PREMIERE",
        rowCount: 12,
        columnCount: 4,
        standingCapacity: 0,
      },
      {
        label: "V2",
        serviceClass: "DEUXIEME",
        rowCount: 22,
        columnCount: 4,
        standingCapacity: 30,
      },
      {
        label: "V3",
        serviceClass: "DEUXIEME",
        rowCount: 22,
        columnCount: 4,
        standingCapacity: 30,
      },
      {
        label: "V4",
        serviceClass: "DEUXIEME",
        rowCount: 22,
        columnCount: 4,
        standingCapacity: 30,
      },
    ],
  },
]

/**
 * Barème kilométrique de l'annexe 2 du CDC. Ces valeurs-là sont certaines :
 * elles sont reproduites telles quelles du document.
 */
const FARE_BASES = [
  { trainType: "EXPRESS", serviceClass: "VIP", short: 72.38, long: 62.16 },
  { trainType: "EXPRESS", serviceClass: "PREMIERE", short: 60.1, long: 54.93 },
  { trainType: "EXPRESS", serviceClass: "DEUXIEME", short: 47.51, long: 43.42 },
  { trainType: "OMNIBUS", serviceClass: "PREMIERE", short: 46.93, long: 42.89 },
  { trainType: "OMNIBUS", serviceClass: "DEUXIEME", short: 37.54, long: 34.31 },
  { trainType: "AUTORAIL", serviceClass: "PREMIERE", short: 60.1, long: 54.93 },
  { trainType: "AUTORAIL", serviceClass: "DEUXIEME", short: 37.54, long: 34.31 },
] as const

/** Réductions de l'annexe 2. Les tarifs en projet restent désactivés. */
const DISCOUNTS = [
  {
    code: "ENFANT",
    label: "Enfant de 4 à 11 ans",
    ratePct: 50,
    minAge: 4,
    maxAge: 11,
    requiresProof: true,
    isActive: true,
  },
  {
    code: "GROUPE_10_49",
    label: "Groupe de 10 à 49 personnes",
    ratePct: 30,
    minPassengers: 10,
    maxPassengers: 49,
    requiresProof: false,
    isActive: true,
  },
  {
    code: "GROUPE_50_PLUS",
    label: "Groupe de 50 personnes et plus",
    ratePct: 45,
    minPassengers: 50,
    requiresProof: false,
    isActive: true,
  },
  {
    code: "MILITAIRE",
    label: "Militaire avec ordre de mission",
    ratePct: 10,
    requiresProof: true,
    isActive: true,
  },
  // Tarifs en projet : les taux ne sont pas arrêtés par SETRAG (annexe 2
  // §1.1.1.2), ils restent inactifs jusqu'à décision commerciale.
  {
    code: "WEEKEND",
    label: "Tarif week-end (à arbitrer)",
    ratePct: 0,
    requiresProof: false,
    isActive: false,
  },
  {
    code: "ETUDIANT",
    label: "Tarif étudiant (à arbitrer)",
    ratePct: 0,
    requiresProof: true,
    isActive: false,
  },
  {
    code: "TROISIEME_AGE",
    label: "Tarif troisième âge (à arbitrer)",
    ratePct: 0,
    requiresProof: true,
    isActive: false,
  },
  {
    code: "PROMOTIONNEL",
    label: "Tarif promotionnel (à arbitrer)",
    ratePct: 0,
    requiresProof: false,
    isActive: false,
  },
] as const

export const run = internalMutation({
  args: {
    /** Compte de service qui figure comme auteur des données amorcées. */
    adminEmail: v.optional(v.string()),
    /**
     * Pose les barèmes provisoires de démonstration (colis, TAA, funéraire,
     * excédent de bagages). Activé par défaut : sans eux, quatre des cinq
     * produits sont invendables. Passer `false` une fois les barèmes
     * officiels de SETRAG chargés.
     */
    includeProvisionalFares: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const report = {
      stations: { created: 0, updated: 0 },
      pointsOfSale: { created: 0, updated: 0 },
      trains: { created: 0, updated: 0 },
      coaches: { created: 0, skipped: 0 },
      seats: { created: 0 },
      fareSchedule: "",
      provisionalFares: 0,
      warnings: [] as string[],
    }

    /* ── Compte de service ────────────────────────────────────────────── */
    const email = args.adminEmail ?? "seed@setrag.local"
    let admin = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", "seed-service-account"))
      .unique()
    if (!admin) {
      const adminId = await ctx.db.insert("users", {
        authId: "seed-service-account",
        email,
        firstName: "Compte",
        lastName: "d'amorçage",
        role: "admin_fonctionnel",
        identitySource: "local",
        isActive: true,
      })
      admin = (await ctx.db.get(adminId))!
    }

    /* ── Gares et points de vente ─────────────────────────────────────── */
    for (const station of STATIONS) {
      const equipped =
        station.counters.passengers +
          station.counters.baggage +
          station.counters.parcels >
        0

      const existing = await ctx.db
        .query("stations")
        .withIndex("by_code", (q) => q.eq("code", station.code))
        .unique()

      const doc = {
        code: station.code,
        name: station.name,
        province: station.province,
        kilometerPoint: station.kilometerPoint,
        isEquipped: equipped,
        isActive: true,
      }

      let stationId
      if (existing) {
        await ctx.db.patch(existing._id, doc)
        stationId = existing._id
        report.stations.updated += 1
      } else {
        stationId = await ctx.db.insert("stations", doc)
        report.stations.created += 1
      }

      // Un point de vente par gare équipée.
      if (equipped) {
        const posCode = `${station.code}-PV`
        const existingPos = await ctx.db
          .query("pointsOfSale")
          .withIndex("by_code", (q) => q.eq("code", posCode))
          .unique()
        const posDoc = {
          code: posCode,
          name: `${station.name} — point de vente`,
          type: "gare" as const,
          stationId,
          counters: station.counters,
          isActive: true,
        }
        if (existingPos) {
          await ctx.db.patch(existingPos._id, posDoc)
          report.pointsOfSale.updated += 1
        } else {
          await ctx.db.insert("pointsOfSale", posDoc)
          report.pointsOfSale.created += 1
        }
      }
    }

    const approximate = STATIONS.filter((s) => s.approx).length
    report.warnings.push(
      `${approximate} gares sur ${STATIONS.length} portent un point ` +
        `kilométrique INTERPOLÉ. Le barème kilométrique en dépend : ` +
        `obtenir le tableau officiel des distances auprès de SETRAG avant ` +
        `toute vente réelle.`,
    )

    /* ── Trains et compositions ───────────────────────────────────────── */
    for (const train of TRAINS) {
      const existing = await ctx.db
        .query("trains")
        .withIndex("by_number", (q) => q.eq("number", train.number))
        .unique()

      const doc = {
        number: train.number,
        name: train.name,
        type: train.type,
        isActive: true,
      }

      let trainId
      if (existing) {
        await ctx.db.patch(existing._id, doc)
        trainId = existing._id
        report.trains.updated += 1
      } else {
        trainId = await ctx.db.insert("trains", doc)
        report.trains.created += 1
      }

      const existingCoaches = await ctx.db
        .query("coaches")
        .withIndex("by_train", (q) => q.eq("trainId", trainId))
        .collect()

      for (const [index, coach] of train.coaches.entries()) {
        if (existingCoaches.some((c) => c.label === coach.label)) {
          report.coaches.skipped += 1
          continue
        }
        const seatCount = coach.rowCount * coach.columnCount
        const coachId = await ctx.db.insert("coaches", {
          trainId,
          label: coach.label,
          serviceClass: coach.serviceClass,
          rowCount: coach.rowCount,
          columnCount: coach.columnCount,
          seatCount,
          standingCapacity: coach.standingCapacity,
          position: index + 1,
        })
        report.coaches.created += 1

        for (const seat of generateSeats({
          rowCount: coach.rowCount,
          columnCount: coach.columnCount,
          seatCount,
        })) {
          await ctx.db.insert("seats", {
            coachId,
            trainId,
            label: seat.label,
            row: seat.row,
            column: seat.column,
            isActive: true,
          })
          report.seats.created += 1
        }
      }
    }

    /* ── Grille tarifaire ─────────────────────────────────────────────── */
    const existingSchedule = await ctx.db
      .query("fareSchedules")
      .withIndex("by_status", (q) => q.eq("status", "actif"))
      .first()

    if (existingSchedule) {
      report.fareSchedule = "grille active déjà en place, inchangée"
    } else {
      const scheduleId = await ctx.db.insert("fareSchedules", {
        label: "Barème CDC — annexe 2",
        status: "actif",
        validFrom: Date.now(),
        // Validité d'un an à compter de l'amorçage.
        validUntil: Date.now() + 365 * 24 * 60 * 60 * 1000,
        roundingBasis: "TTC",
        vatPct: 18,
        cssPct: 0,
        createdBy: admin._id,
        approvedBy: admin._id,
        approvedAt: Date.now(),
      })

      for (const base of FARE_BASES) {
        await ctx.db.insert("fareBases", {
          scheduleId,
          trainType: base.trainType,
          serviceClass: base.serviceClass,
          shortDistanceRate: base.short,
          longDistanceRate: base.long,
        })
      }

      for (const discount of DISCOUNTS) {
        await ctx.db.insert("discounts", {
          scheduleId,
          code: discount.code,
          label: discount.label,
          ratePct: discount.ratePct,
          minPassengers:
            "minPassengers" in discount ? discount.minPassengers : undefined,
          maxPassengers:
            "maxPassengers" in discount ? discount.maxPassengers : undefined,
          minAge: "minAge" in discount ? discount.minAge : undefined,
          maxAge: "maxAge" in discount ? discount.maxAge : undefined,
          requiresProof: discount.requiresProof,
          isActive: discount.isActive,
        })
      }

      report.fareSchedule = "grille « Barème CDC — annexe 2 » créée et activée"
      report.warnings.push(
        `Les tarifs en projet (week-end, étudiant, 3e âge, promotionnel) ` +
          `sont créés à 0 % et désactivés : leurs taux ne sont pas arrêtés.`,
      )
    }

    /* ── Barèmes provisoires de démonstration ─────────────────────────── */
    if (args.includeProvisionalFares !== false) {
      const grille = await ctx.db
        .query("fareSchedules")
        .withIndex("by_status", (q) => q.eq("status", "actif"))
        .first()
      if (grille) {
        const existants = await ctx.db
          .query("ancillaryFares")
          .withIndex("by_schedule_product", (q) =>
            q.eq("scheduleId", grille._id),
          )
          .collect()
        for (const row of existants) {
          if (row.isProvisional === true) await ctx.db.delete(row._id)
        }
        const lignes = buildProvisionalFares()
        for (const ligne of lignes) {
          await ctx.db.insert("ancillaryFares", {
            scheduleId: grille._id,
            product: ligne.product,
            zone: ligne.zone,
            weightTier: ligne.weightTier,
            amountHt: ligne.amountHt,
            franchiseKg: ligne.franchiseKg,
            label: ligne.label,
            isProvisional: true,
          })
        }
        report.provisionalFares = lignes.length
        report.warnings.push(
          `⚠️ ${lignes.length} lignes de barème PROVISOIRE posées (colis ` +
            `express, transport auto accompagné, transport funéraire, ` +
            `excédent de bagages). Ces montants NE VIENNENT PAS DE SETRAG : ` +
            `ils rendent la démonstration possible mais ne doivent jamais ` +
            `servir à facturer un client. Les retirer avec ` +
            `« bunx convex run seeds/provisionalFares:purge » dès réception ` +
            `des barèmes officiels.`,
        )
      }
    }

    await ctx.db.insert("auditLogs", {
      actorId: admin._id,
      action: "seed.referentiel",
      entityTable: "stations",
      entityId: "*",
      metadata: JSON.stringify(report),
      createdAt: Date.now(),
    })

    return report
  },
})

/**
 * Purge le référentiel amorcé. Réservé aux environnements de développement :
 * refuse de s'exécuter si des ventes existent.
 */
export const reset = internalMutation({
  args: {},
  handler: async (ctx) => {
    const sale = await ctx.db.query("sales").first()
    if (sale) {
      throw new Error(
        `Des ventes existent : purge refusée pour ne pas détruire de ` +
          `données commerciales`,
      )
    }

    const tables = [
      "seats",
      "coaches",
      "trains",
      "pointsOfSale",
      "stations",
      "ancillaryFares",
      "discounts",
      "fareBases",
      "fareSchedules",
    ] as const

    const deleted: Record<string, number> = {}
    for (const table of tables) {
      const rows = await ctx.db.query(table).collect()
      for (const row of rows) await ctx.db.delete(row._id)
      deleted[table] = rows.length
    }
    return deleted
  },
})
