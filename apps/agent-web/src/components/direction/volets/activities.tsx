import type { ReactNode } from "react"
import Link from "next/link"

import { Button } from "@workspace/ui/components/button"
import { EmptyState } from "@workspace/ui/components/empty-state"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { Tag } from "@workspace/ui/components/tag"

import { formatTime } from "@/lib/format"

import { BarSeries, BreakdownBars } from "../charts"
import { DIRECTIONS } from "../direction-map"
import { formatDay } from "../executive-period"
import type {
  CotrafDashboard,
  ExecutiveOverviewDto,
  ExecutiveSourceState,
  FreightDashboard,
  ServiceTrip,
} from "../executive-dto"
import { LineSynoptic } from "../line-synoptic"
import { MetricCard, MetricGrid } from "../metric-card"
import { ProvenanceSummary, ProvenanceTag } from "../provenance"
import { PassengerPeriodControl } from "./overview"
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

type CotrafMovement = CotrafDashboard["movements"][number]
type CotrafSegment = CotrafDashboard["segments"][number]
type ConstrainedSegmentStatus = "occupe" | "bloque" | "reserve"
type FreightOperation = FreightDashboard["operations"][number]
type FreightAlert = FreightDashboard["alerts"][number]

function serviceTypeLabel(serviceType: CotrafMovement["serviceType"]): string {
  switch (serviceType) {
    case "voyageurs":
      return "Voyageurs"
    case "minerai":
      return "Minerai"
    case "bois":
      return "Bois"
    case "hydrocarbures":
      return "Hydrocarbures"
    case "service":
      return "Service"
  }
}

function movementStatusLabel(status: CotrafMovement["status"]): string {
  switch (status) {
    case "planifie":
      return "Planifiée"
    case "en_ligne":
      return "En ligne"
    case "retenu":
      return "Retenue"
    case "arrive":
      return "Arrivée"
  }
}

function movementDirectionLabel(
  direction: CotrafMovement["direction"]
): string {
  return direction === "croissant" ? "vers Franceville" : "vers Owendo"
}

function segmentStatusLabel(status: CotrafSegment["status"]): string {
  switch (status) {
    case "libre":
      return "Libre"
    case "reserve":
      return "Réservé"
    case "occupe":
      return "Occupé"
    case "bloque":
      return "Bloqué"
  }
}

function isConstrainedSegment(
  segment: CotrafSegment
): segment is CotrafSegment & { status: ConstrainedSegmentStatus } {
  return (
    segment.status === "occupe" ||
    segment.status === "bloque" ||
    segment.status === "reserve"
  )
}

function constrainedSegmentTone(
  status: ConstrainedSegmentStatus
): "warning" | "neutral" {
  return status === "bloque" ? "warning" : "neutral"
}

function conflictSeverityLabel(
  severity: CotrafDashboard["conflicts"][number]["severity"]
): string {
  return severity === "critical" ? "critique" : "à surveiller"
}

function conflictSeverityTone(
  severity: CotrafDashboard["conflicts"][number]["severity"]
): "danger" | "warning" {
  return severity === "critical" ? "danger" : "warning"
}

function serviceTripStatusLabel(status: ServiceTrip["status"]): string {
  switch (status) {
    case "planifie":
      return "Planifiée"
    case "a_lheure":
      return "À l’heure"
    case "retarde":
      return "Retardée"
    case "annule":
      return "Annulée"
    case "termine":
      return "Terminée"
  }
}

function freightOperationStatusLabel(status: FreightOperation["status"]) {
  switch (status) {
    case "planifie":
      return "Planifiée"
    case "chargement":
      return "Chargement"
    case "en_ligne":
      return "En ligne"
    case "livraison":
      return "Livraison"
    case "livre":
      return "Livrée"
    case "retarde":
      return "Retardée"
  }
}

function freightSafetyLabel(status: FreightOperation["safetyStatus"]) {
  switch (status) {
    case "conforme":
      return "Conforme"
    case "controle_requis":
      return "Contrôle requis"
    case "bloque":
      return "Bloqué"
  }
}

