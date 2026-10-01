import type { FunctionArgs } from "convex/server"

import type { infraApi } from "../commun"

/*
 * Listes de choix du programme de remise à niveau (PRN). Les tableaux
 * affichent les libellés renvoyés par le serveur (`…Libelle`).
 */

type ArgsChantier = FunctionArgs<typeof infraApi.mutations.creerChantier>

export type NatureChantier = ArgsChantier["nature"]
export type Bailleur = ArgsChantier["financements"][number]["bailleur"]
export type StatutChantier = NonNullable<FunctionArgs<typeof infraApi.mutations.modifierChantier>["statut"]>

export const NATURES_CHANTIER: Record<NatureChantier, string> = {
  renouvellement_voie: "Renouvellement de voie",
  traverses_beton: "Traverses béton bibloc",
  ballast: "Ballastage",
  ouvrage_art: "Ouvrages d'art",
  stabilisation_talus: "Stabilisation de talus",
  signalisation: "Signalisation",
  telecoms: "Télécommunications",
  assainissement: "Assainissement et drainage",
}

export const BAILLEURS: Record<Bailleur, string> = {
  afd: "AFD",
  sfi: "SFI",
  proparco: "Proparco",
  ue: "Union européenne",
  meridiam: "Meridiam",
  etat: "État gabonais",
  setrag: "SETRAG (fonds propres)",
}
export const ORDRE_BAILLEURS: readonly Bailleur[] = ["afd", "sfi", "proparco", "ue", "meridiam", "etat", "setrag"]

export const STATUTS_CHANTIER: Record<StatutChantier, string> = {
  etude: "En étude",
  en_cours: "En cours",
  suspendu: "Suspendu",
  receptionne: "Réceptionné",
}

/** Transitions permises (règle serveur) et libellé du geste correspondant. */
export const TRANSITIONS_CHANTIER: Record<StatutChantier, readonly { vers: StatutChantier; geste: string }[]> = {
  etude: [{ vers: "en_cours", geste: "Lancer les travaux" }],
  en_cours: [
    { vers: "suspendu", geste: "Suspendre le chantier" },
    { vers: "receptionne", geste: "Prononcer la réception" },
  ],
  suspendu: [{ vers: "en_cours", geste: "Reprendre les travaux" }],
  receptionne: [],
}

export const estBailleur = (valeur: string): valeur is Bailleur => valeur in BAILLEURS
