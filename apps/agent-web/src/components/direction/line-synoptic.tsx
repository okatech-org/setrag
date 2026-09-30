import { cn } from "@workspace/ui/lib/utils"
import { Tag } from "@workspace/ui/components/tag"

import type {
  CotrafDashboard,
  ExecutiveOverviewDto,
  NetworkStation,
} from "./executive-dto"
import { pluralize } from "./executive-dto"
import { ProvenanceTag } from "./provenance"

const NUMBER_FORMATTER = new Intl.NumberFormat("fr-FR")
const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Africa/Libreville",
})

const SERVICE_TYPE_LABELS: Readonly<
  Record<CotrafDashboard["movements"][number]["serviceType"], string>
> = {
  voyageurs: "Voyageurs",
  minerai: "Minerai",
  bois: "Bois",
  hydrocarbures: "Hydrocarbures",
  service: "Service",
}

type Movement = CotrafDashboard["movements"][number]
type Conflict = CotrafDashboard["conflicts"][number]
type Segment = CotrafDashboard["segments"][number]

/** Circulation placée sur le rail : uniquement avec un PK persisté. */
interface PlacedMovement {
  movement: Movement
  pk: number
}

interface PlacedBand {
  key: string
  fromPk: number
  toPk: number
  label: string
  detail: string
  tone: "danger" | "warning"
}

interface LineModel {
  stations: readonly NetworkStation[]
  pkMax: number
  movements: readonly PlacedMovement[]
  bands: readonly PlacedBand[]
  labelled: ReadonlySet<string>
}

/** Espacement minimal entre deux libellés d'une même rangée, en kilomètres. */
const MIN_LABEL_GAP_KM = 25

function movementLabel(movement: Movement) {
  const delay =
    movement.status === "retenu"
      ? "retenu"
      : movement.delayMinutes > 0
        ? `+${NUMBER_FORMATTER.format(movement.delayMinutes)} min`
        : "à l’heure"
  return `T ${movement.trainNumber} · ${delay}`
}

function movementDirection(movement: Movement) {
  return movement.direction === "croissant"
    ? { glyph: "→", text: "vers Franceville" }
    : { glyph: "←", text: "vers Owendo" }
}

function movementTone(movement: Movement): "success" | "warning" | "neutral" {
  if (movement.status === "retenu") return "neutral"
  return movement.delayMinutes > 0 ? "warning" : "success"
}

export function buildLineModel(data: ExecutiveOverviewDto): LineModel {
  const stations = [...data.network.stations]
    .filter((station) => station.isActive)
    .sort((left, right) => left.kilometerPoint - right.kilometerPoint)
  const pkMax = Math.max(
    ...stations.map(({ kilometerPoint }) => kilometerPoint),
    1
  )
  const dashboard = data.cotraf.dashboard
  const readable =
    data.cotraf.state === "operational" ||
    data.cotraf.state === "synthetic_demo"
  const pkByCode = new Map<string, number>()
  for (const station of stations)
    pkByCode.set(station.code, station.kilometerPoint)
  for (const station of dashboard?.stations ?? []) {
    if (!pkByCode.has(station.code))
      pkByCode.set(station.code, station.kilometerPoint)
  }

  const movements: PlacedMovement[] =
    readable && dashboard
      ? dashboard.movements
          .filter(
            (movement) =>
              (movement.status === "en_ligne" ||
                movement.status === "retenu") &&
              typeof movement.currentPk === "number"
          )
          .map((movement) => ({ movement, pk: movement.currentPk as number }))
          .sort((left, right) => left.pk - right.pk)
      : []

  const bands: PlacedBand[] = []
  if (readable && dashboard) {
    for (const conflict of dashboard.conflicts as readonly Conflict[]) {
      const fromPk = pkByCode.get(conflict.fromStationCode)
      const toPk = pkByCode.get(conflict.toStationCode)
      if (fromPk === undefined || toPk === undefined) continue
      bands.push({
        key: conflict.key,
        fromPk: Math.min(fromPk, toPk),
        toPk: Math.max(fromPk, toPk),
        label: `Conflit ${conflict.fromStationName}–${conflict.toStationName}`,
        detail: `${conflict.trainNumbers.join(" / ")} · ${conflict.severity === "critical" ? "critique" : "à surveiller"}`,
        tone: conflict.severity === "critical" ? "danger" : "warning",
      })
    }
    for (const segment of dashboard.segments as readonly Segment[]) {
      if (segment.status !== "bloque") continue
      bands.push({
        key: segment.id,
        fromPk: Math.min(segment.fromKm, segment.toKm),
        toPk: Math.max(segment.fromKm, segment.toKm),
        label: `Canton bloqué ${segment.fromStationName}–${segment.toStationName}`,
        detail: segment.note,
        tone: "warning",
      })
    }
  }

  // Gares nommées : les deux terminus et toute gare portant un événement ;
  // les autres reçoivent leur code, sur deux rangées alternées, à condition
  // de laisser MIN_LABEL_GAP_KM à la précédente de la même rangée.
  const eventPks = new Set<number>([
    ...movements.map(({ pk }) => pk),
    ...bands.flatMap(({ fromPk, toPk }) => [fromPk, toPk]),
  ])
  const labelled = new Set<string>()
  const lastLabelPk: [number, number] = [-Infinity, -Infinity]
  stations.forEach((station, index) => {
    const row = (index % 2) as 0 | 1
    const important =
      index === 0 ||
      index === stations.length - 1 ||
      eventPks.has(station.kilometerPoint)
    if (
      important ||
      station.kilometerPoint - lastLabelPk[row] >= MIN_LABEL_GAP_KM
    ) {
      labelled.add(station.code)
      lastLabelPk[row] = station.kilometerPoint
    }
  })

  return { stations, pkMax, movements, bands, labelled }
}

