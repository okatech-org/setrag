"use client"

import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"

/**
 * Le ruban qui glisse vers l'élément choisi — onglets, jours, navigation.
 *
 * Le conteneur marque son élément courant par `data-actif="true"`. Le premier
 * placement (et chaque redimensionnement) est instantané : seul un changement
 * de choix fait glisser le ruban, en 480 ms, départ progressif et arrivée
 * douce — le geste d'un train.
 */

export interface PositionIndicateur {
  x: number
  w: number
}

/**
 * `axe="y"` mesure l'élément courant dans la hauteur (menu latéral) : `x` porte
 * alors le décalage vertical et `w` la hauteur.
 */
export function useIndicateur<T extends HTMLElement>(cle: unknown, axe: "x" | "y" = "x") {
  const ref = React.useRef<T>(null)
  const [position, setPosition] = React.useState<PositionIndicateur | null>(null)
  const [anime, setAnime] = React.useState(false)

  const mesurer = React.useCallback(() => {
    const actif = ref.current?.querySelector<HTMLElement>('[data-actif="true"]')
    // Un élément masqué (groupe replié, droit absent) n'a pas de boîte.
    if (!actif || !actif.offsetParent) return setPosition(null)
    setPosition(
      axe === "x" ? { x: actif.offsetLeft, w: actif.offsetWidth } : { x: actif.offsetTop, w: actif.offsetHeight }
    )
  }, [axe])

  React.useLayoutEffect(() => {
    mesurer()
  }, [cle, mesurer])

  // Le placement initial ne glisse pas : l'animation n'est armée qu'ensuite.
  React.useEffect(() => {
    if (!position || anime) return
    const frame = requestAnimationFrame(() => setAnime(true))
    return () => cancelAnimationFrame(frame)
  }, [position, anime])

  React.useEffect(() => {
    const conteneur = ref.current
    if (!conteneur) return
    const observateur = new ResizeObserver(() => {
      setAnime(false)
      mesurer()
    })
    observateur.observe(conteneur)
    return () => observateur.disconnect()
  }, [mesurer])

  return { ref, position, anime }
}

export interface IndicateurRubanProps {
  position: PositionIndicateur | null
  anime: boolean
  /** Retrait de part et d'autre (le ruban ne couvre que le libellé). */
  retrait?: number
  /** Largeur fixe, centrée sur l'élément (barre d'onglets mobile). */
  largeur?: number
  className?: string
}

export function IndicateurRuban({ position, anime, retrait = 0, largeur, className }: IndicateurRubanProps) {
  if (!position) return null
  const w = largeur ?? Math.max(position.w - 2 * retrait, 0)
  const x = largeur ? position.x + (position.w - largeur) / 2 : position.x + retrait
  return (
    <span
      aria-hidden
      className={cn(
        "bg-ruban pointer-events-none absolute left-0 h-[3px] rounded-[3px]",
        anime && "transition-[translate,width] duration-[var(--dur-glisse)] ease-[var(--ease-glisse)]",
        className
      )}
      style={{ width: w, translate: `${x}px 0` }}
    />
  )
}

export interface NavRubanProps extends React.ComponentProps<"nav"> {
  /** Clé de l'élément courant : sa modification fait glisser le ruban. */
  actif: unknown
  retrait?: number
  largeur?: number
  /** Le ruban sous les liens (web) ou au-dessus (barre d'onglets mobile). */
  cote?: "bas" | "haut"
  indicateurClassName?: string
}

/** Navigation dont l'élément courant porte le ruban. */
export function NavRuban({
  actif,
  retrait,
  largeur,
  cote = "bas",
  indicateurClassName,
  className,
  children,
  ...props
}: NavRubanProps) {
  const { ref, position, anime } = useIndicateur<HTMLElement>(actif)
  return (
    <nav ref={ref} className={cn("relative", className)} {...props}>
      {children}
      <IndicateurRuban
        position={position}
        anime={anime}
        retrait={retrait}
        largeur={largeur}
        className={cn(cote === "bas" ? "bottom-0" : "-top-px rounded-t-none", indicateurClassName)}
      />
    </nav>
  )
}

export interface NavRubanVerticalProps extends React.ComponentProps<"nav"> {
  /** Clé de l'élément courant : sa modification fait glisser le ruban. */
  actif: unknown
  /** Retrait en haut et en bas de l'élément courant. */
  retrait?: number
  indicateurClassName?: string
}

/**
 * Menu vertical dont l'entrée courante porte le ruban sur son bord gauche.
 * Même geste que les onglets : le ruban glisse d'une entrée à l'autre.
 */
export function NavRubanVertical({
  actif,
  retrait = 8,
  indicateurClassName,
  className,
  children,
  ...props
}: NavRubanVerticalProps) {
  const { ref, position, anime } = useIndicateur<HTMLElement>(actif, "y")
  return (
    <nav ref={ref} className={cn("relative", className)} {...props}>
      {children}
      {position ? (
        <span
          aria-hidden
          className={cn(
            "bg-ruban-v pointer-events-none absolute top-0 left-0 w-1 rounded-r-[3px]",
            anime && "transition-[translate,height] duration-[var(--dur-glisse)] ease-[var(--ease-glisse)]",
            indicateurClassName
          )}
          style={{ height: Math.max(position.w - 2 * retrait, 0), translate: `0 ${position.x + retrait}px` }}
        />
      ) : null}
    </nav>
  )
}
