"use client"

import type { FunctionReference } from "convex/server"
import {
  Activity,
  AlertTriangle,
  ArrowRightLeft,
  Clock3,
  Database,
  Gauge,
  MapPin,
  Radio,
  Route,
  ShieldAlert,
  TrainFront,
} from "lucide-react"

import { useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Badge } from "@workspace/ui/components/badge"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { EmptyState } from "@workspace/ui/components/empty-state"
import { InlineMessage } from "@workspace/ui/components/inline-message"
import { Skeleton } from "@workspace/ui/components/skeleton"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import { EnterpriseShell } from "@/components/enterprise-layout"

export interface CotrafDashboardDto {
  moduleCode: "cotraf"
  dataState: "empty" | "synthetic_demo" | "operational"
  accessibleSiteIds: readonly string[]
  generatedAt: number
  dataset: null | {
    key: string
    label: string
    notice: string
    dataOrigin: "synthetic_demo" | "operational"
    referenceAt: number
    pkConvention: string
    referenceSources: readonly {
      label: string
      url: string
    }[]
  }
  kpis: readonly {
    code: string
    label: string
    value: number
    unit: string
    tone: "neutral" | "positive" | "warning" | "critical"
    description: string
  }[]
  stations: readonly {
    code: string
    name: string
    kilometerPoint: number
  }[]
  movements: readonly {
    id: string
    movementCode: string
    trainNumber: string
    serviceType: "voyageurs" | "minerai" | "bois" | "hydrocarbures" | "service"
    direction: "croissant" | "decroissant"
    status: "planifie" | "en_ligne" | "retenu" | "arrive"
    originLabel: string
    destinationLabel: string
    currentPk?: number
    delayMinutes: number
    priority: number
    lastEventAt: number
    trajectory: readonly {
      stationCode: string
      stationName: string
      kilometerPoint: number
      plannedAt: number
      forecastAt?: number
    }[]
  }[]
  segments: readonly {
    id: string
    segmentCode: string
    fromStationCode: string
    fromStationName: string
    fromKm: number
    toStationCode: string
    toStationName: string
    toKm: number
    status: "libre" | "reserve" | "occupe" | "bloque"
    movementCode?: string
    enteredAt?: number
    expectedReleaseAt?: number
    speedLimitKph?: number
    note: string
  }[]
  events: readonly {
    id: string
    eventCode: string
    category: "croisement" | "alerte" | "otr" | "journal"
    severity: "information" | "warning" | "critical"
    title: string
    message: string
    siteLabel: string
    status: "planifie" | "confirme" | "ouverte" | "resolue"
    occurredAt: number
    dueAt?: number
    primaryTrainNumber?: string
    secondaryTrainNumber?: string
    estimatedGainMinutes?: number
  }[]
  conflicts: readonly {
    key: string
    fromStationCode: string
    fromStationName: string
    toStationCode: string
    toStationName: string
    trainNumbers: readonly [string, string]
    startsAt: number
    endsAt: number
    severity: "warning" | "critical"
  }[]
}

type CotrafDashboardReference = FunctionReference<
  "query",
  "public",
  Record<string, never>,
  CotrafDashboardDto
>

/**
 * Référence dynamique : l'interface peut être livrée avant la prochaine
 * régénération de l'API Convex, sans introduire de données locales de repli.
 */
const cotrafApi = (
  api as unknown as {
    modules: {
      cotraf: {
        queries: {
          dashboard: CotrafDashboardReference
        }
      }
    }
  }
).modules.cotraf.queries

const E2E_MODE =
  process.env.NODE_ENV !== "production" &&
  process.env.NEXT_PUBLIC_E2E_MODE === "1"

const E2E_EMPTY_DASHBOARD = {
  moduleCode: "cotraf",
  dataState: "empty",
  accessibleSiteIds: [],
  generatedAt: 0,
  dataset: null,
  kpis: [],
  stations: [],
  movements: [],
  segments: [],
  events: [],
  conflicts: [],
} satisfies CotrafDashboardDto

const NUMBER_FORMATTER = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 1,
})

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Africa/Libreville",
})

