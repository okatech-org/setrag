import type * as React from "react"

/**
 * Déplacement au clavier dans un groupe de boutons `role="radio"` : flèches,
 * Début et Fin choisissent l'option voisine et lui donnent le focus, comme un
 * groupe de boutons radio natif. Les options désactivées sont sautées.
 *
 * Chaque bouton porte `data-valeur` ; seul le bouton coché est dans l'ordre
 * de tabulation (`tabIndex` 0, les autres -1).
 */
export function flecheRadio(
  event: React.KeyboardEvent<HTMLElement>,
  valeurs: readonly string[],
  valeur: string | undefined,
  choisir: (valeur: string) => void,
  desactivee: (valeur: string) => boolean = () => false
) {
  const actives = valeurs.filter((v) => !desactivee(v))
  if (actives.length === 0) return
  const index = Math.max(0, actives.indexOf(valeur ?? ""))
  let cible: string | undefined
  switch (event.key) {
    case "ArrowRight":
    case "ArrowDown":
      cible = actives[(index + 1) % actives.length]
      break
    case "ArrowLeft":
    case "ArrowUp":
      cible = actives[(index - 1 + actives.length) % actives.length]
      break
    case "Home":
      cible = actives[0]
      break
    case "End":
      cible = actives[actives.length - 1]
      break
    default:
      return
  }
  event.preventDefault()
  if (cible === undefined) return
  choisir(cible)
  event.currentTarget.querySelector<HTMLElement>(`[data-valeur="${CSS.escape(cible)}"]`)?.focus()
}
