"use client"

import { usePathname } from "next/navigation"

import { cn } from "@workspace/ui/lib/utils"

import { VoiceTravelAssistantHost } from "@/components/assistant/voice-travel-assistant"
import { BarreReseau } from "@/components/offline/barre-reseau"
import { InviteInstallation } from "@/components/offline/invite-installation"
import { ServiceWorker } from "@/components/service-worker"
import { DesktopFooter, DesktopHeader } from "@/components/shell/desktop-shell"
import { MobileChromeProvider } from "@/components/shell/mobile-chrome"
import {
  MobileTabBar,
  MobileTabBarSpacer,
  MobileTopBar,
} from "@/components/shell/mobile-shell"
import { useTravelerAuth } from "@/hooks/use-traveler-auth"
import { IS_E2E } from "@/lib/ticketing"

const BROWSER_E2E = IS_E2E && process.env.NODE_ENV !== "test"

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
  // Les parcours Playwright simulent une session afin de couvrir le chrome
  // authentifié sans dépendre d'un service d'identité externe.
  const hasTravelerSession = BROWSER_E2E || isAuthenticated
  const encodedReturn = encodeURIComponent(pathname)
  const loginHref = `/connexion?intention=connexion&retour=${encodedReturn}`
  const signupHref = `/connexion?intention=inscription&retour=${encodedReturn}`

  // Le dossier de présentation s'adresse à la SETRAG, pas à un voyageur : il
  // porte son propre en-tête et n'a rien à faire du chrome de la billetterie.
  if (pathname.startsWith("/presentation")) {
    return <>{children}</>
  }

  return (
    <MobileChromeProvider>
      <div data-slot="site-shell" className="flex min-h-dvh flex-col bg-canvas">
        <ServiceWorker />
        <BarreReseau />
        <InviteInstallation />
        {IS_E2E && (
          <div className="text-small bg-warning-soft px-4 py-2 text-center text-warning-ink">
            Mode de test — aucune session ni réservation affichée ici n’est
            réelle.
          </div>
        )}
        <DesktopHeader
          isAuthenticated={hasTravelerSession}
          isLoading={isLoading}
          loginHref={loginHref}
          signupHref={signupHref}
          mobileVisible={!hasTravelerSession}
        />
        {hasTravelerSession && <MobileTopBar />}
        {children}
        <DesktopFooter mobileVisible={!hasTravelerSession} />
        {hasTravelerSession && (
          <>
            <MobileTabBarSpacer />
            <MobileTabBar isAuthenticated />
          </>
        )}
        <VoiceTravelAssistantHost />
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
