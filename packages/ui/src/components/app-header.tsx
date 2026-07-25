import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"

export interface AppHeaderLink {
  label: string
  href: string
  active?: boolean
}

export interface AppHeaderProps extends React.ComponentProps<"header"> {
  links?: AppHeaderLink[]
  /** Marque à gauche — logo SETRAG en général. */
  brand?: React.ReactNode
  /** Bloc de droite — avatar, bouton de connexion. */
  actions?: React.ReactNode
}

/**
 * En-tête d'application — marque, navigation, compte.
 * Les liens sont fournis par l'application : le design system n'impose ni
 * routeur ni structure d'URL.
 */
function AppHeader({
  links = [],
  brand,
  actions,
  className,
  ...props
}: AppHeaderProps) {
  return (
    <header
      data-slot="app-header"
      className={cn(
        "flex items-center justify-between gap-6 border-b border-line bg-surface px-6 py-3.5",
        className
      )}
      {...props}
    >
      <div className="flex items-center gap-3">{brand}</div>

      {links.length > 0 && (
        <nav aria-label="Navigation principale" className="hidden gap-6 md:flex">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              aria-current={link.active ? "page" : undefined}
              className={cn(
                "text-[14px] leading-none no-underline transition-colors",
                link.active
                  ? "font-semibold text-ink"
                  : "font-medium text-ink-muted hover:text-ink"
              )}
            >
              {link.label}
            </a>
          ))}
        </nav>
      )}

      <div className="flex items-center gap-3">{actions}</div>
    </header>
  )
}

export { AppHeader }
