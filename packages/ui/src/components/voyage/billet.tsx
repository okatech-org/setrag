"use client"

import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"

import { Logo } from "../../marque/logo"
import { CodeAztec } from "../code-aztec"
import { Voie } from "../voie"

export type BilletEtat = "valide" | "retard" | "utilise" | "annule" | "expire"

export interface BilletProps extends React.ComponentProps<"article"> {
  depart: { heure: string; gare: string }
  arrivee: { heure: string; gare: string }
  /** Au milieu de la voie du trajet : durée ou date. */
  milieu?: string
  train: string
  /** Pastille d'état, déjà rendue (valide, +12 min, utilisé…). */
  statut?: React.ReactNode
  etat?: BilletEtat
  /** Cases du bas : voiture, place, quai, classe. */
  cases?: { libelle: string; valeur: string }[]
  /** Charge signée du code Aztec ; absente sur le récapitulatif. */
  code?: string
  /** Sous le code : référence, rang du billet. */
  legendeCode?: string
  pied?: React.ReactNode
  /**
   * Le ruban traverse la ligne de découpe une fois (720 ms) : à l'émission,
   * sur la confirmation. Sans animation, la découpe est une voie vide.
   */
  emis?: boolean
  /** Couleur du fond autour du billet : les encoches de la découpe la prennent. */
  fondDecoupe?: string
}

/**
 * Le billet : un objet, sur fond encre, dans les deux thèmes. La voie
 * remplace les pointillés de découpe ; le code Aztec se lit hors réseau.
 */
export function Billet({
  depart,
  arrivee,
  milieu,
  train,
  statut,
  etat = "valide",
  cases,
  code,
  legendeCode,
  pied,
  emis,
  fondDecoupe = "var(--c-canvas)",
  className,
  style,
  ...props
}: BilletProps) {
  const [rempli, setRempli] = React.useState(0)
  React.useEffect(() => {
    if (!emis) return
    const frame = requestAnimationFrame(() => setRempli(1))
    return () => cancelAnimationFrame(frame)
  }, [emis])

  const eteint = etat === "utilise" || etat === "annule" || etat === "expire"

  return (
    <article
      data-etat={etat}
      className={cn("rounded-lg shadow-md", className)}
      // Le fond des encoches se résout ici, dans le thème de la page, avant
      // que l'intérieur ne passe en sombre.
      style={{ ...style, "--fond-decoupe": fondDecoupe } as React.CSSProperties}
      {...props}
    >
      {/* Fond encre : les pastilles y prennent les teintes du thème sombre. */}
      <div
        data-theme="dark"
        className="grid gap-3 rounded-lg bg-brand-encre px-5 py-4 text-[oklch(0.97_0.006_257)]"
      >
        <header className="flex items-center gap-3 text-[13px] font-semibold text-[oklch(0.76_0.016_257)]">
          <Logo
            variante="compact"
            theme="negatif"
            title=""
            className="h-[26px]"
          />
          <span className="min-w-0 truncate">{train}</span>
          {statut && <span className="ml-auto">{statut}</span>}
        </header>

        <div
          className={cn(
            "grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 transition-opacity",
            eteint && "opacity-45"
          )}
        >
          <div>
            <b className="block font-mono text-[26px] leading-none font-semibold tabular-nums">
              {depart.heure}
            </b>
            <span className="mt-1.5 block text-[13px] font-medium text-[oklch(0.76_0.016_257)]">
              {depart.gare}
            </span>
          </div>
          <div className="grid justify-items-center gap-1 font-mono text-[11.5px] text-[oklch(0.76_0.016_257)]">
            {milieu}
            <Voie etat="pleine" fond="encre" className="w-full" />
          </div>
          <div className="text-right">
            <b className="block font-mono text-[26px] leading-none font-semibold tabular-nums">
              {arrivee.heure}
            </b>
            <span className="mt-1.5 block text-[13px] font-medium text-[oklch(0.76_0.016_257)]">
              {arrivee.gare}
            </span>
          </div>
        </div>

        {/* La découpe : une voie, que le ruban traverse à l'émission. */}
        <div className="relative -mx-5 px-4" aria-hidden>
          <span
            className="absolute top-1/2 -left-2.5 size-5 -translate-y-1/2 rounded-pill"
            style={{ background: "var(--fond-decoupe)" }}
          />
          <span
            className="absolute top-1/2 -right-2.5 size-5 -translate-y-1/2 rounded-pill"
            style={{ background: "var(--fond-decoupe)" }}
          />
          <Voie
            fond="encre"
            rempli={emis ? rempli : 0}
            className="w-full [&_.voie-ruban]:duration-[720ms]"
          />
        </div>

        {cases && cases.length > 0 && (
          <dl
            className="grid gap-2"
            style={{
              gridTemplateColumns: `repeat(${cases.length}, minmax(0, 1fr))`,
            }}
          >
            {cases.map((c) => (
              <div key={c.libelle} className="min-w-0">
                <dt className="text-[11px] font-medium text-[oklch(0.76_0.016_257)]">
                  {c.libelle}
                </dt>
                <dd className="truncate font-mono text-[18px] font-semibold">
                  {c.valeur}
                </dd>
              </div>
            ))}
          </dl>
        )}

        {code && (
          <div
            className={cn(
              "grid justify-items-center gap-1.5 rounded-md bg-white p-3 text-brand-encre",
              eteint && "opacity-45"
            )}
          >
            <CodeAztec valeur={code} className="w-[min(196px,60vw)]" />
            {legendeCode && (
              <small className="font-mono text-[11.5px] tracking-[0.08em] text-[oklch(0.5_0.02_257)]">
                {legendeCode}
              </small>
            )}
          </div>
        )}

        {pied && (
          <footer className="flex justify-between gap-3 text-[12px] font-medium text-[oklch(0.76_0.016_257)]">
            {pied}
          </footer>
        )}
      </div>
    </article>
  )
}
