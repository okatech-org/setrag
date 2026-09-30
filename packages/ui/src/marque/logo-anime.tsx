"use client"

import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"

import { Logo, type LogoVariante } from "./logo"

/**
 * Le logo animé (3,3 s) : la voie se pose, le ruban la parcourt, sort au pied
 * du S, se couche sous le nom ; chaque lettre se lève à son passage, puis la
 * signature apparaît.
 *
 * Il ne joue qu'aux grands moments — ouverture de la PWA, connexion — et une
 * seule fois. Le lecteur Lottie et l'animation sont chargés à la demande ; si
 * l'utilisateur demande moins d'animations, le logo fixe s'affiche d'emblée.
 */

const FICHIERS = {
  "complet-clair": () => import("./lottie/logo-anime.json"),
  "complet-sombre": () => import("./lottie/logo-anime-negatif.json"),
  "compact-clair": () => import("./lottie/logo-anime-compact.json"),
  "symbole-clair": () => import("./lottie/symbole-anime.json"),
} as const

export interface LogoAnimeProps {
  variante?: Extract<LogoVariante, "complet" | "compact" | "symbole">
  fond?: "clair" | "sombre"
  className?: string
  /** Appelé à la fin de l'animation (ou tout de suite sans animation). */
  onFin?: () => void
  /** Change cette clé pour rejouer l'animation. */
  rejouer?: number
  title?: string
}

export function LogoAnime({
  variante = "complet",
  fond = "clair",
  className,
  onFin,
  rejouer = 0,
  title = "SETRAG — Société d’Exploitation du Transgabonais",
}: LogoAnimeProps) {
  const conteneur = React.useRef<HTMLDivElement>(null)
  const [fixe, setFixe] = React.useState(false)
  const finRef = React.useRef(onFin)
  React.useEffect(() => {
    finRef.current = onFin
  })

  React.useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setFixe(true)
      finRef.current?.()
      return
    }
    let detruire: (() => void) | undefined
    let annule = false
    const cle = `${variante}-${variante === "complet" ? fond : "clair"}` as keyof typeof FICHIERS
    Promise.all([import("lottie-web/build/player/lottie_light"), (FICHIERS[cle] ?? FICHIERS["complet-clair"])()])
      .then(([{ default: lottie }, donnees]) => {
        if (annule || !conteneur.current) return
        conteneur.current.replaceChildren()
        const animation = lottie.loadAnimation({
          container: conteneur.current,
          renderer: "svg",
          loop: false,
          autoplay: true,
          animationData: "default" in donnees ? donnees.default : donnees,
          rendererSettings: { preserveAspectRatio: "xMidYMid meet" },
        })
        animation.addEventListener("complete", () => finRef.current?.())
        detruire = () => animation.destroy()
      })
      .catch(() => {
        // Sans le lecteur (hors réseau au premier chargement), le logo fixe suffit.
        if (!annule) setFixe(true)
      })
    return () => {
      annule = true
      detruire?.()
    }
  }, [variante, fond, rejouer])

  if (fixe) {
    return <Logo variante={variante} theme={fond === "sombre" ? "negatif" : "couleur"} title={title} className={cn("h-auto w-full", className)} />
  }
  return (
    <div
      ref={conteneur}
      role="img"
      aria-label={title}
      className={cn(
        "w-full",
        variante === "symbole" ? "aspect-[92/114]" : variante === "compact" ? "aspect-[254/111]" : "aspect-[254/126]",
        className
      )}
    />
  )
}
