import { formatXaf } from "@/lib/format"

import type {
  DailyPoint,
  ExecutiveSourceState,
  RevenueSlice,
} from "./executive-dto"
import { ProvenanceTag } from "./provenance"

const NUMBER_FORMATTER = new Intl.NumberFormat("fr-FR")
const DATE_FORMATTER = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
})

function dateFromIso(value: string) {
  return new Date(`${value}T12:00:00Z`)
}

function ChartFrame({
  title,
  description,
  state,
  count,
  children,
}: {
  title: string
  description?: string
  state: ExecutiveSourceState
  count?: string
  children: React.ReactNode
}) {
  return (
    <section
      aria-label={title}
      className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 rounded-lg border border-line bg-surface p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-h4">{title}</h3>
          {description ? (
            <p className="text-small mt-1 text-ink-muted">{description}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {count ? (
            <span className="font-mono text-xs text-ink-muted tabular-nums">
              {count}
            </span>
          ) : null}
          <ProvenanceTag state={state} />
        </div>
      </div>
      {children}
    </section>
  )
}

function EmptyChart({ state }: { state: ExecutiveSourceState }) {
  return (
    <p className="text-small rounded-md border border-dashed border-line-strong p-6 text-ink-muted">
      {state === "loading"
        ? "Lecture de la série en cours…"
        : state === "unavailable"
          ? "Source non accessible à ce compte."
          : "Aucune journée clôturée sur la période. Les recettes apparaissent après la clôture des journées comptables."}
    </p>
  )
}

/**
 * Série journalière en barres CSS — série unique en accent, jamais de
 * palette. La table repliée porte les mêmes valeurs (rien par la couleur ou
 * la hauteur seule).
 */
export function BarSeries({
  title,
  description,
  series,
  state,
  tableCaption,
}: {
  title: string
  description?: string
  series: readonly DailyPoint[]
  state: ExecutiveSourceState
  tableCaption: string
}) {
  const maximum = Math.max(...series.map(({ netTtc }) => netTtc), 1)
  const total = series.reduce((sum, { netTtc }) => sum + netTtc, 0)

  return (
    <ChartFrame
      title={title}
      description={description}
      state={state}
      count={
        series.length > 0
          ? `${series.length} j · ${formatXaf(total)}`
          : undefined
      }
    >
      {series.length > 0 ? (
        <>
          <svg
            aria-hidden="true"
            viewBox={`0 0 ${series.length} 100`}
            preserveAspectRatio="none"
            className="h-48 w-full border-b border-line"
          >
            {series.map((day, index) => {
              const height =
                day.netTtc === 0 ? 1 : Math.max((day.netTtc / maximum) * 100, 2)
              return (
                <rect
                  key={day.date}
                  x={index + 0.15}
                  y={100 - height}
                  width={0.7}
                  height={height}
                  style={{ fill: "var(--c-accent)" }}
                >
                  <title>
                    {`${DATE_FORMATTER.format(dateFromIso(day.date))} : ${formatXaf(day.netTtc)}`}
                  </title>
                </rect>
              )
            })}
          </svg>
          <details className="min-w-0 rounded-md border border-line bg-surface-sunk p-3">
            <summary className="text-small flex min-h-target cursor-pointer items-center font-semibold">
              Voir le tableau : {tableCaption.toLowerCase()}
            </summary>
            <div className="overflow-x-auto pt-2">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">{tableCaption}</caption>
                <thead className="text-ink-muted">
                  <tr className="border-b border-line">
                    <th scope="col" className="px-2 py-3 font-semibold">
                      Date
                    </th>
                    <th
                      scope="col"
                      className="px-2 py-3 text-right font-semibold"
                    >
                      CA net
                    </th>
                    <th
                      scope="col"
                      className="px-2 py-3 text-right font-semibold"
                    >
                      Billets
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {series.map((day) => (
                    <tr key={day.date} className="border-b border-line/70">
                      <td className="px-2 py-3">
                        {DATE_FORMATTER.format(dateFromIso(day.date))}
                      </td>
                      <td className="px-2 py-3 text-right font-mono tabular-nums">
                        {formatXaf(day.netTtc)}
                      </td>
                      <td className="px-2 py-3 text-right font-mono tabular-nums">
                        {NUMBER_FORMATTER.format(day.tickets)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      ) : (
        <EmptyChart state={state} />
      )}
    </ChartFrame>
  )
}

/**
 * Ventilation en barres horizontales : chaque ligne porte son libellé, sa
 * valeur et sa part en texte ; la barre n'est qu'un renfort visuel.
 */
export function BreakdownBars({
  title,
  description,
  slices,
  state,
  tableCaption,
}: {
  title: string
  description?: string
  slices: readonly RevenueSlice[] | undefined
  state: ExecutiveSourceState
  tableCaption: string
}) {
  const rows = slices ?? []
  const total = rows.reduce((sum, { netTtc }) => sum + netTtc, 0)
  const maximum = Math.max(...rows.map(({ netTtc }) => netTtc), 1)

  return (
    <ChartFrame
      title={title}
      description={description}
      state={state}
      count={rows.length > 0 ? formatXaf(total) : undefined}
    >
      {rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{tableCaption}</caption>
            <thead className="sr-only">
              <tr>
                <th scope="col">Catégorie</th>
                <th scope="col">CA net</th>
                <th scope="col">Part</th>
                <th scope="col">Billets</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((slice) => {
                const share = total > 0 ? (slice.netTtc / total) * 100 : 0
                return (
                  <tr
                    key={slice.key}
                    className="border-b border-line/70 last:border-b-0"
                  >
                    <th
                      scope="row"
                      className="w-1/3 py-2 pr-3 align-top font-medium text-ink"
                    >
                      <span className="block">{slice.label}</span>
                      <span
                        aria-hidden="true"
                        className="mt-1.5 block h-1.5 rounded-pill bg-surface-sunk"
                      >
                        <span
                          className="block h-full rounded-pill bg-accent-base"
                          style={{
                            width: `${Math.max((slice.netTtc / maximum) * 100, 2)}%`,
                          }}
                        />
                      </span>
                    </th>
                    <td className="py-2 pr-3 text-right align-top font-mono tabular-nums">
                      {formatXaf(slice.netTtc)}
                    </td>
                    <td className="py-2 pr-3 text-right align-top font-mono text-ink-muted tabular-nums">
                      {NUMBER_FORMATTER.format(Math.round(share))} %
                    </td>
                    <td className="py-2 text-right align-top font-mono text-ink-muted tabular-nums">
                      {NUMBER_FORMATTER.format(slice.ticketCount)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyChart state={state} />
      )}
    </ChartFrame>
  )
}
