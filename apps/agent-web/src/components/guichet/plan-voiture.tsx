"use client"

import { ArrowLeft, ArrowRight, Lock } from "lucide-react"
import { Fragment, type CSSProperties } from "react"

import { cn } from "@workspace/ui/lib/utils"

import { libelleClasse, type Classe } from "@/lib/agent-data"

import type { Siege } from "./donnees"

/**
 * Plan de voiture intégré au tunnel. Chaque état se lit sans la couleur :
 * vendue — hachures et numéro barré ; bloquée — cadenas et bord en tirets ;
 * choisie — rang du voyageur écrit dans la place.
 */

export interface Voiture {
  id: string
  libelle: string
  position: number
  classe: Classe
  rangs: number
  colonnes: number
  libres: number
}

/** Voitures du train, dans l'ordre de la composition, avec leurs places libres. */
export function voituresDepuis(sieges: readonly Siege[], nosPlaces: ReadonlySet<string>): Voiture[] {
  const parVoiture = new Map<string, Voiture>()
  for (const siege of sieges) {
    const voiture = parVoiture.get(siege.coachId) ?? {
      id: siege.coachId,
      libelle: siege.coachLabel,
      position: siege.coachPosition,
      classe: siege.serviceClass,
      rangs: siege.coachRowCount,
      colonnes: siege.coachColumnCount,
      libres: 0,
    }
    if (siege.isFree || nosPlaces.has(siege.seatId)) voiture.libres += 1
    parVoiture.set(siege.coachId, voiture)
  }
  return [...parVoiture.values()].sort((a, b) => a.position - b.position)
}

/** Numéro de voiture lisible : « V4 » → « Voiture 4 ». */
export function nomVoiture(libelle: string) {
  const numero = /^V(\d+)$/i.exec(libelle)?.[1]
  return numero ? `Voiture ${numero}` : libelle
}

export function ChoixVoiture({
  voitures,
  classe,
  active,
  onChoisir,
}: {
  voitures: readonly Voiture[]
  classe: Classe
  active: string | null
  onChoisir: (id: string) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Voitures du train">
      {voitures.map((voiture) => {
        const autreClasse = voiture.classe !== classe
        const complete = voiture.libres === 0
        return (
          <button
            key={voiture.id}
            type="button"
            aria-pressed={voiture.id === active}
            disabled={autreClasse || complete}
            onClick={() => onChoisir(voiture.id)}
            className={cn(
              "grid min-h-[52px] gap-px rounded-sm border px-3.5 py-1.5 text-left text-[14px] font-bold transition-colors",
              voiture.id === active
                ? "border-accent-base bg-accent-soft shadow-[inset_0_0_0_1px_var(--c-accent)]"
                : "border-line-strong bg-surface hover:bg-surface-sunk",
              "disabled:cursor-not-allowed disabled:opacity-55"
            )}
          >
            {nomVoiture(voiture.libelle)}
            <small className="text-[11.5px] font-medium text-ink-muted">
              {autreClasse ? libelleClasse(voiture.classe) : complete ? "Complète" : `${voiture.libres} libre${voiture.libres > 1 ? "s" : ""}`}
            </small>
          </button>
        )
      })}
    </div>
  )
}

export function PlanVoiture({
  sieges,
  choisies,
  nosPlaces,
  onPlace,
  libelleVoiture,
}: {
  /** Places de la voiture affichée. */
  sieges: readonly Siege[]
  /** Place → rang du voyageur (1, 2…). */
  choisies: ReadonlyMap<string, number>
  /** Places tenues par cette vente : libres pour elle. */
  nosPlaces: ReadonlySet<string>
  onPlace: (siege: Siege) => void
  libelleVoiture: string
}) {
  if (sieges.length === 0) return null
  const colonnes = sieges[0]!.coachColumnCount
  const rangs = sieges[0]!.coachRowCount
  const avantAllee = Math.ceil(colonnes / 2)
  const parCase = new Map(sieges.map((s) => [`${s.row}:${s.column}`, s]))
  // Lignes de la grille : les colonnes de sièges, l'allée au milieu.
  const lignes = [...Array.from({ length: avantAllee }, () => "44px"), "26px", ...Array.from({ length: colonnes - avantAllee }, () => "44px")]

  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-1.5 text-[11.5px] font-semibold tracking-[0.06em] text-ink-faint uppercase">
        <ArrowLeft aria-hidden className="size-3.5" />
        Vers la locomotive
        <span className="ml-auto">Queue du train</span>
        <ArrowRight aria-hidden className="size-3.5" />
      </div>
      <div className="relative overflow-x-auto rounded-[36px/44px] border-2 border-line-strong bg-surface-sunk px-6 py-5">
        <div
          role="group"
          aria-label={`Plan de la ${libelleVoiture}`}
          className="mx-auto grid w-max grid-flow-col gap-1.5"
          style={{ gridTemplateRows: lignes.join(" "), gridTemplateColumns: `repeat(${rangs}, 44px)` }}
        >
          {Array.from({ length: rangs }, (_, index) => {
            const rang = index + 1
            return (
              <Fragment key={rang}>
                {Array.from({ length: colonnes + 1 }, (_, position) => {
                  if (position === avantAllee) {
                    return (
                      <span key="allee" aria-hidden className="tabular grid place-items-center text-[10.5px] text-ink-faint" style={{ gridColumn: rang, gridRow: position + 1 }}>
                        {rang}
                      </span>
                    )
                  }
                  const colonne = position < avantAllee ? position + 1 : position
                  const siege = parCase.get(`${rang}:${colonne}`)
                  const style = { gridColumn: rang, gridRow: position + 1 }
                  if (!siege) return <span key={`vide-${colonne}`} aria-hidden style={style} />
                  return <Place key={siege.seatId} siege={siege} rangVoyageur={choisies.get(siege.seatId)} nous={nosPlaces.has(siege.seatId)} onPlace={onPlace} style={style} />
                })}
              </Fragment>
            )
          })}
        </div>
      </div>
      <Legende />
    </div>
  )
}

