export type Station = {
  _id: string
  code: string
  name: string
  province: string
  kilometerPoint: number
}

export type SearchDraft = {
  originId: string
  destinationId: string
  serviceDate: string
  adults: number
  children: number
}

export type SelectedTrip = {
  tripId: string
  trainNumber: string
  trainType: "EXPRESS" | "OMNIBUS" | "AUTORAIL" | "SPECIAL"
  departureAt: number
  arrivalAt: number
  originId: string
  destinationId: string
  originName: string
  destinationName: string
  passengers: number
  priceXaf: number
  available: number
  fromIndex?: number
  toIndex?: number
}

export type BookingDraft = {
  reference?: string
  holdExpiresAt?: number
  contactPhone: string
  contactEmail?: string
  serviceClass: "DEUXIEME" | "PREMIERE" | "VIP"
  passengers: Array<{
    firstName: string
    lastName: string
    gender: "M" | "F"
    emergencyPhone?: string
    discountCode?: string
    seatId?: string
  }>
}

/**
 * Les données fictives ne doivent jamais pouvoir atteindre un build de
 * production, même si la variable E2E a été laissée par erreur dans Vercel.
 */
export function resolveE2EMode(nodeEnv?: string, enabled?: string) {
  return nodeEnv !== "production" && enabled === "1"
}

export const IS_E2E = resolveE2EMode(
  process.env.NODE_ENV,
  process.env.NEXT_PUBLIC_E2E_MODE
)

export const DEMO_STATIONS: Station[] = [
  {
    _id: "station-owendo",
    code: "OWD",
    name: "Owendo",
    province: "Estuaire",
    kilometerPoint: 0,
  },
  {
    _id: "station-ndjole",
    code: "NDJ",
    name: "Ndjolé",
    province: "Moyen-Ogooué",
    kilometerPoint: 187,
  },
  {
    _id: "station-lope",
    code: "LOP",
    name: "Lopé",
    province: "Ogooué-Ivindo",
    kilometerPoint: 276,
  },
  {
    _id: "station-booue",
    code: "BOO",
    name: "Booué",
    province: "Ogooué-Ivindo",
    kilometerPoint: 335,
  },
  {
    _id: "station-lastoursville",
    code: "LTV",
    name: "Lastoursville",
    province: "Ogooué-Lolo",
    kilometerPoint: 464,
  },
  {
    _id: "station-moanda",
    code: "MOA",
    name: "Moanda",
    province: "Haut-Ogooué",
    kilometerPoint: 583,
  },
  {
    _id: "station-franceville",
    code: "FCV",
    name: "Franceville",
    province: "Haut-Ogooué",
    kilometerPoint: 648,
  },
]

export function gabonDate(daysFromNow = 1) {
  const date = new Date(Date.now() + daysFromNow * 86_400_000)
  return new Intl.DateTimeFormat("fr-CA", {
    timeZone: "Africa/Libreville",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date)
}

export function demoTrips(search: SearchDraft): SelectedTrip[] {
  const origin =
    DEMO_STATIONS.find((station) => station._id === search.originId) ??
    DEMO_STATIONS[0]!
  const destination =
    DEMO_STATIONS.find((station) => station._id === search.destinationId) ??
    DEMO_STATIONS.at(-1)!
  const tomorrow = new Date(`${search.serviceDate}T08:00:00+01:00`).getTime()
  const passengers = search.adults + search.children
  return [
    {
      tripId: "trip-201",
      trainNumber: "TR-201",
      trainType: "EXPRESS",
      departureAt: tomorrow,
      arrivalAt: tomorrow + 11 * 60 * 60_000 + 45 * 60_000,
      originId: origin._id,
      destinationId: destination._id,
      originName: origin.name,
      destinationName: destination.name,
      passengers,
      priceXaf: 35_000,
      available: 18,
      fromIndex: 0,
      toIndex: 6,
    },
    {
      tripId: "trip-202",
      trainNumber: "TR-202",
      trainType: "OMNIBUS",
      departureAt: tomorrow + 9 * 60 * 60_000,
      arrivalAt: tomorrow + 22 * 60 * 60_000 + 10 * 60_000,
      originId: origin._id,
      destinationId: destination._id,
      originName: origin.name,
      destinationName: destination.name,
      passengers,
      priceXaf: 28_500,
      available: 42,
      fromIndex: 0,
      toIndex: 6,
    },
  ]
}

const SEARCH_KEY = "setrag:search"
const SEARCH_UPDATED_EVENT = "setrag:search-updated"
const TRIP_KEY = "setrag:trip"
const BOOKING_KEY = "setrag:booking"
const BOOKING_OWNER_KEY = "setrag:booking-owner"

function read<T>(key: string): T | null {
  if (typeof window === "undefined") return null
  const value = window.sessionStorage.getItem(key)
  if (!value) return null
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

function write<T>(key: string, value: T) {
  if (typeof window !== "undefined") {
    window.sessionStorage.setItem(key, JSON.stringify(value))
  }
}

export const ticketingStorage = {
  getSearch: () => read<SearchDraft>(SEARCH_KEY),
  setSearch: (value: SearchDraft) => {
    write(SEARCH_KEY, value)
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent<SearchDraft>(SEARCH_UPDATED_EVENT, { detail: value })
      )
    }
  },
  subscribeSearch: (listener: (value: SearchDraft) => void) => {
    if (typeof window === "undefined") return () => undefined
    const onSearchUpdated = (event: Event) => {
      listener((event as CustomEvent<SearchDraft>).detail)
    }
    window.addEventListener(SEARCH_UPDATED_EVENT, onSearchUpdated)
    return () =>
      window.removeEventListener(SEARCH_UPDATED_EVENT, onSearchUpdated)
  },
  getTrip: () => read<SelectedTrip>(TRIP_KEY),
  setTrip: (value: SelectedTrip) => write(TRIP_KEY, value),
  getBooking: (ownerId?: string) => {
    const booking = read<BookingDraft>(BOOKING_KEY)
    if (!booking || !ownerId || typeof window === "undefined") return booking

    const storedOwner = window.sessionStorage.getItem(BOOKING_OWNER_KEY)
    if (storedOwner === ownerId) return booking

    // Les anciens brouillons n'étaient pas rattachés à un compte. Ils peuvent
    // contenir les noms du compte précédemment connecté et ne sont donc jamais
    // repris dans une nouvelle session authentifiée.
    window.sessionStorage.removeItem(BOOKING_KEY)
    window.sessionStorage.removeItem(BOOKING_OWNER_KEY)
    return null
  },
  setBooking: (value: BookingDraft, ownerId?: string) => {
    write(BOOKING_KEY, value)
    if (typeof window === "undefined") return
    if (ownerId) window.sessionStorage.setItem(BOOKING_OWNER_KEY, ownerId)
    else window.sessionStorage.removeItem(BOOKING_OWNER_KEY)
  },
  clearBooking: () => {
    if (typeof window === "undefined") return
    window.sessionStorage.removeItem(BOOKING_KEY)
    window.sessionStorage.removeItem(BOOKING_OWNER_KEY)
  },
}

export const DEFAULT_SEARCH: SearchDraft = {
  originId: DEMO_STATIONS[0]!._id,
  destinationId: DEMO_STATIONS.at(-1)!._id,
  serviceDate: gabonDate(1),
  adults: 1,
  children: 0,
}

export const DEFAULT_BOOKING: BookingDraft = {
  contactPhone: "",
  contactEmail: "",
  serviceClass: "DEUXIEME",
  passengers: [
    {
      firstName: "",
      lastName: "",
      gender: "F",
      emergencyPhone: "",
    },
  ],
}