function isNamed(model: LineModel, station: NetworkStation, index: number) {
  return (
    index === 0 ||
    index === model.stations.length - 1 ||
    model.movements.some(({ pk }) => pk === station.kilometerPoint) ||
    model.bands.some(
      ({ fromPk, toPk }) =>
        fromPk === station.kilometerPoint || toPk === station.kilometerPoint
    )
  )
}

function percent(pk: number, pkMax: number) {
  return `${Math.min(100, Math.max(0, (pk / pkMax) * 100)).toFixed(2)}%`
}

function stationBefore(model: LineModel, pk: number) {
  let candidate: NetworkStation | undefined
  for (const station of model.stations) {
    if (station.kilometerPoint <= pk) candidate = station
  }
  return candidate
}

function stationAfter(model: LineModel, pk: number) {
  return model.stations.find((station) => station.kilometerPoint > pk)
}

function positionText(model: LineModel, pk: number) {
  const before = stationBefore(model, pk)
  const after = stationAfter(model, pk)
  if (before && before.kilometerPoint === pk) return `en gare de ${before.name}`
  if (before && after) return `entre ${before.name} et ${after.name}`
  return `PK ${NUMBER_FORMATTER.format(pk)}`
}

function RailHorizontal({ model }: { model: LineModel }) {
  const { stations, pkMax, movements, bands } = model
  return (
    <div className="hidden md:block">
      <div className="relative mx-6 h-56">
        {/* Voie unique */}
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-28 h-1 rounded-pill bg-line-strong"
        />

        {/* Bandes : conflits et cantons bloqués */}
        <ol
          aria-label="Conflits et cantons contraints"
          className="absolute inset-0"
        >
          {bands.map((band, index) => (
            <li
              key={band.key}
              className={cn(
                "absolute top-[104px] flex h-6 min-w-2 items-center justify-center rounded-xs border",
                band.tone === "danger"
                  ? "border-danger-ink/50 bg-danger-soft"
                  : "border-warning-ink/50 bg-warning-soft"
              )}
              style={{
                left: percent(band.fromPk, pkMax),
                width: `calc(${percent(band.toPk, pkMax)} - ${percent(band.fromPk, pkMax)})`,
              }}
            >
              <span
                className={cn(
                  "absolute left-1/2 w-max max-w-56 -translate-x-1/2 text-center text-[11px] leading-tight",
                  index % 2 === 0
                    ? "top-[calc(100%+3.5rem)]"
                    : "top-[calc(100%+4.75rem)]",
                  band.tone === "danger"
                    ? "text-danger-ink"
                    : "text-warning-ink"
                )}
              >
                <span className="font-semibold">{band.label}</span>
                <span className="block text-ink-muted">{band.detail}</span>
              </span>
            </li>
          ))}
        </ol>

        {/* Gares */}
        <ol aria-label="Gares de la ligne" className="absolute inset-0">
          {stations.map((station, index) => {
            const named = isNamed(model, station, index)
            const shown = model.labelled.has(station.code)
            const above = index % 2 === 0
            return (
              <li
                key={station.code}
                className="absolute top-28 -translate-x-1/2"
                style={{ left: percent(station.kilometerPoint, pkMax) }}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "block w-0.5 -translate-y-1/2 bg-ink-muted",
                    named ? "h-5" : "h-3"
                  )}
                />
                <span
                  className={cn(
                    "absolute left-1/2 w-max -translate-x-1/2 text-center leading-tight whitespace-nowrap",
                    above
                      ? "bottom-[calc(100%+0.5rem)]"
                      : "top-[calc(100%+0.25rem)]",
                    named
                      ? "text-[11px] font-semibold text-ink"
                      : "text-[10px] text-ink-muted",
                    !shown && "sr-only"
                  )}
                >
                  {named ? station.name : station.code}
                  <span className="sr-only">
                    {named ? "" : `, ${station.name}`}, PK{" "}
                    {NUMBER_FORMATTER.format(station.kilometerPoint)}
                  </span>
                </span>
              </li>
            )
          })}
        </ol>

        {/* Circulations */}
        <ol aria-label="Circulations en ligne" className="absolute inset-0">
          {movements.map(({ movement, pk }, index) => {
            const direction = movementDirection(movement)
            return (
              <li
                key={movement.id}
                className={cn(
                  "absolute -translate-x-1/2",
                  index % 2 === 0 ? "top-2" : "top-12"
                )}
                style={{ left: percent(pk, pkMax) }}
              >
                <Tag tone={movementTone(movement)}>
                  <span aria-hidden="true">{direction.glyph}</span>
                  <span>{movementLabel(movement)}</span>
                  <span className="sr-only">
                    , {SERVICE_TYPE_LABELS[movement.serviceType]},{" "}
                    {direction.text}, {positionText(model, pk)}
                  </span>
                </Tag>
              </li>
            )
          })}
        </ol>
      </div>
    </div>
  )
}

