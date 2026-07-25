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
 */
export interface ThemeScopeProps extends React.ComponentProps<"div"> {
  theme?: "light" | "dark"
}

function ThemeScope({ theme = "light", className, ...props }: ThemeScopeProps) {
  return (
    <div
      data-theme={theme}
      data-slot="theme-scope"
      className={cn("bg-canvas text-ink", className)}
      {...props}
    />
  )
}

export { ThemeScope }
