"use client"

import { usePathname } from "next/navigation"

import { cn } from "@workspace/ui/lib/utils"

import { DesktopFooter, DesktopHeader } from "@/components/shell/desktop-shell"
import { MobileChromeProvider } from "@/components/shell/mobile-chrome"
import {
  MobileTabBar,
  MobileTabBarSpacer,
  MobileTopBar,
} from "@/components/shell/mobile-shell"
import { useTravelerAuth } from "@/hooks/use-traveler-auth"
import { IS_E2E } from "@/lib/ticketing"

/**
 * Enveloppe commune aux deux expériences.
 *
 * Seul le chrome est dédoublé — en-tête, pied de page, barre d'onglets — et
 * le tri se fait en CSS, jamais par une mesure de largeur : le serveur ignore
 * la taille de l'écran, et un rendu conditionnel en JavaScript ferait sauter
 * la mise en page à l'hydratation.
 *
 * Le contenu, lui, n'est monté qu'une fois : c'est à chaque page de proposer
 * sa vue mobile et sa vue bureau lorsque leurs structures divergent.
 */
export function SiteShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { isAuthenticated, isLoading } = useTravelerAuth()
  const encodedReturn = encodeURIComponent(pathname)
  const loginHref = `/connexion?intention=connexion&retour=${encodedReturn}`
  const signupHref = `/connexion?intention=inscription&retour=${encodedReturn}`

  return (
    <MobileChromeProvider>
      <div data-slot="site-shell" className="flex min-h-dvh flex-col bg-canvas">
        {IS_E2E && (
          <div className="text-small bg-warning-soft px-4 py-2 text-center text-warning-ink">
            Mode de test — aucune session ni réservation affichée ici n’est
            réelle.
          </div>
        )}
        <DesktopHeader
          isAuthenticated={isAuthenticated}
          isLoading={isLoading}
          loginHref={loginHref}
          signupHref={signupHref}
          mobileVisible={!isAuthenticated}
        />
        {isAuthenticated && <MobileTopBar />}
        {children}
        <DesktopFooter mobileVisible={!isAuthenticated} />
        {isAuthenticated && (
          <>
            <MobileTabBarSpacer />
            <MobileTabBar isAuthenticated />
          </>
        )}
      </div>
    </MobileChromeProvider>
  )
}

/**
 * Titre de page.
 *
 * En mobile, la barre de titre du shell porte déjà le nom de l'écran : les
 * pages qui la laissent faire passent `className="hidden md:grid"` plutôt que
 * de répéter le libellé deux fois de suite.
 */
export function PageIntro({
  eyebrow,
  title,
  description,
  className,
  children,
}: {
  eyebrow?: string
  title: string
  description?: string
  className?: string
  children?: React.ReactNode
}) {
  return (
    <section className={cn("grid gap-4", className)}>
      {eyebrow && (
        <span className="text-mono-label text-accent-ink">{eyebrow}</span>
      )}
      <h1 className="text-h1">{title}</h1>
      {description && (
        <p className="text-body-lg max-w-3xl text-ink-muted">{description}</p>
      )}
      {children}
    </section>
  )
}
