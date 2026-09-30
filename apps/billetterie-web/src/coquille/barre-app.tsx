"use client"

import { ChevronLeftIcon } from "lucide-react"
import Link from "next/link"
import type { Route } from "next"
import { useRouter } from "next/navigation"
import { useEffect, useState, type ReactNode } from "react"

import { Logo } from "@workspace/ui/marque"
import { cn } from "@workspace/ui/lib/utils"

import { Cloche } from "./compte-rapide"
import { signalerNavigation } from "./filet-navigation"

/**
 * Barre d'app mobile, propre à chaque écran — comme une app native : un
 * retour, un titre sur deux lignes, des actions à droite. Les écrans racines
 * (accueil, billets, compte) portent le logo à la place du retour.
 *
 * Invisible sur grand écran, où l'en-tête du site prend le relais.
 */
export function BarreApp({
  titre,
  sousTitre,
  retour,
  actions,
  logo,
  className,
}: {
  titre?: ReactNode
  sousTitre?: ReactNode
  /** Page de repli du retour ; `true` : l'écran précédent, sinon l'accueil. */
  retour?: Route | true
  actions?: ReactNode
  /** Écran racine : le logo, et la cloche des notifications. */
  logo?: boolean
  className?: string
}) {
  const router = useRouter()
  const [defile, setDefile] = useState(false)

  // Le filet du bas n'apparaît qu'une fois le contenu passé dessous.
  useEffect(() => {
    const mesurer = () => setDefile(window.scrollY > 4)
    mesurer()
    window.addEventListener("scroll", mesurer, { passive: true })
    return () => window.removeEventListener("scroll", mesurer)
  }, [])

  const revenir = () => {
    signalerNavigation()
    if (retour === true) {
      if (window.history.length > 1) router.back()
      else router.push("/")
    }
  }

  return (
    <div
      className={cn(
        "pt-safe sticky top-0 z-30 border-b bg-canvas/95 backdrop-blur-md transition-colors duration-[var(--dur-base)] md:hidden",
        defile ? "border-line" : "border-transparent",
        className
      )}
    >
      <div className={cn("flex min-h-[52px] items-center gap-1 pr-2", logo ? "pl-4" : "pl-1")}>
        {logo ? (
          <Link href="/" aria-label="SETRAG — accueil" className="mr-auto rounded-sm">
            <Logo variante="compact" title="" className="h-[30px]" />
          </Link>
        ) : (
          retour &&
          (retour === true ? (
            <button type="button" onClick={revenir} aria-label="Retour" className="grid size-11 shrink-0 place-items-center rounded-pill text-accent-ink active:bg-surface-sunk">
              <ChevronLeftIcon className="size-6" />
            </button>
          ) : (
            <Link href={retour} aria-label="Retour" className="grid size-11 shrink-0 place-items-center rounded-pill text-accent-ink active:bg-surface-sunk">
              <ChevronLeftIcon className="size-6" />
            </Link>
          ))
        )}
        {titre && (
          <div className={cn("min-w-0 flex-1", !retour && !logo && "pl-3")}>
            <p className="truncate text-[16px] leading-tight font-bold">{titre}</p>
            {sousTitre && <p className="truncate text-[12.5px] font-medium text-ink-muted">{sousTitre}</p>}
          </div>
        )}
        <div className="ml-auto flex items-center gap-0.5">
          {actions}
          {logo && <Cloche />}
        </div>
      </div>
    </div>
  )
}

/** Grand titre d'écran racine, sous la barre d'app (mobile) : « Billets », « Où allez-vous ? ». */
export function GrandTitre({ children, className }: { children: ReactNode; className?: string }) {
  return <h1 className={cn("text-[28px] leading-[1.15] font-bold tracking-[-0.01em] md:text-h1", className)}>{children}</h1>
}
