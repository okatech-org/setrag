"use client"

import { useEffect, useRef } from "react"

import { cn } from "@workspace/ui/lib/utils"

import { heure } from "@/lib/format"

/**
 * Zone de signature du contrevenant : on signe du doigt, dans un cadre en
 * tirets. Le tracé est rendu en image (PNG) une fois le doigt levé.
 *
 * Signer est un geste explicite, pas un geste caché : la zone est annoncée
 * par son libellé, et le refus de signer a son propre bouton.
 */
export function ZoneSignature({
  signeeA,
  onSigner,
  inactive,
}: {
  /** Heure de la signature, affichée sous le tracé. */
  signeeA?: number
  onSigner: (image: string) => void
  inactive?: boolean
}) {
  const toile = useRef<HTMLCanvasElement | null>(null)
  const trace = useRef(false)
  const dernier = useRef<{ x: number; y: number } | null>(null)

  // La toile suit la taille de son cadre, en pixels réels de l'écran.
  useEffect(() => {
    const t = toile.current
    if (!t) return
    const ratio = window.devicePixelRatio || 1
    const { width, height } = t.getBoundingClientRect()
    t.width = Math.round(width * ratio)
    t.height = Math.round(height * ratio)
    const contexte = t.getContext("2d")
    contexte?.scale(ratio, ratio)
  }, [])

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const cadre = event.currentTarget.getBoundingClientRect()
    return { x: event.clientX - cadre.left, y: event.clientY - cadre.top }
  }

  function dessiner(event: React.PointerEvent<HTMLCanvasElement>) {
    const t = toile.current
    const contexte = t?.getContext("2d")
    if (!t || !contexte || !dernier.current) return
    const ici = point(event)
    // La couleur de l'encre du thème : le tracé se lit en clair comme en sombre.
    contexte.strokeStyle = getComputedStyle(t).color
    contexte.lineWidth = 2.6
    contexte.lineCap = "round"
    contexte.lineJoin = "round"
    contexte.beginPath()
    contexte.moveTo(dernier.current.x, dernier.current.y)
    contexte.lineTo(ici.x, ici.y)
    contexte.stroke()
    dernier.current = ici
    trace.current = true
  }

  return (
    <div
      className={cn(
        "relative h-24 overflow-hidden rounded-md border-[1.5px] border-dashed border-line-strong bg-surface text-ink",
        inactive && "opacity-45"
      )}
    >
      <canvas
        ref={toile}
        aria-label="Zone de signature du contrevenant"
        role="img"
        className="absolute inset-0 size-full touch-none"
        onPointerDown={(event) => {
          if (inactive) return
          event.currentTarget.setPointerCapture(event.pointerId)
          dernier.current = point(event)
        }}
        onPointerMove={(event) => {
          if (dernier.current) dessiner(event)
        }}
        onPointerUp={() => {
          dernier.current = null
          if (trace.current && toile.current) onSigner(toile.current.toDataURL("image/png"))
        }}
      />
      <small className="pointer-events-none absolute bottom-1.5 left-3 text-[11px] font-medium text-ink-muted">
        {signeeA ? (
          <>
            Signé à <span className="tabular">{heure(signeeA)}</span>
          </>
        ) : (
          "Signez ici, du doigt"
        )}
      </small>
    </div>
  )
}
