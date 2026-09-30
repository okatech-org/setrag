/**
 * Le titulaire d'un compte voyageur : le voyageur « Moi ».
 *
 * Le compte porte lui-même son voyageur par défaut. Prénom, nom, téléphone,
 * e-mail et civilité vivent dans le profil (`users`), créé à la connexion :
 * il n'existe pas de fiche en double dans `savedPassengers`, qui reste la
 * liste des personnes avec qui l'on voyage. Une seule source, rien à
 * synchroniser, et un compte ancien sans civilité continue de fonctionner.
 *
 * Ce module est pur : il sert au backend (contexte de Ruban, réservation) et
 * à la billetterie web (préremplissage de « Moi »), via
 * `@workspace/backend/titulaire`.
 */

export type Civilite = "M" | "F"

type Nomme = {
  firstName?: string | null
  lastName?: string | null
}

/**
 * Nom et prénom comparés sans accents, casse ni ponctuation :
 * « ITOUTOU Berny » et « Itoutou berny » désignent la même personne.
 * `null` si l'un des deux manque : un nom partiel ne prouve rien.
 */
export function cleDeNom(personne: Nomme): string | null {
  const propre = (valeur: string | null | undefined) =>
    (valeur ?? "")
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim()
  const prenom = propre(personne.firstName)
  const nom = propre(personne.lastName)
  if (!prenom || !nom) return null
  return `${prenom}|${nom}`
}

/** Deux personnes portent-elles les mêmes prénom et nom ? */
export function memePersonne(a: Nomme, b: Nomme): boolean {
  const cle = cleDeNom(a)
  return cle !== null && cle === cleDeNom(b)
}

/**
 * Civilité du titulaire : celle du profil ; à défaut — comptes ouverts avant
 * que le profil la porte —, celle de la fiche enregistrée à ses nom et
 * prénom, que le voyageur avait créée pour lui-même.
 */
export function civiliteDuTitulaire(
  profil: Nomme & { gender?: Civilite | null },
  fiches: ReadonlyArray<Nomme & { gender: Civilite }>
): Civilite | null {
  if (profil.gender) return profil.gender
  return fiches.find((fiche) => memePersonne(profil, fiche))?.gender ?? null
}

export type ChampTitulaire = "firstName" | "lastName" | "gender"

/**
 * Ce qui manque encore au titulaire pour figurer sur un billet — la seule
 * chose que Ruban puisse avoir à lui demander à son sujet.
 */
export function manquesDuTitulaire(
  profil: Nomme,
  civilite: Civilite | null
): ChampTitulaire[] {
  const manques: ChampTitulaire[] = []
  if (!profil.firstName?.trim()) manques.push("firstName")
  if (!profil.lastName?.trim()) manques.push("lastName")
  if (!civilite) manques.push("gender")
  return manques
}

/**
 * La civilité donnée à la réservation pour le titulaire, quand son profil
 * n'en porte pas encore : elle le complète, une fois. Jamais pour écraser une
 * civilité déjà connue ; jamais sur la foi d'un nom partiel.
 */
export function civiliteAEnregistrer(
  profil: Nomme & { gender?: Civilite | null },
  voyageurs: ReadonlyArray<Nomme & { gender: Civilite }>
): Civilite | null {
  if (profil.gender) return null
  const civilites = new Set(
    voyageurs
      .filter((voyageur) => memePersonne(profil, voyageur))
      .map((voyageur) => voyageur.gender)
  )
  // Deux homonymes de civilités différentes dans le même dossier : on ne
  // tranche pas.
  return civilites.size === 1 ? [...civilites][0]! : null
}
