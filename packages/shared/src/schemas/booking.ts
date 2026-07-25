import { z } from "zod"
import { SERVICE_CLASSES, PAYMENT_METHODS } from "../constants"

export const passengerSchema = z.object({
  firstName: z.string().min(2, "Prénom requis"),
  lastName: z.string().min(2, "Nom requis"),
  birthDate: z.iso.date().optional(),
  documentType: z.enum(["cni", "passeport", "carte_sejour"]).optional(),
  documentNumber: z.string().min(4).max(32).optional(),
  phone: z
    .string()
    .regex(/^\+?[0-9\s]{8,15}$/, "Numéro de téléphone invalide")
    .optional(),
})

export const searchTripsSchema = z
  .object({
    originStationId: z.string().min(1, "Gare de départ requise"),
    destinationStationId: z.string().min(1, "Gare d'arrivée requise"),
    departureDate: z.iso.date(),
    passengers: z.number().int().min(1).max(9).default(1),
    serviceClass: z.enum(SERVICE_CLASSES).optional(),
  })
  .refine((v) => v.originStationId !== v.destinationStationId, {
    message: "Les gares de départ et d'arrivée doivent être différentes",
    path: ["destinationStationId"],
  })

export const createBookingSchema = z.object({
  tripId: z.string().min(1),
  serviceClass: z.enum(SERVICE_CLASSES),
  passengers: z.array(passengerSchema).min(1).max(9),
  contactEmail: z.email().optional(),
  contactPhone: z.string().regex(/^\+?[0-9\s]{8,15}$/),
})

export const payBookingSchema = z.object({
  bookingId: z.string().min(1),
  method: z.enum(PAYMENT_METHODS),
  payerPhone: z
    .string()
    .regex(/^\+?[0-9\s]{8,15}$/)
    .optional(),
})

export const scanTicketSchema = z.object({
  qrPayload: z.string().min(8),
  stationId: z.string().min(1).optional(),
})

export type PassengerInput = z.infer<typeof passengerSchema>
export type SearchTripsInput = z.infer<typeof searchTripsSchema>
export type CreateBookingInput = z.infer<typeof createBookingSchema>
export type PayBookingInput = z.infer<typeof payBookingSchema>
export type ScanTicketInput = z.infer<typeof scanTicketSchema>
