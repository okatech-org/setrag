/**
 * Vocabulaire du voyage, tel que le voyageur le lit.
 *
 * Les codes viennent du backend (`schema.ts`) ; seuls les libellés vivent
 * ici. Ce sont des mots d'interface, pas des règles : prix, réductions et
 * disponibilités se lisent toujours dans le backend.
 */

export const CLASSES = ["DEUXIEME", "PREMIERE", "VIP"] as const
export type Classe = (typeof CLASSES)[number]

export const LIBELLE_CLASSE: Record<Classe, { nom: string; court: string }> = {
  DEUXIEME: { nom: "Deuxième classe", court: "2e" },
  PREMIERE: { nom: "Première classe", court: "1re" },
  VIP: { nom: "VIP", court: "VIP" },
}

export function estClasse(valeur: string | null | undefined): valeur is Classe {
  return (CLASSES as readonly string[]).includes(valeur ?? "")
}

const TYPES_TRAIN: Record<string, string> = {
  EXPRESS: "Express",
  OMNIBUS: "Omnibus",
  AUTORAIL: "Autorail",
  SPECIAL: "Train spécial",
}

/** « Express 201 » à partir de EXPRESS et TR-201. */
export function nomTrain(type: string, numero: string): string {
  return `${TYPES_TRAIN[type] ?? "Train"} ${numero.replace(/^[A-Z]+-/, "")}`
}

export function libelleTypeTrain(type: string): string {
  return TYPES_TRAIN[type] ?? "Train"
}

/**
 * Gares nommées sur le schéma de la ligne : les autres y sont des points.
 * Un choix de lisibilité, pas une donnée d'exploitation.
 */
export const GARES_REPERES = new Set(["OWE", "NDJ", "BOO", "LTV", "FCV"])

/** Au-delà, une réservation en ligne n'est plus possible : c'est un groupe. */
export const VOYAGEURS_MAX = 9

/** Places restantes affichées seulement sous ce seuil (charte : « sous 10 »). */
export const SEUIL_PLACES = 10
