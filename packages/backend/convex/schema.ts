import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"
import { continuityTables } from "./modules/continuity/tables"
import { cotrafTables } from "./modules/cotraf/tables"
import { financeTables } from "./modules/finance/tables"
import { fretTables } from "./modules/fret/tables"
import { platformTables } from "./modules/platform/tables"
import { appRoleValidator } from "./modules/platform/validators"

/**
 * Schéma du système billettique unifié SETRAG.
 *
 * Couvre les deux cahiers des charges : le système central de vente
 * (remplaçant de MOBIPASS — cinq produits voyageurs, points de vente, caisse,
 * comptabilité, yield management) et le front-office qu'il alimente (vente en
 * ligne, application contrôleur).
 *
 * Référence : docs/plans/backend.html §6 « Modèle de données ».
 */

/* ═══════════════════════ Énumérations du domaine ════════════════════════ */

/** Types de train commercialisés (CDC §7.3). */
export const trainType = v.union(
  v.literal("EXPRESS"),
  v.literal("OMNIBUS"),
  v.literal("AUTORAIL"),
  v.literal("SPECIAL")
)

/** Classes de service (CDC §7.1.1). */
export const serviceClass = v.union(
  v.literal("DEUXIEME"),
  v.literal("PREMIERE"),
  v.literal("VIP")
)

/**
 * Rôles applicatifs. Les rôles internes sont dérivés des groupes de
 * l'annuaire ERAMET ; `voyageur` est le seul rôle client.
 */
export const role = appRoleValidator

/** Canal de vente — détermine le circuit d'encaissement et les contrôles. */
export const saleChannel = v.union(
  v.literal("guichet"),
  v.literal("ligne"),
  v.literal("agence"),
  v.literal("bord"),
  v.literal("manuel")
)

/** Produits voyageurs commercialisés (CDC §7.1). */
export const productType = v.union(
  v.literal("billet"),
  v.literal("bagage"),
  v.literal("colis"),
  v.literal("taa"),
  v.literal("funeraire")
)

/**
 * Nature de l'écriture commerciale. Les annulations et remboursements sont
 * des écritures liées, jamais des suppressions — le CDC cite explicitement
 * leur indétectabilité actuelle comme faille de fraude.
 */
export const saleKind = v.union(
  v.literal("vente"),
  v.literal("annulation"),
  v.literal("remboursement")
)

export const saleStatus = v.union(
  v.literal("brouillon"),
  v.literal("en_attente_paiement"),
  v.literal("confirmee"),
  v.literal("annulee"),
  v.literal("remboursee"),
  v.literal("expiree")
)

export const paymentMethod = v.union(
  v.literal("especes"),
  v.literal("airtel_money"),
  v.literal("moov_money"),
  v.literal("clickpay"),
  v.literal("visa"),
  v.literal("mastercard"),
  v.literal("en_compte")
)

export const paymentStatus = v.union(
  v.literal("initie"),
  v.literal("en_attente"),
  v.literal("confirme"),
  v.literal("echoue"),
  v.literal("expire"),
  v.literal("rembourse")
)

/** Cycle de validation partagé par les livrets horaires et les tarifs. */
export const approvalStatus = v.union(
  v.literal("brouillon"),
  v.literal("a_valider"),
  v.literal("actif"),
  v.literal("rejete"),
  v.literal("expire")
)

export const tripStatus = v.union(
  v.literal("planifie"),
  v.literal("a_lheure"),
  v.literal("retarde"),
  v.literal("annule"),
  v.literal("termine")
)

export const ticketStatus = v.union(
  /** Réservé en ligne, en attente de règlement. */
  v.literal("en_attente"),
  v.literal("valide"),
  v.literal("utilise"),
  v.literal("annule"),
  v.literal("rembourse"),
  v.literal("expire")
)

export const pointOfSaleType = v.union(
  v.literal("gare"),
  v.literal("agence_accreditee"),
  v.literal("agence_premium")
)

/** Résultat d'un contrôle à bord — motifs exigés par l'écran CM-05. */
/**
 * Verdicts qu'un contrôle à bord peut consigner.
 *
 * L'énumération suit ce que le terminal sait réellement distinguer, car un
 * contrôle est une pièce probante : ramener « code illisible » et « signature
 * contrefaite » au même verdict reviendrait à accuser de fraude un voyageur
 * dont le billet est simplement froissé.
 */
export const scanResult = v.union(
  v.literal("valide"),
  v.literal("signature_invalide"),
  /** Code d'un autre émetteur, tronqué ou abîmé — ni fraude ni titre valide. */
  v.literal("illisible"),
  /** Clé de signature retirée du service : incident d'exploitation. */
  v.literal("cle_hors_service"),
  v.literal("mauvaise_desserte"),
  v.literal("hors_segment"),
  v.literal("expire"),
  v.literal("deja_controle"),
  v.literal("annule"),
  v.literal("rembourse"),
  /** Titre réservé mais non réglé. */
  v.literal("non_paye"),
  /** Signature authentique, titre absent du manifeste embarqué. */
  v.literal("inconnu")
)

/** Canaux conversationnels raccordés au même assistant voyageur. */
export const messagingChannel = v.union(
  v.literal("telegram"),
  v.literal("whatsapp"),
  v.literal("messenger"),
  v.literal("apple_messages")
)

/**
 * Bouton d'un message sortant : soit un rappel opaque renvoyé au webhook
 * (`data`), soit un lien ouvert par le client de messagerie (`url`).
 */
export const messagingButton = v.union(
  v.object({ label: v.string(), data: v.string() }),
  v.object({ label: v.string(), url: v.string() })
)

/** Civilité imprimée sur un billet : `M` (monsieur) ou `F` (madame). */
export const gender = v.union(v.literal("M"), v.literal("F"))

/** Nature d'une note de Ruban (voir `model/memoire.ts`). */
export const assistantMemoryCategory = v.union(
  v.literal("preference"),
  v.literal("trajet"),
  v.literal("compagnon"),
  v.literal("contrainte"),
  v.literal("rappel"),
  v.literal("autre")
)

/**
 * État d'une réponse de Ruban écrite au fil du flux (`assistantMessages`).
 * Absent sur les messages terminés d'avant le flux : ils valent `termine`.
 */
export const assistantMessageStatus = v.union(
  v.literal("en_cours"),
  v.literal("termine"),
  v.literal("erreur")
)

/**
 * Un appel d'outil d'un tour de Ruban, gardé pour être rejoué au modèle aux
 * tours suivants (`ai/rejeu.ts`). La sortie est la version projetée — celle
 * que le modèle a lue —, réduite et bornée ; elle est absente pour une action
 * à confirmer, dont l'état se relit dans `assistantToolExecutions`.
 * `actorKey` désigne l'acteur qui l'a obtenue (`compte:<id>` ou `invite`).
 */
export const assistantToolCallRecord = v.object({
  callId: v.string(),
  toolName: v.string(),
  inputJson: v.string(),
  outputJson: v.optional(v.string()),
  status: v.union(v.literal("ok"), v.literal("approval_required")),
  actorKey: v.string(),
})

/* ════════════════════════ Objets composés réutilisés ════════════════════ */

/** Ventilation fiscale portée par toute vente (CDC §7.1.1, §7.8). */
const amounts = v.object({
  ht: v.number(),
  vat: v.number(),
  css: v.number(),
  ttc: v.number(),
  /** Montant effectivement perçu — peut différer du TTC (paiement partiel). */
  received: v.number(),
})