const TIME_FORMATTER = new Intl.DateTimeFormat("fr-FR", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "Africa/Libreville",
})

const KPI_TONE_CLASS = {
  neutral: "text-ink",
  positive: "text-success-ink",
  warning: "text-warning-ink",
  critical: "text-danger-ink",
} as const

// Variables de la charte : les marches restent lisibles en clair comme en sombre.
const MOVEMENT_COLORS = ["var(--c-accent)", "var(--c-warning)", "var(--c-success)", "var(--c-second)", "var(--c-danger)"]

function humanizeCode(value: string) {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/^./, (letter) => letter.toLocaleUpperCase("fr-FR"))
}

function formatDateTime(value?: number) {
  if (value === undefined || value === 0) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return {
    iso: date.toISOString(),
    label: DATE_TIME_FORMATTER.format(date),
  }
}

function formatTime(value: number) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "—" : TIME_FORMATTER.format(date)
}

function segmentVariant(
  status: CotrafDashboardDto["segments"][number]["status"]
) {
  if (status === "bloque") return "destructive" as const
  if (status === "occupe") return "warning" as const
  if (status === "reserve") return "info" as const
  return "success" as const
}

function movementVariant(
  status: CotrafDashboardDto["movements"][number]["status"]
) {
  if (status === "retenu") return "warning" as const
  if (status === "en_ligne") return "info" as const
  if (status === "arrive") return "success" as const
  return "outline" as const
}

function CotrafDashboardLoading() {
  return (
    <div
      role="status"
      aria-label="Chargement des données COTRAF"
      className="grid gap-4"
    >
      <Skeleton className="h-24 w-full" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
      <Skeleton className="h-96 w-full" />
    </div>
  )
}

function SyntheticDatasetBanner({
  dataset,
}: {
  dataset: CotrafDashboardDto["dataset"]
}) {
  const referenceAt = formatDateTime(dataset?.referenceAt)

  return (
    <section aria-labelledby="cotraf-demo-title" className="grid gap-3">
      <InlineMessage
        tone="warning"
        title="Données synthétiques de démonstration"
        className="border border-l-[5px] border-warning/30"
      >
        {dataset?.notice ??
          "Scénario fictif destiné à valider l’ergonomie COTRAF. Il ne décrit aucune circulation réelle de la SETRAG."}
      </InlineMessage>
      <div className="text-small flex flex-col gap-2 rounded-md border border-warning/30 bg-warning-soft px-4 py-3 text-warning-ink sm:flex-row sm:items-start sm:justify-between">
        <div className="grid gap-1">
          <p id="cotraf-demo-title" className="font-semibold">
            {dataset?.label ?? "Jeu de données COTRAF de démonstration"}
          </p>
          <p>
            Convention kilométrique : {dataset?.pkConvention ?? "non précisée"}
          </p>
          {referenceAt ? (
            <p>
              Situation de référence :{" "}
              <time dateTime={referenceAt.iso}>{referenceAt.label}</time>
            </p>
          ) : null}
        </div>
        <Badge variant="warning" className="w-fit shrink-0">
          SYNTHÉTIQUE · NON OFFICIEL
        </Badge>
      </div>
      {dataset && dataset.referenceSources.length > 0 ? (
        <p className="text-caption text-ink-subtle">
          Sources publiques de calibration :{" "}
          {dataset.referenceSources.map((source, index) => (
            <span key={source.url}>
              {index > 0 ? " · " : null}
              <a
                href={source.url}
                target="_blank"
                rel="noreferrer"
                className="font-semibold underline underline-offset-4 hover:text-ink"
              >
                {source.label}
              </a>
            </span>
          ))}
        </p>
      ) : null}
    </section>
  )
}

