"use client"

import { ArrowRight, BarChart3, Download, Plus, Search } from "lucide-react"
import Link from "next/link"
import type { Route } from "next"
import { useMemo, useState } from "react"
import { useConvex } from "convex/react"

import { useAction, useMutation, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Card } from "@workspace/ui/components/card"
import { Field, Input, SelectNative } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import { useOnlineStatus } from "@/hooks/use-online-status"
import { asAppRole, canRole } from "@/lib/portal-access"
import {
  MANAGEMENT_SECTIONS,
  type ManagementSection,
} from "@/lib/management-data"
import type { SellerIdentity } from "@/lib/agent-data"
import { formatXaf } from "@/lib/format"
import { SellerShell } from "./seller-shell"
import { usePortalSession } from "./portal-guard"
import {
  DataSelectionDialog,
  FareScheduleDialog,
  PointOfSaleDialog,
  PricingRuleDialog,
  SettingsDialog,
  TrainCompositionDialog,
  type CoachDraft,
  type FareScheduleDraft,
  type PointOfSaleDraft,
  type PricingRuleDraft,
  type SettingsDraft,
} from "./management-admin-dialogs"
import {
  JournalExportDialog,
  PenaltyDialog,
  ReportScheduleDialog,
  RevenueControlDialog,
  type AccountingDayOption,
  type PenaltyDraft,
  type PenaltyTripOption,
  type ReportScheduleDraft,
  type RevenueControlSnapshot,
} from "./management-action-dialogs"

const E2E_MODE =
  process.env.NODE_ENV !== "production" &&
  process.env.NEXT_PUBLIC_E2E_MODE === "1"

const MANAGEMENT_IDENTITY = {
  id: "management-demo",
  firstName: "Mireille",
  lastName: "NZENG",
  matricule: "G-044",
  role: "admin_fonctionnel",
}

const MANAGEMENT_SCOPE = {
  code: "DCO",
  name: "Direction commerciale · réseau entier",
  type: "siege",
}

interface LiveSummary {
  revenue?: number
  tickets?: number
  occupancy?: number
  booklets?: number
  trains?: number
  stations?: number
  exports?: number
  incidents?: number
  severity?: string
}

export interface ManagementRowData {
  id: string
  cells: readonly string[]
  href?: string
  detailLabel?: string
}

type ManagementRowInput = ManagementRowData | readonly string[]

function KpiCard({
  label,
  value,
  delta,
}: {
  label: string
  value: string
  delta: string
}) {
  return (
    <Card className="min-w-0 gap-2 p-5">
      <span className="tabular text-h3 min-w-0">{value}</span>
      <span className="text-small text-ink-muted">{label}</span>
      <span className="text-caption text-success-ink">{delta}</span>
    </Card>
  )
}

function Overview({ live }: { live: LiveSummary }) {
  const bars = [42, 55, 48, 68, 72, 64, 79, 62, 84, 76, 91, 86, 95, 88]
  return (
    <>
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Recette nette"
          value={formatXaf(live.revenue ?? 184_650_000)}
          delta="+8,4 % vs période précédente"
        />
        <KpiCard
          label="Billets émis"
          value={(live.tickets ?? 12_486).toLocaleString("fr-FR")}
          delta="+5,1 %"
        />
        <KpiCard
          label="Remplissage moyen"
          value={`${(live.occupancy ?? 71.4).toLocaleString("fr-FR")} %`}
          delta="+3,2 points"
        />
        <KpiCard
          label="Points suivis"
          value={String((live.stations ?? 24) + 12)}
          delta="100 % connectés"
        />
      </div>
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.6fr)]">
        <Card className="p-5">
          <div className="flex items-center justify-between gap-3">
            <span className="text-mono-label text-ink-muted">
              VENTES · 14 DERNIERS JOURS
            </span>
            <BarChart3 className="text-accent-ink" />
          </div>
          <div
            className="flex h-48 items-end gap-2"
            aria-label="Graphique des ventes sur 14 jours"
          >
            {bars.map((height, index) => (
              <span
                key={`${height}-${index}`}
                className="flex-1 rounded-t-xs bg-accent-base"
                style={{ height: `${height}%` }}
                title={`Jour ${index + 1} : ${height}`}
              />
            ))}
          </div>
        </Card>
        <Card className="p-5">
          <span className="text-mono-label text-ink-muted">
            ÉTAT DU SYSTÈME
          </span>
          <div className="grid gap-3">
            <div className="flex items-center justify-between gap-3">
              <span>Supervision Convex</span>
              <Badge
                variant={
                  live.severity === "critique" ? "destructive" : "success"
                }
              >
                {live.severity ?? "Opérationnelle"}
              </Badge>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>Déversements SAGE</span>
              <Badge variant={(live.exports ?? 0) > 0 ? "warning" : "success"}>
                {live.exports ?? 2} en file
              </Badge>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>Incidents ouverts</span>
              <Badge variant="info">{live.incidents ?? 3}</Badge>
            </div>
          </div>
        </Card>
      </div>
    </>
  )
}

