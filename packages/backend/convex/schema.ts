import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"

// ============================================================================
// Énumérations partagées — miroir de packages/shared/src/constants.ts
// ============================================================================

export const serviceClass = v.union(
  v.literal("economique"),
  v.literal("confort"),
  v.literal("vip")
)

export const bookingStatus = v.union(
  v.literal("brouillon"),
  v.literal("en_attente_paiement"),
  v.literal("confirmee"),
  v.literal("annulee"),
  v.literal("expiree"),
  v.literal("remboursee")
)

export const ticketStatus = v.union(
  v.literal("valide"),
  v.literal("utilise"),
  v.literal("annule"),
  v.literal("rembourse"),
  v.literal("expire")
)

export const paymentMethod = v.union(
  v.literal("mobile_money_airtel"),
  v.literal("mobile_money_moov"),
  v.literal("carte_bancaire"),
  v.literal("especes_guichet"),
  v.literal("virement")
)

export const role = v.union(
  v.literal("voyageur"),
  v.literal("agent_guichet"),
  v.literal("controleur"),
  v.literal("chef_gare"),
  v.literal("superviseur"),
  v.literal("admin")
)

export const tripStatus = v.union(
  v.literal("planifie"),
  v.literal("a_lheure"),
  v.literal("retarde"),
  v.literal("annule"),
  v.literal("termine")
)

const identityDocument = v.object({
  type: v.union(
    v.literal("cni"),
    v.literal("passeport"),
    v.literal("carte_sejour")
  ),
  number: v.string(),
})

const passenger = v.object({
  firstName: v.string(),
  lastName: v.string(),
  birthDate: v.optional(v.string()),
  document: v.optional(identityDocument),
  phone: v.optional(v.string()),
})

// ============================================================================
// Schéma
// ============================================================================