function CotrafKpis({ kpis }: { kpis: CotrafDashboardDto["kpis"] }) {
  if (kpis.length === 0) return null

  return (
    <section aria-labelledby="cotraf-kpis-title" className="grid gap-3">
      <div>
        <h2 id="cotraf-kpis-title" className="text-h3">
          Situation d’exploitation
        </h2>
        <p className="text-small mt-1 text-ink-muted">
          Indicateurs calculés côté serveur pour le périmètre COTRAF autorisé.
        </p>
      </div>
      <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.code} className="border-line bg-surface">
            <CardContent className="flex items-start justify-between gap-3 p-4">
              <div>
                <dt className="text-small text-ink-muted">{kpi.label}</dt>
                <dd
                  className={`mt-2 flex items-baseline gap-2 ${KPI_TONE_CLASS[kpi.tone]}`}
                >
                  <span className="text-2xl font-black tabular-nums">
                    {NUMBER_FORMATTER.format(kpi.value)}
                  </span>
                  {kpi.unit ? (
                    <span className="text-small font-semibold">{kpi.unit}</span>
                  ) : null}
                </dd>
                <p className="text-caption text-ink-subtle mt-2">
                  {kpi.description}
                </p>
              </div>
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-ink">
                <Gauge aria-hidden className="size-4" />
              </span>
            </CardContent>
          </Card>
        ))}
      </dl>
    </section>
  )
}

