import type { FunctionArgs } from "convex/server"

import type { infraApi } from "../commun"

/*
 * Listes de choix des formulaires et des filtres. Les tableaux affichent les
 * libellés renvoyés par le serveur (`…Libelle`) ; le typage par `Record` sur
 * les arguments des mutations signale à la compilation toute valeur ajoutée
 * côté serveur.
 */

type ArgsOuvrage = FunctionArgs<typeof infraApi.mutations.creerOuvrage>
type ArgsInspection = FunctionArgs<typeof infraApi.mutations.creerInspection>

export type TypeOuvrage = ArgsOuvrage["type"]
export type Cotation = ArgsInspection["cotationProposee"]
export type TypeInspection = ArgsInspection["type"]
export type GraviteDesordre = ArgsInspection["desordres"][number]["gravite"]

export const TYPES_OUVRAGE: Record<TypeOuvrage, string> = {
  pont: "Pont",
  viaduc: "Viaduc",
  tunnel: "Tunnel",
  buse: "Buse",
  dalot: "Dalot",
  mur_soutenement: "Mur de soutènement",
  tranchee: "Tranchée",
}

/** Cotation IQOA : de la meilleure à la plus grave. */
export const COTATIONS: Record<Cotation, string> = {
  "1": "1 — bon état apparent",
  "2": "2 — défauts mineurs",
  "2E": "2E — défauts à surveiller, évolution possible",
  "3": "3 — structure altérée, travaux à programmer",
  "3U": "3U — structure gravement altérée, urgence",
}
export const ORDRE_COTATIONS: readonly Cotation[] = ["1", "2", "2E", "3", "3U"]

export const TYPES_INSPECTION: Record<TypeInspection, string> = {
  visite_annuelle: "Visite annuelle",
  inspection_detaillee: "Inspection détaillée",
  inspection_exceptionnelle: "Inspection exceptionnelle",
}

export const GRAVITES_DESORDRE: Record<GraviteDesordre, string> = {
  faible: "Faible",
  moyenne: "Moyenne",
  elevee: "Élevée",
  critique: "Critique",
}

export const libelleTypeInspection = (type: string) => TYPES_INSPECTION[type as TypeInspection] ?? type
