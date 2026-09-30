import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"

import { DEGRADES, S } from "./traces"

/**
 * Le signe de Ruban, l'assistant SETRAG : le ruban lui-même, posé en S, sans
 * les rails. SETRAG pose la voie, Ruban roule dessus.
 *
 * États :
 * - `repos` — rien ne bouge (bouton flottant, avatar) ;
 * - `reflexion` — une rame parcourt le S (réponse qui tarde plus de 400 ms) ;
 * - `ecoute` / `parole` — l'épaisseur suit la voix : passer `niveau` (0 → 1),
 *   lissé côté appelant ;
 * - `hors-ligne` — le ruban devient gris.
 */

export type SigneEtat = "repos" | "reflexion" | "ecoute" | "parole" | "hors-ligne"

export interface SigneRubanProps extends Omit<React.ComponentProps<"svg">, "children"> {
  etat?: SigneEtat
  /** `sombre` éclaircit la tête du ruban pour un fond encre. */
  fond?: "clair" | "sombre"
  /** Niveau de la voix (0 → 1) en écoute et en parole. */
  niveau?: number
  /** Le ruban se trace une fois (première ouverture de la session). */
  trace?: boolean
  title?: string
}

export function SigneRuban({
  etat = "repos",
  fond = "clair",
  niveau,
  trace,
  title,
  className,
  style,
  ...props
}: SigneRubanProps) {
  // Les identifiants de React contiennent des caractères refusés dans url(#…).
  const id = `st${React.useId().replace(/[^a-zA-Z0-9_-]/g, "")}`
  const etapes = fond === "sombre" ? DEGRADES.sombre : DEGRADES.clair
  const voix = etat === "ecoute" || etat === "parole"
  const epaisseur = voix && niveau !== undefined ? 13 + Math.min(Math.max(niveau, 0), 1) * 7 : undefined

  return (
    <svg
      viewBox="8 -6 84 112"
      data-etat={etat}
      data-trace={trace || undefined}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className={cn("signe h-8 w-auto", className)}
      style={epaisseur ? ({ ...style, "--w": epaisseur } as React.CSSProperties) : style}
      {...props}
    >
      <defs>
        {/* Le S descend de façon continue : un dégradé vertical suit le ruban. */}
        <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={0} y1={4} x2={0} y2={97}>
          {etapes.map(([offset, couleur]) => (
            <stop key={offset} offset={offset} stopColor={couleur} />
          ))}
        </linearGradient>
      </defs>
      <path className="sg-piste" d={S} pathLength={1} />
      <path className="sg-ruban" d={S} pathLength={1} stroke={`url(#${id})`} />
    </svg>
  )
}
