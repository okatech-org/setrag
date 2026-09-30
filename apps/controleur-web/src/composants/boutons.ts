/**
 * Bouton de terrain : 56 px, pour toute action d'un verdict, d'un formulaire
 * ou du viseur — au-dessus du plancher de 44 px de la charte, parce qu'ici on
 * vise en marchant, parfois avec des gants. Le libellé passe à la ligne
 * plutôt que d'être tronqué.
 */
export const TERRAIN = "h-auto min-h-14 py-2 text-[16px] leading-tight whitespace-normal text-center"

/**
 * Bouton inactif qui dit pourquoi : il reste lisible (pas d'opacité réduite),
 * sur un fond neutre, et son libellé explique ce qui manque.
 */
export const INACTIF_EXPLIQUE =
  "disabled:border-line disabled:bg-surface-sunk disabled:text-ink-muted disabled:opacity-100"