function TimeDistanceChart({
  stations,
  movements,
}: {
  stations: CotrafDashboardDto["stations"]
  movements: CotrafDashboardDto["movements"]
}) {
  const chartMovements = movements
    .map((movement) => ({
      movement,
      points: [...movement.trajectory]
        .map((point) => ({
          ...point,
          plottedAt: point.forecastAt ?? point.plannedAt,
        }))
        .filter(
          (point) =>
            Number.isFinite(point.plottedAt) &&
            Number.isFinite(point.kilometerPoint)
        )
        .sort((left, right) => left.plottedAt - right.plottedAt),
    }))
    .filter(({ points }) => points.length > 0)

  if (chartMovements.length === 0) {
    return (
      <EmptyState
        title="Aucune trajectoire disponible"
        description="Aucun horaire de circulation exploitable n’a été fourni par le serveur."
      />
    )
  }

  const allPoints = chartMovements.flatMap(({ points }) => points)
  const observedTimes = allPoints.map((point) => point.plottedAt)
  const rawMinTime = Math.min(...observedTimes)
  const rawMaxTime = Math.max(...observedTimes)
  const timePadding = rawMinTime === rawMaxTime ? 30 * 60 * 1000 : 0
  const minTime = rawMinTime - timePadding
  const maxTime = rawMaxTime + timePadding
  const timeRange = Math.max(1, maxTime - minTime)
  const maxPk = Math.max(
    1,
    ...stations.map((station) => station.kilometerPoint),
    ...allPoints.map((point) => point.kilometerPoint)
  )
  const width = 1000
  const height = 390
  const left = 120
  const right = 968
  const top = 30
  const bottom = 330
  const xFor = (time: number) =>
    left + ((time - minTime) / timeRange) * (right - left)
  const yFor = (pk: number) => top + (pk / maxPk) * (bottom - top)
  const timeTicks = Array.from(
    { length: 5 },
    (_, index) => minTime + (timeRange * index) / 4
  )

  return (
    <div className="grid gap-4">
      <div className="bg-surface-raised w-full overflow-x-auto rounded-md border border-line p-3">
        <svg
          role="img"
          aria-labelledby="cotraf-chart-title"
          aria-describedby="cotraf-chart-description"
          data-testid="cotraf-time-distance-chart"
          viewBox={`0 0 ${width} ${height}`}
          className="h-auto min-w-[720px]"
        >
          <title id="cotraf-chart-title">
            Graphique espace-temps des circulations COTRAF
          </title>
          <desc id="cotraf-chart-description">
            Le temps progresse horizontalement et le point kilométrique
            verticalement. Chaque ligne représente la trajectoire prévue ou
            prévisionnelle d’un train.
          </desc>

          <rect x="0" y="0" width={width} height={height} fill="white" rx="8" />

          {stations.map((station) => {
            const y = yFor(station.kilometerPoint)
            return (
              <g key={station.code}>
                <line
                  x1={left}
                  x2={right}
                  y1={y}
                  y2={y}
                  stroke="var(--c-line-strong)"
                  strokeDasharray="4 5"
                />
                <text
                  x={left - 10}
                  y={y + 4}
                  textAnchor="end"
                  fontSize="12"
                  fill="var(--c-ink-muted)"
                >
                  {station.name} · PK{" "}
                  {NUMBER_FORMATTER.format(station.kilometerPoint)}
                </text>
              </g>
            )
          })}

          {timeTicks.map((time) => {
            const x = xFor(time)
            return (
              <g key={time}>
                <line x1={x} x2={x} y1={top} y2={bottom} stroke="var(--c-line)" />
                <text
                  x={x}
                  y={bottom + 24}
                  textAnchor="middle"
                  fontSize="12"
                  fill="var(--c-ink-muted)"
                >
                  {formatTime(time)}
                </text>
              </g>
            )
          })}

          <text
            x={(left + right) / 2}
            y={height - 10}
            textAnchor="middle"
            fontSize="12"
            fontWeight="600"
            fill="var(--c-ink)"
          >
            Heure locale · Libreville
          </text>
          <text
            x="18"
            y={(top + bottom) / 2}
            textAnchor="middle"
            fontSize="12"
            fontWeight="600"
            fill="var(--c-ink)"
            transform={`rotate(-90 18 ${(top + bottom) / 2})`}
          >
            Point kilométrique
          </text>

          {chartMovements.map(({ movement, points }, index) => {
            const color = MOVEMENT_COLORS[index % MOVEMENT_COLORS.length]
            const polylinePoints = points
              .map(
                (point) =>
                  `${xFor(point.plottedAt)},${yFor(point.kilometerPoint)}`
              )
              .join(" ")

            return (
              <g key={movement.id}>
                {points.length > 1 ? (
                  <polyline
                    points={polylinePoints}
                    fill="none"
                    stroke={color}
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ) : null}
                {points.map((point) => (
                  <circle
                    key={`${movement.id}-${point.stationCode}-${point.plottedAt}`}
                    cx={xFor(point.plottedAt)}
                    cy={yFor(point.kilometerPoint)}
                    r="5"
                    fill={color}
                    stroke="white"
                    strokeWidth="2"
                  >
                    <title>
                      {movement.trainNumber} · {point.stationName} · PK{" "}
                      {NUMBER_FORMATTER.format(point.kilometerPoint)} ·{" "}
                      {formatTime(point.plottedAt)}
                    </title>
                  </circle>
                ))}
                {points[0] ? (
                  <text
                    x={xFor(points[0].plottedAt) + 8}
                    y={yFor(points[0].kilometerPoint) - 9}
                    fontSize="12"
                    fontWeight="700"
                    fill={color}
                  >
                    {movement.trainNumber}
                  </text>
                ) : null}
              </g>
            )
          })}
        </svg>
      </div>

      <div className="relative overflow-x-auto">
        <Table aria-label="Alternative textuelle du graphique espace-temps">
          <TableCaption>
            Alternative textuelle du graphique : horaires prévus et
            prévisionnels par train et par gare.
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Circulation</TableHead>
              <TableHead>État</TableHead>
              <TableHead>Gare / PK</TableHead>
              <TableHead>Prévu</TableHead>
              <TableHead>Prévision</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {chartMovements.flatMap(({ movement, points }) =>
              points.map((point) => {
                const planned = formatDateTime(point.plannedAt)
                const forecast = formatDateTime(point.forecastAt)
                return (
                  <TableRow
                    key={`${movement.id}-${point.stationCode}-${point.plottedAt}`}
                  >
                    <TableCell className="min-w-44 align-top whitespace-normal">
                      <p className="font-mono text-xs font-semibold text-ink">
                        {movement.trainNumber} · {movement.movementCode}
                      </p>
                      <p className="text-caption text-ink-muted">
                        {movement.originLabel} → {movement.destinationLabel}
                      </p>
                    </TableCell>
                    <TableCell className="align-top">
                      <Badge variant={movementVariant(movement.status)}>
                        {humanizeCode(movement.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="min-w-40 align-top whitespace-normal">
                      {point.stationName} · PK{" "}
                      {NUMBER_FORMATTER.format(point.kilometerPoint)}
                    </TableCell>
                    <TableCell className="min-w-36 align-top">
                      {planned ? (
                        <time dateTime={planned.iso}>{planned.label}</time>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="min-w-36 align-top">
                      {forecast ? (
                        <time dateTime={forecast.iso}>{forecast.label}</time>
                      ) : (
                        "Identique au prévu"
                      )}
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

function CirculationPanel({
  stations,
  movements,
}: {
  stations: CotrafDashboardDto["stations"]
  movements: CotrafDashboardDto["movements"]
}) {
  return (
    <Card className="min-w-0 border-line bg-surface">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base text-ink">
          <Activity aria-hidden className="size-5 text-ink-muted" />
          Graphique espace-temps · voie unique
        </CardTitle>
        <p className="text-small text-ink-muted">
          Trajectoires calculées sur les horaires prévus et leurs dernières
          prévisions serveur.
        </p>
      </CardHeader>
      <CardContent>
        <TimeDistanceChart stations={stations} movements={movements} />
      </CardContent>
    </Card>
  )
}

function SegmentsPanel({
  segments,
}: {
  segments: CotrafDashboardDto["segments"]
}) {
  return (
    <Card className="min-w-0 overflow-hidden border-line bg-surface">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base text-ink">
          <Route aria-hidden className="size-5 text-ink-muted" />
          Cantons et occupation de la voie
        </CardTitle>
      </CardHeader>
      <CardContent>
        {segments.length === 0 ? (
          <EmptyState
            title="Aucun canton renseigné"
            description="Le serveur n’a fourni aucun état d’occupation pour le périmètre autorisé."
          />
        ) : (
          <div className="relative overflow-x-auto">
            <Table aria-label="État des cantons COTRAF">
              <TableHeader>
                <TableRow>
                  <TableHead>Canton</TableHead>
                  <TableHead>État</TableHead>
                  <TableHead>Circulation</TableHead>
                  <TableHead>Temporalité</TableHead>
                  <TableHead>Consigne</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {segments.map((segment) => {
                  const enteredAt = formatDateTime(segment.enteredAt)
                  const releaseAt = formatDateTime(segment.expectedReleaseAt)
                  return (
                    <TableRow key={segment.id}>
                      <TableCell className="min-w-52 align-top whitespace-normal">
                        <p className="font-mono text-xs font-semibold text-ink">
                          {segment.segmentCode}
                        </p>
                        <p className="text-small font-semibold">
                          {segment.fromStationName} → {segment.toStationName}
                        </p>
                        <p className="text-caption text-ink-muted">
                          PK {NUMBER_FORMATTER.format(segment.fromKm)} à PK{" "}
                          {NUMBER_FORMATTER.format(segment.toKm)}
                        </p>
                      </TableCell>
                      <TableCell className="align-top">
                        <Badge variant={segmentVariant(segment.status)}>
                          {humanizeCode(segment.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="align-top font-mono text-xs">
                        {segment.movementCode ?? "—"}
                      </TableCell>
                      <TableCell className="min-w-44 align-top text-xs">
                        {enteredAt ? (
                          <p>
                            Entrée :{" "}
                            <time dateTime={enteredAt.iso}>
                              {enteredAt.label}
                            </time>
                          </p>
                        ) : null}
                        {releaseAt ? (
                          <p>
                            Libération :{" "}
                            <time dateTime={releaseAt.iso}>
                              {releaseAt.label}
                            </time>
                          </p>
                        ) : null}
                        {!enteredAt && !releaseAt ? "—" : null}
                      </TableCell>
                      <TableCell className="min-w-52 align-top whitespace-normal">
                        {segment.speedLimitKph ? (
                          <p className="font-semibold">
                            Limite{" "}
                            {NUMBER_FORMATTER.format(segment.speedLimitKph)}
                            {" km/h"}
                          </p>
                        ) : null}
                        <p className="text-caption text-ink-muted">
                          {segment.note}
                        </p>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ConflictsPanel({
  conflicts,
}: {
  conflicts: CotrafDashboardDto["conflicts"]
}) {
  if (conflicts.length === 0) {
    return (
      <InlineMessage
        tone="success"
        title="Aucun conflit de circulation détecté"
      >
        Les trajectoires fournies ne présentent pas de conflit ouvert sur le
        périmètre visible.
      </InlineMessage>
    )
  }

  return (
    <section aria-labelledby="cotraf-conflicts-title" className="grid gap-3">
      <div>
        <h2 id="cotraf-conflicts-title" className="text-h3">
          Conflits et croisements à arbitrer
        </h2>
        <p className="text-small mt-1 text-ink-muted">
          Fenêtres de circulation qui se recouvrent sur une même section de voie
          unique.
        </p>
      </div>
      <ul className="grid gap-3 lg:grid-cols-2">
        {conflicts.map((conflict) => {
          const startsAt = formatDateTime(conflict.startsAt)
          const endsAt = formatDateTime(conflict.endsAt)
          const critical = conflict.severity === "critical"
          return (
            <li
              key={conflict.key}
              role={critical ? "alert" : "status"}
              className={`grid grid-cols-[auto_1fr] gap-3 rounded-md border p-4 ${
                critical
                  ? "border-danger/30 bg-danger-soft text-danger-ink"
                  : "border-warning/30 bg-warning-soft text-warning-ink"
              }`}
            >
              <ArrowRightLeft aria-hidden className="mt-0.5 size-5" />
              <div className="grid gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">
                    {conflict.fromStationName} → {conflict.toStationName}
                  </span>
                  <Badge variant={critical ? "destructive" : "warning"}>
                    {critical ? "Critique" : "À surveiller"}
                  </Badge>
                </div>
                <p className="font-mono text-sm font-semibold">
                  {conflict.trainNumbers[0]} × {conflict.trainNumbers[1]}
                </p>
                <p className="text-caption">
                  {startsAt ? (
                    <time dateTime={startsAt.iso}>{startsAt.label}</time>
                  ) : (
                    "Début non renseigné"
                  )}
                  {" — "}
                  {endsAt ? (
                    <time dateTime={endsAt.iso}>{endsAt.label}</time>
                  ) : (
                    "fin non renseignée"
                  )}
                </p>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function EventsPanel({ events }: { events: CotrafDashboardDto["events"] }) {
  return (
    <Card className="border-line bg-surface">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base text-ink">
          <Radio aria-hidden className="size-5 text-ink-muted" />
          Main courante et événements COTRAF
        </CardTitle>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <EmptyState
            title="Aucun événement COTRAF disponible"
            description="La main courante ne contient aucun événement visible dans ce périmètre."
          />
        ) : (
          <ol className="grid gap-3">
            {events.map((event) => {
              const occurredAt = formatDateTime(event.occurredAt)
              const dueAt = formatDateTime(event.dueAt)
              const critical = event.severity === "critical"
              const warning = event.severity === "warning"
              const Icon = critical
                ? ShieldAlert
                : warning
                  ? AlertTriangle
                  : Clock3
              return (
                <li
                  key={event.id}
                  className="bg-surface-raised grid grid-cols-[auto_1fr] gap-3 rounded-md border border-line p-4"
                >
                  <span
                    className={`flex size-9 items-center justify-center rounded-full ${
                      critical
                        ? "bg-danger-soft text-danger-ink"
                        : warning
                          ? "bg-warning-soft text-warning-ink"
                          : "bg-info-soft text-info-ink"
                    }`}
                  >
                    <Icon aria-hidden className="size-4" />
                  </span>
                  <div className="grid gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{event.title}</span>
                      <Badge variant="outline">
                        {humanizeCode(event.category)}
                      </Badge>
                      <Badge
                        variant={
                          critical
                            ? "destructive"
                            : warning
                              ? "warning"
                              : "info"
                        }
                      >
                        {humanizeCode(event.severity)}
                      </Badge>
                      <Badge variant="secondary">
                        {humanizeCode(event.status)}
                      </Badge>
                    </div>
                    <p className="text-small text-ink-muted">{event.message}</p>
                    <div className="text-caption text-ink-subtle flex flex-wrap gap-x-4 gap-y-1">
                      <span className="inline-flex items-center gap-1">
                        <MapPin aria-hidden className="size-3.5" />
                        {event.siteLabel}
                      </span>
                      {occurredAt ? (
                        <span>
                          Événement :{" "}
                          <time dateTime={occurredAt.iso}>
                            {occurredAt.label}
                          </time>
                        </span>
                      ) : null}
                      {dueAt ? (
                        <span>
                          Échéance :{" "}
                          <time dateTime={dueAt.iso}>{dueAt.label}</time>
                        </span>
                      ) : null}
                      {event.primaryTrainNumber ? (
                        <span>
                          Trains : {event.primaryTrainNumber}
                          {event.secondaryTrainNumber
                            ? ` × ${event.secondaryTrainNumber}`
                            : ""}
                        </span>
                      ) : null}
                      {event.estimatedGainMinutes !== undefined ? (
                        <span>
                          Gain estimé : {event.estimatedGainMinutes} min
                        </span>
                      ) : null}
                    </div>
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}

function EmptyCotrafDashboard() {
  return (
    <div className="grid gap-6">
      <Card className="border-line bg-surface">
        <CardHeader>
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-full bg-accent-soft text-accent-ink">
              <Database aria-hidden className="size-5" />
            </span>
            <div className="grid gap-1">
              <CardTitle className="text-base text-ink">
                Socle COTRAF sécurisé
              </CardTitle>
              <p className="text-small text-ink-muted">
                Le module est actif, mais aucune circulation autorisée n’est
                disponible.
              </p>
            </div>
          </div>
        </CardHeader>
      </Card>
      <Card className="border-line bg-surface">
        <CardContent className="p-6">
          <EmptyState
            title="Aucune donnée COTRAF disponible"
            description="Le tableau de bord est prêt à recevoir les mouvements, cantons et événements validés côté serveur."
            action={
              <span className="text-caption text-ink-subtle">
                Aucun train ni état de voie de démonstration n’est substitué aux
                données manquantes.
              </span>
            }
          />
        </CardContent>
      </Card>
    </div>
  )
}

export function CotrafDashboardScreen({
  dashboard,
}: {
  dashboard: CotrafDashboardDto
}) {
  const itemCount =
    dashboard.kpis.length +
    dashboard.movements.length +
    dashboard.segments.length +
    dashboard.events.length +
    dashboard.conflicts.length

  if (dashboard.dataState === "empty" && itemCount === 0) {
    return <EmptyCotrafDashboard />
  }

  const generatedAt = formatDateTime(dashboard.generatedAt)

  return (
    <div className="grid gap-6">
      {dashboard.dataState === "synthetic_demo" ? (
        <SyntheticDatasetBanner dataset={dashboard.dataset} />
      ) : null}

      <div className="text-caption flex flex-wrap items-center justify-between gap-2 text-ink-muted">
        <span className="inline-flex items-center gap-1.5">
          <TrainFront aria-hidden className="size-4" />
          {dashboard.movements.length.toLocaleString("fr-FR")} circulation(s) ·{" "}
          {dashboard.segments.length.toLocaleString("fr-FR")} canton(s)
        </span>
        {generatedAt ? (
          <span>
            Situation générée le{" "}
            <time dateTime={generatedAt.iso}>{generatedAt.label}</time>
          </span>
        ) : null}
      </div>

      <CotrafKpis kpis={dashboard.kpis} />
      <CirculationPanel
        stations={dashboard.stations}
        movements={dashboard.movements}
      />
      <ConflictsPanel conflicts={dashboard.conflicts} />
      <SegmentsPanel segments={dashboard.segments} />
      <EventsPanel events={dashboard.events} />
    </div>
  )
}

export function CotrafDashboardPage() {
  const liveDashboard = useQuery(cotrafApi.dashboard, E2E_MODE ? "skip" : {})
  const dashboard = E2E_MODE ? E2E_EMPTY_DASHBOARD : liveDashboard

  return (
    <EnterpriseShell
      title="Poste de Commande Centralisé (COTRAF)"
      subtitle="Supervision des circulations, cantons et croisements sur la voie unique Owendo–Franceville"
    >
      {dashboard === undefined ? (
        <CotrafDashboardLoading />
      ) : (
        <CotrafDashboardScreen dashboard={dashboard} />
      )}
    </EnterpriseShell>
  )
}
