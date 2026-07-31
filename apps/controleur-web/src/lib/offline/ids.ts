/**
 * Identifiants attribués par le terminal.
 *
 * Deux besoins distincts se croisent ici et ne doivent pas être confondus :
 *
 *  — le `clientId`, invisible pour l'agent, sert d'unique clé d'idempotence.
 *    Il doit être universellement unique, car deux terminaux qui produiraient
 *    la même valeur verraient l'un de leurs envois silencieusement ignoré ;
 *
 *  — le numéro local (PV-0117, B-9002, INC-042) est ce que l'agent annonce au
 *    voyageur avant toute synchronisation. Il n'a qu'à être lisible et unique
 *    sur le terminal ; le numéro opposable définitif vient du serveur.
 */

const COUNTER_PREFIX = "setrag.controle.counter."

/**
 * Instant courant, en millisecondes.
 *
 * Isolé derrière une fonction : l'horodatage d'un contrôle ou d'un
 * procès-verbal est une donnée métier — elle finit dans un document
 * opposable — et doit pouvoir être fixée dans un test.
 */
export function nowMs(): number {
  return Date.now()
}

/** Identifiant d'idempotence, unique entre tous les terminaux. */
export function clientId(prefix: string): string {
  const unique =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
  return `${prefix}-${unique}`
}

/**
 * Numéro lisible, croissant sur ce terminal.
 *
 * Le compteur vit dans `localStorage` plutôt qu'en base : il doit survivre à
 * la purge de fin de tournée, sans quoi deux procès-verbaux d'une même
 * semaine porteraient le même numéro devant le voyageur.
 */
export function localNumber(prefix: string, pad = 4): string {
  const key = `${COUNTER_PREFIX}${prefix}`
  let next = 1
  if (typeof localStorage !== "undefined") {
    next = Number.parseInt(localStorage.getItem(key) ?? "0", 10) + 1
    if (!Number.isFinite(next) || next < 1) next = 1
    localStorage.setItem(key, String(next))
  }
  return `${prefix}-${String(next).padStart(pad, "0")}`
}
