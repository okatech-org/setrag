import { z } from "zod"
import { ROLES } from "../constants"

export const profileSchema = z.object({
  firstName: z.string().min(2).max(60),
  lastName: z.string().min(2).max(60),
  email: z.email().optional(),
  phone: z.string().regex(/^\+?[0-9\s]{8,15}$/, "Numéro invalide"),
  birthDate: z.iso.date().optional(),
  documentType: z.enum(["cni", "passeport", "carte_sejour"]).optional(),
  documentNumber: z.string().min(4).max(32).optional(),
})

export const agentProfileSchema = profileSchema.extend({
  role: z.enum(ROLES),
  stationId: z.string().min(1).optional(),
  matricule: z.string().min(3).max(20),
})

export type ProfileInput = z.infer<typeof profileSchema>
export type AgentProfileInput = z.infer<typeof agentProfileSchema>
