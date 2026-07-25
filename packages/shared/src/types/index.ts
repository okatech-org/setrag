import type {
  BookingStatus,
  PaymentMethod,
  Role,
  ServiceClass,
  TicketStatus,
} from "../constants"

export type {
  BookingStatus,
  PaymentMethod,
  Role,
  ServiceClass,
  TicketStatus,
} from "../constants"

/** Gare du réseau Transgabonais. */
export interface Station {
  _id: string
  code: string
  name: string
  province: string
  latitude?: number
  longitude?: number
  isActive: boolean
}

/** Desserte commerciale : un train à une date donnée. */
export interface Trip {
  _id: string
  trainNumber: string
  originStationId: string
  destinationStationId: string
  departureAt: number
  arrivalAt: number
  status: "planifie" | "a_lheure" | "retarde" | "annule" | "termine"
  delayMinutes?: number
}

/** Disponibilité et tarif d'une classe sur une desserte. */
export interface TripAvailability {
  serviceClass: ServiceClass
  seatsTotal: number
  seatsAvailable: number
  priceXaf: number
}

/** Passager rattaché à un billet. */
export interface Passenger {
  firstName: string
  lastName: string
  birthDate?: string
  documentType?: "cni" | "passeport" | "carte_sejour"
  documentNumber?: string
  phone?: string
}

export interface Booking {
  _id: string
  reference: string
  userId: string
  tripId: string
  serviceClass: ServiceClass
  status: BookingStatus
  totalXaf: number
  holdExpiresAt?: number
  createdAt: number
}

export interface Ticket {
  _id: string
  bookingId: string
  reference: string
  passenger: Passenger
  seatNumber?: string
  status: TicketStatus
  qrPayload: string
}

export interface Payment {
  _id: string
  bookingId: string
  method: PaymentMethod
  amountXaf: number
  status: "initie" | "en_cours" | "reussi" | "echoue" | "rembourse"
  providerReference?: string
  createdAt: number
}

export interface AppUser {
  _id: string
  email?: string
  phone?: string
  firstName?: string
  lastName?: string
  role: Role
  stationId?: string
}
