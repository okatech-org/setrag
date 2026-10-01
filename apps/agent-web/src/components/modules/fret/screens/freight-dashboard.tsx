"use client"

import type { FunctionReturnType } from "convex/server"
import {
  Boxes,
  Clock3,
  Database,
  Gauge,
  MapPin,
  Route,
  ShieldAlert,
  ShieldCheck,
  TrainFront,
  TriangleAlert,
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

const E2E_MODE =
  process.env.NODE_ENV !== "production" &&
  process.env.NEXT_PUBLIC_E2E_MODE === "1"

export type FreightDashboard = FunctionReturnType<
  typeof api.modules.fret.queries.dashboard
>

const E2E_EMPTY_DASHBOARD = {
  moduleCode: "fret",
  dataState: "empty",
  accessibleSiteIds: [],
  dataset: null,
  kpis: [],
  operations: [],
  alerts: [],
} satisfies FreightDashboard

const NUMBER_FORMATTER = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 2,
})

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Africa/Libreville",
})

const DATE_FORMATTER = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "long",
  timeZone: "Africa/Libreville",
})

function clampProgress(value?: number) {
  if (value === undefined || !Number.isFinite(value)) return undefined
  return Math.min(100, Math.max(0, Math.round(value)))
}

function formatDateTime(value?: number | string) {
  if (value === undefined) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return {
    iso: date.toISOString(),
    label: DATE_TIME_FORMATTER.format(date),
  }
}

function formatDate(value?: number | string) {
  if (value === undefined) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return {
    iso: date.toISOString(),
    label: DATE_FORMATTER.format(date),
  }
}

function humanizeCode(value?: string, fallback = "Non renseigné") {
  if (!value) return fallback
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/^./, (letter) => letter.toLocaleUpperCase("fr-FR"))
}

function formatPriority(priority?: number) {
  if (priority === undefined) return null
  return `Priorité P${priority}`
}

function statusVariant(status: string) {
  const normalized = status.toLocaleLowerCase("fr-FR")
  if (
    normalized.includes("termin") ||
    normalized === "livre" ||
    normalized.includes("arriv")
  ) {
    return "success" as const
  }
  if (
    normalized.includes("retard") ||
    normalized.includes("suspend") ||
    normalized.includes("bloqu")
  ) {
    return "warning" as const
  }
  if (
    normalized.includes("ligne") ||
    normalized.includes("route") ||
    normalized.includes("cours") ||
    normalized.includes("livraison")
  ) {
    return "info" as const
  }
  return "outline" as const
}

function safetyVariant(safetyState?: string) {
  const normalized = safetyState?.toLocaleLowerCase("fr-FR") ?? ""
  if (
    normalized.includes("bloqu") ||
    normalized.includes("stop") ||
    normalized.includes("crit")
  ) {
    return "destructive" as const
  }
  if (
    normalized.includes("vigil") ||
    normalized.includes("surveill") ||
    normalized.includes("attention") ||
    normalized.includes("controle")
  ) {
    return "warning" as const
  }
  if (
    normalized.includes("conforme") ||
    normalized.includes("valid") ||
    normalized.includes("autoris")
  ) {
    return "success" as const
  }
  return "secondary" as const
}

function FreightDashboardLoading() {
  return (
    <div
      role="status"
      aria-label="Chargement des données Fret"
      className="grid gap-4"
    >
      <Skeleton className="h-24 w-full" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
      <Skeleton className="h-72 w-full" />
    </div>
  )
}