function freightDocumentLabel(status: FreightOperation["documentStatus"]) {
  switch (status) {
    case "complet":
      return "Complet"
    case "a_completer":
      return "À compléter"
    case "bloque":
      return "Bloqué"
  }
}

function freightAlertSeverityLabel(severity: FreightAlert["severity"]) {
  switch (severity) {
    case "information":
      return "Information"
    case "warning":
      return "Avertissement"
    case "critical":
      return "Critique"
  }
}

function freightAlertSeverityTone(
  severity: FreightAlert["severity"]
): "info" | "warning" | "danger" {
  switch (severity) {
    case "information":
      return "info"
    case "warning":
      return "warning"
    case "critical":
      return "danger"
  }
}

function freightAlertCategoryLabel(category: FreightAlert["category"]) {
  switch (category) {
    case "exploitation":
      return "Exploitation"
    case "securite":
      return "Sécurité"
    case "documentation":
      return "Documentation"
    case "capacite":
      return "Capacité"
  }
}

function freightAlertStatusLabel(status: FreightAlert["status"]) {
  switch (status) {
    case "ouverte":
      return "Ouverte"
    case "acquittee":
      return "Acquittée"
  }
}

function trainTypeLabel(trainType: string) {
  switch (trainType) {
    case "EXPRESS":
      return "Express"
    case "OMNIBUS":
      return "Omnibus"
    case "AUTORAIL":
      return "Autorail"
    case "SPECIAL":
      return "Spécial"
    default:
      return trainType
  }
}

function serviceClassLabel(serviceClass: string) {
  switch (serviceClass) {
    case "DEUXIEME":
      return "2e classe"
    case "PREMIERE":
      return "1re classe"
    case "VIP":
      return "VIP"
    default:
      return serviceClass
  }
}

/** Nombre de dessertes affichées dans le classement du remplissage. */
const OCCUPANCY_DISPLAY_LIMIT = 12

function delayLabel(minutes: number) {
  return minutes > 0 ? `+${NUMBER_FORMATTER.format(minutes)} min` : "0 min"
}

function clampProgressPct(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, Math.round(value)))
}

function stationName(data: ExecutiveOverviewDto, id: string) {
  return (
    data.network.stations.find((station) => station.id === id)?.name ??
    "Gare non identifiée"
  )
}

/**
 * Remplace le contenu d'un domaine par le message adapté à son état ; le
 * contenu réel (tables, listes) n'est rendu qu'en `operational`/`synthetic_demo`.
 */
function DomainGate({
  state,
  unavailableTitle,
  emptyTitle,
  emptyAction,
  children,
}: {
  state: ExecutiveSourceState
  unavailableTitle: string
  emptyTitle: string
  emptyAction?: ReactNode
  children: ReactNode
}) {
  switch (state) {
    case "loading":
      return (
        <p role="status" className="text-small text-ink-muted">
          Lecture…
        </p>
      )
    case "unavailable":
      return (
        <EmptyState
          title={unavailableTitle}
          description="Votre habilitation ne couvre pas cette source. L’administration peut l’attribuer en lecture."
          action={
            <Button asChild variant="secondary">
              <Link href="/administration">Voir mes habilitations</Link>
            </Button>
          }
        />
      )
    case "not_connected":
      return (
        <p className="text-small text-ink-muted">
          Non raccordé. Aucune source n’alimente encore ce domaine dans le
          système.
        </p>
      )
    case "empty":
      return <EmptyState title={emptyTitle} action={emptyAction} />
    default:
      return <>{children}</>
  }
}

function NotConnectedDirectionCard({
  code,
  data,
}: {
  code: "dmat" | "dinfra"
  data: ExecutiveOverviewDto
}) {
  const entry = DIRECTIONS.find((direction) => direction.code === code)
  if (!entry) return null
  const moduleVisible = entry.modules.some((moduleCode) =>
    data.modules.some((module) => module.code === moduleCode)
  )

  return (
    <div className="grid min-w-0 content-start gap-3 rounded-lg border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-h4">{entry.label}</h2>
        <ProvenanceTag state="not_connected" />
      </div>
      <p className="text-small text-ink-muted">{entry.notConnectedNote}</p>
      {entry.demoHref && entry.demoLabel && moduleVisible ? (
        <Button
          asChild
          variant="secondary"
          className="h-auto min-h-target justify-self-start py-2 text-left whitespace-normal"
        >
          <Link href={entry.demoHref}>{entry.demoLabel}</Link>
        </Button>
      ) : (
        <p className="text-small text-ink-muted">
          Module non accessible à ce compte.
        </p>
      )}
    </div>
  )
}