interface VerticalRow {
  station: NetworkStation
  named: boolean
  movements: readonly PlacedMovement[]
  bands: readonly PlacedBand[]
}

function verticalRows(model: LineModel): VerticalRow[] {
  return model.stations.map((station, index) => {
    const next = model.stations[index + 1]
    const upper = next ? next.kilometerPoint : Infinity
    return {
      station,
      named: isNamed(model, station, index),
      movements: model.movements.filter(
        ({ pk }) => pk >= station.kilometerPoint && pk < upper
      ),
      bands: model.bands.filter(
        ({ fromPk }) => fromPk === station.kilometerPoint
      ),
    }
  })
}

function VerticalStation({
  row,
  model,
}: {
  row: VerticalRow
  model: LineModel
}) {
  const hasEvents = row.movements.length > 0 || row.bands.length > 0
  return (
    <li className="grid grid-cols-[1.25rem_minmax(0,1fr)] gap-x-3">
      <span aria-hidden="true" className="relative flex justify-center">
        <span className="absolute inset-y-0 w-0.5 bg-line-strong" />
        <span
          className={cn(
            "relative mt-3 size-3 rounded-full border-2 border-ink-muted bg-surface",
            (row.named || hasEvents) && "border-ink bg-ink"
          )}
        />
      </span>
      <div className="grid gap-1 py-2">
        <div className="flex items-baseline justify-between gap-3">
          <span
            className={cn(
              "text-small",
              (row.named || hasEvents) && "font-semibold"
            )}
          >
            {row.station.name}
          </span>
          <span className="font-mono text-xs text-ink-muted tabular-nums">
            PK {NUMBER_FORMATTER.format(row.station.kilometerPoint)}
          </span>
        </div>
        {row.movements.map(({ movement, pk }) => {
          const direction = movementDirection(movement)
          return (
            <div
              key={movement.id}
              className="flex flex-wrap items-center gap-2"
            >
              <Tag tone={movementTone(movement)}>
                <span aria-hidden="true">{direction.glyph}</span>
                {movementLabel(movement)}
              </Tag>
              <span className="text-caption text-ink-muted">
                {SERVICE_TYPE_LABELS[movement.serviceType]} · {direction.text} ·{" "}
                {positionText(model, pk)}
              </span>
            </div>
          )
        })}
        {row.bands.map((band) => (
          <p
            key={band.key}
            className={cn(
              "text-caption",
              band.tone === "danger" ? "text-danger-ink" : "text-warning-ink"
            )}
          >
            <span className="font-semibold">{band.label}</span> · {band.detail}
          </p>
        ))}
      </div>
    </li>
  )
}