export default defineSchema({
  /** Profil applicatif, adossé à l'identité Better Auth (`authId`). */
  users: defineTable({
    authId: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    role: role,
    /** Gare de rattachement — agents uniquement. */
    stationId: v.optional(v.id("stations")),
    matricule: v.optional(v.string()),
    isActive: v.boolean(),
    lastSeenAt: v.optional(v.number()),
  })
    .index("by_authId", ["authId"])
    .index("by_email", ["email"])
    .index("by_phone", ["phone"])
    .index("by_role", ["role"])
    .index("by_station", ["stationId"]),

  /** Gares du réseau Transgabonais. */
  stations: defineTable({
    code: v.string(), // ex. "OWE", "NDJ", "FCV"
    name: v.string(),
    province: v.string(),
    /** Position sur la ligne, en kilomètres depuis Owendo (PK). */
    kilometerPoint: v.number(),
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    isActive: v.boolean(),
  })
    .index("by_code", ["code"])
    .index("by_kilometerPoint", ["kilometerPoint"]),

  /** Matériel roulant et plan de composition. */
  trains: defineTable({
    number: v.string(),
    name: v.optional(v.string()),
    capacityByClass: v.object({
      economique: v.number(),
      confort: v.number(),
      vip: v.number(),
    }),
    isActive: v.boolean(),
  }).index("by_number", ["number"]),

  /** Desserte commerciale : un train circulant à une date donnée. */
  trips: defineTable({
    trainId: v.id("trains"),
    trainNumber: v.string(),
    originStationId: v.id("stations"),
    destinationStationId: v.id("stations"),
    departureAt: v.number(),
    arrivalAt: v.number(),
    status: tripStatus,
    delayMinutes: v.optional(v.number()),
    /** Prix de référence classe économique, en XAF. */
    basePriceXaf: v.number(),
    seatsAvailable: v.object({
      economique: v.number(),
      confort: v.number(),
      vip: v.number(),
    }),
  })
    .index("by_departure", ["departureAt"])
    .index("by_route_departure", [
      "originStationId",
      "destinationStationId",
      "departureAt",
    ])
    .index("by_status", ["status"])
    .index("by_train", ["trainId", "departureAt"]),

  /** Arrêts intermédiaires d'une desserte. */
  tripStops: defineTable({
    tripId: v.id("trips"),
    stationId: v.id("stations"),
    sequence: v.number(),
    arrivalAt: v.optional(v.number()),
    departureAt: v.optional(v.number()),
  })
    .index("by_trip", ["tripId", "sequence"])
    .index("by_station", ["stationId"]),

  /** Réservation : panier puis dossier confirmé. */
  bookings: defineTable({
    reference: v.string(),
    userId: v.optional(v.id("users")),
    /** Agent ayant émis la réservation au guichet, le cas échéant. */
    issuedByAgentId: v.optional(v.id("users")),
    tripId: v.id("trips"),
    serviceClass: serviceClass,
    status: bookingStatus,
    passengerCount: v.number(),
    totalXaf: v.number(),
    contactEmail: v.optional(v.string()),
    contactPhone: v.string(),
    /** Expiration du blocage des places avant paiement. */
    holdExpiresAt: v.optional(v.number()),
    cancelledAt: v.optional(v.number()),
  })
    .index("by_reference", ["reference"])
    .index("by_user", ["userId"])
    .index("by_trip", ["tripId"])
    .index("by_status", ["status"])
    .index("by_hold_expiry", ["status", "holdExpiresAt"]),

  /** Billet nominatif rattaché à une réservation. */
  tickets: defineTable({
    bookingId: v.id("bookings"),
    tripId: v.id("trips"),
    reference: v.string(),
    passenger: passenger,
    serviceClass: serviceClass,
    seatNumber: v.optional(v.string()),
    coachNumber: v.optional(v.string()),
    status: ticketStatus,
    /** Charge utile signée encodée dans le QR code. */
    qrPayload: v.string(),
    usedAt: v.optional(v.number()),
  })
    .index("by_booking", ["bookingId"])
    .index("by_reference", ["reference"])
    .index("by_qrPayload", ["qrPayload"])
    .index("by_trip_status", ["tripId", "status"]),

  /** Transaction de paiement associée à une réservation. */
  payments: defineTable({
    bookingId: v.id("bookings"),
    method: paymentMethod,
    amountXaf: v.number(),
    status: v.union(
      v.literal("initie"),
      v.literal("en_cours"),
      v.literal("reussi"),
      v.literal("echoue"),
      v.literal("rembourse")
    ),
    providerReference: v.optional(v.string()),
    payerPhone: v.optional(v.string()),
    failureReason: v.optional(v.string()),
    settledAt: v.optional(v.number()),
  })
    .index("by_booking", ["bookingId"])
    .index("by_provider_reference", ["providerReference"])
    .index("by_status", ["status"]),

  /** Journal des contrôles de billets à bord ou en gare. */
  ticketScans: defineTable({
    ticketId: v.id("tickets"),
    tripId: v.id("trips"),
    agentId: v.id("users"),
    stationId: v.optional(v.id("stations")),
    result: v.union(
      v.literal("valide"),
      v.literal("deja_utilise"),
      v.literal("invalide"),
      v.literal("expire"),
      v.literal("mauvaise_desserte")
    ),
    scannedAt: v.number(),
  })
    .index("by_ticket", ["ticketId"])
    .index("by_trip", ["tripId", "scannedAt"])
    .index("by_agent", ["agentId", "scannedAt"]),

  /** Journal d'audit des actions sensibles du back-office. */
  auditLogs: defineTable({
    actorId: v.optional(v.id("users")),
    action: v.string(),
    entityTable: v.string(),
    entityId: v.string(),
    metadata: v.optional(v.any()),
    ipAddress: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_actor", ["actorId", "createdAt"])
    .index("by_entity", ["entityTable", "entityId"])
    .index("by_action", ["action", "createdAt"]),

  /** Notifications applicatives (push mobile, e-mail, SMS). */
  notifications: defineTable({
    userId: v.id("users"),
    channel: v.union(
      v.literal("push"),
      v.literal("email"),
      v.literal("sms"),
      v.literal("in_app")
    ),
    title: v.string(),
    body: v.string(),
    data: v.optional(v.any()),
    readAt: v.optional(v.number()),
    sentAt: v.optional(v.number()),
  }).index("by_user", ["userId"]),

  /** Jetons de notification push Expo, par appareil. */
  pushTokens: defineTable({
    userId: v.id("users"),
    token: v.string(),
    platform: v.union(v.literal("ios"), v.literal("android")),
    deviceId: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_token", ["token"]),
})
