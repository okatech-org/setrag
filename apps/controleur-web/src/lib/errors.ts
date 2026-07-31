/**
 * Messages d'erreur lisibles à bord.
 *
 * Convex enveloppe les erreurs applicatives dans une trace destinée aux
 * journaux : nom de la mutation, identifiant de requête, pile d'appels. Un
 * contrôleur, lui, doit lire « Aucune session de caisse ouverte » et savoir
 * quoi faire. On extrait donc le message métier, et on garde la trace pour la
 * console du navigateur.
 */

const CONVEX_PREFIX = /^\[CONVEX [^\]]*\]\s*/
const REQUEST_ID = /\[Request ID: [^\]]*\]\s*/
const SERVER_ERROR = /^Server Error\s*/
const UNCAUGHT = /^Uncaught (Error|ConvexError):\s*/

export function humanError(error: unknown): string {
  const raw =
    error instanceof Error ? error.message : String(error ?? "Erreur inconnue")

  const first = raw
    .replace(CONVEX_PREFIX, "")
    .replace(REQUEST_ID, "")
    .replace(SERVER_ERROR, "")
    .split("\n")
    // La pile commence à la première ligne indentée ou préfixée « at ».
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("at "))
    .map((line) => line.replace(UNCAUGHT, ""))
    .find((line) => line.length > 0)

  return first ?? "Erreur inconnue"
}
