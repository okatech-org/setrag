/**
 * Enregistrer un fichier sur l'appareil : PDF des billets, carte Wallet,
 * événement d'agenda.
 */

function declencher(url: string, nom: string) {
  const lien = document.createElement("a")
  lien.href = url
  lien.download = nom
  lien.rel = "noopener"
  document.body.append(lien)
  lien.click()
  lien.remove()
}

/** Fichier fabriqué sur l'appareil (agenda, carte Apple Wallet). */
export function enregistrerFichier(
  contenu: BlobPart,
  type: string,
  nom: string
) {
  const url = URL.createObjectURL(new Blob([contenu], { type }))
  declencher(url, nom)
  // Safari lit le fichier après le clic : on ne révoque pas l'adresse tout de suite.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

/**
 * Fichier servi par le stockage Convex. On le télécharge pour lui donner son
 * nom ; si le navigateur refuse la lecture croisée, on l'ouvre directement.
 */
export async function enregistrerDistant(url: string, nom: string) {
  try {
    const reponse = await fetch(url)
    if (!reponse.ok) throw new Error(String(reponse.status))
    enregistrerFichier(await reponse.blob(), "application/pdf", nom)
  } catch {
    window.location.assign(url)
  }
}