function RailVertical({
  model,
  compact,
}: {
  model: LineModel
  compact: boolean
}) {
  const rows = verticalRows(model)
  const groups: (VerticalRow | VerticalRow[])[] = []
  if (compact) {
    let run: VerticalRow[] = []
    rows.forEach((row, index) => {
      const keep =
        row.named ||
        row.movements.length > 0 ||
        row.bands.length > 0 ||
        index === 0 ||
        index === rows.length - 1
      if (keep) {
        if (run.length > 0) groups.push(run)
        run = []
        groups.push(row)
      } else {
        run.push(row)
      }
    })
    if (run.length > 0) groups.push(run)
  }

  return (
    <ol
      aria-label="Gares de la ligne, d’Owendo à Franceville"
      className="grid md:hidden"
    >
      {(compact ? groups : rows).map((entry) => {
        if (!Array.isArray(entry)) {
          return (
            <VerticalStation
              key={entry.station.code}
              row={entry}
              model={model}
            />
          )
        }
        const first = entry[0]
        if (!first) return null
        if (entry.length === 1) {
          return (
            <VerticalStation
              key={first.station.code}
              row={first}
              model={model}
            />
          )
        }
        return (
          <li
            key={`run-${first.station.code}`}
            className="grid grid-cols-[1.25rem_minmax(0,1fr)] gap-x-3"
          >
            <span aria-hidden="true" className="relative flex justify-center">
              <span className="absolute inset-y-0 w-0.5 bg-line-strong" />
            </span>
            <details className="py-1">
              <summary className="text-small flex min-h-target cursor-pointer items-center text-ink-muted">
                {pluralize(
                  entry.length,
                  "gare sans circulation",
                  "gares sans circulation"
                )}
              </summary>
              <ol className="grid">
                {entry.map((row) => (
                  <VerticalStation
                    key={row.station.code}
                    row={row}
                    model={model}
                  />
                ))}
              </ol>
            </details>
          </li>
        )
      })}
    </ol>
  )
}

