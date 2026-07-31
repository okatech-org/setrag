"use client"

import { UserRound } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { DESKTOP_LINKS } from "@/components/shell/navigation"
import { NotificationsBell } from "@/components/shell/notifications-bell"

/**
 * En-tête du bureau — logo, navigation du voyageur et compte.
 *
 * Masqué sous 768 px : en mobile la navigation passe par la barre d'onglets du
 * bas et la recherche vit dans l'écran d'accueil.
 */
export function DesktopHeader({
  isAuthenticated,
  isLoading,
  loginHref,
  signupHref,
  mobileVisible = false,
}: {
  isAuthenticated: boolean
  isLoading: boolean
  loginHref: string
  signupHref: string
  mobileVisible?: boolean
}) {
  const pathname = usePathname()

  return (
    <header
      data-slot="desktop-header"
      className={cn(
        "pt-safe sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur",
        mobileVisible ? "block" : "hidden md:block"
      )}
    >
      <div className="mx-auto flex h-17 max-w-7xl items-center gap-3 px-4 sm:gap-5 sm:px-6">
        <Link href="/" aria-label="SETRAG — accueil" className="shrink-0">
          <Image
            src="/setrag-logo.png"
            alt="SETRAG"
            width={82}
            height={34}
            priority
            style={{ width: "auto", height: "auto" }}
          />
        </Link>
        {isAuthenticated && (
          <nav
            aria-label="Navigation principale"
            className="hidden items-center gap-8 md:flex"
          >
            {DESKTOP_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={pathname === link.href ? "page" : undefined}
                className={
                  pathname === link.href
                    ? "text-small font-semibold text-accent-ink"
                    : "text-small font-medium text-ink-muted hover:text-ink"
                }
              >
                {link.label}
              </Link>
            ))}
          </nav>
        )}
        {isAuthenticated && <NotificationsBell className="ml-auto shrink-0" />}
        {isLoading ? (
          <span
            aria-label="Chargement de la session"
            className="ml-auto h-9 w-40 animate-pulse rounded-pill bg-surface-sunk"
          />
        ) : isAuthenticated ? (
          <Button asChild variant="secondary" size="sm">
            <Link href="/compte">
              <UserRound className="size-4" />
              Mon compte
            </Link>
          </Button>
        ) : (
          <div className="ml-auto flex items-center gap-2">
            <Button asChild variant="ghost" size="sm" className="px-3 sm:px-4">
              <Link href={loginHref}>Se connecter</Link>
            </Button>
            <Button asChild size="sm" className="px-3 sm:px-4">
              <Link href={signupHref}>S’inscrire</Link>
            </Button>
          </div>
        )}
      </div>
    </header>
  )
}

/**
 * Pied de page du bureau.
 *
 * Masqué en mobile : ses liens secondaires sont repris dans l'onglet Compte,
 * un pied de trois colonnes ne se parcourt pas au pouce.
 */
export function DesktopFooter({
  mobileVisible = false,
}: {
  mobileVisible?: boolean
}) {
  return (
    <div
      data-slot="desktop-footer-container"
      className={cn(
        "mt-auto pt-16",
        mobileVisible ? "block" : "hidden md:block"
      )}
    >
      <footer className="border-t border-line bg-ink text-ink-inverse">
        <div className="mx-auto grid max-w-7xl gap-8 px-6 py-10 md:grid-cols-[1.5fr_1fr_1fr]">
          <div className="grid gap-3">
            <Image
              src="/setrag-logo.png"
              alt="SETRAG"
              width={92}
              height={38}
              className="rounded bg-white p-1"
              style={{ width: "auto", height: "auto" }}
            />
            <p className="text-small max-w-md text-ink-faint">
              Billetterie officielle de la ligne Owendo–Franceville.
            </p>
          </div>
          <div className="text-small grid content-start gap-2">
            <strong>Voyager</strong>
            <Link href="/">Horaires et gares</Link>
            <Link href="/mes-reservations">Mes réservations</Link>
            <Link href="/tarifs">Tarifs officiels</Link>
            <Link href="/bagages">Bagages</Link>
          </div>
          <div className="text-small grid content-start gap-2">
            <strong>Assistance</strong>
            <Link href="/suivi">Suivre un train</Link>
            <Link href="/aide">Aide et contacts</Link>
            <span>Guichets · 06:00–20:00</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