/** Identité d'un voyageur, champs minimaux imposés par le CDC §7.1.1. */
const passenger = v.object({
  lastName: v.string(),
  firstName: v.string(),
  gender: v.union(v.literal("M"), v.literal("F")),
  phone: v.optional(v.string()),
  /** Contact téléphonique en cas d'urgence, exigé par le CDC. */
  emergencyPhone: v.optional(v.string()),
  birthDate: v.optional(v.string()),
  nationality: v.optional(v.string()),
  documentNumber: v.optional(v.string()),
})

/** Trace du calcul tarifaire, conservée pour l'audit et les remboursements. */
const fareTrace = v.object({
  distanceKm: v.number(),
  chargeableKm: v.number(),
  ratePerKm: v.number(),
  fareCode: v.optional(v.string()),
  discountCode: v.optional(v.string()),
  discountPct: v.number(),
  /** Règles de yield appliquées, dans l'ordre de priorité. */
  appliedRules: v.array(v.string()),
  roundingStep: v.number(),
})

export default defineSchema({
  ...platformTables,
  ...financeTables,
  ...continuityTables,
  ...fretTables,
  ...cotrafTables,

  /* ══════════════════ Identités & habilitations ═════════════════════════ */

  /**
   * Identités de connexion d'un compte supprimé. Le temps que sa session
   * expire, un jeton encore valide ne doit pas recréer de profil.
   */
  identitesSupprimees: defineTable({
    authId: v.string(),
    userId: v.id("users"),
    supprimeeLe: v.number(),
  }).index("by_authId", ["authId"]),

  users: defineTable({
    /** Identifiant fourni par Better Auth. */
    authId: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    /**
     * Civilité du titulaire, facultative : le compte porte le voyageur
     * « Moi » (voir `model/titulaire.ts`). Demandée une fois, à la fin de
     * l'inscription, dans le profil ou par Ruban ; absente sur les comptes
     * plus anciens, qui fonctionnent sans.
     */
    gender: v.optional(gender),
    role,
    /** Matricule interne, pour le personnel. */
    matricule: v.optional(v.string()),
    /** Point de vente de rattachement, pour le personnel de vente. */
    pointOfSaleId: v.optional(v.id("pointsOfSale")),
    /** Source de l'identité : annuaire ERAMET ou compte local de repli. */
    identitySource: v.union(v.literal("annuaire"), v.literal("local")),
    isActive: v.boolean(),
    lastSeenAt: v.optional(v.number()),
  })
    .index("by_authId", ["authId"])
    .index("by_email", ["email"])
    .index("by_phone", ["phone"])
    .index("by_role", ["role"])
    .index("by_pointOfSale", ["pointOfSaleId"]),

  /* ══════════════════ Réseau & matériel roulant ═════════════════════════ */

  stations: defineTable({
    code: v.string(),
    name: v.string(),
    province: v.string(),
    /** Point kilométrique depuis Owendo — base du calcul de distance. */
    kilometerPoint: v.number(),
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    /** Gare équipée d'un point de vente (19 sur 22 à l'ouverture). */
    isEquipped: v.boolean(),
    isActive: v.boolean(),
  })
    .index("by_code", ["code"])
    .index("by_kilometerPoint", ["kilometerPoint"]),

  trains: defineTable({
    number: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    type: trainType,
    isActive: v.boolean(),
  }).index("by_number", ["number"]),

  coaches: defineTable({
    trainId: v.id("trains"),
    /** Repère de la voiture dans la composition, ex. « V1 ». */
    label: v.string(),
    serviceClass,
    serialNumber: v.optional(v.string()),
    /** Plan de sièges importé : rangées × colonnes. */
    rowCount: v.number(),
    columnCount: v.number(),
    seatCount: v.number(),
    /** Contingent de places debout, sans numéro de siège. */
    standingCapacity: v.number(),
    position: v.number(),
  })
    .index("by_train", ["trainId"])
    .index("by_train_class", ["trainId", "serviceClass"]),

  seats: defineTable({
    coachId: v.id("coaches"),
    trainId: v.id("trains"),
    /** Numéro affiché au voyageur, ex. « 12A ». */
    label: v.string(),
    row: v.number(),
    column: v.number(),
    isActive: v.boolean(),
  })
    .index("by_coach", ["coachId"])
    .index("by_train", ["trainId"]),

  /* ══════════════════ Offre & horaires ══════════════════════════════════ */

  timetableBooklets: defineTable({
    label: v.string(),
    description: v.optional(v.string()),
    validFrom: v.number(),
    validUntil: v.number(),
    status: approvalStatus,
    createdBy: v.id("users"),
    approvedBy: v.optional(v.id("users")),
    approvedAt: v.optional(v.number()),
    rejectionReason: v.optional(v.string()),
  })
    .index("by_status", ["status"])
    .index("by_validity", ["validFrom"]),

  /**
   * Horaire d'un train dans un livret : l'« itinéraire détaillé » du CDC
   * §7.9.1. C'est le gabarit à partir duquel les dessertes sont engendrées
   * pour chaque jour de circulation.
   */
  bookletSchedules: defineTable({
    bookletId: v.id("timetableBooklets"),
    trainId: v.id("trains"),
    trainNumber: v.string(),
    trainType,
    /** Heure de départ locale, format HH:MM (fuseau Africa/Libreville). */
    departureTime: v.string(),
    /** Jours de circulation, 0 = dimanche. Tableau vide = tous les jours. */
    daysOfWeek: v.array(v.number()),
    /** Arrêts desservis, avec décalages en minutes depuis le départ. */
    stops: v.array(
      v.object({
        stationId: v.id("stations"),
        sequence: v.number(),
        arrivalOffsetMinutes: v.optional(v.number()),
        departureOffsetMinutes: v.optional(v.number()),
      })
    ),
  })
    .index("by_booklet", ["bookletId"])
    .index("by_booklet_train", ["bookletId", "trainId"]),

  trips: defineTable({
    bookletId: v.id("timetableBooklets"),
    scheduleId: v.optional(v.id("bookletSchedules")),
    trainId: v.id("trains"),
    trainNumber: v.string(),
    trainType,
    /** Jour de circulation, au format AAAA-MM-JJ (fuseau Africa/Libreville). */
    serviceDate: v.string(),
    departureAt: v.number(),
    arrivalAt: v.number(),
    originStationId: v.id("stations"),
    destinationStationId: v.id("stations"),
    status: tripStatus,
    delayMinutes: v.number(),
    /** Nombre de segments — borne les masques d'occupation. */
    segmentCount: v.number(),
    isOpenForSale: v.boolean(),
  })
    .index("by_departure", ["departureAt"])
    .index("by_origin_departure", ["originStationId", "departureAt"])
    .index("by_route_date", [
      "originStationId",
      "destinationStationId",
      "serviceDate",
    ])
    .index("by_status", ["status"])
    .index("by_train_date", ["trainId", "serviceDate"])
    .index("by_service_date", ["serviceDate", "departureAt"])
    .index("by_booklet", ["bookletId"])
    .index("by_schedule", ["scheduleId"]),

  tripStops: defineTable({
    tripId: v.id("trips"),
    stationId: v.id("stations"),
    /** Rang de l'arrêt, à partir de 0 — indice utilisé par les masques. */
    sequence: v.number(),
    kilometerPoint: v.number(),
    arrivalAt: v.optional(v.number()),
    departureAt: v.optional(v.number()),
  })
    .index("by_trip", ["tripId"])
    .index("by_trip_sequence", ["tripId", "sequence"])
    .index("by_trip_station", ["tripId", "stationId"])
    .index("by_station", ["stationId"]),

  /* ══════════════════ Tarification ══════════════════════════════════════ */

  fareSchedules: defineTable({
    label: v.string(),
    status: approvalStatus,
    validFrom: v.number(),
    validUntil: v.number(),
    /** Assiette de l'arrondi réglementaire. */
    roundingBasis: v.union(v.literal("HT"), v.literal("TTC")),
    vatPct: v.number(),
    cssPct: v.number(),
    createdBy: v.id("users"),
    approvedBy: v.optional(v.id("users")),
    approvedAt: v.optional(v.number()),
    rejectionReason: v.optional(v.string()),
  })
    .index("by_status", ["status"])
    .index("by_validity", ["validFrom"]),

  fareBases: defineTable({
    scheduleId: v.id("fareSchedules"),
    trainType,
    serviceClass,
    /** Taux au kilomètre de 0 à 99 km. */
    shortDistanceRate: v.number(),
    /** Taux au kilomètre à partir de 100 km. */
    longDistanceRate: v.number(),
  })
    .index("by_schedule", ["scheduleId"])
    .index("by_schedule_train_class", [
      "scheduleId",
      "trainType",
      "serviceClass",
    ]),

  discounts: defineTable({
    scheduleId: v.id("fareSchedules"),
    code: v.string(),
    label: v.string(),
    ratePct: v.number(),
    /** Effectif minimal, pour les tarifs de groupe. */
    minPassengers: v.optional(v.number()),
    maxPassengers: v.optional(v.number()),
    minAge: v.optional(v.number()),
    maxAge: v.optional(v.number()),
    requiresProof: v.boolean(),
    isActive: v.boolean(),
  })
    .index("by_schedule", ["scheduleId"])
    .index("by_schedule_code", ["scheduleId", "code"]),

  /** Barèmes des produits non kilométriques (bagages, colis, tonnage). */
  ancillaryFares: defineTable({
    scheduleId: v.id("fareSchedules"),
    product: productType,
    /** Zone kilométrique — sept zones pour les colis (annexe 2 §9.8.4). */
    zone: v.optional(v.number()),
    /** Palier de poids par tranche de 10 kg, pour les colis. */
    weightTier: v.optional(v.number()),
    /**
     * Montant hors taxes. Sa nature dépend du produit : prix de la tranche
     * pour un colis, prix du kilogramme excédentaire pour un bagage, prix de
     * la tonne pour un transport au tonnage.
     */
    amountHt: v.number(),
    /** Franchise de poids incluse, en kilogrammes (CDC §7.9.2). */
    franchiseKg: v.optional(v.number()),
    label: v.string(),
    /**
     * Barème provisoire, non fourni par SETRAG.
     * Marque les valeurs de démonstration : elles ne doivent jamais servir à
     * facturer un client réel.
     */
    isProvisional: v.optional(v.boolean()),
  })
    .index("by_schedule_product", ["scheduleId", "product"])
    .index("by_schedule_product_zone", ["scheduleId", "product", "zone"]),

  /* ══════════════════ Yield management ══════════════════════════════════ */

  fareClassQuotas: defineTable({
    tripId: v.id("trips"),
    serviceClass,
    /** Libellé du contingent : bas prix, standard, flexible. */
    label: v.string(),
    priority: v.number(),
    seatCount: v.number(),
    soldCount: v.number(),
    /** Multiplicateur appliqué au prix de base. */
    coefficient: v.number(),
    isActive: v.boolean(),
  })
    .index("by_trip_class", ["tripId", "serviceClass"])
    .index("by_trip_class_priority", ["tripId", "serviceClass", "priority"]),

  pricingRules: defineTable({
    scope: v.union(
      v.literal("reseau"),
      v.literal("ligne"),
      v.literal("desserte")
    ),
    tripId: v.optional(v.id("trips")),
    serviceClass: v.optional(serviceClass),
    type: v.union(
      v.literal("remplissage"),
      v.literal("anticipation"),
      v.literal("periode"),
      v.literal("canal"),
      v.literal("promotion")
    ),
    /** Seuil de déclenchement : taux de remplissage, jours d'anticipation… */
    threshold: v.optional(v.number()),
    modifierPct: v.number(),
    priority: v.number(),
    validFrom: v.optional(v.number()),
    validUntil: v.optional(v.number()),
    /** Bornes de sécurité appliquées après cumul des règles. */
    floorXaf: v.optional(v.number()),
    capXaf: v.optional(v.number()),
    code: v.optional(v.string()),
    isActive: v.boolean(),
    createdBy: v.id("users"),
  })
    .index("by_active_priority", ["isActive", "priority"])
    .index("by_trip", ["tripId"]),

  /* ══════════════════ Inventaire par segment ════════════════════════════ */

  /**
   * Occupation d'une place sur une desserte, par masque de bits.
   * Le bit i vaut 1 si la place est occupée sur le segment i.
   */
  seatOccupancy: defineTable({
    tripId: v.id("trips"),
    seatId: v.id("seats"),
    coachId: v.id("coaches"),
    serviceClass,
    /** Masque des segments vendus. */
    soldMask: v.number(),
    /** Masque des segments réservés temporairement (hold en ligne). */
    heldMask: v.number(),
    /** Masque des segments bloqués par l'exploitation. */
    blockedMask: v.number(),
  })
    .index("by_trip_seat", ["tripId", "seatId"])
    .index("by_trip_class", ["tripId", "serviceClass"])
    .index("by_trip_coach", ["tripId", "coachId"]),

  /**
   * Compteurs de disponibilité dénormalisés, un document par
   * (desserte, classe, segment).
   *
   * Ce découpage est délibéré : il répartit les écritures de vente sur une
   * soixantaine de documents par desserte au lieu d'un seul, ce qui évite le
   * point chaud décrit dans le plan (§7) et limite la contention aux ventes
   * qui se chevauchent réellement.
   */
  segmentCounters: defineTable({
    tripId: v.id("trips"),
    serviceClass,
    segmentIndex: v.number(),
    capacity: v.number(),
    sold: v.number(),
    held: v.number(),
    /** Places retirées de la vente par blocage ou quota d'agence. */
    reserved: v.number(),
    available: v.number(),
  })
    .index("by_trip_class_segment", ["tripId", "serviceClass", "segmentIndex"])
    .index("by_trip_class", ["tripId", "serviceClass"]),

  seatBlocks: defineTable({
    tripId: v.id("trips"),
    seatId: v.id("seats"),
    mask: v.number(),
    reason: v.union(
      v.literal("maintenance"),
      v.literal("exploitation"),
      v.literal("protocole"),
      v.literal("autre")
    ),
    comment: v.optional(v.string()),
    createdBy: v.id("users"),
    releasedBy: v.optional(v.id("users")),
    releasedAt: v.optional(v.number()),
    isActive: v.boolean(),
  })
    .index("by_trip", ["tripId"])
    .index("by_trip_active", ["tripId", "isActive"])
    .index("by_seat", ["seatId"]),

  agencyQuotas: defineTable({
    pointOfSaleId: v.id("pointsOfSale"),
    tripId: v.id("trips"),
    serviceClass,
    allocated: v.number(),
    sold: v.number(),
    isActive: v.boolean(),
    createdBy: v.id("users"),
    cancelledBy: v.optional(v.id("users")),
    cancelledAt: v.optional(v.number()),
  })
    .index("by_pos_trip", ["pointOfSaleId", "tripId"])
    .index("by_trip", ["tripId"]),

  /* ══════════════════ Points de vente & clients ═════════════════════════ */

  pointsOfSale: defineTable({
    code: v.string(),
    name: v.string(),
    type: pointOfSaleType,
    stationId: v.optional(v.id("stations")),
    /** Nombre de guichets par produit, pour le dimensionnement. */
    counters: v.object({
      passengers: v.number(),
      baggage: v.number(),
      parcels: v.number(),
    }),
    /** Taux de royalties pour les agences accréditées, en pourcentage. */
    royaltyPct: v.optional(v.number()),
    isActive: v.boolean(),
  })
    .index("by_code", ["code"])
    .index("by_station", ["stationId"])
    .index("by_type", ["type"]),

  systemSettings: defineTable({
    /** Document unique de paramétrage métier, identifié par cette clé. */
    key: v.string(),
    vatPct: v.number(),
    cssPct: v.number(),
    seatHoldMinutes: v.number(),
    mobilePaymentAttempts: v.number(),
    degradedSalesEnabled: v.boolean(),
    cashVarianceNotificationsEnabled: v.boolean(),
    updatedBy: v.id("users"),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),

  corporateAccounts: defineTable({
    code: v.string(),
    name: v.string(),
    contactEmail: v.optional(v.string()),
    contactPhone: v.optional(v.string()),
    creditLimitXaf: v.number(),
    outstandingXaf: v.number(),
    isActive: v.boolean(),
  }).index("by_code", ["code"]),

  /**
   * Compteurs de numérotation.
   *
   * Le CDC §7.1.1 exige une identification unique et une numérotation
   * continue. La clé inclut le point de vente et la journée, ce qui donne
   * une séquence par guichet et par jour : la continuité reste vérifiable
   * pour le contrôle des recettes, et la contention reste faible puisque
   * deux guichets n'écrivent jamais le même compteur.
   */
  sequences: defineTable({
    key: v.string(),
    value: v.number(),
  }).index("by_key", ["key"]),

  /* ══════════════════ Ventes — socle commun ═════════════════════════════ */

  sales: defineTable({
    /** Numéro unique et continu, exigé par le CDC §7.1.1. */
    number: v.string(),
    kind: saleKind,
    product: productType,
    channel: saleChannel,
    status: saleStatus,
    pointOfSaleId: v.optional(v.id("pointsOfSale")),
    sellerId: v.optional(v.id("users")),
    /** Appareil émetteur — champ obligatoire sur chaque opération. */
    deviceId: v.optional(v.string()),
    customerId: v.optional(v.id("users")),
    corporateAccountId: v.optional(v.id("corporateAccounts")),
    contactPhone: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
    amounts,
    accountingDayId: v.optional(v.id("accountingDays")),
    cashSessionId: v.optional(v.id("cashSessions")),
    /** Vente d'origine, pour une annulation ou un remboursement. */
    originSaleId: v.optional(v.id("sales")),
    refundReason: v.optional(v.string()),
    penaltyPct: v.optional(v.number()),
    /** Prix figé pendant le hold de la vente en ligne. */
    priceLockedUntil: v.optional(v.number()),
    /** Conditions acceptées au paiement, y compris lors d'un achat invité. */
    cgvVersion: v.optional(v.string()),
    cgvAcceptedAt: v.optional(v.number()),
    /** PDF multi-billets mis en cache pour le dossier voyageur. */
    bundlePdfStorageId: v.optional(v.id("_storage")),
    /**
     * Identifiant attribué par le terminal contrôleur avant l'envoi.
     *
     * C'est la clé d'idempotence des ventes à bord : le terminal encaisse
     * hors ligne et rejoue son lot à la reconnexion. Sans elle, une reprise
     * après coupure vendrait deux fois le même titre.
     */
    clientSaleId: v.optional(v.string()),
    soldAt: v.number(),
    cancelledAt: v.optional(v.number()),
  })
    .index("by_number", ["number"])
    .index("by_status", ["status"])
    .index("by_customer", ["customerId"])
    .index("by_seller", ["sellerId"])
    .index("by_pos_day", ["pointOfSaleId", "accountingDayId"])
    .index("by_accounting_day", ["accountingDayId"])
    .index("by_cash_session", ["cashSessionId"])
    .index("by_origin", ["originSaleId"])
    .index("by_client_id", ["clientSaleId"])
    .index("by_status_hold", ["status", "priceLockedUntil"]),

  tickets: defineTable({
    saleId: v.id("sales"),
    number: v.string(),
    tripId: v.id("trips"),
    passenger,
    originStationId: v.id("stations"),
    destinationStationId: v.id("stations"),
    /** Indices d'arrêts, base des masques d'occupation. */
    fromStopIndex: v.number(),
    toStopIndex: v.number(),
    serviceClass,
    seatId: v.optional(v.id("seats")),
    seatLabel: v.optional(v.string()),
    coachLabel: v.optional(v.string()),
    /** Billet debout, sans siège attribué. */
    isStanding: v.boolean(),
    fare: fareTrace,
    unitPriceTtc: v.number(),
    status: ticketStatus,
    /** Charge utile signée du code-barres Aztec. */
    barcodePayload: v.optional(v.string()),
    barcodeSignature: v.optional(v.string()),
    keyVersion: v.optional(v.number()),
    pdfStorageId: v.optional(v.id("_storage")),
    /** Nombre de réimpressions — chacune est un duplicata tracé. */
    duplicateCount: v.number(),
    usedAt: v.optional(v.number()),
  })
    .index("by_sale", ["saleId"])
    .index("by_number", ["number"])
    .index("by_trip", ["tripId"])
    .index("by_trip_status", ["tripId", "status"])
    .index("by_barcode", ["barcodePayload"])
    .index("by_seat", ["seatId"]),

  /* ══════════════════ Ventes — produits fret voyageur ═══════════════════ */

  baggages: defineTable({
    saleId: v.id("sales"),
    /** Numéro d'étiquette unique. */
    tagNumber: v.string(),
    ticketId: v.id("tickets"),
    tripId: v.id("trips"),
    originStationId: v.id("stations"),
    destinationStationId: v.id("stations"),
    distanceKm: v.number(),
    weightKg: v.number(),
    senderName: v.string(),
    recipientName: v.optional(v.string()),
    fareCode: v.optional(v.string()),
    amounts,
  })
    .index("by_sale", ["saleId"])
    .index("by_tag", ["tagNumber"])
    .index("by_ticket", ["ticketId"]),

  parcels: defineTable({
    saleId: v.id("sales"),
    /** Numéro d'expédition unique. */
    shipmentNumber: v.string(),
    tripId: v.optional(v.id("trips")),
    originStationId: v.id("stations"),
    destinationStationId: v.id("stations"),
    distanceKm: v.number(),
    zone: v.number(),
    senderName: v.string(),
    senderPhone: v.string(),
    recipientName: v.string(),
    recipientPhone: v.string(),
    totalWeightKg: v.number(),
    status: v.union(
      v.literal("enregistre"),
      v.literal("en_transport"),
      v.literal("arrive"),
      v.literal("retire")
    ),
    amounts,
  })
    .index("by_sale", ["saleId"])
    .index("by_shipment", ["shipmentNumber"])
    .index("by_status", ["status"]),

  parcelItems: defineTable({
    parcelId: v.id("parcels"),
    /** Numéro de vignette apposé sur l'article. */
    stickerNumber: v.string(),
    description: v.string(),
    weightKg: v.number(),
    weightTier: v.number(),
    amountTtc: v.number(),
  })
    .index("by_parcel", ["parcelId"])
    .index("by_sticker", ["stickerNumber"]),

  vehicleTransports: defineTable({
    saleId: v.id("sales"),
    shipmentNumber: v.string(),
    ticketId: v.id("tickets"),
    tripId: v.id("trips"),
    originStationId: v.id("stations"),
    destinationStationId: v.id("stations"),
    distanceKm: v.number(),
    tonnage: v.number(),
    senderName: v.string(),
    fareCode: v.optional(v.string()),
    validFrom: v.number(),
    validUntil: v.number(),
    amounts,
  })
    .index("by_sale", ["saleId"])
    .index("by_shipment", ["shipmentNumber"]),

  funeralTransports: defineTable({
    saleId: v.id("sales"),
    shipmentNumber: v.string(),
    tripId: v.id("trips"),
    originStationId: v.id("stations"),
    destinationStationId: v.id("stations"),
    distanceKm: v.number(),
    tonnage: v.number(),
    senderName: v.string(),
    fareCode: v.optional(v.string()),
    amounts,
  })
    .index("by_sale", ["saleId"])
    .index("by_shipment", ["shipmentNumber"]),

  /* ══════════════════ Abonnements ═══════════════════════════════════════ */

  subscriptions: defineTable({
    saleId: v.optional(v.id("sales")),
    customerId: v.id("users"),
    cardNumber: v.string(),
    kind: v.union(
      v.literal("AN"),
      v.literal("SIX_MOIS"),
      v.literal("TROIS_MOIS"),
      v.literal("DEMI_TARIF")
    ),
    originStationId: v.id("stations"),
    destinationStationId: v.id("stations"),
    distanceKm: v.number(),
    serviceClass,
    validFrom: v.number(),
    validUntil: v.number(),
    status: v.union(
      v.literal("active"),
      v.literal("expiree"),
      v.literal("suspendue")
    ),
    barcodePayload: v.optional(v.string()),
    barcodeSignature: v.optional(v.string()),
    keyVersion: v.optional(v.number()),
  })
    .index("by_customer", ["customerId"])
    .index("by_card", ["cardNumber"])
    .index("by_barcode", ["barcodePayload"]),

  /* ══════════════════ Paiements ═════════════════════════════════════════ */

  payments: defineTable({
    saleId: v.optional(v.id("sales")),
    /** Encaissement d'une amende de procès-verbal. */
    penaltyId: v.optional(v.id("procesVerbaux")),
    method: paymentMethod,
    provider: v.optional(v.string()),
    status: paymentStatus,
    amountXaf: v.number(),
    payerPhone: v.optional(v.string()),
    providerReference: v.optional(v.string()),
    checkoutUrl: v.optional(v.string()),
    failureReason: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
    lastPolledAt: v.optional(v.number()),
    settledAt: v.optional(v.number()),
  })
    .index("by_sale", ["saleId"])
    .index("by_penalty", ["penaltyId"])
    .index("by_provider_reference", ["providerReference"])
    .index("by_status", ["status"])
    .index("by_status_expiry", ["status", "expiresAt"]),

  /**
   * Journal brut des notifications de paiement.
   * Garantit l'idempotence : un webhook rejoué, ou doublé par le polling de
   * réconciliation, ne règle jamais deux fois la même vente.
   */
  paymentEvents: defineTable({
    paymentId: v.id("payments"),
    provider: v.string(),
    externalId: v.string(),
    source: v.union(v.literal("webhook"), v.literal("polling")),
    payload: v.string(),
    signatureValid: v.boolean(),
    processedAt: v.optional(v.number()),
  })
    .index("by_payment", ["paymentId"])
    .index("by_provider_external", ["provider", "externalId"]),

  /* ══════════════════ Caisse & comptabilité ═════════════════════════════ */

  accountingDays: defineTable({
    /** Journée comptable au format AAAA-MM-JJ. */
    date: v.string(),
    status: v.union(v.literal("ouverte"), v.literal("cloturee")),
    openedAt: v.number(),
    closedAt: v.optional(v.number()),
    closedBy: v.optional(v.id("users")),
    totalTtc: v.number(),
    totalReceived: v.number(),
    exportStatus: v.optional(
      v.union(
        v.literal("en_attente"),
        v.literal("envoye"),
        v.literal("integre"),
        v.literal("echec")
      )
    ),
    exportError: v.optional(v.string()),
  })
    .index("by_date", ["date"])
    .index("by_status", ["status"]),

  cashSessions: defineTable({
    sellerId: v.id("users"),
    pointOfSaleId: v.id("pointsOfSale"),
    accountingDayId: v.id("accountingDays"),
    openedAt: v.number(),
    closedAt: v.optional(v.number()),
    openingFloatXaf: v.number(),
    /** Totaux théoriques et comptés, par mode de règlement. */
    expectedByMethod: v.array(
      v.object({ method: paymentMethod, amountXaf: v.number() })
    ),
    countedByMethod: v.optional(
      v.array(v.object({ method: paymentMethod, amountXaf: v.number() }))
    ),
    varianceXaf: v.optional(v.number()),
    varianceReason: v.optional(v.string()),
    status: v.union(
      v.literal("ouverte"),
      v.literal("cloturee"),
      v.literal("validee")
    ),
    validatedBy: v.optional(v.id("users")),
  })
    .index("by_seller", ["sellerId"])
    .index("by_day", ["accountingDayId"])
    .index("by_pos_day", ["pointOfSaleId", "accountingDayId"])
    .index("by_status", ["status"]),

  /** Écritures au format d'export V65 attendu par SAGE X3. */
  journalEntries: defineTable({
    accountingDayId: v.id("accountingDays"),
    journalCode: v.string(),
    pieceNumber: v.string(),
    saleDate: v.string(),
    financialSite: v.string(),
    pointOfSaleCode: v.string(),
    analyticAccount: v.string(),
    costCenter: v.optional(v.string()),
    ht: v.number(),
    vat: v.number(),
    css: v.number(),
    ttc: v.number(),
  })
    .index("by_day", ["accountingDayId"])
    .index("by_piece", ["pieceNumber"]),

  /** Ventes réalisées sur billets pré-imprimés pendant une indisponibilité. */
  manualTickets: defineTable({
    saleId: v.id("sales"),
    /** Numéro du carnet papier — contrôle d'unicité strict. */
    preprintedNumber: v.string(),
    systemNumber: v.string(),
    soldAt: v.number(),
    recordedAt: v.number(),
    originalSellerId: v.id("users"),
    recordedBy: v.id("users"),
  })
    .index("by_preprinted", ["preprintedNumber"])
    .index("by_sale", ["saleId"]),

  /* ══════════════════ Contrôle & terrain ════════════════════════════════ */

  ticketScans: defineTable({
    ticketId: v.optional(v.id("tickets")),
    subscriptionId: v.optional(v.id("subscriptions")),
    tripId: v.id("trips"),
    agentId: v.id("users"),
    result: scanResult,
    stopIndex: v.optional(v.number()),
    scannedAt: v.number(),
    /** Contrôle effectué hors ligne, synchronisé plus tard. */
    offline: v.boolean(),
    /** Identifiant généré sur le terminal — garantit l'idempotence. */
    clientScanId: v.string(),
    syncedAt: v.optional(v.number()),
    /** Titre validé sur deux terminaux : à arbitrer humainement. */
    conflict: v.boolean(),
  })
    .index("by_ticket", ["ticketId"])
    .index("by_trip", ["tripId"])
    .index("by_agent", ["agentId"])
    .index("by_client_id", ["clientScanId"])
    .index("by_conflict", ["conflict"]),

  procesVerbaux: defineTable({
    number: v.string(),
    agentId: v.id("users"),
    tripId: v.id("trips"),
    ticketId: v.optional(v.id("tickets")),
    scanId: v.optional(v.id("ticketScans")),
    offender: v.object({
      lastName: v.optional(v.string()),
      firstName: v.optional(v.string()),
      documentNumber: v.optional(v.string()),
      phone: v.optional(v.string()),
      declined: v.boolean(),
    }),
    reason: v.union(
      v.literal("sans_titre"),
      v.literal("titre_invalide"),
      v.literal("classe_superieure"),
      v.literal("autre")
    ),
    notes: v.optional(v.string()),
    amountXaf: v.number(),
    status: v.union(
      v.literal("emis"),
      v.literal("paye"),
      v.literal("conteste"),
      v.literal("annule")
    ),
    paymentId: v.optional(v.id("payments")),
    issuedAt: v.number(),
    offline: v.boolean(),
    clientId: v.string(),
    resolvedBy: v.optional(v.id("users")),
    resolutionNote: v.optional(v.string()),
  })
    .index("by_number", ["number"])
    .index("by_trip", ["tripId"])
    .index("by_agent", ["agentId"])
    .index("by_status", ["status"])
    .index("by_client_id", ["clientId"])
    // Lecture par période pour la synthèse agrégée (`control.networkSummary`).
    .index("by_issued_at", ["issuedAt"]),

  incidents: defineTable({
    reporterId: v.id("users"),
    tripId: v.optional(v.id("trips")),
    stationId: v.optional(v.id("stations")),
    category: v.union(
      v.literal("securite"),
      v.literal("technique"),
      v.literal("comportement"),
      v.literal("medical"),
      v.literal("autre")
    ),
    severity: v.union(
      v.literal("information"),
      v.literal("important"),
      v.literal("critique")
    ),
    description: v.string(),
    photoStorageIds: v.array(v.id("_storage")),
    status: v.union(
      v.literal("ouvert"),
      v.literal("en_cours"),
      v.literal("resolu")
    ),
    reportedAt: v.number(),
    offline: v.boolean(),
    clientId: v.string(),
    resolvedBy: v.optional(v.id("users")),
    resolvedAt: v.optional(v.number()),
    resolutionNote: v.optional(v.string()),
  })
    .index("by_trip", ["tripId"])
    .index("by_status", ["status"])
    .index("by_severity", ["severity"])
    .index("by_client_id", ["clientId"])
    // Lecture par période pour la synthèse agrégée (`control.networkSummary`).
    .index("by_reported_at", ["reportedAt"]),

  /* ══════════════════ Interopérabilité & conformité ═════════════════════ */

  /**
   * File d'envoi vers les systèmes tiers. Journal métier consultable et
   * rejouable ; les tentatives elles-mêmes sont déléguées au composant
   * action-retrier.
   */
  outboxEvents: defineTable({
    type: v.union(
      v.literal("sage_export"),
      v.literal("colirail_status"),
      v.literal("notification")
    ),
    entityId: v.string(),
    payload: v.string(),
    status: v.union(
      v.literal("en_attente"),
      v.literal("envoye"),
      v.literal("echec")
    ),
    attempts: v.number(),
    lastError: v.optional(v.string()),
    retrierRunId: v.optional(v.string()),
    createdAt: v.number(),
    sentAt: v.optional(v.number()),
  })
    .index("by_status", ["status"])
    .index("by_type_status", ["type", "status"]),

  /**
   * Voyageurs mémorisés d'un compte.
   *
   * Le CDC autorise l'achat sans compte : ces fiches ne servent qu'à
   * préremplir un dossier, jamais à identifier le porteur d'un billet. Le
   * titre reste nominatif par la copie figée dans `tickets.passenger`, qui ne
   * suit pas les modifications faites ici.
   */
  savedPassengers: defineTable({
    userId: v.id("users"),
    lastName: v.string(),
    firstName: v.string(),
    gender: v.union(v.literal("M"), v.literal("F")),
    phone: v.optional(v.string()),
    emergencyPhone: v.optional(v.string()),
    birthDate: v.optional(v.string()),
    /** Réduction habituelle du voyageur — « ENFANT », « MILITAIRE »… */
    discountCode: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  consents: defineTable({
    userId: v.id("users"),
    type: v.union(
      v.literal("cgv"),
      v.literal("donnees"),
      v.literal("marketing")
    ),
    /** Version du texte accepté, ex. « cgv-2026-07 ». */
    version: v.string(),
    grantedAt: v.number(),
    revokedAt: v.optional(v.number()),
    channel: v.union(
      v.literal("web"),
      v.literal("mobile"),
      v.literal("guichet")
    ),
    ipAddress: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_user_type", ["userId", "type"]),

  /**
   * Codes à usage unique retenus pour le développement.
   *
   * Cette table est une PORTE DÉROBÉE : qui la lit peut se connecter au nom de
   * n'importe qui. Elle n'est alimentée et lisible que si
   * `DEV_SIGNIN_ENABLED` vaut « true », variable qui ne doit jamais être posée
   * en production. La supervision remonte un constat critique tant qu'elle
   * l'est — on ne compte pas sur la seule discipline pour cela.
   *
   * Sa raison d'être : sans fournisseur d'e-mail ni de SMS branché, le code
   * part dans les journaux du serveur. Développer et démontrer l'écran de
   * connexion suppose de pouvoir le relire.
   */
  devOtpCodes: defineTable({
    /** Adresse e-mail ou numéro de téléphone destinataire. */
    identifier: v.string(),
    code: v.string(),
    channel: v.union(v.literal("email"), v.literal("sms")),
    createdAt: v.number(),
    expiresAt: v.number(),
  }).index("by_identifier", ["identifier"]),

  /* ═════════════════════ Messagerie multicanale ═════════════════════════ */

  messagingIdentities: defineTable({
    channel: messagingChannel,
    externalUserId: v.string(),
    /**
     * Compte SETRAG relié, posé uniquement quand la personne appuie sur
     * « Démarrer » dans SA messagerie avec un jeton tiré depuis le site
     * (`messaging.linking.startFromSite`, puis `/start <jeton>`). C'est lui
     * qui donne son acteur à la conversation du fil ; l'identifiant externe
     * n'en est jamais un.
     *
     * À l'effacement du compte, `externalUserId` est remplacé par une
     * empreinte non réversible et `displayName` vidé.
     */
    userId: v.optional(v.id("users")),
    linkedAt: v.optional(v.number()),
    displayName: v.optional(v.string()),
    locale: v.optional(v.string()),
    createdAt: v.number(),
    lastSeenAt: v.number(),
  })
    .index("by_channel_and_external_user", ["channel", "externalUserId"])
    .index("by_user", ["userId"]),

  /**
   * Demandes de liaison d'une messagerie, émises depuis le site par un
   * voyageur connecté (`messaging.linking.startFromSite`).
   *
   * Le jeton part dans le lien `https://t.me/<bot>?start=<jeton>` et n'est
   * jamais stocké : seule son empreinte SHA-256 l'est. Une demande sert une
   * seule fois, expire au bout de dix minutes, et un compte n'en a jamais plus
   * de trois en cours. Un cron efface les demandes échues.
   */
  messagingLinkRequests: defineTable({
    userId: v.id("users"),
    channel: messagingChannel,
    tokenHash: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("used"),
      v.literal("expired")
    ),
    expiresAt: v.number(),
    createdAt: v.number(),
    usedAt: v.optional(v.number()),
    /** Identité de messagerie reliée par cette demande. */
    identityId: v.optional(v.id("messagingIdentities")),
  })
    .index("by_token_hash", ["tokenHash"])
    .index("by_user_and_status", ["userId", "status"])
    .index("by_expires_at", ["expiresAt"]),

  messagingThreads: defineTable({
    channel: messagingChannel,
    externalThreadId: v.string(),
    identityId: v.id("messagingIdentities"),
    conversationId: v.id("assistantConversations"),
    state: v.union(
      v.literal("active"),
      v.literal("handoff_requested"),
      v.literal("human_active"),
      v.literal("closed")
    ),
    createdAt: v.number(),
    lastInboundAt: v.number(),
    lastOutboundAt: v.optional(v.number()),
    processingEventId: v.optional(v.id("messagingEvents")),
    processingStartedAt: v.optional(v.number()),
  })
    .index("by_channel_and_external_thread", ["channel", "externalThreadId"])
    .index("by_conversation", ["conversationId"])
    .index("by_identity", ["identityId"]),

  messagingEvents: defineTable({
    channel: messagingChannel,
    externalEventId: v.string(),
    externalThreadId: v.string(),
    externalUserId: v.string(),
    threadId: v.optional(v.id("messagingThreads")),
    type: v.union(
      v.literal("text"),
      v.literal("action"),
      v.literal("command"),
      v.literal("unsupported")
    ),
    text: v.optional(v.string()),
    actionToken: v.optional(v.string()),
    /**
     * Empreinte du jeton de liaison reçu avec `/start <jeton>`. Le jeton
     * lui-même n'est conservé ni ici, ni dans `text`, ni dans `rawPayload`.
     */
    linkTokenHash: v.optional(v.string()),
    providerInteractionId: v.optional(v.string()),
    displayName: v.optional(v.string()),
    locale: v.optional(v.string()),
    rawPayload: v.optional(v.string()),
    status: v.union(
      v.literal("received"),
      v.literal("processing"),
      v.literal("processed"),
      v.literal("failed"),
      v.literal("exhausted")
    ),
    attempts: v.number(),
    error: v.optional(v.string()),
    createdAt: v.number(),
    processingStartedAt: v.optional(v.number()),
    processedAt: v.optional(v.number()),
  })
    .index("by_channel_and_external_event", ["channel", "externalEventId"])
    .index("by_channel_thread_status_and_created_at", [
      "channel",
      "externalThreadId",
      "status",
      "createdAt",
    ])
    .index("by_status_and_created_at", ["status", "createdAt"])
    .index("by_thread_and_created_at", ["threadId", "createdAt"]),

  messagingApprovals: defineTable({
    threadId: v.id("messagingThreads"),
    token: v.string(),
    callId: v.string(),
    toolName: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("resolved"),
      v.literal("failed"),
      v.literal("expired")
    ),
    decision: v.optional(v.union(v.literal("approve"), v.literal("reject"))),
    expiresAt: v.number(),
    createdAt: v.number(),
    resolvedAt: v.optional(v.number()),
    error: v.optional(v.string()),
  })
    .index("by_token", ["token"])
    .index("by_thread_and_status", ["threadId", "status"])
    .index("by_thread_and_call", ["threadId", "callId"]),

  messagingOutbox: defineTable({
    threadId: v.id("messagingThreads"),
    sourceEventId: v.optional(v.id("messagingEvents")),
    kind: v.union(v.literal("text"), v.literal("document")),
    text: v.optional(v.string()),
    documentUrl: v.optional(v.string()),
    filename: v.optional(v.string()),
    buttons: v.optional(v.array(messagingButton)),
    status: v.union(
      v.literal("pending"),
      v.literal("sending"),
      v.literal("sent"),
      v.literal("failed")
    ),
    attempts: v.number(),
    nextAttemptAt: v.optional(v.number()),
    providerMessageId: v.optional(v.string()),
    error: v.optional(v.string()),
    createdAt: v.number(),
    sentAt: v.optional(v.number()),
  })
    .index("by_thread_and_status", ["threadId", "status"])
    .index("by_status_and_next_attempt", ["status", "nextAttemptAt"])
    .index("by_source_event", ["sourceEventId"]),

  /* ═════════════════════ Assistants IA voyageurs ════════════════════════ */

  assistantConversations: defineTable({
    userId: v.optional(v.id("users")),
    /** Empreinte SHA-256 du secret de session pour un visiteur non connecté. */
    guestKeyHash: v.string(),
    assistantId: v.union(
      v.literal("concierge"),
      v.literal("booking"),
      v.literal("tickets"),
      v.literal("account")
    ),
    provider: v.union(
      v.literal("openai"),
      v.literal("anthropic"),
      v.literal("google")
    ),
    model: v.string(),
    title: v.optional(v.string()),
    status: v.union(v.literal("active"), v.literal("closed")),
    createdAt: v.number(),
    lastMessageAt: v.number(),
  })
    .index("by_user_and_last_message_at", ["userId", "lastMessageAt"])
    .index("by_status_and_last_message_at", ["status", "lastMessageAt"]),

  assistantMessages: defineTable({
    conversationId: v.id("assistantConversations"),
    role: v.union(v.literal("user"), v.literal("assistant"), v.literal("tool")),
    content: v.string(),
    /** Clé d'idempotence du tour texte fournie par le client. */
    requestId: v.optional(v.string()),
    toolName: v.optional(v.string()),
    toolCallId: v.optional(v.string()),
    provider: v.optional(
      v.union(v.literal("openai"), v.literal("anthropic"), v.literal("google"))
    ),
    model: v.optional(v.string()),
    /**
     * Réponse de Ruban écrite au fil du flux : `en_cours` pendant qu'elle
     * s'écrit (le texte grandit par écritures regroupées), `erreur` si le
     * fournisseur a échoué en route — le texte partiel reste. Absent :
     * message terminé.
     */
    status: v.optional(assistantMessageStatus),
    /** Libellé montré au voyageur quand la réponse a échoué. */
    error: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_conversation_and_created_at", ["conversationId", "createdAt"])
    .index("by_conversation_and_tool_call_id", ["conversationId", "toolCallId"])
    .index("by_conversation_and_request_id_and_role", [
      "conversationId",
      "requestId",
      "role",
    ]),

  assistantTurns: defineTable({
    conversationId: v.id("assistantConversations"),
    requestId: v.string(),
    status: v.union(
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed")
    ),
    resultJson: v.optional(v.string()),
    /**
     * Appels d'outils du tour, rejoués au modèle aux tours suivants (sortie
     * projetée et bornée, acteur qui l'a obtenue). Effacés avec le tour.
     */
    toolCalls: v.optional(v.array(assistantToolCallRecord)),
    error: v.optional(v.string()),
    attempts: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_conversation_and_request", ["conversationId", "requestId"])
    .index("by_conversation_and_created_at", ["conversationId", "createdAt"])
    .index("by_status_and_updated_at", ["status", "updatedAt"]),

  assistantToolExecutions: defineTable({
    conversationId: v.id("assistantConversations"),
    callId: v.string(),
    toolName: v.string(),
    inputJson: v.string(),
    outputJson: v.optional(v.string()),
    status: v.union(
      v.literal("approval_required"),
      v.literal("running"),
      v.literal("succeeded"),
      v.literal("failed"),
      v.literal("rejected")
    ),
    requiresApproval: v.boolean(),
    approvedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    error: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_conversation_and_call_id", ["conversationId", "callId"])
    .index("by_conversation_and_status", ["conversationId", "status"]),

  assistantVoiceSessions: defineTable({
    conversationId: v.id("assistantConversations"),
    provider: v.literal("openai"),
    model: v.string(),
    providerSessionId: v.optional(v.string()),
    status: v.union(
      v.literal("created"),
      v.literal("connected"),
      v.literal("ended"),
      v.literal("failed")
    ),
    expiresAt: v.optional(v.number()),
    createdAt: v.number(),
    endedAt: v.optional(v.number()),
  })
    .index("by_conversation_and_created_at", ["conversationId", "createdAt"])
    .index("by_status_and_created_at", ["status", "createdAt"]),

  /**
   * Ce que Ruban retient d'un compte : des faits courts et durables
   * (préférences, trajets habituels, compagnons, contraintes, rappels),
   * partagés entre le site, l'application et les messageries reliées.
   *
   * Jamais pour un invité. Filtrés côté serveur (`model/memoire.ts`),
   * bornés à `NOTES_PAR_COMPTE_MAX` par compte, visibles et effaçables par
   * le voyageur (« Ce que Ruban retient »), effacés avec le compte.
   */
  assistantMemories: defineTable({
    userId: v.id("users"),
    category: assistantMemoryCategory,
    content: v.string(),
    /** Clé de dédoublonnage : le contenu mis à plat. */
    contentKey: v.string(),
    /** Voie par laquelle la note a été prise (voir `ConversationActor`). */
    source: v.union(v.literal("session"), v.literal("messaging")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user_and_updated_at", ["userId", "updatedAt"])
    .index("by_user_and_content_key", ["userId", "contentKey"]),

  /* ═══════════════════════ Indicateurs pré-agrégés ═══════════════════════ */

  /**
   * Cumuls journaliers de vente.
   *
   * Écrits à la clôture de journée comptable, jamais à la volée. Une ligne à
   * 250 000 voyageurs par an produit environ 20 000 ventes par mois : les
   * parcourir à chaque ouverture d'un tableau de bord coûterait plus cher que
   * la vente elle-même, pour un résultat qui ne bouge plus.
   *
   * Grain : jour × point de vente × canal × produit. Assez fin pour toutes les
   * ventilations demandées au CDC, assez grossier pour rester en dizaines de
   * lignes par jour.
   */
  dailyMetrics: defineTable({
    /** Journée comptable au format AAAA-MM-JJ. */
    date: v.string(),
    pointOfSaleId: v.optional(v.id("pointsOfSale")),
    channel: saleChannel,
    product: productType,
    salesCount: v.number(),
    ticketCount: v.number(),
    cancelledCount: v.number(),
    refundedCount: v.number(),
    grossHt: v.number(),
    grossVat: v.number(),
    grossCss: v.number(),
    grossTtc: v.number(),
    grossReceived: v.number(),
    refundedHt: v.number(),
    refundedVat: v.number(),
    refundedCss: v.number(),
    refundedTtc: v.number(),
    refundedReceived: v.number(),
    computedAt: v.number(),
  })
    .index("by_date", ["date"])
    .index("by_date_pos", ["date", "pointOfSaleId"])
    .index("by_date_channel", ["date", "channel"]),

  /**
   * Remplissage d'une desserte, en sièges-kilomètres.
   *
   * Un comptage de billets serait trompeur sur une ligne où le même siège se
   * vend par tronçon : deux billets courts ne remplissent pas un train, un
   * billet de bout en bout non plus. Le siège-kilomètre est la mesure du
   * secteur et la seule qui rende justice au modèle par segments.
   */
  tripMetrics: defineTable({
    tripId: v.id("trips"),
    serviceDate: v.string(),
    trainNumber: v.string(),
    trainType,
    serviceClass,
    seatKmOffered: v.number(),
    seatKmSold: v.number(),
    loadFactorPct: v.number(),
    /** Tronçon le plus chargé : celui qui borne la vente. */
    peakSegmentIndex: v.optional(v.number()),
    peakPct: v.number(),
    ticketCount: v.number(),
    revenueTtc: v.number(),
    computedAt: v.number(),
  })
    .index("by_trip", ["tripId"])
    .index("by_service_date", ["serviceDate"])
    .index("by_trip_class", ["tripId", "serviceClass"]),

  auditLogs: defineTable({
    actorId: v.optional(v.id("users")),
    assignmentId: v.optional(v.id("userAssignments")),
    action: v.string(),
    entityTable: v.string(),
    entityId: v.string(),
    permission: v.optional(
      v.union(
        v.literal("consulter"),
        v.literal("creer"),
        v.literal("modifier"),
        v.literal("supprimer"),
        v.literal("valider")
      )
    ),
    reason: v.optional(v.string()),
    result: v.optional(
      v.union(v.literal("succes"), v.literal("refus"), v.literal("echec"))
    ),
    correlationId: v.optional(v.string()),
    causationId: v.optional(v.string()),
    classification: v.optional(
      v.union(
        v.literal("public"),
        v.literal("interne"),
        v.literal("confidentiel"),
        v.literal("restreint")
      )
    ),
    /** Valeurs avant et après, pour les modifications de paramétrage. */
    before: v.optional(v.string()),
    after: v.optional(v.string()),
    metadata: v.optional(v.string()),
    context: v.optional(v.string()),
    ipAddress: v.optional(v.string()),
    deviceId: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_actor", ["actorId"])
    .index("by_assignment", ["assignmentId"])
    .index("by_entity", ["entityTable", "entityId"])
    .index("by_action", ["action"])
    .index("by_correlation", ["correlationId"])
    .index("by_result_createdAt", ["result", "createdAt"])
    .index("by_createdAt", ["createdAt"]),

  /**
   * Empreintes chaînées du journal d'audit.
   *
   * Ce scellement détecte une altération dans la base applicative, sans se
   * substituer à l'archivage WORM externe prévu pour la production.
   */
  auditSeals: defineTable({
    windowStart: v.number(),
    windowEnd: v.number(),
    logCount: v.number(),
    logsHash: v.string(),
    previousSealHash: v.optional(v.string()),
    sealHash: v.string(),
    algorithm: v.literal("sha256"),
    sealedAt: v.number(),
  })
    .index("by_window", ["windowStart", "windowEnd"])
    .index("by_window_end", ["windowEnd"]),

  /** Rapports récurrents demandés depuis le back-office de gestion. */
  reportSchedules: defineTable({
    label: v.string(),
    reportType: v.union(
      v.literal("ventes_canaux"),
      v.literal("remplissage"),
      v.literal("annulations"),
      v.literal("recettes")
    ),
    frequency: v.union(
      v.literal("quotidien"),
      v.literal("hebdomadaire"),
      v.literal("mensuel")
    ),
    format: v.union(v.literal("csv"), v.literal("xlsx"), v.literal("pdf")),
    recipients: v.array(v.string()),
    nextRunAt: v.number(),
    lastRunAt: v.optional(v.number()),
    isActive: v.boolean(),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_next_run", ["nextRunAt"])
    .index("by_active_next_run", ["isActive", "nextRunAt"]),

  notifications: defineTable({
    userId: v.id("users"),
    channel: v.union(
      v.literal("push"),
      v.literal("email"),
      v.literal("sms"),
      v.literal("in_app")
    ),
    /** Nature du message, qui pilote le filtre de la liste et les préférences. */
    category: v.optional(
      v.union(
        v.literal("retard"),
        v.literal("rappel"),
        v.literal("achat"),
        v.literal("remboursement")
      )
    ),
    title: v.string(),
    body: v.string(),
    data: v.optional(v.string()),
    sentAt: v.optional(v.number()),
    readAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_user_read", ["userId", "readAt"]),

  /**
   * Préférences de notification.
   *
   * Une ligne par voyageur, absente tant qu'il n'a rien réglé : l'absence vaut
   * consentement aux seules alertes d'exploitation, jamais au marketing, qui
   * relève de `consents`.
   */
  notificationPreferences: defineTable({
    userId: v.id("users"),
    pushEnabled: v.boolean(),
    smsEnabled: v.boolean(),
    /** Catégories désactivées par le voyageur. */
    mutedCategories: v.array(
      v.union(
        v.literal("retard"),
        v.literal("rappel"),
        v.literal("achat"),
        v.literal("remboursement")
      )
    ),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  pushTokens: defineTable({
    userId: v.id("users"),
    token: v.string(),
    platform: v.union(v.literal("ios"), v.literal("android")),
    deviceId: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_token", ["token"]),
})
