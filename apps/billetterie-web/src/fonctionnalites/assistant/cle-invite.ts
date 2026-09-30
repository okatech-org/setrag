/**
 * Secret de session invitée de Ruban.
 *
 * Il prouve qu'une conversation appartient à cet onglet tant que le voyageur
 * n'est pas connecté — puis, après connexion, qu'il peut la rattacher à son
 * compte (`ai.conversations.claim`). Il vit en sessionStorage : jamais dans
 * une adresse, un journal ou un rapport d'erreur.
 */

const CLE = "setrag.ai.guest-key"

export function cleInvite(): string {
  if (typeof window === "undefined") return ""
  try {
    const existante = window.sessionStorage.getItem(CLE)
    if (existante) return existante
    const cle = `${crypto.randomUUID()}${crypto.randomUUID()}`
    window.sessionStorage.setItem(CLE, cle)
    return cle
  } catch {
    // Stockage refusé : un secret propre à la page, perdu au rechargement.
    return `${crypto.randomUUID()}${crypto.randomUUID()}`
  }
}