function Place({
  siege,
  rangVoyageur,
  nous,
  onPlace,
  style,
}: {
  siege: Siege
  rangVoyageur: number | undefined
  nous: boolean
  onPlace: (siege: Siege) => void
  style: CSSProperties
}) {
  const base = "grid size-11 place-items-center rounded-[10px_10px_8px_8px] border-[1.5px] p-0 text-[12px] font-semibold transition-[background-color,border-color,transform] duration-[var(--dur-fast)]"
  if (rangVoyageur !== undefined) {
    return (
      <button
        type="button"
        style={style}
        aria-label={`Place ${siege.label}, voyageur ${rangVoyageur}`}
        aria-pressed
        onClick={() => onPlace(siege)}
        className={cn(base, "border-accent-base bg-accent-base font-bold text-ink-inverse active:scale-95")}
      >
        {rangVoyageur}
      </button>
    )
  }
  if (siege.isBlocked && !nous) {
    return (
      <button
        type="button"
        style={style}
        disabled
        aria-label={`Place ${siege.label}, bloquée par la gestion`}
        title="Bloquée par la gestion"
        className={cn(base, "cursor-not-allowed border-dashed border-warning-ink bg-warning-soft text-warning-ink")}
      >
        <Lock aria-hidden className="size-4" />
      </button>
    )
  }
  if (siege.isOccupied && !nous) {
    return (
      <button
        type="button"
        style={style}
        disabled
        aria-label={`Place ${siege.label}, vendue`}
        className={cn(
          base,
          "tabular cursor-not-allowed border-line bg-[repeating-linear-gradient(135deg,var(--c-surface-sunk)_0_4px,var(--c-line)_4px_6px)] text-ink-faint line-through"
        )}
      >
        {siege.label}
      </button>
    )
  }
  return (
    <button
      type="button"
      style={style}
      aria-label={`Place ${siege.label}, libre`}
      aria-pressed={false}
      onClick={() => onPlace(siege)}
      className={cn(base, "tabular border-line-strong bg-surface text-ink-muted hover:border-accent-base hover:text-accent-ink active:scale-95")}
    >
      {siege.label}
    </button>
  )
}

function Legende() {
  const petite = "grid size-6 place-items-center rounded-[6px_6px_5px_5px] border-[1.5px] text-[10px] font-semibold"
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-2 text-[13px] text-ink-muted" aria-label="Légende du plan">
      <li className="inline-flex items-center gap-2">
        <span aria-hidden className={cn(petite, "border-line-strong bg-surface")} />
        Libre
      </li>
      <li className="inline-flex items-center gap-2">
        <span aria-hidden className={cn(petite, "border-accent-base bg-accent-base text-ink-inverse")}>1</span>
        Choisie, avec le rang du voyageur
      </li>
      <li className="inline-flex items-center gap-2">
        <span
          aria-hidden
          className={cn(petite, "tabular border-line bg-[repeating-linear-gradient(135deg,var(--c-surface-sunk)_0_4px,var(--c-line)_4px_6px)] text-ink-faint line-through")}
        >
          7
        </span>
        Vendue
      </li>
      <li className="inline-flex items-center gap-2">
        <span aria-hidden className={cn(petite, "border-dashed border-warning-ink bg-warning-soft text-warning-ink")}>
          <Lock className="size-3" />
        </span>
        Bloquée par la gestion
      </li>
    </ul>
  )
}

/**
 * Places côte à côte pour tout le groupe : d'abord un même rang, puis des
 * rangs qui se suivent dans une même voiture, sinon les premières libres.
 */
export function placerCoteACote(sieges: readonly Siege[], nombre: number, classe: Classe, nosPlaces: ReadonlySet<string>, voiturePreferee?: string | null) {
  const libres = sieges.filter((s) => s.serviceClass === classe && (s.isFree || nosPlaces.has(s.seatId)))
  const voitures = [...new Set(libres.map((s) => s.coachId))].sort((a, b) => (a === voiturePreferee ? -1 : b === voiturePreferee ? 1 : 0))
  for (const voiture of voitures) {
    const parRang = new Map<number, Siege[]>()
    for (const siege of libres.filter((s) => s.coachId === voiture)) {
      parRang.set(siege.row, [...(parRang.get(siege.row) ?? []), siege])
    }
    const rangs = [...parRang.keys()].sort((a, b) => a - b)
    const unRang = rangs.find((r) => (parRang.get(r)?.length ?? 0) >= nombre)
    if (unRang !== undefined) {
      return parRang.get(unRang)!.sort((a, b) => a.column - b.column).slice(0, nombre)
    }
    for (let depart = 0; depart < rangs.length; depart += 1) {
      const suite: Siege[] = []
      for (let i = depart; i < rangs.length && suite.length < nombre; i += 1) {
        if (i > depart && rangs[i]! - rangs[i - 1]! > 1) break
        suite.push(...parRang.get(rangs[i]!)!.sort((a, b) => a.column - b.column))
      }
      if (suite.length >= nombre) return suite.slice(0, nombre)
    }
  }
  return libres.slice(0, nombre)
}
