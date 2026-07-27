"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"

import { MobileAppBar, MobileAppBarBack } from "@workspace/ui/mobile/app-bar"
import { BottomNav, BottomNavItem } from "@workspace/ui/mobile/bottom-nav"

import { useMobileChrome } from "@/components/shell/mobile-chrome"
import { NotificationsBell } from "@/components/shell/notifications-bell"
import { MOBILE_TABS, isTabActive } from "@/components/shell/navigation"

/**
 * Barre de titre mobile.
 *
 * Absente sur l'accueil, qui porte son propre en-tête sombre : deux bandeaux
 * empilés mangeraient un quart de la hauteur utile.
 */
export function MobileTopBar() {
  const chrome = useMobileChrome()

  if (chrome.variant === "hero") return null

  return (
    <MobileAppBar
      className="md:hidden"
      title={chrome.title ?? "SETRAG"}
      subtitle={chrome.subtitle}
      back={chrome.variant === "stack" ? <MobileBackButton /> : undefined}
      action={chrome.variant === "tab" ? <NotificationsBell /> : undefined}
    />
  )
}

/**
 * Retour arrière.
 *
 * `router.back()` sortirait du site quand l'écran a été ouvert directement —
 * lien reçu par SMS vers un billet, par exemple. On ne remonte donc dans
 * l'historique que si la navigation vient d'ici.
 */
function MobileBackButton() {
  const router = useRouter()

  // L'historique se lit au clic et non au montage : il s'allonge au fil de la
  // session, et un écran ouvert sans antécédent peut en avoir acquis un depuis.
  return (
    <MobileAppBarBack
      onClick={() =>
        window.history.length > 1 ? router.back() : router.push("/")
      }
    />
  )
}

/** Barre d'onglets du bas — masquée sur les écrans empilés et au-delà de 768 px. */
export function MobileTabBar({
  isAuthenticated,
}: {
  isAuthenticated: boolean
}) {
  const pathname = usePathname()
  const chrome = useMobileChrome()

  if (chrome.variant === "stack") return null

  return (
    <BottomNav label="Navigation principale" className="md:hidden">
      {MOBILE_TABS.filter(
        (tab) => isAuthenticated || !tab.requiresAuthentication
      ).map((tab) => {
        const Icon = tab.icon
        return (
          <BottomNavItem
            key={tab.href}
            asChild
            active={isTabActive(tab.href, pathname)}
          >
            <Link href={tab.href}>
              <Icon aria-hidden />
              {tab.label}
            </Link>
          </BottomNavItem>
        )
      })}
    </BottomNav>
  )
}

/**
 * Réserve du contenu la hauteur de la barre d'onglets, qui flotte au-dessus.
 * Sans elle, la dernière ligne de chaque page passerait dessous.
 */
export function MobileTabBarSpacer() {
  const chrome = useMobileChrome()

  if (chrome.variant === "stack") return null

  return (
    <div
      aria-hidden
      className="pb-safe h-14 md:hidden"
      data-slot="tab-bar-spacer"
    />
  )
}
