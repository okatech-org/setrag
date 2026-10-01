"use client"

import { useCallback, useEffect, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"

import { CodeAztec } from "@workspace/ui/components/code-aztec"
import { cn } from "@workspace/ui/lib/utils"
import { Logo } from "@workspace/ui/marque"

/**
 * Impression au guichet — billets et étiquettes sur l'imprimante thermique
 * (80 mm), état de caisse en A4.
 *
 * Le document à imprimer est rendu hors de l'arbre de la page, directement
 * sous `<body>` ; la feuille de style d'impression masque tout le reste. Le
 * navigateur envoie ainsi à l'imprimante le titre seul, à sa largeur réelle.
 */

type Format = "ticket" | "a4"

const STYLES: Record<Format, string> = {
  ticket: `
    @media print {
      @page { size: 80mm auto; margin: 0; }
      body > *:not(.zone-impression) { display: none !important; }
      .zone-impression { display: block !important; width: 80mm; }
      .zone-impression .ticket-thermique { box-shadow: none !important; width: 80mm !important; break-after: page; }
      .zone-impression .ticket-thermique:last-child { break-after: auto; }
    }`,
  a4: `
    @media print {
      @page { size: A4; margin: 14mm; }
      body > *:not(.zone-impression) { display: none !important; }
      .zone-impression { display: block !important; }
    }`,
}

/**
 * Imprime un contenu : il est monté hors écran, la boîte d'impression
 * s'ouvre, puis il est retiré.
 */
export function useImpression() {
  const [travail, setTravail] = useState<{ contenu: ReactNode; format: Format; cle: number } | null>(null)

  useEffect(() => {
    if (!travail) return
    // Laisse le navigateur peindre le document (et le code Aztec, chargé à
    // la demande) avant d'ouvrir la boîte d'impression.
    const minuterie = window.setTimeout(() => window.print(), 400)
    const fin = () => setTravail(null)
    window.addEventListener("afterprint", fin)
    return () => {
      window.clearTimeout(minuterie)
      window.removeEventListener("afterprint", fin)
    }
  }, [travail])

  const imprimer = useCallback((contenu: ReactNode, format: Format = "ticket") => {
    setTravail({ contenu, format, cle: Date.now() })
  }, [])

  const zone =
    travail && typeof document !== "undefined"
      ? createPortal(
          <div className="zone-impression hidden bg-surface text-ink" data-theme="light" key={travail.cle}>
            <style>{STYLES[travail.format]}</style>
            {travail.contenu}
          </div>,
          document.body
        )
      : null

  return { imprimer, zone, enCours: travail !== null }
}

/* ═══════════════════════════ Ticket 80 mm ═════════════════════════════════ */

/** Ligne du ticket : deux valeurs aux extrémités. */
export function LigneTicket({ gauche, droite, gras }: { gauche: ReactNode; droite?: ReactNode; gras?: boolean }) {
  return (
    <div className={cn("flex justify-between gap-2", gras && "font-semibold")}>
      <span className="min-w-0">{gauche}</span>
      {droite !== undefined ? <span className="shrink-0 text-right">{droite}</span> : null}
    </div>
  )
}

export function FiletTicket() {
  return <hr className="m-0 border-0 border-t border-dashed border-line-strong" />
}

/**
 * Papier thermique de 80 mm : police mono, noir sur blanc, bords déchirés.
 * Sert à l'aperçu à l'écran et, tel quel, à l'impression.
 */
export function TicketThermique({
  children,
  duplicata,
  className,
  imprime,
}: {
  children: ReactNode
  /** Mention imprimée en clair : « DUPLICATA N°2 ». */
  duplicata?: string | null
  className?: string
  /** Le papier sort de l'imprimante (animation d'entrée, une fois). */
  imprime?: boolean
}) {
  return (
    <div
      data-theme="light"
      className={cn(
        "ticket-thermique relative grid w-[302px] max-w-full gap-2.5 justify-self-center rounded-[4px] bg-surface px-[18px] pt-[18px] pb-[14px] font-mono text-[12.5px] leading-[1.45] text-ink shadow-[var(--sh-md)]",
        imprime && "motion-safe:animate-[st-monte_600ms_var(--ease-glisse)_both]",
        className
      )}
    >
      <Logo variante="compact" theme="mono-encre" title="SETRAG" className="mx-auto h-[30px] w-auto" />
      {duplicata ? (
        <span className="justify-self-center border-2 border-ink px-2.5 py-0.5 text-[14px] font-bold tracking-[0.2em]">{duplicata}</span>
      ) : null}
      {children}
    </div>
  )
}

/** Code Aztec du titre, au centre du ticket. */
export function CodeTicket({ valeur, legende = "Code du titre" }: { valeur: string; legende?: string }) {
  return <CodeAztec valeur={valeur} label={legende} className="w-[132px] justify-self-center text-ink" />
}
