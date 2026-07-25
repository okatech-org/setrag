import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"

/**
 * Épingle un thème sur une sous-arborescence, indépendamment de l'hôte.
 *
 * Pose `data-theme` **et** la couleur de texte. Les deux sont nécessaires :
 * `color` s'hérite par sa valeur calculée, donc un hôte qui déclare
 * `body { color: … }` hors `@layer` traverse toutes les variables qu'on
 * redéfinit ici — seuls les éléments portant une classe de couleur explicite y
 * échapperaient, et le reste du texte partirait à la couleur de l'hôte.
 *
 * En revanche il ne peint **aucun fond** en mode clair : un aplat `canvas`
 * posé sur la surface d'accueil s'y voit comme un rectangle grisé. Le fond
 * n'arrive que là où il est nécessaire — en mode sombre, sans quoi le texte
 * clair se retrouverait sur la surface claire de l'hôte — ou sur demande
 * explicite via `surface`.
 */
export interface ThemeScopeProps extends React.ComponentProps<"div"> {
  theme?: "light" | "dark"
  /** Peint le fond `canvas`, pour une vraie surface de page. */
  surface?: boolean
}

function ThemeScope({
  theme = "light",
  surface = false,
  className,
  ...props
}: ThemeScopeProps) {
  return (
    <div
      data-theme={theme}
      data-slot="theme-scope"
      className={cn(
        "text-ink",
        (surface || theme === "dark") && "bg-canvas",
        className
      )}
      {...props}
    />
  )
}

export { ThemeScope }
