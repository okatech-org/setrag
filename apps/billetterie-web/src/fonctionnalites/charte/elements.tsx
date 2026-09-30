import type { ReactNode } from "react"

import { cn } from "@workspace/ui/lib/utils"

/** Une section numérotée de la charte, ancrée pour le sommaire. */
export function Section({
  id,
  numero,
  titre,
  intro,
  children,
}: {
  id: string
  numero: string
  titre: string
  intro?: ReactNode
  children: ReactNode
}) {
  return (
    <section id={id} aria-labelledby={`${id}-titre`} className="scroll-mt-24 border-t border-line pt-10 pb-4 md:pt-14">
      <h2 id={`${id}-titre`} className="flex items-baseline gap-3 text-h3 md:text-h2">
        <span className="font-mono text-[14px] font-semibold text-ink-faint">{numero}</span>
        {titre}
      </h2>
      {intro && <p className="mt-3 max-w-[68ch] text-body-lg text-ink-muted max-md:text-body">{intro}</p>}
      <div className="mt-7 grid grid-cols-[minmax(0,1fr)] gap-8">{children}</div>
    </section>
  )
}

export function SousTitre({ children }: { children: ReactNode }) {
  return <h3 className="text-h4">{children}</h3>
}

/** Fond de présentation d'un élément de marque. */
export function Planche({
  fond = "blanc",
  etiquette,
  className,
  children,
}: {
  fond?: "blanc" | "creux" | "encre" | "bleu" | "photo"
  etiquette?: string
  className?: string
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        "relative grid min-h-[168px] place-items-center overflow-hidden rounded-md border p-6",
        fond === "blanc" && "border-line bg-[var(--c-surface)] [color-scheme:light]",
        fond === "creux" && "border-line bg-surface-sunk",
        fond === "encre" && "border-transparent bg-brand-encre text-ink-inverse",
        fond === "bleu" && "border-transparent bg-brand-bleu",
        fond === "photo" &&
          "border-transparent bg-[radial-gradient(circle_at_30%_20%,color-mix(in_oklch,var(--brand-vert)_45%,var(--brand-encre)),var(--brand-encre)_70%)]",
        className
      )}
    >
      {etiquette && (
        <span
          className={cn(
            "absolute top-3 left-3 text-caption",
            fond === "blanc" || fond === "creux" ? "text-ink-muted" : "text-white/75"
          )}
        >
          {etiquette}
        </span>
      )}
      {children}
    </div>
  )
}

/** Fiche de composant : le nom, le chemin d'import, les règles. */
export function Fiche({
  titre,
  chemin,
  nouveau,
  children,
  regles,
}: {
  titre: string
  chemin?: string
  nouveau?: boolean
  children?: ReactNode
  regles?: [string, ReactNode][]
}) {
  return (
    <div className="grid content-start gap-2">
      <h4 className="flex flex-wrap items-center gap-2 text-[16px] font-bold">
        {titre}
        {chemin && <code className="rounded-xs bg-surface-sunk px-1.5 py-0.5 font-mono text-[12px] font-medium text-ink-muted">{chemin}</code>}
        {nouveau && <span className="rounded-pill bg-accent-soft px-2 py-0.5 text-[11.5px] font-semibold text-accent-ink">nouveau</span>}
      </h4>
      {children && <p className="text-small text-ink-muted">{children}</p>}
      {regles && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[13px]">
          {regles.map(([terme, valeur]) => (
            <div key={terme} className="contents">
              <dt className="font-semibold text-ink-muted">{terme}</dt>
              <dd>{valeur}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}

/** Démonstration d'un composant : la scène à gauche (en haut sur mobile), la fiche à droite. */
export function Demo({ scene, fiche, sceneClassName }: { scene: ReactNode; fiche: ReactNode; sceneClassName?: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] overflow-hidden rounded-lg border border-line bg-surface lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
      <div className={cn("grid min-h-[180px] grid-cols-[minmax(0,1fr)] place-items-center gap-4 bg-canvas p-5 md:p-8", sceneClassName)}>{scene}</div>
      <div className="border-line p-5 max-lg:border-t lg:border-l md:p-6">{fiche}</div>
    </div>
  )
}

/** Oui / non : ce qu'on fait, ce qu'on ne fait pas. */
export function Regles({ oui, non }: { oui: { titre: string; items: ReactNode[] }; non: { titre: string; items: ReactNode[] } }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {[
        { ...oui, ton: "oui" as const },
        { ...non, ton: "non" as const },
      ].map((bloc) => (
        <div
          key={bloc.ton}
          className={cn(
            "rounded-md border-l-[3px] p-4",
            bloc.ton === "oui" ? "border-l-success bg-success-soft" : "border-l-danger bg-danger-soft"
          )}
        >
          <h4 className={cn("text-[15px] font-bold", bloc.ton === "oui" ? "text-success-ink" : "text-danger-ink")}>
            {bloc.ton === "oui" ? "✓ " : "✕ "}
            {bloc.titre}
          </h4>
          <ul className="mt-2 grid list-disc gap-1 pl-5 text-small">
            {bloc.items.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
