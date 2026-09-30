import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"

/**
 * La voie : deux rails et des traverses, en gris de ligne. Elle relie deux
 * informations — un départ et une arrivée, deux moitiés de billet.
 *
 * Le ruban y glisse pour un état précis :
 * - `vide` — rien ;
 * - `pleine` — le trajet est choisi (le ruban remplit la voie en 480 ms) ;
 * - `attente` — une rame passe, sans fin, tant que dure une attente réelle.
 *
 * `rempli` (0 → 1) remplit partiellement la voie : progression mesurée.
 */
export interface VoieProps extends React.ComponentProps<"span"> {
  etat?: "vide" | "pleine" | "attente"
  rempli?: number
  /** Couleurs des rails selon le fond : clair (défaut), billet encre, bleu. */
  fond?: "clair" | "encre" | "bleu"
}

export function Voie({ etat = "vide", rempli, fond = "clair", className, style, ...props }: VoieProps) {
  return (
    <span
      aria-hidden
      data-etat={etat}
      data-fond={fond === "clair" ? undefined : fond}
      className={cn("voie flex-1", className)}
      style={rempli !== undefined ? ({ ...style, "--p": rempli } as React.CSSProperties) : style}
      {...props}
    >
      <span className="voie-ruban" />
    </span>
  )
}

/**
 * Attente longue (plus d'une seconde) : une rame passe sur la voie, et une
 * phrase dit ce qu'on attend. Sous une seconde, on préfère des squelettes.
 */
export function Chargeur({ children, className, fond }: { children: React.ReactNode; className?: string; fond?: VoieProps["fond"] }) {
  return (
    <div role="status" className={cn("grid justify-items-center gap-2 text-center", className)}>
      <Voie etat="attente" fond={fond} className="w-full max-w-[240px] flex-none" />
      <p className="text-small text-ink-muted">{children}</p>
    </div>
  )
}
