"use client"

import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"

/**
 * Code Aztec du billet — la charge signée (`SETRAG1:…`) que lit le contrôleur,
 * hors réseau. Même encodeur que le PDF du backend (bwip-js), chargé à la
 * demande : il pèse lourd et ne sert que sur l'écran du billet.
 */
export function CodeAztec({ valeur, className, label = "Code du billet" }: { valeur: string; className?: string; label?: string }) {
  const [svg, setSvg] = React.useState<string>()

  React.useEffect(() => {
    let annule = false
    import("bwip-js/browser")
      .then(({ toSVG }) => {
        if (annule) return
        const brut = toSVG({ bcid: "azteccode", text: valeur, scale: 1 })
        // Le symbole occupe tout son cadre, quelle que soit la taille affichée.
        setSvg(brut.replace(/\swidth="[^"]*"/, ' width="100%"').replace(/\sheight="[^"]*"/, ' height="100%"'))
      })
      .catch(() => {
        if (!annule) setSvg(undefined)
      })
    return () => {
      annule = true
    }
  }, [valeur])

  return (
    <div role="img" aria-label={label} className={cn("aspect-square w-[150px] text-brand-encre", className)}>
      {svg ? (
        <div className="size-full [&_svg]:block [&_svg]:size-full" dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <div className="size-full animate-pulse rounded-sm bg-surface-sunk" />
      )}
    </div>
  )
}
