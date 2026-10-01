import type { FunctionArgs } from "convex/server"

import type { CapaciteInfra, infraApi } from "../commun"

/*
 * Listes de choix des formulaires et des filtres d'équipements. Les tableaux
 * affichent les libellés du serveur (`…Libelle`).
 */

export type CategorieEquipement = FunctionArgs<typeof infraApi.mutations.creerEquipement>["categorie"]
export type EtatEquipement = FunctionArgs<typeof infraApi.mutations.majEtatEquipement>["etat"]

export const CATEGORIES_EQUIPEMENT: Record<CategorieEquipement, string> = {
  signalisation: "Signalisation",
  passage_niveau: "Passages à niveau",
  telecoms: "Télécommunications",
}
export const ORDRE_CATEGORIES: readonly CategorieEquipement[] = ["signalisation", "passage_niveau", "telecoms"]

export const ETATS_EQUIPEMENT: Record<EtatEquipement, string> = {
  en_service: "En service",
  degrade: "Dégradé",
  hors_service: "Hors service",
}

/** Exemples de types proposés à la saisie, par catégorie (texte libre au serveur). */
export const TYPES_SUGGERES: Record<CategorieEquipement, readonly string[]> = {
  signalisation: ["Signal d'entrée", "Signal de sortie", "Aiguillage motorisé", "Circuit de voie", "Compteur d'essieux", "Poste d'enclenchement"],
  passage_niveau: ["PN gardé", "PN à signalisation automatique", "PN non gardé"],
  telecoms: ["Fibre optique", "Relais radio sol-train", "Station GSM-R", "Téléphone de canton"],
}

/** La signalisation et les PN relèvent d'une capacité, les télécoms d'une autre. */
export function capaciteEquipement(categorie: CategorieEquipement): CapaciteInfra {
  return categorie === "telecoms" ? "equipement_telecoms" : "equipement_signalisation"
}
