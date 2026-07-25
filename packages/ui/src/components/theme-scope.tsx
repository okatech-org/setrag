import * as React from "react"

/**
 * Épingle un thème sur une sous-arborescence, indépendamment de l'hôte.
 *
 * Utile partout où le design system est rendu dans une surface dont on ne
 * contrôle pas le thème : panneau d'outil, aperçu embarqué, capture. Sans lui,
 * un hôte en thème sombre ferait basculer les composants alors que sa surface
 * d'accueil, elle, reste claire — texte clair sur fond blanc.
 */
export interface ThemeScopeProps extends React.ComponentProps<"div"> {
  theme?: "light" | "dark"
}

function ThemeScope({ theme = "light", ...props }: ThemeScopeProps) {
  return <div data-theme={theme} {...props} />
}

export { ThemeScope }