function SyntheticDatasetBanner({
  dataset,
}: {
  dataset: FreightDashboard["dataset"]
}) {
  const scenarioDate = formatDate(dataset?.scenarioDate)

  return (
    <section aria-labelledby="fret-demo-title" className="grid gap-3">
      <InlineMessage
        tone="warning"
        title="Données synthétiques de démonstration"
        className="border border-l-[5px] border-warning/30"
      >
        {dataset?.description ??
          "Scénario fictif inspiré de l’activité ferroviaire gabonaise. Ces informations ne décrivent ni le trafic réel ni les engagements contractuels de la SETRAG."}
      </InlineMessage>
      <div className="text-small flex flex-col gap-2 rounded-md border border-line bg-surface px-4 py-3 text-ink-muted sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p id="fret-demo-title" className="font-semibold text-ink">
            {dataset?.label ?? "Jeu de données Fret de démonstration"}
          </p>
          <p>
            Période de référence : {dataset?.referencePeriod ?? "non précisée"}
          </p>
          {dataset?.routeLabel ? (
            <p>
              Périmètre : {dataset.routeLabel}
              {dataset.routeLengthKm
                ? ` · ${NUMBER_FORMATTER.format(dataset.routeLengthKm)} km`
                : ""}
            </p>
          ) : null}
        </div>
        {scenarioDate ? (
          <p className="text-caption shrink-0">
            Date du scénario :{" "}
            <time dateTime={scenarioDate.iso}>{scenarioDate.label}</time>
          </p>
        ) : null}
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

function FreightKpis({ kpis }: { kpis: FreightDashboard["kpis"] }) {
  if (kpis.length === 0) return null

  return (
    <section aria-labelledby="fret-kpis-title" className="grid gap-3">
      <div>
        <h2 id="fret-kpis-title" className="text-h3">
          Indicateurs du scénario
        </h2>
        <p className="text-small mt-1 text-ink-muted">
          Vue synthétique calculée exclusivement à partir du jeu de
          démonstration.
        </p>
      </div>
      <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.code} className="border-line bg-surface">
            <CardContent className="flex items-start justify-between gap-3 pt-6">
              <div className="min-w-0">
                <dt className="text-small text-ink-muted">{kpi.label}</dt>
                <dd className="mt-2 flex flex-wrap items-baseline gap-x-2 text-ink">
                  <span className="text-h2 tabular-nums">
                    {NUMBER_FORMATTER.format(kpi.value)}
                  </span>
                  {kpi.unit ? (
                    <span className="text-small font-semibold">{kpi.unit}</span>
                  ) : null}
                </dd>
                {kpi.description ? (
                  <p className="text-caption text-ink-subtle mt-2">
                    {kpi.description}
                  </p>
                ) : null}
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

function OperationProgress({
  operation,
}: {
  operation: FreightDashboard["operations"][number]
}) {
  const progress = clampProgress(operation.routeProgressPct)
  const priority = formatPriority(operation.priority)

  return (
    <div className="grid min-w-44 gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={statusVariant(operation.status)}>
          {humanizeCode(operation.status)}
        </Badge>
        {priority ? <Badge variant="outline">{priority}</Badge> : null}
      </div>
      {progress !== undefined ? (
        <div className="grid gap-1">
          <div className="text-caption flex items-center justify-between gap-3 text-ink-muted">
            <span>Progression</span>
            <span className="tabular-nums">{progress} %</span>
          </div>
          <div
            role="progressbar"
            aria-label={`Progression du convoi ${operation.trainNumber}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            className="h-2 overflow-hidden rounded-full bg-surface-sunk"
          >
            <div
              aria-hidden
              className="h-full rounded-full bg-accent-base"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      ) : null}
      <span className="text-caption inline-flex items-center gap-1.5 whitespace-normal text-ink-muted">
        <MapPin aria-hidden className="size-3.5 shrink-0" />
        {operation.currentLocation}
      </span>
    </div>
  )
}

function FreightOperations({
  operations,
}: {
  operations: FreightDashboard["operations"]
}) {
  return (
    <Card className="min-w-0 overflow-hidden border-line bg-surface">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base text-ink">
          <TrainFront aria-hidden className="size-5 text-ink-muted" />
          Convois et flux marchandises
        </CardTitle>
      </CardHeader>
      <CardContent>
        {operations.length === 0 ? (
          <EmptyState
            title="Aucun convoi dans ce scénario"
            description="Le jeu de démonstration ne contient aucune opération Fret exploitable."
          />
        ) : (
          <Table>
            <TableCaption>
              Convois synthétiques — aucune donnée contractuelle ou de
              circulation réelle.
            </TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Convoi et flux</TableHead>
                <TableHead>Itinéraire</TableHead>
                <TableHead className="text-right">Chargement</TableHead>
                <TableHead>État et position</TableHead>
                <TableHead>Horaires</TableHead>
                <TableHead>Sécurité</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {operations.map((operation) => {
                const departure = formatDateTime(operation.scheduledDepartureAt)
                const arrival = formatDateTime(operation.scheduledArrivalAt)
                const lastEvent = formatDateTime(operation.lastEventAt)

                return (
                  <TableRow key={operation.id}>
                    <TableCell className="min-w-48 align-top whitespace-normal">
                      <div className="grid gap-1">
                        <span className="font-mono text-xs font-semibold text-ink">
                          {operation.trainNumber}
                          {` · ${operation.operationCode}`}
                        </span>
                        <span className="font-semibold text-ink">
                          {operation.cargoLabel}
                        </span>
                        <span className="text-caption text-ink-muted">
                          Segment scénario : {operation.clientSegment}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="min-w-52 align-top whitespace-normal">
                      <div className="grid gap-1.5">
                        <span className="inline-flex items-center gap-1.5 font-semibold text-ink">
                          <Route
                            aria-hidden
                            className="size-4 shrink-0 text-warning-ink"
                          />
                          {operation.origin} → {operation.destination}
                        </span>
                        <span className="text-caption text-ink-muted">
                          Corridor Transgabonais — scénario
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="min-w-36 text-right align-top">
                      <span className="font-semibold text-ink tabular-nums">
                        {NUMBER_FORMATTER.format(operation.quantity)}{" "}
                        {operation.quantityUnit}
                      </span>
                      <span className="text-caption mt-1 block text-ink-muted tabular-nums">
                        {NUMBER_FORMATTER.format(operation.wagonCount)} wagons ·{" "}
                        {NUMBER_FORMATTER.format(operation.locomotiveCount)}{" "}
                        loco.
                      </span>
                    </TableCell>
                    <TableCell className="align-top">
                      <OperationProgress operation={operation} />
                    </TableCell>
                    <TableCell className="min-w-48 align-top whitespace-normal">
                      <div className="text-caption grid gap-2">
                        <span className="inline-flex items-start gap-1.5">
                          <Clock3
                            aria-hidden
                            className="mt-0.5 size-3.5 shrink-0 text-ink-muted"
                          />
                          <span>
                            <span className="block text-ink-muted">
                              Départ programmé
                            </span>
                            {departure ? (
                              <time dateTime={departure.iso}>
                                {departure.label}
                              </time>
                            ) : (
                              "À confirmer"
                            )}
                          </span>
                        </span>
                        <span className="pl-5">
                          <span className="block text-ink-muted">
                            Arrivée estimée
                          </span>
                          {arrival ? (
                            <time dateTime={arrival.iso}>{arrival.label}</time>
                          ) : (
                            "À confirmer"
                          )}
                        </span>
                        {lastEvent ? (
                          <span className="pl-5 text-ink-muted">
                            Dernier événement :{" "}
                            <time dateTime={lastEvent.iso}>
                              {lastEvent.label}
                            </time>
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="align-top whitespace-normal">
                      <Badge variant={safetyVariant(operation.safetyStatus)}>
                        {humanizeCode(operation.safetyStatus)}
                      </Badge>
                      <span className="text-caption mt-2 block text-ink-muted">
                        Dossier : {humanizeCode(operation.documentStatus)}
                      </span>
                      <span className="text-caption mt-2 block max-w-52 text-ink-muted">
                        {operation.operationalNote}
                      </span>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

function FreightAlerts({ alerts }: { alerts: FreightDashboard["alerts"] }) {
  if (alerts.length === 0) {
    return (
      <InlineMessage tone="success" title="Aucune alerte dans ce scénario.">
        Aucun événement de sécurité ou d’exploitation n’est actuellement
        signalé.
      </InlineMessage>
    )
  }

  return (
    <section aria-labelledby="fret-alerts-title" className="grid gap-3">
      <div>
        <h2 id="fret-alerts-title" className="text-h3">
          Alertes sécurité et exploitation
        </h2>
        <p className="text-small mt-1 text-ink-muted">
          Situations fictives destinées à tester la priorisation opérationnelle.
        </p>
      </div>
      <ul className="grid gap-3 lg:grid-cols-2">
        {alerts.map((alert) => {
          const isCritical = alert.severity === "critical"
          const isWarning = alert.severity === "warning"
          const Icon = isCritical ? ShieldAlert : TriangleAlert
          const detectedAt = formatDateTime(alert.detectedAt)
          const dueAt = formatDateTime(alert.dueAt)

          return (
            <li
              key={alert.id}
              role={isCritical ? "alert" : "status"}
              className={`grid grid-cols-[auto_1fr] gap-3 rounded-md border p-4 ${
                isCritical
                  ? "border-danger/30 bg-danger-soft text-danger-ink"
                  : isWarning
                    ? "border-warning/30 bg-warning-soft text-warning-ink"
                    : "border-info/30 bg-info-soft text-info-ink"
              }`}
            >
              <Icon aria-hidden className="mt-0.5 size-5 shrink-0" />
              <div className="grid gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{alert.title}</span>
                  <Badge variant="outline">
                    {humanizeCode(alert.category)}
                  </Badge>
                  <Badge
                    variant={
                      isCritical
                        ? "destructive"
                        : isWarning
                          ? "warning"
                          : "info"
                    }
                  >
                    {humanizeCode(alert.severity)}
                  </Badge>
                  {alert.operationCode ? (
                    <Badge variant="outline" className="font-mono">
                      {alert.operationCode}
                    </Badge>
                  ) : null}
                </div>
                <p className="text-small">{alert.message}</p>
                <div className="text-caption flex flex-wrap gap-x-4 gap-y-1">
                  <span>Site : {alert.siteLabel}</span>
                  <span>État : {humanizeCode(alert.status)}</span>
                  {detectedAt ? (
                    <span>
                      Détectée le{" "}
                      <time dateTime={detectedAt.iso}>{detectedAt.label}</time>
                    </span>
                  ) : null}
                  {dueAt ? (
                    <span className="font-semibold">
                      Échéance : <time dateTime={dueAt.iso}>{dueAt.label}</time>
                    </span>
                  ) : null}
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function EmptyFreightDashboard() {
  return (
    <div className="grid gap-6">
      <Card className="border-line bg-surface">
        <CardHeader>
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-full bg-accent-soft text-accent-ink">
              <ShieldCheck aria-hidden className="size-5" />
            </span>
            <div className="grid gap-1">
              <CardTitle className="text-base text-ink">
                Socle Fret sécurisé
              </CardTitle>
              <p className="text-small text-ink-muted">
                Les données affichées proviennent du module Fret autorisé côté
                serveur.
              </p>
            </div>
          </div>
        </CardHeader>
      </Card>
      <Card className="border-line bg-surface">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-ink">
            <Database aria-hidden className="size-5 text-ink-muted" />
            Activité Fret
          </CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            title="Aucune donnée Fret disponible"
            description="Le module est actif et prêt à recevoir les premiers programmes, ordres et événements opérationnels validés."
            action={
              <span className="text-caption text-ink-subtle">
                Aucun chiffre de démonstration n’est substitué aux données
                manquantes.
              </span>
            }
          />
        </CardContent>
      </Card>
    </div>
  )
}

export function FreightDashboardScreen({
  dashboard,
}: {
  dashboard: FreightDashboard
}) {
  const itemCount =
    dashboard.kpis.length +
    dashboard.operations.length +
    dashboard.alerts.length

  if (dashboard.dataState === "empty" && itemCount === 0) {
    return <EmptyFreightDashboard />
  }

  return (
    <div className="grid gap-6">
      {dashboard.dataState === "synthetic_demo" ? (
        <SyntheticDatasetBanner dataset={dashboard.dataset} />
      ) : null}
      <FreightKpis kpis={dashboard.kpis} />
      <FreightOperations operations={dashboard.operations} />
      <FreightAlerts alerts={dashboard.alerts} />
      <p className="text-caption text-ink-subtle inline-flex items-center gap-2">
        <Boxes aria-hidden className="size-4" />
        {dashboard.operations.length.toLocaleString("fr-FR")} convoi(s),{" "}
        {dashboard.alerts.length.toLocaleString("fr-FR")} alerte(s) dans le jeu
        affiché.
      </p>
    </div>
  )
}

export function FreightDashboardPage() {
  const liveDashboard = useQuery(
    api.modules.fret.queries.dashboard,
    E2E_MODE ? "skip" : {}
  )
  const dashboard = E2E_MODE ? E2E_EMPTY_DASHBOARD : liveDashboard

  return (
    <EnterpriseShell
      title="Fret & Marchandises"
      subtitle="Pilotage des flux miniers, bois, hydrocarbures et marchandises sur le corridor Transgabonais"
    >
      {dashboard === undefined ? (
        <FreightDashboardLoading />
      ) : (
        <FreightDashboardScreen dashboard={dashboard} />
      )}
    </EnterpriseShell>
  )
}
