export interface SellerIdentity {
  id?: string
  firstName?: string
  lastName?: string
  matricule?: string
  role: string
}

export interface PointOfSaleSummary {
  code: string
  name: string
  type: string
  stationName?: string
}

export interface CashSessionSummary {
  id: string
  openedAt: number
  openingFloatXaf: number
}

export interface SellerDashboardData {
  seller: SellerIdentity
  pointOfSale: PointOfSaleSummary
  session: CashSessionSummary | null
  metrics: {
    salesCount: number
    totalReceived: number
    cancellations: number
    refunded: number
  }
  lastOperations: Array<{
    id: string
    number: string
    product: string
    kind: string
    status: string
    amountXaf: number
    createdAt: number
  }>
}

export interface StationSummary {
  id: string
  code: string
  name: string
}

export interface TripSearchResult {
  id: string
  trainNumber: string
  trainType: string
  serviceDate: string
  departureAt: number
  arrivalAt: number
  fromIndex: number
  toIndex: number
  distanceKm: number
  availableByClass: Record<string, number>
  /** Desserte supprimée : affichée, marquée, jamais vendable. */
  cancelled?: boolean
  hasAvailability: boolean
}

export type ServiceClass = "DEUXIEME" | "PREMIERE" | "VIP"

export interface SalePassenger {
  firstName: string
  lastName: string
  gender: "M" | "F"
  phone?: string
  emergencyPhone?: string
  discountCode?: string
  seatId?: string
  seatLabel?: string
}

export interface TicketSaleDraft {
  tripId: string
  trainNumber: string
  trainType: string
  serviceDate: string
  departureAt: number
  arrivalAt: number
  originStationId: string
  originName: string
  originCode: string
  destinationStationId: string
  destinationName: string
  destinationCode: string
  fromIndex: number
  toIndex: number
  serviceClass: ServiceClass
  passengers: SalePassenger[]
  distanceKm: number
  totalTtc: number
}

export interface SeatMapItem {
  seatId: string
  coachId: string
  coachLabel: string
  coachPosition: number
  coachRowCount: number
  coachColumnCount: number
  label: string
  row: number
  column: number
  serviceClass: ServiceClass
  isBlocked: boolean
  isOccupied: boolean
  isFree: boolean
}

export interface SaleConfirmationData {
  saleId: string
  number: string
  amounts: {
    ht: number
    vat: number
    css: number
    ttc: number
    received: number
  }
  tickets: Array<{
    id?: string
    number: string
    passengerName?: string
    seatLabel: string | null
    unitPriceTtc: number
  }>
  changeDue: number
  draft: TicketSaleDraft
}

// Valeur fixe : les fixtures sont rendues côté serveur puis hydratées côté
// client. `Date.now()` produirait deux libellés d'heure potentiellement
// différents au passage d'une minute.
const now = new Date("2026-07-26T19:15:00+01:00").getTime()

export const DEMO_DASHBOARD: SellerDashboardData = {
  seller: {
    id: "user-seller-demo",
    firstName: "Aly",
    lastName: "MBOUMBA",
    matricule: "V-101",
    role: "vendeur_guichet",
  },
  pointOfSale: {
    code: "OWE-PV",
    name: "Gare d’Owendo Virié · guichet 3",
    type: "gare",
    stationName: "Owendo",
  },
  session: {
    id: "cash-demo",
    openedAt: now - 3 * 60 * 60 * 1000,
    openingFloatXaf: 50_000,
  },
  metrics: {
    salesCount: 42,
    totalReceived: 1_246_500,
    cancellations: 3,
    refunded: 833,
  },
  lastOperations: [
    {
      id: "sale-1",
      number: "B-4821",
      product: "billet",
      kind: "vente",
      status: "confirmee",
      amountXaf: 18_500,
      createdAt: now - 8 * 60 * 1000,
    },
    {
      id: "sale-2",
      number: "G-1190",
      product: "bagage",
      kind: "vente",
      status: "confirmee",
      amountXaf: 700,
      createdAt: now - 19 * 60 * 1000,
    },
    {
      id: "sale-3",
      number: "C-0814",
      product: "colis",
      kind: "vente",
      status: "confirmee",
      amountXaf: 5_500,
      createdAt: now - 31 * 60 * 1000,
    },
  ],
}

export const DEMO_STATIONS: StationSummary[] = [
  { id: "station-owendo", code: "OWE", name: "Owendo" },
  { id: "station-ndjole", code: "NDJ", name: "Ndjolé" },
  { id: "station-booue", code: "BOO", name: "Booué" },
  { id: "station-lope", code: "LOP", name: "Lopé" },
  { id: "station-franceville", code: "FCV", name: "Franceville" },
]

export const DEMO_TRIPS: TripSearchResult[] = [
  {
    id: "trip-201",
    trainNumber: "TR-201",
    trainType: "omnibus",
    serviceDate: "2026-07-27",
    departureAt: new Date("2026-07-27T08:00:00+01:00").getTime(),
    arrivalAt: new Date("2026-07-27T19:40:00+01:00").getTime(),
    fromIndex: 0,
    toIndex: 5,
    distanceKm: 648,
    availableByClass: { DEUXIEME: 86, PREMIERE: 24, VIP: 8 },
    hasAvailability: true,
  },
  {
    id: "trip-202",
    trainNumber: "TR-202",
    trainType: "express",
    serviceDate: "2026-07-27",
    departureAt: new Date("2026-07-27T17:30:00+01:00").getTime(),
    arrivalAt: new Date("2026-07-28T07:30:00+01:00").getTime(),
    fromIndex: 0,
    toIndex: 8,
    distanceKm: 648,
    availableByClass: { DEUXIEME: 41, PREMIERE: 12 },
    hasAvailability: true,
  },
]

export const DEMO_SEATS: SeatMapItem[] = Array.from(
  { length: 32 },
  (_, index) => {
    const row = Math.floor(index / 4) + 1
    const column = index % 4
    const suffix = ["A", "B", "C", "D"][column]!
    const occupied = [2, 9, 18, 27].includes(index)
    const blocked = [15, 24].includes(index)
    return {
      seatId: `seat-${row}${suffix}`,
      coachId: "coach-v1",
      coachLabel: "V1",
      coachPosition: 1,
      coachRowCount: 8,
      coachColumnCount: 4,
      label: `${row}${suffix}`,
      row,
      column: column + 1,
      serviceClass: "DEUXIEME" as const,
      isBlocked: blocked,
      isOccupied: occupied,
      isFree: !blocked && !occupied,
    }
  }
)
