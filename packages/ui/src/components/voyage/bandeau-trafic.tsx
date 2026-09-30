import * as React from "react"
import { TriangleAlertIcon, XIcon } from "lucide-react"

import { cn } from "@workspace/ui/lib/utils"

export interface BandeauTraficProps extends React.ComponentProps<"div"> {
  titre: React.ReactNode
  lien?: React.ReactNode
  /** Carte arrondie (dans un fil de contenu) plutôt que bandeau pleine largeur. */
  arrondi?: boolean
  onFermer?: () => void
}

/**
 * Information trafic — jaune sur bleu SETRAG, comme le bandeau du site
 * setrag.eramet.com (5,9:1). Le message dit ce qui change et ce qui reste
 * acquis : « départs retardés de 25 min. Vos places sont conservées. »
 */
export function BandeauTrafic({ titre, lien, arrondi, onFermer, className, children, ...props }: BandeauTraficProps) {
  return (
    <div
      role="status"
      className={cn(
        "flex items-center gap-3 bg-brand-bleu px-4 py-3 text-[14px] leading-snug font-medium text-brand-jaune",
        arrondi && "items-start rounded-md",
        className
      )}
      {...props}
    >
      <TriangleAlertIcon className={cn("size-[18px] shrink-0", arrondi && "mt-0.5")} aria-hidden />
      <p className="min-w-0 flex-1">
        <b className="font-bold">{titre}</b> {children}
      </p>
      {lien && <span className="shrink-0 font-semibold text-white underline-offset-[3px] [&_a]:underline">{lien}</span>}
      {onFermer && (
        <button type="button" onClick={onFermer} aria-label="Masquer l'information" className="-my-2 grid size-11 shrink-0 place-items-center rounded-pill text-white/80 hover:bg-white/10">
          <XIcon className="size-4" />
        </button>
      )}
    </div>
  )
}