export function ManagementScreen({
  section,
  live = {},
  rows: rowsOverride,
  online,
  identity = MANAGEMENT_IDENTITY,
  onPrimaryAction,
  primaryHref,
  onSignOut,
}: {
  section: ManagementSection
  live?: LiveSummary
  rows?: readonly ManagementRowInput[]
  online: boolean
  identity?: SellerIdentity
  onPrimaryAction?: () => void | Promise<string | void>
  primaryHref?: string
  onSignOut?: () => void
}) {
  const config = MANAGEMENT_SECTIONS[section]
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState("tous")
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState("")
  const [messageTone, setMessageTone] = useState<"success" | "danger">(
    "success"
  )
  const sourceRows: readonly ManagementRowInput[] = rowsOverride ?? config.rows
  const normalizedRows = useMemo<ManagementRowData[]>(
    () =>
      sourceRows.map((row, index) => {
        if ("cells" in row) return row
        return {
          id: `${section}-${index}-${row.join("-")}`,
          cells: row,
        }
      }),
    [section, sourceRows]
  )
  const rows = useMemo(
    () =>
      normalizedRows.filter(
        (row) =>
          row.cells.some((cell) =>
            cell.toLowerCase().includes(search.trim().toLowerCase())
          ) &&
          (status === "tous" ||
            row.cells.at(-1)?.toLowerCase() === status.toLowerCase())
      ),
    [normalizedRows, search, status]
  )
  const hasDetails = rows.some((row) => Boolean(row.href))

  async function runPrimary() {
    if (!onPrimaryAction) return
    setPending(true)
    setMessage("")
    try {
      const result = await onPrimaryAction()
      if (result) {
        setMessageTone("success")
        setMessage(result)
      }
    } catch (cause) {
      setMessageTone("danger")
      setMessage(cause instanceof Error ? cause.message : "L’action a échoué.")
    } finally {
      setPending(false)
    }
  }

  return (
    <SellerShell
      seller={identity}
      pointOfSale={MANAGEMENT_SCOPE}
      session={null}
      online={online}
      portal="gestion"
      onSignOut={onSignOut}
    >
      <div className="mx-auto grid max-w-[1500px] min-w-0 grid-cols-[minmax(0,1fr)] gap-6">
        <header className="flex min-w-0 flex-col items-start gap-4 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <span className="text-mono-label text-accent-ink">
              {config.code}
            </span>
            <h1 className="text-h2 mt-1">{config.title}</h1>
            <p className="text-small mt-2 max-w-3xl text-ink-muted">
              {config.description}
            </p>
          </div>
          {primaryHref ? (
            <Button asChild disabled={!online}>
              <Link href={primaryHref as Route}>
                <Plus />
                {config.action}
              </Link>
            </Button>
          ) : onPrimaryAction ? (
            <Button
              type="button"
              variant={section === "tableau-de-bord" ? "secondary" : "primary"}
              loading={pending}
              loadingLabel="Traitement…"
              disabled={!online}
              onClick={runPrimary}
            >
              {section === "tableau-de-bord" ? <Download /> : <Plus />}
              {config.action}
            </Button>
          ) : null}
        </header>

        {!online ? (
          <InlineMessage tone="warning" title="Mode consultation hors ligne.">
            Les données affichées peuvent être anciennes et les actions sont
            suspendues.
          </InlineMessage>
        ) : null}
        {message ? <InlineMessage tone={messageTone} title={message} /> : null}

        {section === "tableau-de-bord" ? <Overview live={live} /> : null}

        {section !== "tableau-de-bord" ? (
          <>
            <Card className="gap-4 p-5">
              <div className="grid items-end gap-3 md:grid-cols-[minmax(220px,1fr)_220px]">
                <Field label="Rechercher" htmlFor={`search-${section}`}>
                  <Input
                    id={`search-${section}`}
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Nom, référence, train…"
                  />
                </Field>
                <Field label="État" htmlFor={`status-${section}`}>
                  <SelectNative
                    id={`status-${section}`}
                    value={status}
                    onChange={(event) => setStatus(event.target.value)}
                  >
                    <option value="tous">Tous les états</option>
                    <option value="Actif">Actif</option>
                    <option value="Conforme">Conforme</option>
                    <option value="Opérationnel">Opérationnel</option>
                    <option value="Suspendu">Suspendu</option>
                  </SelectNative>
                </Field>
              </div>
            </Card>
            <Card className="min-w-0 overflow-hidden p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    {config.columns.map((column) => (
                      <TableHead key={column}>{column}</TableHead>
                    ))}
                    {hasDetails ? (
                      <TableHead className="text-right">Actions</TableHead>
                    ) : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      {row.cells.map((cell, index) => (
                        <TableCell
                          key={`${cell}-${index}`}
                          className={index === 0 ? "font-semibold" : undefined}
                        >
                          {index === row.cells.length - 1 ? (
                            <Badge
                              variant={
                                /suspendu|dégradé|rejouer|bloquée|suivre/i.test(
                                  cell
                                )
                                  ? "warning"
                                  : "success"
                              }
                            >
                              {cell}
                            </Badge>
                          ) : (
                            cell
                          )}
                        </TableCell>
                      ))}
                      {hasDetails ? (
                        <TableCell className="text-right">
                          {row.href ? (
                            <Button asChild size="sm" variant="secondary">
                              <Link href={row.href as Route}>
                                {row.detailLabel ?? "Voir le détail"}
                                <ArrowRight />
                              </Link>
                            </Button>
                          ) : null}
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {rows.length === 0 ? (
                <div className="grid place-items-center gap-2 p-8 text-center text-ink-muted">
                  <Search />
                  Aucun résultat pour ces filtres.
                </div>
              ) : null}
            </Card>
          </>
        ) : null}

        <InlineMessage
          tone={
            section === "recettes" || section === "comptabilite"
              ? "warning"
              : "info"
          }
          title={
            section === "integrations"
              ? "Les files Convex sont conservées jusqu’à traitement."
              : "Chaque modification est horodatée et inscrite au journal d’audit."
          }
        >
          Les validations et changements d’état restent traçables et ne
          suppriment jamais l’historique.
        </InlineMessage>
      </div>
    </SellerShell>
  )
}

