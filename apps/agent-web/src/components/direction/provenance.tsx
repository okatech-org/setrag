import { Tag, type TagProps } from "@workspace/ui/components/tag"
import { cn } from "@workspace/ui/lib/utils"

import type { ExecutiveSourceState } from "./executive-dto"

/** Six états, un mot chacun : la teinte ne fait que renforcer le libellé. */
export const PROVENANCE_LABELS: Readonly<Record<ExecutiveSourceState, string>> =
  {
    loading: "Chargement",
    operational: "Opérationnel",
    synthetic_demo: "Synthétique · non officiel",
    empty: "Aucune donnée",
    unavailable: "Non accessible",
    not_connected: "Non raccordé",
  }

export const PROVENANCE_DESCRIPTIONS: Readonly<
  Record<ExecutiveSourceState, string>
> = {
  loading: "Lecture de la source en cours.",
  operational: "Données issues de l’exploitation, horodatées.",
  synthetic_demo:
    "Scénario synthétique de démonstration, sans valeur opérationnelle.",
  empty: "Source accessible, mais rien d’enregistré sur la période.",
  unavailable: "Votre habilitation ne couvre pas cette source.",
  not_connected: "Aucune source n’alimente encore ce domaine dans le système.",
}

const PROVENANCE_TONES: Readonly<
  Record<ExecutiveSourceState, NonNullable<TagProps["tone"]>>
> = {
  loading: "neutral",
  operational: "success",
  synthetic_demo: "warning",
  empty: "neutral",
  unavailable: "neutral",
  not_connected: "second",
}

const PROVENANCE_INK: Readonly<Record<ExecutiveSourceState, string>> = {
  loading: "text-ink-muted",
  operational: "text-success-ink",
  synthetic_demo: "text-warning-ink",
  empty: "text-ink-muted",
  unavailable: "text-ink-muted",
  not_connected: "text-second-ink",
}

/** Mention compacte (téléphone) : le mot de l'état, dans l'encre de son ton. */
export function ProvenanceMention({
  state,
  className,
}: {
  state: ExecutiveSourceState
  className?: string
}) {
  return (
    <span
      title={PROVENANCE_DESCRIPTIONS[state]}
      className={cn(
        "text-caption font-semibold whitespace-nowrap",
        PROVENANCE_INK[state],
        className
      )}
    >
      {PROVENANCE_LABELS[state]}
    </span>
  )
}

export function provenanceLabel(state: ExecutiveSourceState) {
  return PROVENANCE_LABELS[state]
}

export function provenanceDescription(state: ExecutiveSourceState) {
  return PROVENANCE_DESCRIPTIONS[state]
}

export function ProvenanceTag({
  state,
  className,
}: {
  state: ExecutiveSourceState
  className?: string
}) {
  return (
    <Tag
      tone={PROVENANCE_TONES[state]}
      title={PROVENANCE_DESCRIPTIONS[state]}
      aria-busy={state === "loading" || undefined}
      className={cn("shrink-0", className)}
    >
      {PROVENANCE_LABELS[state]}
    </Tag>
  )
}

/** « Sources : 3 opérationnelles · 2 en démonstration · 1 vide · 4 non raccordées » */
export function summarizeProvenance(
  states: readonly ExecutiveSourceState[]
): string {
  const count = (state: ExecutiveSourceState) =>
    states.filter((candidate) => candidate === state).length
  const parts = [
    [count("operational"), "opérationnelle", "opérationnelles"],
    [count("synthetic_demo"), "en démonstration", "en démonstration"],
    [count("empty"), "vide", "vides"],
    [count("unavailable"), "non accessible", "non accessibles"],
    [count("not_connected"), "non raccordée", "non raccordées"],
    [count("loading"), "en cours de lecture", "en cours de lecture"],
  ] as const

  const described = parts
    .filter(([total]) => total > 0)
    .map(
      ([total, singular, plural]) =>
        `${total} ${total === 1 ? singular : plural}`
    )

  return described.length > 0
    ? `Sources : ${described.join(" · ")}`
    : "Sources : aucune source lue"
}

export function ProvenanceSummary({
  states,
  className,
}: {
  states: readonly ExecutiveSourceState[]
  className?: string
}) {
  return (
    <p className={cn("text-small text-ink-muted", className)}>
      {summarizeProvenance(states)}. Les valeurs synthétiques ou absentes sont
      signalées et ne sont jamais agrégées aux performances opérationnelles.
    </p>
  )
}
