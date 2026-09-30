import type { Route } from "next"

/**
 * Identifiants de connexion : numéro gabonais ou adresse e-mail, et page où
 * revenir une fois connecté. Fonctions pures, testées à part.
 */

export type Canal = "telephone" | "email"

/** Durée de validité d'un code, alignée sur la configuration de Better Auth. */
export const VALIDITE_CODE_MINUTES = 10

/** Essais permis par code avant qu'il soit détruit (réglage par défaut de Better Auth). */
export const ESSAIS_PAR_CODE = 3

/** Page par défaut après la connexion : c'est là que le voyageur retrouve ses billets. */
const RETOUR_PAR_DEFAUT: Route = "/billets"

/**
 * Page où revenir après la connexion.
 *
 * Seul un chemin du site est accepté : `//exemple.com` ou `/\exemple.com`
 * seraient lus par le navigateur comme une autre origine, et feraient de la
 * connexion une porte de sortie vers un site d'hameçonnage. La page de
 * connexion elle-même est écartée, pour ne pas y tourner en rond.
 */
export function cheminDeRetour(demande: string | null | undefined): Route {
  if (
    !demande ||
    !demande.startsWith("/") ||
    demande.startsWith("//") ||
    demande.startsWith("/\\")
  )
    return RETOUR_PAR_DEFAUT
  const base = "http://interne.invalid"
  let url: URL
  try {
    url = new URL(demande, base)
  } catch {
    return RETOUR_PAR_DEFAUT
  }
  // Le parseur retire tabulations et retours à la ligne : « /\t/exemple.com »
  // devient une autre origine. On juge donc l'adresse résolue, pas la saisie.
  if (url.origin !== base) return RETOUR_PAR_DEFAUT
  if (url.pathname === "/connexion" || url.pathname.startsWith("/connexion/"))
    return RETOUR_PAR_DEFAUT
  return `${url.pathname}${url.search}${url.hash}` as Route
}

/**
 * Un numéro enregistré (+24177123456), réécrit comme le voyageur l'écrit :
 * « 077 12 34 56 ». Un numéro étranger reste tel quel.
 */
export function ecritureNationale(numero: string | null | undefined): string {
  const gabonais = /^\+241(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(numero ?? "")
  if (!gabonais) return numero ?? ""
  const [, a, b, c, d] = gabonais
  return `0${a} ${b} ${c} ${d}`
}

export function normaliserEmail(saisie: string): string {
  return saisie.trim().toLowerCase()
}

export function emailValide(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

/** Adresse fabriquée par Better Auth pour un compte ouvert par téléphone : elle n'appartient à personne. */
export function emailTechnique(email: string | null | undefined): boolean {
  return Boolean(email?.endsWith("@auth.setrag.local"))
}

type ErreurAuth =
  { code?: string; status?: number; message?: string } | null | undefined

/**
 * Message à écrire au voyageur pour une erreur de Better Auth : ce qui s'est
 * passé, puis ce qu'il peut faire.
 */
export function messageErreur(
  erreur: ErreurAuth,
  contexte: {
    etape: "envoi" | "verification"
    canal: Canal
    essaisRestants?: number
  }
): string {
  if (erreur?.status === 429)
    return "Trop de demandes en peu de temps. Patientez une minute, puis réessayez."
  switch (erreur?.code) {
    case "INVALID_OTP":
      if (contexte.essaisRestants === undefined)
        return "Ce code ne correspond pas. Vérifiez les chiffres."
      return contexte.essaisRestants > 0
        ? `Ce code ne correspond pas. Il vous reste ${contexte.essaisRestants} essai${contexte.essaisRestants > 1 ? "s" : ""}.`
        : "Ce code ne correspond pas. Demandez un nouveau code."
    case "OTP_EXPIRED":
      return `Ce code a expiré : il ne vaut que ${VALIDITE_CODE_MINUTES} minutes. Demandez-en un nouveau.`
    case "TOO_MANY_ATTEMPTS":
      return "Trop d'essais avec ce code : il n'est plus valable. Demandez-en un nouveau."
    case "OTP_NOT_FOUND":
      return "Aucun code n'attend pour ce numéro. Demandez-en un nouveau."
    case "INVALID_PHONE_NUMBER":
      return "Ce numéro n'est pas un numéro gabonais valide."
    case "INVALID_EMAIL":
      return "Cette adresse e-mail n'est pas valide."
  }
  if (contexte.etape === "envoi") {
    return contexte.canal === "telephone"
      ? "Le code n'a pas pu être envoyé par SMS. Réessayez dans un instant."
      : "Le code n'a pas pu être envoyé par e-mail. Réessayez dans un instant."
  }
  return "Le code n'a pas pu être vérifié. Réessayez dans un instant."
}