function downloadTextFile(filename: string, content: string) {
  const url = URL.createObjectURL(
    new Blob([content], { type: "text/csv;charset=utf-8" })
  )
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

const DEMO_ACCOUNTING_DAYS: AccountingDayOption[] = [
  { id: "day-2026-07-26", date: "2026-07-26", status: "cloturee" },
  { id: "day-2026-07-27", date: "2026-07-27", status: "ouverte" },
]

const DEMO_PENALTY_TRIPS: PenaltyTripOption[] = [
  {
    id: "trip-201",
    trainNumber: "TR-201",
    serviceDate: "2026-07-27",
    origin: "Owendo",
    destination: "Franceville",
  },
  {
    id: "trip-202",
    trainNumber: "TR-202",
    serviceDate: "2026-07-28",
    origin: "Franceville",
    destination: "Owendo",
  },
]

export function ManagementPageClient({
  section,
}: {
  section: ManagementSection
}) {
  const online = useOnlineStatus()
  const convex = useConvex()
  const portalSession = usePortalSession()
  const profile = portalSession?.profile
  const role = E2E_MODE
    ? ("admin_fonctionnel" as const)
    : asAppRole(profile?.user?.role)
  const may = (
    resource: Parameters<typeof canRole>[1],
    permission: Parameters<typeof canRole>[2] = "consulter"
  ) => canRole(role, resource, permission)
  const today = new Date().toISOString().slice(0, 10)
  const monthStart = `${today.slice(0, 8)}01`
  const [dialog, setDialog] = useState<
    | "penalty"
    | "schedule"
    | "journal"
    | "revenue"
    | "fare"
    | "yield"
    | "composition"
    | "seat-plan"
    | "point-of-sale"
    | "manifest"
    | "settings"
    | null
  >(null)
  const reporting = useQuery(
    api.functions.reporting.dashboard,
    E2E_MODE || !may("rapports") || section !== "tableau-de-bord"
      ? "skip"
      : { from: monthStart, to: today }
  )
  const booklets = useQuery(
    api.functions.booklets.list,
    E2E_MODE || !may("livrets_horaires") || section !== "livrets" ? "skip" : {}
  )
  const trains = useQuery(
    api.functions.referential.listTrains,
    E2E_MODE ||
      !may("referentiel") ||
      (section !== "trains" && section !== "places")
      ? "skip"
      : {}
  )
  const stations = useQuery(
    api.functions.referential.listStations,
    E2E_MODE ||
      !may("referentiel") ||
      (section !== "points-de-vente" &&
        section !== "trains" &&
        section !== "tarifs")
      ? "skip"
      : { includeInactive: true }
  )
  const exportsList = useQuery(
    api.functions.accounting.listExports,
    E2E_MODE ||
      !may("journal_comptable") ||
      (section !== "comptabilite" && section !== "integrations")
      ? "skip"
      : {}
  )
  const accountingDays = useQuery(
    api.functions.cash.listAccountingDays,
    E2E_MODE ||
      !may("journee_comptable") ||
      (section !== "recettes" && section !== "comptabilite")
      ? "skip"
      : { limit: 31 }
  )
  const health = useQuery(
    api.functions.monitoring.health,
    E2E_MODE ||
      !may("rapports") ||
      (section !== "tableau-de-bord" && section !== "integrations")
      ? "skip"
      : {}
  )
  const incidents = useQuery(
    api.functions.control.listIncidents,
    E2E_MODE || !may("incidents") || section !== "incidents" ? "skip" : {}
  )
  const penalties = useQuery(
    api.functions.control.listPenalties,
    E2E_MODE || !may("proces_verbaux") || section !== "incidents" ? "skip" : {}
  )
  const penaltyTrips = useQuery(
    api.functions.control.penaltyTripOptions,
    E2E_MODE ||
      !may("controles") ||
      (section !== "incidents" && section !== "voyageurs")
      ? "skip"
      : { limit: 30 }
  )
  const reportSchedules = useQuery(
    api.functions.reportSchedules.list,
    E2E_MODE || !may("rapports") || section !== "rapports" ? "skip" : {}
  )
  const fareSchedules = useQuery(
    api.functions.management.listFareSchedules,
    E2E_MODE || !may("tarifs") || section !== "tarifs" ? "skip" : {}
  )
  const pricingRules = useQuery(
    api.functions.management.listPricingRules,
    E2E_MODE || !may("yield") || section !== "yield" ? "skip" : {}
  )
  const trainCompositions = useQuery(
    api.functions.management.listTrainCompositions,
    E2E_MODE ||
      !may("referentiel") ||
      (section !== "trains" && section !== "places")
      ? "skip"
      : {}
  )
  const seatBlocks = useQuery(
    api.functions.management.listSeatBlocks,
    E2E_MODE || !may("places") || section !== "places" ? "skip" : {}
  )
  const pointsOfSale = useQuery(
    api.functions.management.listPointsOfSale,
    E2E_MODE || !may("referentiel") || section !== "points-de-vente"
      ? "skip"
      : {}
  )
  const travelers = useQuery(
    api.functions.management.listTravelers,
    E2E_MODE || !may("donnees_voyageurs") || section !== "voyageurs"
      ? "skip"
      : { limit: 100 }
  )
  const users = useQuery(
    api.functions.management.listUsers,
    E2E_MODE || !may("utilisateurs") || section !== "utilisateurs" ? "skip" : {}
  )
  const settings = useQuery(
    api.functions.management.getSettings,
    E2E_MODE || !may("parametrage") || section !== "parametrage" ? "skip" : {}
  )

  const createBooklet = useMutation(api.functions.booklets.create)
  const syncPenalties = useMutation(api.functions.control.syncPenalties)
  const createReportSchedule = useMutation(api.functions.reportSchedules.create)
  const closeAccountingDay = useMutation(api.functions.cash.closeAccountingDay)
  const createFareSchedule = useMutation(
    api.functions.management.createFareSchedule
  )
  const createPricingRule = useMutation(
    api.functions.management.createPricingRule
  )
  const addCoach = useMutation(api.functions.referential.addCoach)
  const createPointOfSale = useMutation(
    api.functions.management.createPointOfSale
  )
  const saveSettings = useMutation(api.functions.management.saveSettings)
  const retryIntegrationFailures = useMutation(
    api.functions.management.retryIntegrationFailures
  )
  const synchronizeDirectory = useAction(
    api.functions.management.synchronizeDirectory
  )

  const dayOptions: AccountingDayOption[] = E2E_MODE
    ? DEMO_ACCOUNTING_DAYS
    : (accountingDays ?? []).map((day) => ({
        id: day._id,
        date: day.date,
        status: day.status,
      }))
  const tripOptions: PenaltyTripOption[] = E2E_MODE
    ? DEMO_PENALTY_TRIPS
    : (penaltyTrips ?? []).map((trip) => ({
        id: trip.id,
        trainNumber: trip.trainNumber,
        serviceDate: trip.serviceDate,
        origin: trip.origin,
        destination: trip.destination,
      }))
  const trainOptions = (trains ?? []).map((train) => ({
    id: train._id,
    label: `${train.number} · ${train.name}`,
  }))
  const stationOptions = (stations ?? []).map((station) => ({
    id: station._id,
    label: `${station.code} · ${station.name}`,
  }))
  const dataTripOptions = tripOptions.map((trip) => ({
    id: trip.id,
    label: `${trip.trainNumber} · ${trip.serviceDate} · ${trip.origin} → ${trip.destination}`,
  }))

  const live: LiveSummary = E2E_MODE
    ? {}
    : {
        revenue: reporting?.revenue.netTtc,
        tickets: reporting?.volume.tickets,
        occupancy: reporting?.occupancy.pct,
        booklets: booklets?.length,
        trains: trains?.length,
        stations: stations?.length,
        exports: exportsList?.filter(({ event }) => event.status !== "envoye")
          .length,
        incidents: (incidents?.length ?? 0) + (penalties?.length ?? 0),
        severity: health?.severity,
      }
  const liveRows: readonly ManagementRowInput[] | undefined = E2E_MODE
    ? undefined
    : section === "livrets" && booklets
      ? booklets.map((booklet) => ({
          id: booklet._id,
          href: `/gestion/livrets/${booklet._id}`,
          cells: [
            booklet.label,
            `${new Date(booklet.validFrom).toLocaleDateString("fr-FR")} → ${new Date(booklet.validUntil).toLocaleDateString("fr-FR")}`,
            "Synchronisé",
            booklet.status,
          ],
        }))
      : section === "trains" && trains
        ? (trainCompositions ?? []).map(({ train, coachCount, capacity }) => ({
            id: train._id,
            href: `/gestion/trains/${train._id}`,
            cells: [
              train.number,
              train.type,
              `${coachCount} voiture(s)`,
              `${capacity} place(s)`,
            ],
          }))
        : section === "tarifs" && fareSchedules
          ? fareSchedules.flatMap(({ schedule, bases }) =>
              bases.length > 0
                ? bases.map((base) => ({
                    id: String(base._id),
                    href: `/gestion/tarifs/${schedule._id}`,
                    detailLabel: "Gérer la grille",
                    cells: [
                      base.trainType,
                      base.serviceClass,
                      `${base.shortDistanceRate.toLocaleString("fr-FR")} F/km`,
                      `${base.longDistanceRate.toLocaleString("fr-FR")} F/km · ${schedule.status}`,
                    ],
                  }))
                : [
                    {
                      id: String(schedule._id),
                      href: `/gestion/tarifs/${schedule._id}`,
                      detailLabel: "Compléter la grille",
                      cells: [
                        schedule.label,
                        "Aucune base",
                        "—",
                        schedule.status,
                      ],
                    },
                  ]
            )
          : section === "yield" && pricingRules
            ? pricingRules.map((rule) => ({
                id: rule._id,
                href: `/gestion/yield/${rule._id}`,
                cells: [
                  rule.code ?? rule.type,
                  `${rule.type}${rule.threshold !== undefined ? ` · ${rule.threshold}` : ""}`,
                  `${rule.modifierPct >= 0 ? "+" : ""}${rule.modifierPct} %`,
                  rule.isActive ? "Actif" : "Suspendu",
                ],
              }))
            : section === "places" && seatBlocks
              ? seatBlocks.map(({ block, trip, seat, coach }) => ({
                  id: block._id,
                  href: `/gestion/places/${block._id}`,
                  detailLabel: "Gérer le blocage",
                  cells: [
                    trip
                      ? `${trip.trainNumber} · ${trip.serviceDate}`
                      : "Desserte inconnue",
                    `${coach?.label ?? "?"} · ${seat?.label ?? "?"}`,
                    block.reason,
                    block.isActive ? "Bloquée" : "Libérée",
                  ],
                }))
              : section === "points-de-vente" && pointsOfSale
                ? pointsOfSale.map(({ pointOfSale, station }) => ({
                    id: pointOfSale._id,
                    href: `/gestion/points-de-vente/${pointOfSale._id}`,
                    cells: [
                      pointOfSale.name,
                      pointOfSale.type,
                      station
                        ? `${station.name} · ${pointOfSale.counters.passengers} guichet(s)`
                        : `${pointOfSale.counters.passengers} guichet(s)`,
                      pointOfSale.isActive ? "Actif" : "Suspendu",
                    ],
                  }))
                : section === "voyageurs" && travelers
                  ? travelers.map(({ ticket, trip, origin, destination }) => ({
                      id: ticket._id,
                      href: `/gestion/voyageurs/${ticket._id}`,
                      detailLabel: "Voir le billet",
                      cells: [
                        `${ticket.passenger.firstName} ${ticket.passenger.lastName}`,
                        ticket.number,
                        `${origin?.name ?? "?"} → ${destination?.name ?? "?"}`,
                        `${ticket.coachLabel ?? "—"} · ${ticket.seatLabel ?? "Debout"}${trip ? ` · ${trip.serviceDate}` : ""}`,
                      ],
                    }))
                  : section === "utilisateurs" && users
                    ? users.map((user) => ({
                        id: user._id,
                        href: `/gestion/utilisateurs/${user._id}`,
                        cells: [
                          `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() ||
                            user.email ||
                            user.authId,
                          user.matricule ?? "—",
                          user.role,
                          user.isActive ? "Actif" : "Suspendu",
                        ],
                      }))
                    : section === "parametrage" && settings
                      ? [
                          [
                            "TVA billets",
                            `${settings.vatPct} %`,
                            "Réseau",
                            "Actif",
                          ],
                          [
                            "Contribution CSS",
                            `${settings.cssPct} %`,
                            "Billetterie",
                            "Actif",
                          ],
                          [
                            "Tenue des places",
                            `${settings.seatHoldMinutes} min`,
                            "Vente en ligne",
                            "Actif",
                          ],
                          [
                            "Tentatives mobile",
                            String(settings.mobilePaymentAttempts),
                            "Tous canaux",
                            "Actif",
                          ],
                        ]
                      : section === "incidents" && (incidents || penalties)
                        ? [
                            ...(penalties ?? []).map(({ penalty, trip }) => ({
                              id: penalty._id,
                              href: `/gestion/incidents/proces-verbaux/${penalty._id}`,
                              detailLabel: "Traiter le PV",
                              cells: [
                                penalty.number,
                                penalty.reason,
                                trip?.trainNumber ?? "Réseau",
                                penalty.status,
                              ],
                            })),
                            ...(incidents ?? []).map(({ incident, trip }) => ({
                              id: incident._id,
                              href: `/gestion/incidents/${incident._id}`,
                              detailLabel: "Traiter l’incident",
                              cells: [
                                incident.clientId,
                                incident.category,
                                trip?.trainNumber ?? "Réseau",
                                incident.status,
                              ],
                            })),
                          ]
                        : section === "comptabilite" && exportsList
                          ? exportsList.map(({ event, day }) => [
                              day && "date" in day
                                ? new Date(
                                    `${day.date}T00:00:00`
                                  ).toLocaleDateString("fr-FR")
                                : new Date(event.createdAt).toLocaleDateString(
                                    "fr-FR"
                                  ),
                              `${event.attempts} tentative(s)`,
                              "Journal V65",
                              event.status,
                            ])
                          : section === "rapports" && reportSchedules
                            ? reportSchedules.map((schedule) => ({
                                id: schedule._id,
                                href: `/gestion/rapports/${schedule._id}`,
                                cells: [
                                  schedule.label,
                                  schedule.frequency,
                                  schedule.format.toUpperCase(),
                                  schedule.lastRunAt
                                    ? new Date(
                                        schedule.lastRunAt
                                      ).toLocaleString("fr-FR")
                                    : `Prévu ${new Date(schedule.nextRunAt).toLocaleString("fr-FR")}`,
                                ],
                              }))
                            : section === "integrations" && health
                              ? health.findings.map((finding) => [
                                  finding.label,
                                  finding.action,
                                  String(finding.count),
                                  finding.severity,
                                ])
                              : undefined

  const primaryHref =
    section === "trains" && may("referentiel", "creer")
      ? "/gestion/trains/nouveau"
      : section === "places" && may("places", "creer")
        ? "/gestion/places/nouveau"
        : undefined

  const primaryAction: (() => void | Promise<string | void>) | undefined =
    section === "incidents" && may("proces_verbaux", "creer")
      ? () => setDialog("penalty")
      : section === "rapports" && may("rapports", "creer")
        ? () => setDialog("schedule")
        : section === "comptabilite" &&
            may("journal_comptable", "creer") &&
            may("journee_comptable")
          ? () => setDialog("journal")
          : section === "recettes" && may("journee_comptable")
            ? () => setDialog("revenue")
            : section === "livrets" && may("livrets_horaires", "creer")
              ? async () => {
                  if (!E2E_MODE) {
                    await createBooklet({
                      label: `Livret ${new Date().toLocaleDateString("fr-FR")}`,
                      description:
                        "Brouillon créé depuis le portail de gestion",
                      validFrom: Date.now(),
                      validUntil: Date.now() + 90 * 24 * 60 * 60 * 1000,
                    })
                  }
                  return "Le brouillon du livret a été créé."
                }
              : section === "tableau-de-bord" && may("rapports", "creer")
                ? async () => {
                    const exported = E2E_MODE
                      ? {
                          filename: `setrag-ventes-${monthStart}-${today}.csv`,
                          rowCount: 1,
                          content:
                            "Date;Canal;Net TTC\n2026-07-27;Guichet;1246500",
                        }
                      : await convex.query(
                          api.functions.reporting.exportDailyCsv,
                          { from: monthStart, to: today }
                        )
                    downloadTextFile(exported.filename, exported.content)
                    return `${exported.filename} téléchargé · ${exported.rowCount} ligne(s).`
                  }
                : section === "tarifs" && may("tarifs", "creer")
                  ? () => setDialog("fare")
                  : section === "yield" && may("yield", "creer")
                    ? () => setDialog("yield")
                    : section === "points-de-vente" &&
                        may("referentiel", "creer")
                      ? () => setDialog("point-of-sale")
                      : section === "voyageurs" && may("controles")
                        ? () => setDialog("manifest")
                        : section === "utilisateurs" &&
                            may("utilisateurs", "modifier")
                          ? async () => {
                              const result = await synchronizeDirectory({})
                              if (!result.synchronized) {
                                throw new Error(result.message)
                              }
                              return result.message
                            }
                          : section === "parametrage" &&
                              may("parametrage", "modifier")
                            ? () => setDialog("settings")
                            : section === "integrations" && may("integrations")
                              ? async () => {
                                  const result = await retryIntegrationFailures(
                                    {}
                                  )
                                  return result.count === 0
                                    ? "Aucun échec à relancer."
                                    : result.requested
                                      ? `${result.count} échec(s) transmis à l’administration IT pour reprise.`
                                      : `${result.count} traitement(s) remis en file.`
                                }
                              : undefined

  async function submitPenalty(draft: PenaltyDraft) {
    if (E2E_MODE) return "PV-DEMO-0143"
    const result = await syncPenalties({
      penalties: [
        {
          clientId:
            globalThis.crypto?.randomUUID?.() ??
            `pv-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          tripId: draft.tripId as never,
          offender: {
            lastName: draft.lastName,
            firstName: draft.firstName,
            documentNumber: draft.documentNumber,
            phone: draft.phone,
            declined: false,
          },
          reason: draft.reason,
          notes: draft.notes,
          amountXaf: draft.amountXaf,
          paidOnBoard: draft.paidOnBoard,
          issuedAt: Date.now(),
          offline: false,
        },
      ],
    })
    return result.numbers[0] ?? "créé"
  }

  async function submitSchedule(draft: ReportScheduleDraft) {
    if (E2E_MODE) return
    await createReportSchedule(draft)
  }

  async function exportJournal(accountingDayId: string, date: string) {
    const content = E2E_MODE
      ? "Journal;Pièce;Date;Débit;Crédit\nV65;V-0001;2026-07-26;1246500;1246500"
      : await convex.query(api.functions.accounting.previewExport, {
          accountingDayId: accountingDayId as never,
        })
    if (!content) {
      throw new Error(
        "Aucune écriture n’a encore été générée pour cette journée."
      )
    }
    const filename = `setrag-journal-v65-${date}.csv`
    downloadTextFile(filename, content)
    return {
      filename,
      rowCount: Math.max(content.split(/\r?\n/).length - 1, 0),
    }
  }

  async function inspectRevenue(
    accountingDayId: string
  ): Promise<RevenueControlSnapshot> {
    if (E2E_MODE) {
      return {
        date: "2026-07-27",
        status: "ouverte",
        sessions: 3,
        openSessions: 0,
        unjustifiedVariances: 0,
        sales: 42,
        cancellations: 2,
        refunds: 1,
        ttc: 3_419_000,
        received: 3_419_000,
      }
    }
    const state = await convex.query(api.functions.cash.controlStates, {
      accountingDayId: accountingDayId as never,
    })
    return {
      date: state.day.date,
      status: state.day.status,
      sessions: state.sessions.length,
      openSessions: state.openSessions,
      unjustifiedVariances: state.unjustifiedVariances,
      sales: state.totals.sales,
      cancellations: state.totals.cancellations,
      refunds: state.totals.refunds,
      ttc: state.totals.ttc,
      received: state.totals.received,
    }
  }

  async function closeRevenue(accountingDayId: string) {
    if (!E2E_MODE) {
      await closeAccountingDay({
        accountingDayId: accountingDayId as never,
      })
    }
  }

  async function submitFareSchedule(draft: FareScheduleDraft) {
    if (!E2E_MODE) await createFareSchedule(draft)
  }

  async function submitPricingRule(draft: PricingRuleDraft) {
    if (!E2E_MODE) await createPricingRule(draft)
  }

  async function submitCoach(draft: CoachDraft) {
    if (E2E_MODE) return
    await addCoach({
      ...draft,
      trainId: draft.trainId as never,
    })
  }

  async function submitPointOfSale(draft: PointOfSaleDraft) {
    if (E2E_MODE) return
    await createPointOfSale({
      ...draft,
      stationId: draft.stationId as never,
    })
  }

  async function submitSettings(draft: SettingsDraft) {
    if (!E2E_MODE) await saveSettings(draft)
  }

  async function inspectSeatPlan(trainId: string) {
    const composition = await convex.query(
      api.functions.referential.getTrainComposition,
      { trainId: trainId as never }
    )
    const coaches = composition.coaches
      .map(
        (coach) =>
          `${coach.label}: ${coach.seatCount} places ${coach.serviceClass.toLowerCase()}`
      )
      .join(" · ")
    return `${composition.train.number} · ${composition.coaches.length} voiture(s) · ${coaches}`
  }

  async function exportManifest(tripId: string) {
    const manifest = await convex.query(api.functions.control.manifest, {
      tripId: tripId as never,
    })
    const rows = [
      ["Billet", "Nom", "Prénom", "Classe", "Voiture", "Place", "État"],
      ...manifest.tickets.map((ticket) => [
        ticket.number,
        ticket.passenger.lastName,
        ticket.passenger.firstName,
        ticket.serviceClass,
        ticket.coachLabel ?? "",
        ticket.seatLabel ?? "Debout",
        ticket.status,
      ]),
    ]
    const content = rows
      .map((row) =>
        row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(";")
      )
      .join("\n")
    const filename = `manifeste-${manifest.trip.trainNumber}-${manifest.trip.serviceDate}.csv`
    downloadTextFile(filename, content)
    return `${filename} téléchargé · ${manifest.tickets.length} voyageur(s).`
  }

  if (!E2E_MODE && !portalSession) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-canvas">
        <p role="status" className="text-small text-ink-muted">
          Vérification de la session…
        </p>
      </main>
    )
  }

  return (
    <>
      <ManagementScreen
        section={section}
        live={live}
        rows={E2E_MODE ? undefined : (liveRows ?? [])}
        online={online}
        primaryHref={primaryHref}
        identity={
          profile?.user
            ? {
                id: profile.user._id,
                firstName: profile.user.firstName,
                lastName: profile.user.lastName,
                matricule: profile.user.matricule,
                role: profile.user.role,
              }
            : MANAGEMENT_IDENTITY
        }
        onPrimaryAction={primaryAction}
      />
      {dialog === "penalty" ? (
        <PenaltyDialog
          open
          trips={tripOptions}
          onOpenChange={(open) => setDialog(open ? "penalty" : null)}
          onSubmit={submitPenalty}
        />
      ) : null}
      {dialog === "schedule" ? (
        <ReportScheduleDialog
          open
          onOpenChange={(open) => setDialog(open ? "schedule" : null)}
          onSubmit={submitSchedule}
        />
      ) : null}
      {dialog === "journal" ? (
        <JournalExportDialog
          open
          days={dayOptions}
          onOpenChange={(open) => setDialog(open ? "journal" : null)}
          onExport={exportJournal}
        />
      ) : null}
      {dialog === "revenue" ? (
        <RevenueControlDialog
          open
          days={dayOptions}
          canClose={may("journee_comptable", "valider")}
          onOpenChange={(open) => setDialog(open ? "revenue" : null)}
          onInspect={inspectRevenue}
          onCloseDay={closeRevenue}
        />
      ) : null}
      {dialog === "fare" ? (
        <FareScheduleDialog
          open
          onOpenChange={(open) => setDialog(open ? "fare" : null)}
          onSubmit={submitFareSchedule}
        />
      ) : null}
      {dialog === "yield" ? (
        <PricingRuleDialog
          open
          onOpenChange={(open) => setDialog(open ? "yield" : null)}
          onSubmit={submitPricingRule}
        />
      ) : null}
      {dialog === "composition" ? (
        <TrainCompositionDialog
          open
          trains={trainOptions}
          onOpenChange={(open) => setDialog(open ? "composition" : null)}
          onSubmit={submitCoach}
        />
      ) : null}
      {dialog === "point-of-sale" ? (
        <PointOfSaleDialog
          open
          stations={stationOptions}
          onOpenChange={(open) => setDialog(open ? "point-of-sale" : null)}
          onSubmit={submitPointOfSale}
        />
      ) : null}
      {dialog === "settings" ? (
        <SettingsDialog
          open
          initial={{
            vatPct: settings?.vatPct ?? 18,
            cssPct: settings?.cssPct ?? 0,
            seatHoldMinutes: settings?.seatHoldMinutes ?? 15,
            mobilePaymentAttempts: settings?.mobilePaymentAttempts ?? 3,
            degradedSalesEnabled: settings?.degradedSalesEnabled ?? true,
            cashVarianceNotificationsEnabled:
              settings?.cashVarianceNotificationsEnabled ?? true,
          }}
          onOpenChange={(open) => setDialog(open ? "settings" : null)}
          onSubmit={submitSettings}
        />
      ) : null}
      {dialog === "seat-plan" ? (
        <DataSelectionDialog
          open
          title="Plan de composition"
          description="Consultez la capacité réelle enregistrée dans Convex."
          label="Train"
          options={trainOptions}
          actionLabel="Charger le plan"
          onOpenChange={(open) => setDialog(open ? "seat-plan" : null)}
          onRun={inspectSeatPlan}
        />
      ) : null}
      {dialog === "manifest" ? (
        <DataSelectionDialog
          open
          title="Exporter le manifeste voyageurs"
          description="Le fichier CSV est produit à partir des titres réels de la desserte."
          label="Desserte"
          options={dataTripOptions}
          actionLabel="Télécharger le manifeste"
          onOpenChange={(open) => setDialog(open ? "manifest" : null)}
          onRun={exportManifest}
        />
      ) : null}
    </>
  )
}
