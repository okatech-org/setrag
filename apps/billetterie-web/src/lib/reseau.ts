import { toast } from "sonner"

/**
 * Vrai si l'appareil a du réseau. Sinon, le dit au voyageur et l'action n'a
 * pas lieu : une écriture lancée hors réseau resterait en suspens sans que
 * rien ne l'annonce.
 *
 * L'état est relu au moment d'agir, jamais capturé au rendu (voir
 * `useOnline`) : `navigator.onLine` à faux est fiable, à vrai il ne garantit
 * rien — c'est alors la requête elle-même qui échoue, et l'écran le dit.
 */
export function reseauDisponible(
  message = "Hors réseau : cette modification attendra le retour du réseau. Rien n'a changé."
): boolean {
  if (typeof navigator === "undefined" || navigator.onLine) return true
  toast(message)
  return false
}