function LineTables({
  model,
  data,
}: {
  model: LineModel
  data: ExecutiveOverviewDto
}) {
  const movements = data.cotraf.dashboard?.movements ?? []
  return (
    <details className="min-w-0 rounded-md border border-line bg-surface-sunk p-3">
      <summary className="text-small flex min-h-target cursor-pointer items-center font-semibold">
        Voir le tableau : circulations et gares
      </summary>
      <div className="grid gap-4 overflow-x-auto pt-2">
        <table className="w-full text-left text-sm">
          <caption className="text-caption mb-2 text-left text-ink-muted">
            Circulations enregistrées par le COTRAF
          </caption>
          <thead className="text-ink-muted">
            <tr className="border-b border-line">
              <th scope="col" className="px-2 py-2 font-semibold">
                Train
              </th>
              <th scope="col" className="px-2 py-2 font-semibold">
                Type
              </th>
              <th scope="col" className="px-2 py-2 font-semibold">
                Sens
              </th>
              <th scope="col" className="px-2 py-2 font-semibold">
                État
              </th>
              <th scope="col" className="px-2 py-2 text-right font-semibold">
                PK
              </th>
              <th scope="col" className="px-2 py-2 text-right font-semibold">
                Retard
              </th>
            </tr>
          </thead>
          <tbody>
            {movements.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-2 py-3 text-ink-muted">
                  Aucune circulation lisible.
                </td>
              </tr>
            ) : (
              movements.map((movement) => (
                <tr key={movement.id} className="border-b border-line/70">
                  <td className="px-2 py-2 font-mono tabular-nums">
                    {movement.trainNumber}
                  </td>
                  <td className="px-2 py-2">
                    {SERVICE_TYPE_LABELS[movement.serviceType]}
                  </td>
                  <td className="px-2 py-2">
                    {movementDirection(movement).text}
                  </td>
                  <td className="px-2 py-2">
                    {movement.status.replace("_", " ")}
                  </td>
                  <td className="px-2 py-2 text-right font-mono tabular-nums">
                    {typeof movement.currentPk === "number"
                      ? NUMBER_FORMATTER.format(movement.currentPk)
                      : "—"}
                  </td>
                  <td className="px-2 py-2 text-right font-mono tabular-nums">
                    {movement.delayMinutes > 0
                      ? `+${NUMBER_FORMATTER.format(movement.delayMinutes)} min`
                      : "0 min"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <table className="w-full text-left text-sm">
          <caption className="text-caption mb-2 text-left text-ink-muted">
            Gares du référentiel et points kilométriques
          </caption>
          <thead className="text-ink-muted">
            <tr className="border-b border-line">
              <th scope="col" className="px-2 py-2 font-semibold">
                Code
              </th>
              <th scope="col" className="px-2 py-2 font-semibold">
                Gare
              </th>
              <th scope="col" className="px-2 py-2 font-semibold">
                Province
              </th>
              <th scope="col" className="px-2 py-2 text-right font-semibold">
                PK
              </th>
            </tr>
          </thead>
          <tbody>
            {model.stations.map((station) => (
              <tr key={station.code} className="border-b border-line/70">
                <td className="px-2 py-2 font-mono">{station.code}</td>
                <td className="px-2 py-2">{station.name}</td>
                <td className="px-2 py-2 text-ink-muted">{station.province}</td>
                <td className="px-2 py-2 text-right font-mono tabular-nums">
                  {NUMBER_FORMATTER.format(station.kilometerPoint)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}

function statusSentence(data: ExecutiveOverviewDto, model: LineModel) {
  switch (data.cotraf.state) {
    case "loading":
      return "Lecture des circulations…"
    case "unavailable":
      return "Circulations non accessibles à ce compte."
    case "not_connected":
      return "Circulations non raccordées."
    case "empty":
      return "Aucune circulation enregistrée."
    default:
      return `${pluralize(model.movements.length, "circulation placée", "circulations placées")}, ${pluralize(data.cotraf.conflicts ?? 0, "conflit", "conflits")}.`
  }
}

/**
 * « La ligne » — synoptique du Transgabonais en HTML : gares du référentiel
 * au PK réel, et par-dessus uniquement ce que le COTRAF a enregistré. Rail
 * horizontal à partir de `md:`, liste verticale en dessous ; les deux lisent
 * le même modèle, et une table repliée porte les mêmes données.
 */
export function LineSynoptic({
  data,
  compact = false,
  id = "ligne",
}: {
  data: ExecutiveOverviewDto
  /** Replie les gares sans événement dans la liste verticale (vue d'ensemble). */
  compact?: boolean
  id?: string
}) {
  const model = buildLineModel(data)
  const generated = data.cotraf.generatedAt
    ? DATE_TIME_FORMATTER.format(new Date(data.cotraf.generatedAt))
    : undefined
  const synthetic = data.cotraf.state === "synthetic_demo"
  const freightAlerts = data.freight.criticalAlerts

  return (
    <figure
      id={id}
      aria-labelledby={`${id}-titre`}
      className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 rounded-lg border border-line bg-surface p-5"
    >
      <figcaption className="grid gap-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id={`${id}-titre`} className="text-h4">
              La ligne — Owendo → Franceville
            </h2>
            <p className="text-small mt-1 text-ink-muted">
              {statusSentence(data, model)}
              {synthetic
                ? " Circulations : scénario de démonstration, sans valeur opérationnelle."
                : ""}
            </p>
          </div>
          <ProvenanceTag state={data.cotraf.state} />
        </div>
        <p className="text-caption text-ink-muted">
          {pluralize(model.stations.length, "gare", "gares")} du référentiel ·{" "}
          {NUMBER_FORMATTER.format(model.pkMax)} km · PK du schéma de ligne
          public, convention à homologuer
          {generated ? ` · instantané COTRAF du ${generated}` : ""}
          {typeof freightAlerts === "number" && freightAlerts > 0
            ? ` · ${pluralize(freightAlerts, "alerte Fret critique ouverte", "alertes Fret critiques ouvertes")} (hors rail : site sans PK)`
            : ""}
        </p>
      </figcaption>

      {data.network.state === "loading" ? (
        <p role="status" className="text-small text-ink-muted">
          Lecture du référentiel des gares…
        </p>
      ) : model.stations.length === 0 ? (
        <p className="text-small rounded-md border border-dashed border-line-strong p-6 text-ink-muted">
          Référentiel des gares indisponible : la ligne ne peut pas être tracée.
        </p>
      ) : (
        <>
          <RailHorizontal model={model} />
          <RailVertical model={model} compact={compact} />
          <LineTables model={model} data={data} />
        </>
      )}
    </figure>
  )
}
