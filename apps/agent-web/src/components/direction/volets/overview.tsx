import type { Route } from "next"
import Link from "next/link"

import { SegmentedControl } from "@workspace/ui/components/segmented-control"
import { Tag } from "@workspace/ui/components/tag"

import { BarSeries } from "../charts"
import { DailyBrief } from "../daily-brief"
import { directionsSummaryLabel } from "../direction-map"
import {
  deriveExecutiveArbitrations,
  pluralize,
  type ExecutiveArbitration,
  type ExecutiveOverviewDto,
} from "../executive-dto"
import { EXECUTIVE_VOLETS, executiveVoletEntry } from "../executive-navigation"
import {
  PERIOD_OPTIONS,
  comparisonLabel,
  periodHref,
  periodLabel,
  type PeriodPreset,
} from "../executive-period"
import { LineSynoptic } from "../line-synoptic"
import { MetricCard, MetricGrid } from "../metric-card"
import { ProvenanceSummary } from "../provenance"
import type { ExecutiveVoletProps } from "./types"

const NUMBER_FORMATTER = new Intl.NumberFormat("fr-FR")
const PERCENT_FORMATTER = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 1,
})
const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Africa/Libreville",
})

const TONE_LABELS: Readonly<Record<ExecutiveArbitration["tone"], string>> = {
  critical: "Critique",
  warning: "À surveiller",
  neutral: "Information",
}

const TONE_TAGS: Readonly<
  Record<ExecutiveArbitration["tone"], "danger" | "warning" | "neutral">
> = {
  critical: "danger",
  warning: "warning",
  neutral: "neutral",
}

function variationLabel(value: number | null | undefined, comparison: string) {
  if (value === null) return "Sans période de référence"
  if (value === undefined) return undefined
  const sign = value > 0 ? "+" : value < 0 ? "−" : ""
  return `${sign}${PERCENT_FORMATTER.format(Math.abs(value))} % ${comparison}`
}

function snapshotLabel(timestamp: number | undefined) {
  return timestamp
    ? `Instantané du ${DATE_TIME_FORMATTER.format(new Date(timestamp))}`
    : "Instantané sans horodatage"
}

export function ArbitrationList({
  data,
  limit,
}: {
  data: ExecutiveOverviewDto
  limit?: number
}) {
  const arbitrations = deriveExecutiveArbitrations(data)
  const shown = limit ? arbitrations.slice(0, limit) : arbitrations
  const preset = data.period.preset

  return (
    <section
      aria-labelledby="arbitrer-titre"
      className="grid content-start gap-4 rounded-lg border border-line bg-surface p-5"
    >
      <h2 id="arbitrer-titre" className="text-h4">
        À arbitrer ({NUMBER_FORMATTER.format(arbitrations.length)})
      </h2>
      {arbitrations.length === 0 ? (
        <p className="text-small text-ink-muted">
          Aucun signal établi à partir des sources accessibles.
        </p>
      ) : (
        <ol className="grid gap-2">
          {shown.map((item, index) => {
            const target = executiveVoletEntry(item.volet)
            return (
              <li key={item.id}>
                <Link
                  href={periodHref(target.href, preset) as Route}
                  className="grid min-h-target grid-cols-[1.5rem_minmax(0,1fr)] gap-x-3 rounded-md border border-line p-3 transition-colors hover:border-accent-line hover:bg-surface-sunk"
                >
                  <span className="font-mono text-sm text-ink-muted tabular-nums">
                    {index + 1}.
                  </span>
                  <span className="grid gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-small font-semibold text-ink">
                        {item.label}
                      </span>
                      <Tag tone={TONE_TAGS[item.tone]}>
                        {TONE_LABELS[item.tone]}
                      </Tag>
                    </span>
                    <span className="text-caption text-ink-muted">
                      {item.detail}
                    </span>
                    <span className="text-caption font-semibold text-accent-ink">
                      {target.action}
                    </span>
                  </span>
                </Link>
              </li>
            )
          })}
        </ol>
      )}
      {limit && arbitrations.length > limit ? (
        <Link
          href={periodHref("/direction/decisions", preset) as Route}
          className="text-small flex min-h-target items-center font-semibold text-accent-ink"
        >
          Voir les {NUMBER_FORMATTER.format(arbitrations.length)} signaux
        </Link>
      ) : null}
    </section>
  )
}

export function PassengerPeriodControl({
  data,
  preset,
  onPresetChange,
  heading = "Chiffres de tête",
}: {
  data: ExecutiveOverviewDto
  preset: PeriodPreset
  onPresetChange: (value: string) => void
  /** Titre de section ; `null` quand le volet porte déjà son propre `h2`. */
  heading?: string | null
}) {
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {heading ? <h2 className="text-h4">{heading}</h2> : null}
        <Tag tone="neutral">{periodLabel(preset, data.period)}</Tag>
      </div>
      <SegmentedControl
        label="Période — voyageurs"
        size="touch"
        options={PERIOD_OPTIONS.map(({ value, label }) => ({ value, label }))}
        value={preset}
        onValueChange={onPresetChange}
      />
    </div>
  )
}

