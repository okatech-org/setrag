import type { FunctionArgs } from "convex/server"

import type { infraApi, LigneIntervention } from "../commun"

export type TypeIntervention = FunctionArgs<typeof infraApi.mutations.demanderIntervention>["type"]
export type StatutIntervention = LigneIntervention["statut"]

/** Listes des formulaires et filtres ; les tableaux affichent les libellés du serveur. */
export const TYPES_INTERVENTION: Record<TypeIntervention, string> = {
  entretien_voie: "Entretien de la voie",
  prn: "Travaux PRN",
  ouvrage: "Ouvrage d'art",
  signalisation: "Signalisation",
  telecoms: "Télécommunications",
  debroussaillage: "Débroussaillage",
}

export const STATUTS_INTERVENTION: Record<StatutIntervention, string> = {
  demandee: "Demandée",
  accordee: "Accordée",
  en_cours: "En cours",
  terminee: "Terminée",
  annulee: "Annulée",
  refusee: "Refusée",
}

/** Durée maximale d'une plage travaux (règle serveur). */
export const DUREE_MAX_HEURES = 72

/** Régime de circulation, toujours écrit. */
export const regime = (interruption: boolean) => (interruption ? "Coupure de voie" : "Sous circulation")