export function ActivitiesVolet({
  data,
  preset,
  onPresetChange,
}: ExecutiveVoletProps) {
  const cotrafKpis = data.cotraf.dashboard?.kpis ?? []
  const movements = data.cotraf.dashboard?.movements ?? []
  const conflicts = data.cotraf.dashboard?.conflicts ?? []
  const constrainedSegments = (data.cotraf.dashboard?.segments ?? []).filter(
    isConstrainedSegment
  )
  const constraintRowCount = conflicts.length + constrainedSegments.length
  const freightKpis = data.freight.dashboard?.kpis ?? []
  const freightOperations = data.freight.dashboard?.operations ?? []
  const freightAlerts = data.freight.dashboard?.alerts ?? []
  const datasetCaption = [data.cotraf.datasetLabel, data.cotraf.pkConvention]
    .filter((value): value is string => Boolean(value))
    .join(" · ")

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <p className="text-caption text-ink-muted">
        Organigramme selon l’étude 03 · à confirmer par SETRAG
      </p>

      <section
        aria-labelledby="def-titre"
        className="grid gap-4 rounded-lg border border-line bg-surface p-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 id="def-titre" className="text-h4">
            DEF · Exploitation ferroviaire
          </h2>
          <ProvenanceTag state={data.cotraf.state} />
        </div>
        {datasetCaption ? (
          <p className="text-caption text-ink-muted">
            Jeu de données : {datasetCaption}
          </p>
        ) : null}

        <MetricGrid label="Indicateurs d’exploitation ferroviaire">
          {cotrafKpis.length > 0 ? (
            cotrafKpis.map((kpi) => (
              <MetricCard
                key={kpi.code}
                label={kpi.label}
                value={NUMBER_FORMATTER.format(kpi.value)}
                unit={kpi.unit}
                supporting={kpi.description}
                state={data.cotraf.state}
              />
            ))
          ) : (
            <MetricCard
              label="Indicateurs d’exploitation"
              state={data.cotraf.state}
            />
          )}
        </MetricGrid>

        <LineSynoptic data={data} id="ligne" />

        <DomainGate
          state={data.cotraf.state}
          unavailableTitle="Circulations non accessibles à ce compte"
          emptyTitle="Aucune circulation ni conflit enregistrés sur la ligne."
        >
          <div className="grid gap-3 rounded-lg border border-line bg-surface p-5">
            <h3 className="text-h4">Circulations</h3>
            <Table>
              <TableCaption className="sr-only">
                Circulations enregistrées par le COTRAF
              </TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Train</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Sens</TableHead>
                  <TableHead>Origine → Destination</TableHead>
                  <TableHead>État</TableHead>
                  <TableHead className="text-right">PK</TableHead>
                  <TableHead className="text-right">Retard</TableHead>
                  <TableHead className="text-right">Priorité</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-ink-muted">
                      Aucune circulation enregistrée.
                    </TableCell>
                  </TableRow>
                ) : (
                  movements.map((movement) => (
                    <TableRow key={movement.id}>
                      <TableCell className="font-mono tabular-nums">
                        {movement.trainNumber}
                      </TableCell>
                      <TableCell>
                        {serviceTypeLabel(movement.serviceType)}
                      </TableCell>
                      <TableCell>
                        {movementDirectionLabel(movement.direction)}
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        {movement.originLabel} → {movement.destinationLabel}
                      </TableCell>
                      <TableCell>
                        {movementStatusLabel(movement.status)}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {typeof movement.currentPk === "number"
                          ? NUMBER_FORMATTER.format(movement.currentPk)
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {delayLabel(movement.delayMinutes)}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {NUMBER_FORMATTER.format(movement.priority)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="grid gap-3 rounded-lg border border-line bg-surface p-5">
            <h3 className="text-h4">Conflits et cantons contraints</h3>
            <Table>
              <TableCaption className="sr-only">
                Conflits et cantons contraints enregistrés par le COTRAF
              </TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Tronçon</TableHead>
                  <TableHead>Détail</TableHead>
                  <TableHead>État</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {constraintRowCount === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-ink-muted">
                      Aucun conflit ni canton contraint actuellement.
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                    {conflicts.map((conflict) => (
                      <TableRow key={`conflict-${conflict.key}`}>
                        <TableCell className="whitespace-normal">
                          {conflict.fromStationName}–{conflict.toStationName}
                        </TableCell>
                        <TableCell className="whitespace-normal">
                          {conflict.trainNumbers.join(" / ")}
                        </TableCell>
                        <TableCell>
                          <Tag tone={conflictSeverityTone(conflict.severity)}>
                            {conflictSeverityLabel(conflict.severity)}
                          </Tag>
                        </TableCell>
                      </TableRow>
                    ))}
                    {constrainedSegments.map((segment) => (
                      <TableRow key={`segment-${segment.id}`}>
                        <TableCell className="whitespace-normal">
                          {segment.fromStationName}–{segment.toStationName}
                        </TableCell>
                        <TableCell className="whitespace-normal">
                          {segment.note}
                        </TableCell>
                        <TableCell>
                          <Tag tone={constrainedSegmentTone(segment.status)}>
                            {segmentStatusLabel(segment.status)}
                          </Tag>
                        </TableCell>
                      </TableRow>
                    ))}
                  </>
                )}
              </TableBody>
            </Table>
          </div>
        </DomainGate>

        <div className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-h4">Dessertes voyageurs du jour</h3>
            <ProvenanceTag state={data.service.state} />
          </div>
          <DomainGate
            state={data.service.state}
            unavailableTitle="Dessertes voyageurs non accessibles à ce compte"
            emptyTitle="Aucune desserte voyageurs enregistrée aujourd’hui."
          >
            <Table>
              <TableCaption className="sr-only">Dessertes du jour</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Train</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Origine → Destination</TableHead>
                  <TableHead>Départ</TableHead>
                  <TableHead>État</TableHead>
                  <TableHead className="text-right">Retard</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.service.trips.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-ink-muted">
                      Aucune desserte voyageurs enregistrée aujourd’hui.
                    </TableCell>
                  </TableRow>
                ) : (
                  data.service.trips.map((trip) => (
                    <TableRow key={trip.id}>
                      <TableCell className="font-mono tabular-nums">
                        {trip.trainNumber}
                      </TableCell>
                      <TableCell>{trainTypeLabel(trip.trainType)}</TableCell>
                      <TableCell className="whitespace-normal">
                        {stationName(data, trip.originStationId)} →{" "}
                        {stationName(data, trip.destinationStationId)}
                      </TableCell>
                      <TableCell className="font-mono tabular-nums">
                        {formatTime(trip.departureAt)}
                      </TableCell>
                      <TableCell>
                        {serviceTripStatusLabel(trip.status)}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {delayLabel(trip.delayMinutes)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </DomainGate>
        </div>
      </section>

      <section
        aria-labelledby="dcfv-titre"
        className="grid gap-4 rounded-lg border border-line bg-surface p-5"
      >
        <h2 id="dcfv-titre" className="text-h4">
          DCFV · Commercial fret & voyageurs
        </h2>

        <div className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-h4">Fret</h3>
            <ProvenanceTag state={data.freight.state} />
          </div>
          {data.freight.state === "synthetic_demo" &&
          data.freight.datasetLabel ? (
            <p className="text-caption text-ink-muted">
              Jeu de données : {data.freight.datasetLabel}
            </p>
          ) : null}
          <MetricGrid label="Indicateurs Fret">
            {freightKpis.length > 0 ? (
              freightKpis.map((kpi) => (
                <MetricCard
                  key={kpi.code}
                  label={kpi.label}
                  value={NUMBER_FORMATTER.format(kpi.value)}
                  unit={kpi.unit}
                  supporting={kpi.description}
                  state={data.freight.state}
                />
              ))
            ) : (
              <MetricCard label="Indicateurs Fret" state={data.freight.state} />
            )}
          </MetricGrid>
          <DomainGate
            state={data.freight.state}
            unavailableTitle="Fret non accessible à ce compte"
            emptyTitle="Aucune opération Fret enregistrée."
            emptyAction={
              data.modules.some((module) => module.code === "fret") ? (
                <Button asChild variant="secondary">
                  <Link href="/fret">Ouvrir Fret</Link>
                </Button>
              ) : undefined
            }
          >
            <div className="grid gap-3 rounded-lg border border-line bg-surface p-5">
              <h3 className="text-h4">Opérations</h3>
              <Table>
                <TableCaption className="sr-only">
                  Opérations Fret en cours
                </TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Train</TableHead>
                    <TableHead>Marchandise</TableHead>
                    <TableHead>Client / segment</TableHead>
                    <TableHead>Origine → Destination</TableHead>
                    <TableHead>Position</TableHead>
                    <TableHead className="text-right">Avancement</TableHead>
                    <TableHead className="text-right">Wagons</TableHead>
                    <TableHead>État</TableHead>
                    <TableHead>Sûreté</TableHead>
                    <TableHead>Documents</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {freightOperations.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={11} className="text-ink-muted">
                        Aucune opération Fret en cours.
                      </TableCell>
                    </TableRow>
                  ) : (
                    freightOperations.map((operation) => (
                      <TableRow key={operation.id}>
                        <TableCell className="font-mono tabular-nums">
                          {operation.operationCode}
                        </TableCell>
                        <TableCell className="font-mono tabular-nums">
                          {operation.trainNumber}
                        </TableCell>
                        <TableCell className="whitespace-normal">
                          {operation.cargoLabel}
                        </TableCell>
                        <TableCell className="whitespace-normal">
                          {operation.clientSegment}
                        </TableCell>
                        <TableCell className="whitespace-normal">
                          {operation.origin} → {operation.destination}
                        </TableCell>
                        <TableCell className="whitespace-normal">
                          {operation.currentLocation}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {clampProgressPct(operation.routeProgressPct)} %
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {NUMBER_FORMATTER.format(operation.wagonCount)}
                        </TableCell>
                        <TableCell>
                          {freightOperationStatusLabel(operation.status)}
                        </TableCell>
                        <TableCell>
                          {freightSafetyLabel(operation.safetyStatus)}
                        </TableCell>
                        <TableCell>
                          {freightDocumentLabel(operation.documentStatus)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="grid gap-3 rounded-lg border border-line bg-surface p-5">
              <h3 className="text-h4">Alertes</h3>
              <Table>
                <TableCaption className="sr-only">Alertes Fret</TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sévérité</TableHead>
                    <TableHead>Catégorie</TableHead>
                    <TableHead>Titre et message</TableHead>
                    <TableHead>Échéance</TableHead>
                    <TableHead>Statut</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {freightAlerts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-ink-muted">
                        Aucune alerte Fret ouverte.
                      </TableCell>
                    </TableRow>
                  ) : (
                    freightAlerts.map((alert) => (
                      <TableRow key={alert.id}>
                        <TableCell>
                          <Tag tone={freightAlertSeverityTone(alert.severity)}>
                            {freightAlertSeverityLabel(alert.severity)}
                          </Tag>
                        </TableCell>
                        <TableCell>
                          {freightAlertCategoryLabel(alert.category)}
                        </TableCell>
                        <TableCell className="whitespace-normal">
                          <span className="block font-semibold text-ink">
                            {alert.title}
                          </span>
                          <span className="text-caption block text-ink-muted">
                            {alert.message}
                          </span>
                        </TableCell>
                        <TableCell className="font-mono tabular-nums">
                          {alert.dueAt
                            ? DATE_TIME_FORMATTER.format(new Date(alert.dueAt))
                            : "—"}
                        </TableCell>
                        <TableCell>
                          {freightAlertStatusLabel(alert.status)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </DomainGate>
        </div>

        <div className="grid gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-h4">Voyageurs</h3>
            <ProvenanceTag state={data.passenger.state} />
          </div>
          <PassengerPeriodControl
            heading={null}
            data={data}
            preset={preset}
            onPresetChange={onPresetChange}
          />
          <MetricGrid label="Chiffres voyageurs">
            <MetricCard
              label="Billets émis"
              state={data.passenger.state}
              value={
                data.passenger.tickets !== undefined
                  ? NUMBER_FORMATTER.format(data.passenger.tickets)
                  : undefined
              }
            />
            <MetricCard
              label="Recettes nettes"
              state={data.passenger.state}
              value={
                data.passenger.revenueNet !== undefined
                  ? NUMBER_FORMATTER.format(data.passenger.revenueNet)
                  : undefined
              }
              unit="XAF"
            />
            <MetricCard
              label="Remplissage siège-km"
              state={data.passenger.state}
              value={
                data.passenger.occupancyPct !== undefined
                  ? PERCENT_FORMATTER.format(data.passenger.occupancyPct)
                  : undefined
              }
              unit="%"
            />
          </MetricGrid>
          <BarSeries
            title="Recettes voyageurs par jour"
            description="Chiffre d’affaires net des journées clôturées sur la période."
            series={data.passenger.series}
            state={data.passenger.state}
            tableCaption="Chiffre d’affaires net et billets par jour"
          />
          <BreakdownBars
            title="Par point de vente"
            slices={data.passenger.byPointOfSale}
            state={data.passenger.state}
            tableCaption="Recettes nettes par point de vente"
          />
          <BreakdownBars
            title="Par produit"
            slices={data.passenger.byProduct}
            state={data.passenger.state}
            tableCaption="Recettes nettes par produit"
          />

          <div className="grid gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h4 className="text-small font-semibold text-ink">
                Remplissage par desserte
              </h4>
              <ProvenanceTag state={data.occupancy.state} />
            </div>
            <DomainGate
              state={data.occupancy.state}
              unavailableTitle="Remplissage par desserte non accessible à ce compte"
              emptyTitle="Aucune desserte clôturée sur la période."
            >
              <p className="text-caption text-ink-muted">
                {`${OCCUPANCY_DISPLAY_LIMIT} dessertes les plus chargées sur ${NUMBER_FORMATTER.format(data.occupancy.trips.length)} lues, en sièges-kilomètres, par classe. Saturée : tronçon de pointe à 95 % ou plus pour un remplissage moyen inférieur à 80 %.`}
              </p>
              <Table>
                <TableCaption className="sr-only">
                  Remplissage par desserte, de la plus chargée à la moins
                  chargée
                </TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Train</TableHead>
                    <TableHead>Classe</TableHead>
                    <TableHead className="text-right">Remplissage</TableHead>
                    <TableHead className="text-right">
                      Tronçon de pointe
                    </TableHead>
                    <TableHead>Lecture</TableHead>
                    <TableHead className="text-right">Billets</TableHead>
                    <TableHead className="text-right">Recettes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.occupancy.trips
                    .slice(0, OCCUPANCY_DISPLAY_LIMIT)
                    .map((trip) => (
                      <TableRow key={`${trip.tripId}-${trip.serviceClass}`}>
                        <TableCell>{formatDay(trip.serviceDate)}</TableCell>
                        <TableCell className="font-mono tabular-nums">
                          {trip.trainNumber}
                        </TableCell>
                        <TableCell>
                          {serviceClassLabel(trip.serviceClass)}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {PERCENT_FORMATTER.format(trip.loadFactorPct)} %
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {PERCENT_FORMATTER.format(trip.peakPct)} %
                        </TableCell>
                        <TableCell>
                          {trip.constrainedByPeak ? (
                            <Tag tone="warning">
                              Saturée au tronçon de pointe
                            </Tag>
                          ) : (
                            <span className="text-ink-muted">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {NUMBER_FORMATTER.format(trip.ticketCount)}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {NUMBER_FORMATTER.format(trip.revenueTtc)} XAF
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </DomainGate>
          </div>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <NotConnectedDirectionCard code="dmat" data={data} />
        <NotConnectedDirectionCard code="dinfra" data={data} />
      </div>

      <ProvenanceSummary
        states={[
          data.cotraf.state,
          data.service.state,
          data.freight.state,
          data.passenger.state,
        ]}
      />
    </div>
  )
}