export function OverviewVolet({
  data,
  preset,
  onPresetChange,
}: ExecutiveVoletProps) {
  const comparison = comparisonLabel(data.period)
  const passenger = data.passenger
  const freight = data.freight

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(20rem,0.6fr)]">
      <div className="order-1 xl:order-none xl:col-span-2 xl:row-start-1">
        <DailyBrief data={data} />
      </div>

      <div className="order-4 xl:order-none xl:col-span-2 xl:row-start-2">
        <LineSynoptic data={data} compact />
      </div>

      <section
        aria-label="Chiffres de tête"
        className="order-3 grid content-start gap-4 xl:order-none xl:col-start-1 xl:row-start-3"
      >
        <PassengerPeriodControl
          data={data}
          preset={preset}
          onPresetChange={onPresetChange}
        />
        <MetricGrid label="Chiffres de tête" className="2xl:grid-cols-4">
          <MetricCard
            label="Recettes voyageurs nettes"
            state={passenger.state}
            value={
              passenger.revenueNet !== undefined
                ? NUMBER_FORMATTER.format(passenger.revenueNet)
                : undefined
            }
            unit="XAF"
            supporting={
              passenger.state === "operational"
                ? variationLabel(passenger.revenueVariationPct, comparison)
                : undefined
            }
          />
          <MetricCard
            label="Billets émis"
            state={passenger.state}
            value={
              passenger.tickets !== undefined
                ? NUMBER_FORMATTER.format(passenger.tickets)
                : undefined
            }
            supporting={
              passenger.state === "operational"
                ? variationLabel(passenger.ticketVariationPct, comparison)
                : undefined
            }
          />
          <MetricCard
            label="Remplissage siège-km"
            state={passenger.state}
            value={
              passenger.occupancyPct !== undefined
                ? PERCENT_FORMATTER.format(passenger.occupancyPct)
                : undefined
            }
            unit="%"
            supporting={
              passenger.state === "operational"
                ? "Taux pondéré par les kilomètres parcourus"
                : undefined
            }
          />
          <MetricCard
            label="Tonnes en mouvement · fret"
            state={freight.state}
            value={
              freight.tonnes !== undefined
                ? NUMBER_FORMATTER.format(freight.tonnes)
                : undefined
            }
            unit="t"
            supporting={
              freight.state === "synthetic_demo"
                ? "Scénario de démonstration, sans valeur opérationnelle"
                : freight.state === "operational"
                  ? snapshotLabel(data.freshnessAt)
                  : undefined
            }
          />
        </MetricGrid>
        <BarSeries
          title="Recettes voyageurs par jour"
          description="Chiffre d’affaires net des journées clôturées sur la période."
          series={passenger.series}
          state={passenger.state}
          tableCaption="Chiffre d’affaires net et billets par jour"
        />
      </section>

      <div className="order-2 xl:order-none xl:col-start-2 xl:row-start-3">
        <ArbitrationList data={data} limit={3} />
      </div>

      <p className="text-small order-5 text-ink-muted xl:order-none xl:col-span-2 xl:row-start-4">
        {directionsSummaryLabel(data)} ·{" "}
        <Link
          href={
            `${periodHref("/direction/decisions", preset)}#raccordement` as Route
          }
          className="font-semibold text-accent-ink underline-offset-4 hover:underline"
        >
          Voir le détail des raccordements
        </Link>
      </p>

      <nav
        aria-label="Volets de l’espace"
        className="order-6 grid gap-3 sm:grid-cols-2 lg:hidden"
      >
        {EXECUTIVE_VOLETS.filter(({ volet }) => volet !== "overview").map(
          (entry) => {
            const Icon = entry.icon
            return (
              <Link
                key={entry.volet}
                href={periodHref(entry.href, preset) as Route}
                className="grid min-h-target grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-lg border border-line bg-surface p-4 transition-colors hover:border-accent-line"
              >
                <Icon aria-hidden className="size-5 text-accent-ink" />
                <span className="grid gap-0.5">
                  <span className="text-small font-semibold">
                    {entry.label}
                  </span>
                  <span className="text-caption text-ink-muted">
                    {entry.description}
                  </span>
                </span>
              </Link>
            )
          }
        )}
      </nav>

      <div className="order-7 xl:order-none xl:col-span-2 xl:row-start-5">
        <ProvenanceSummary
          states={[
            passenger.state,
            data.service.state,
            data.cotraf.state,
            freight.state,
            data.safety.state,
            data.occupancy.state,
            data.finance.state,
            data.continuity.state,
            data.health.state,
          ]}
        />
        <p className="text-caption mt-1 text-ink-muted">
          {data.freshnessAt
            ? `Instantané le plus récent : ${DATE_TIME_FORMATTER.format(new Date(data.freshnessAt))} · `
            : ""}
          {pluralize(data.modules.length, "module visible", "modules visibles")}{" "}
          pour ce compte.
        </p>
      </div>
    </div>
  )
}
