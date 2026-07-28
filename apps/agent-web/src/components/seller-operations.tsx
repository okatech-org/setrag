"use client"

import {
  Banknote,
  CircleCheck,
  FilePlus2,
  Printer,
  RefreshCcw,
  RotateCcw,
  Search,
  ShieldAlert,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { FormEvent, useEffect, useMemo, useState } from "react"
import { useConvex } from "convex/react"

import { authClient } from "@workspace/api/auth-client"
import { useAuth, useMutation, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Card } from "@workspace/ui/components/card"
import {
  Field,
  Input,
  SelectNative,
  Textarea,
} from "@workspace/ui/components/field"
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
import {
  DEMO_DASHBOARD,
  DEMO_STATIONS,
  type SellerDashboardData,
  type StationSummary,
} from "@/lib/agent-data"
import { formatTime, formatXaf } from "@/lib/format"
import { asAppRole, canRole } from "@/lib/portal-access"
import { usePortalSession } from "./portal-guard"
import { SellerShell } from "./seller-shell"

const E2E_MODE = process.env.NEXT_PUBLIC_E2E_MODE === "1"

function useSellerAuthentication() {
  const router = useRouter()
  const { isAuthenticated, isLoading } = useAuth()
  useEffect(() => {
    if (!E2E_MODE && !isLoading && !isAuthenticated) {
      router.replace("/connexion")
    }
  }, [isAuthenticated, isLoading, router])
  return { isAuthenticated, isLoading }
}

export interface OperationRow {
  id: string
  number: string
  product: string
  kind: string
  status: string
  amountXaf: number
  soldAt: number
}

const DEMO_OPERATIONS: OperationRow[] = [
  {
    id: "sale-demo-4821",
    number: "V-OWE-4821",
    product: "Billet",
    kind: "Vente",
    status: "Confirmée",
    amountXaf: 18_500,
    soldAt: Date.parse("2026-07-27T09:42:00+01:00"),
  },
  {
    id: "sale-demo-4819",
    number: "V-OWE-4819",
    product: "Colis",
    kind: "Vente",
    status: "Confirmée",
    amountXaf: 5_500,
    soldAt: Date.parse("2026-07-27T09:18:00+01:00"),
  },
  {
    id: "sale-demo-4812",
    number: "R-OWE-0041",
    product: "Billet",
    kind: "Remboursement",
    status: "Confirmée",
    amountXaf: -12_750,
    soldAt: Date.parse("2026-07-27T08:35:00+01:00"),
  },
]

function PageHeader({
  code,
  title,
  description,
}: {
  code: string
  title: string
  description: string
}) {
  return (
    <header className="grid gap-1">
      <span className="text-mono-label text-accent-ink">{code}</span>
      <h1 className="text-h2">{title}</h1>
      <p className="text-small max-w-3xl text-ink-muted">{description}</p>
    </header>
  )
}

export function OperationsScreen({
  dashboard,
  operations,
  online,
  onSearch,
  onCancel,
  onRefund,
  onReprint,
  canCancel = true,
  canRefund = true,
  canReprint = true,
  onSignOut,
}: {
  dashboard: SellerDashboardData
  operations: OperationRow[]
  online: boolean
  onSearch: (number: string) => void
  onCancel: (saleId: string, reason: string) => Promise<void>
  onRefund: (saleId: string, reason: string) => Promise<void>
  onReprint: (saleId: string) => Promise<void>
  canCancel?: boolean
  canRefund?: boolean
  canReprint?: boolean
  onSignOut?: () => void
}) {
  const [number, setNumber] = useState("")
  const [selectedId, setSelectedId] = useState(operations[0]?.id ?? "")
  const [reason, setReason] = useState("")
  const [pending, setPending] = useState("")
  const [message, setMessage] = useState("")
  const selected = operations.find((row) => row.id === selectedId)

  async function run(
    key: "annulation" | "remboursement" | "duplicata",
    action: () => Promise<void>
  ) {
    if (key !== "duplicata" && !reason.trim()) {
      setMessage("Saisissez le motif obligatoire avant de poursuivre.")
      return
    }
    setPending(key)
    setMessage("")
    try {
      await action()
      setMessage(
        key === "duplicata"
          ? "Duplicata tracé et prêt à imprimer."
          : key === "annulation"
            ? "Annulation enregistrée avec succès."
            : "Remboursement enregistré avec succès."
      )
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : "L’opération a échoué."
      )
    } finally {
      setPending("")
    }
  }

  return (
    <SellerShell
      seller={dashboard.seller}
      pointOfSale={dashboard.pointOfSale}
      session={dashboard.session}
      online={online}
      onSignOut={onSignOut}
    >
      <div className="mx-auto grid max-w-[1440px] min-w-0 grid-cols-[minmax(0,1fr)] gap-6">
        <PageHeader
          code="AW-V-09"
          title="Opérations"
          description="Recherchez une vente, puis créez une annulation, un remboursement ou un duplicata entièrement audité."
        />

        {!online ? (
          <InlineMessage tone="warning" title="Connexion au central perdue.">
            Les opérations sensibles sont bloquées jusqu’au retour du réseau.
          </InlineMessage>
        ) : null}

        <Card className="p-5">
          <form
            className="grid items-end gap-3 md:grid-cols-[minmax(220px,1fr)_auto]"
            onSubmit={(event) => {
              event.preventDefault()
              onSearch(number.trim())
            }}
          >
            <Field
              label="Numéro de vente ou de billet"
              htmlFor="operation-number"
              hint="Ex. V-OWE-4821"
            >
              <Input
                id="operation-number"
                value={number}
                onChange={(event) => setNumber(event.target.value)}
              />
            </Field>
            <Button type="submit">
              <Search />
              Rechercher
            </Button>
          </form>
        </Card>

        <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.8fr)]">
          <Card className="min-w-0 overflow-hidden p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Référence</TableHead>
                  <TableHead>Heure</TableHead>
                  <TableHead>Produit</TableHead>
                  <TableHead>Nature</TableHead>
                  <TableHead className="text-right">Montant</TableHead>
                  <TableHead>État</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {operations.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={selectedId === row.id ? "selected" : undefined}
                    className="cursor-pointer"
                    onClick={() => setSelectedId(row.id)}
                  >
                    <TableCell className="font-semibold">
                      {row.number}
                    </TableCell>
                    <TableCell>{formatTime(row.soldAt)}</TableCell>
                    <TableCell>{row.product}</TableCell>
                    <TableCell>{row.kind}</TableCell>
                    <TableCell className="tabular text-right">
                      {formatXaf(row.amountXaf)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={row.amountXaf < 0 ? "warning" : "success"}
                      >
                        {row.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {operations.length === 0 ? (
              <p className="p-6 text-center text-ink-muted">
                Aucune opération trouvée.
              </p>
            ) : null}
          </Card>

          <Card className="p-5">
            <div className="grid gap-1">
              <span className="text-mono-label text-ink-muted">
                OPÉRATION SÉLECTIONNÉE
              </span>
              <h2 className="text-h4">{selected?.number ?? "Aucune"}</h2>
            </div>
            <Field label="Motif obligatoire" htmlFor="operation-reason">
              <Textarea
                id="operation-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Expliquez précisément la demande…"
              />
            </Field>
            {message ? (
              <InlineMessage
                tone={
                  message.includes("succès") || message.includes("prêt")
                    ? "success"
                    : "info"
                }
                title={message}
              />
            ) : null}
            <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-1">
              {canCancel ? (
                <Button
                  type="button"
                  variant="danger"
                  disabled={!selected || !online}
                  loading={pending === "annulation"}
                  onClick={() =>
                    selected &&
                    run("annulation", () => onCancel(selected.id, reason))
                  }
                >
                  <RotateCcw />
                  Annuler la vente
                </Button>
              ) : null}
              {canRefund ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!selected || !online}
                  loading={pending === "remboursement"}
                  onClick={() =>
                    selected &&
                    run("remboursement", () => onRefund(selected.id, reason))
                  }
                >
                  <RefreshCcw />
                  Rembourser
                </Button>
              ) : null}
              {canReprint ? (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={!selected || !online}
                  loading={pending === "duplicata"}
                  onClick={() =>
                    selected && run("duplicata", () => onReprint(selected.id))
                  }
                >
                  <Printer />
                  Imprimer un duplicata
                </Button>
              ) : null}
            </div>
          </Card>
        </div>
      </div>
    </SellerShell>
  )
}

interface CashSummary {
  salesCount: number
  totalTtc: number
  totalReceived: number
  cancellations: number
  refunds: number
}

export function CashScreen({
  dashboard,
  summary,
  online,
  onClose,
  onSignOut,
}: {
  dashboard: SellerDashboardData
  summary: CashSummary
  online: boolean
  onClose: (cash: number, mobile: number, reason?: string) => Promise<void>
  onSignOut?: () => void
}) {
  const [cash, setCash] = useState(String(summary.totalReceived))
  const [mobile, setMobile] = useState("0")
  const [reason, setReason] = useState("")
  const [pending, setPending] = useState(false)
  const [closed, setClosed] = useState(false)
  const counted = Number(cash || 0) + Number(mobile || 0)
  const variance = counted - summary.totalReceived

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (variance !== 0 && !reason.trim()) return
    setPending(true)
    try {
      await onClose(Number(cash), Number(mobile), reason || undefined)
      setClosed(true)
    } finally {
      setPending(false)
    }
  }

  return (
    <SellerShell
      seller={dashboard.seller}
      pointOfSale={dashboard.pointOfSale}
      session={closed ? null : dashboard.session}
      online={online}
      onSignOut={onSignOut}
    >
      <div className="mx-auto grid max-w-[1240px] gap-6">
        <PageHeader
          code="AW-V-10"
          title="Ma caisse"
          description="Contrôlez le théorique, comptez chaque moyen de paiement et clôturez votre session."
        />
        {closed ? (
          <InlineMessage tone="success" title="Caisse clôturée.">
            Le contrôle des recettes peut maintenant rapprocher cette session.
          </InlineMessage>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Ventes", String(summary.salesCount)],
            ["Chiffre d’affaires", formatXaf(summary.totalTtc)],
            ["Encaissé théorique", formatXaf(summary.totalReceived)],
            [
              "Sorties",
              `${summary.cancellations} ann. · ${summary.refunds} remb.`,
            ],
          ].map(([label, value]) => (
            <Card key={label} className="gap-2 p-5">
              <span className="tabular text-h3">{value}</span>
              <span className="text-small text-ink-muted">{label}</span>
            </Card>
          ))}
        </div>
        <form
          className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.7fr)]"
          onSubmit={submit}
        >
          <Card className="p-5">
            <div className="flex items-center gap-3">
              <Banknote className="text-accent-ink" />
              <h2 className="text-h4">Comptage réel</h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Espèces (FCFA)" htmlFor="cash-count">
                <Input
                  id="cash-count"
                  type="number"
                  min={0}
                  step={100}
                  value={cash}
                  onChange={(event) => setCash(event.target.value)}
                />
              </Field>
              <Field label="Mobile money (FCFA)" htmlFor="mobile-count">
                <Input
                  id="mobile-count"
                  type="number"
                  min={0}
                  step={100}
                  value={mobile}
                  onChange={(event) => setMobile(event.target.value)}
                />
              </Field>
            </div>
            <Field
              label="Justification de l’écart"
              htmlFor="variance-reason"
              error={
                variance !== 0 && !reason.trim()
                  ? "Une justification est obligatoire en présence d’un écart."
                  : undefined
              }
            >
              <Textarea
                id="variance-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </Field>
          </Card>
          <Card className="h-fit p-5">
            <span className="text-mono-label text-ink-muted">
              RAPPROCHEMENT
            </span>
            <dl className="grid gap-3">
              <div className="flex justify-between gap-3">
                <dt className="text-ink-muted">Théorique</dt>
                <dd className="tabular font-semibold">
                  {formatXaf(summary.totalReceived)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-muted">Compté</dt>
                <dd className="tabular font-semibold">{formatXaf(counted)}</dd>
              </div>
              <div className="flex justify-between gap-3 border-t border-line pt-3">
                <dt className="font-semibold">Écart</dt>
                <dd className="tabular text-h4">{formatXaf(variance)}</dd>
              </div>
            </dl>
            <Badge variant={variance === 0 ? "success" : "warning"}>
              {variance === 0 ? <CircleCheck /> : <ShieldAlert />}
              {variance === 0 ? "Caisse équilibrée" : "Écart à justifier"}
            </Badge>
            <Button
              type="submit"
              block
              disabled={!online || closed || (variance !== 0 && !reason.trim())}
              loading={pending}
              loadingLabel="Clôture…"
            >
              Clôturer ma caisse
            </Button>
          </Card>
        </form>
      </div>
    </SellerShell>
  )
}

export interface ManualSaleRow {
  id: string
  preprintedNumber: string
  systemNumber: string
  passengerName: string
  amountXaf: number
  soldAt: number
}

const DEMO_MANUAL_SALES: ManualSaleRow[] = [
  {
    id: "manual-1",
    preprintedNumber: "PP-0042817",
    systemNumber: "V-OWE-4801",
    passengerName: "Mireille OBAME",
    amountXaf: 18_500,
    soldAt: Date.parse("2026-07-26T15:40:00+01:00"),
  },
]

export interface ManualSaleValues {
  preprintedNumber: string
  soldAt: number
  originStationId: string
  destinationStationId: string
  serviceClass: "DEUXIEME" | "PREMIERE" | "VIP"
  passengerName: string
  amountReceivedXaf: number
  notes?: string
}

export function ManualSalesScreen({
  dashboard,
  stations,
  rows,
  online,
  onRecord,
  onSignOut,
}: {
  dashboard: SellerDashboardData
  stations: StationSummary[]
  rows: ManualSaleRow[]
  online: boolean
  onRecord: (values: ManualSaleValues) => Promise<void>
  onSignOut?: () => void
}) {
  const [number, setNumber] = useState("PP-0042818")
  const [soldAt, setSoldAt] = useState("2026-07-27T08:30")
  const [origin, setOrigin] = useState(stations[0]?.id ?? "")
  const [destination, setDestination] = useState(stations.at(-1)?.id ?? "")
  const [serviceClass, setServiceClass] =
    useState<ManualSaleValues["serviceClass"]>("DEUXIEME")
  const [passenger, setPassenger] = useState("")
  const [amount, setAmount] = useState("18500")
  const [notes, setNotes] = useState("")
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState("")

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (origin === destination) {
      setMessage("Le départ et l’arrivée doivent être différents.")
      return
    }
    setPending(true)
    setMessage("")
    try {
      await onRecord({
        preprintedNumber: number,
        soldAt: new Date(soldAt).getTime(),
        originStationId: origin,
        destinationStationId: destination,
        serviceClass,
        passengerName: passenger,
        amountReceivedXaf: Number(amount),
        notes: notes || undefined,
      })
      setMessage(`${number} a été régularisé sans réémettre de billet.`)
      setNumber((current) =>
        current.replace(/\d+$/, (digits) =>
          String(Number(digits) + 1).padStart(digits.length, "0")
        )
      )
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : "La ressaisie a échoué."
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <SellerShell
      seller={dashboard.seller}
      pointOfSale={dashboard.pointOfSale}
      session={dashboard.session}
      online={online}
      onSignOut={onSignOut}
    >
      <div className="mx-auto grid max-w-[1440px] min-w-0 grid-cols-[minmax(0,1fr)] gap-6">
        <PageHeader
          code="AW-V-11"
          title="Ventes manuelles · régularisation"
          description="Ressaisissez les billets papier vendus en mode dégradé. Le numéro pré-imprimé reste la référence de contrôle."
        />
        <InlineMessage
          tone="warning"
          title="Cette opération ne produit aucun nouveau titre."
        >
          Elle régularise uniquement la vente et la comptabilité, avec contrôle
          strict des doublons et de la continuité du carnet.
        </InlineMessage>
        <form
          className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.7fr)]"
          onSubmit={submit}
        >
          <Card className="min-w-0 p-5">
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2">
              <Field label="Numéro pré-imprimé" htmlFor="preprinted-number">
                <Input
                  id="preprinted-number"
                  required
                  pattern="[A-Za-z]{2,6}-[0-9]{4,}"
                  value={number}
                  onChange={(event) => setNumber(event.target.value)}
                />
              </Field>
              <Field label="Date et heure de vente" htmlFor="manual-sold-at">
                <Input
                  id="manual-sold-at"
                  type="datetime-local"
                  required
                  value={soldAt}
                  onChange={(event) => setSoldAt(event.target.value)}
                />
              </Field>
              <Field label="Départ" htmlFor="manual-origin">
                <SelectNative
                  id="manual-origin"
                  value={origin}
                  onChange={(event) => setOrigin(event.target.value)}
                >
                  {stations.map((station) => (
                    <option key={station.id} value={station.id}>
                      {station.name}
                    </option>
                  ))}
                </SelectNative>
              </Field>
              <Field label="Arrivée" htmlFor="manual-destination">
                <SelectNative
                  id="manual-destination"
                  value={destination}
                  onChange={(event) => setDestination(event.target.value)}
                >
                  {stations.map((station) => (
                    <option key={station.id} value={station.id}>
                      {station.name}
                    </option>
                  ))}
                </SelectNative>
              </Field>
              <Field label="Classe" htmlFor="manual-class">
                <SelectNative
                  id="manual-class"
                  value={serviceClass}
                  onChange={(event) =>
                    setServiceClass(
                      event.target.value as ManualSaleValues["serviceClass"]
                    )
                  }
                >
                  <option value="DEUXIEME">2e classe</option>
                  <option value="PREMIERE">1re classe</option>
                  <option value="VIP">VIP</option>
                </SelectNative>
              </Field>
              <Field label="Montant perçu (FCFA)" htmlFor="manual-amount">
                <Input
                  id="manual-amount"
                  type="number"
                  min={0}
                  step={100}
                  required
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
              </Field>
              <Field
                label="Nom du voyageur"
                htmlFor="manual-passenger"
                className="sm:col-span-2"
              >
                <Input
                  id="manual-passenger"
                  required
                  value={passenger}
                  onChange={(event) => setPassenger(event.target.value)}
                />
              </Field>
              <Field
                label="Notes de régularisation"
                htmlFor="manual-notes"
                className="sm:col-span-2"
              >
                <Textarea
                  id="manual-notes"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </Field>
            </div>
            {message ? <InlineMessage tone="info" title={message} /> : null}
            <Button
              type="submit"
              disabled={!online}
              loading={pending}
              loadingLabel="Régularisation…"
            >
              <FilePlus2 />
              Enregistrer la vente manuelle
            </Button>
          </Card>
          <Card className="min-w-0 overflow-hidden p-0">
            <div className="px-5 pt-5">
              <h2 className="text-h4">Dernières régularisations</h2>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>N° papier</TableHead>
                  <TableHead>Voyageur</TableHead>
                  <TableHead className="text-right">Montant</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <span className="block font-semibold">
                        {row.preprintedNumber}
                      </span>
                      <span className="text-caption text-ink-muted">
                        {row.systemNumber}
                      </span>
                    </TableCell>
                    <TableCell>{row.passengerName}</TableCell>
                    <TableCell className="tabular text-right">
                      {formatXaf(row.amountXaf)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </form>
      </div>
    </SellerShell>
  )
}

export function OperationsPageClient() {
  const online = useOnlineStatus()
  const convex = useConvex()
  const portalSession = usePortalSession()
  const role = E2E_MODE
    ? ("vendeur_guichet" as const)
    : asAppRole(portalSession?.profile.user.role)
  const { isAuthenticated } = useSellerAuthentication()
  const [number, setNumber] = useState("")
  const dashboardQuery = useQuery(
    api.functions.cash.sellerDashboard,
    E2E_MODE || !isAuthenticated ? "skip" : {}
  )
  const saleQuery = useQuery(
    api.functions.sales.search,
    E2E_MODE || !isAuthenticated || !number ? "skip" : { number }
  )
  const cancelSale = useMutation(api.functions.sales.cancel)
  const refundSale = useMutation(api.functions.sales.refund)
  const reprintTicket = useMutation(api.functions.sales.reprintTicket)
  const dashboard = E2E_MODE ? DEMO_DASHBOARD : dashboardQuery
  const operations = useMemo<OperationRow[]>(() => {
    if (E2E_MODE) {
      return number
        ? DEMO_OPERATIONS.filter((row) =>
            row.number.toLowerCase().includes(number.toLowerCase())
          )
        : DEMO_OPERATIONS
    }
    return (saleQuery ?? []).map((sale) => ({
      id: sale._id,
      number: sale.number,
      product: sale.product,
      kind: sale.kind,
      status: sale.status,
      amountXaf: sale.amounts.ttc,
      soldAt: sale.soldAt,
    }))
  }, [number, saleQuery])

  if (!dashboard) return <p className="p-8">Chargement des opérations…</p>

  return (
    <OperationsScreen
      dashboard={dashboard}
      operations={operations}
      online={online}
      canCancel={canRole(role, "annulations", "creer")}
      canRefund={canRole(role, "remboursements", "creer")}
      canReprint={canRole(role, "duplicatas", "creer")}
      onSearch={setNumber}
      onCancel={async (saleId, reason) => {
        if (!E2E_MODE) await cancelSale({ saleId: saleId as never, reason })
      }}
      onRefund={async (saleId, reason) => {
        if (!E2E_MODE)
          await refundSale({
            saleId: saleId as never,
            reason,
            penaltyPct: 10,
          })
      }}
      onReprint={async (saleId) => {
        if (!E2E_MODE) {
          const detail = await convex.query(api.functions.sales.get, {
            saleId: saleId as never,
          })
          const ticket = detail.tickets[0]
          if (!ticket) throw new Error("Aucun billet valide à réimprimer.")
          await reprintTicket({ ticketId: ticket._id })
        }
      }}
      onSignOut={() => authClient.signOut()}
    />
  )
}

export function CashPageClient() {
  const online = useOnlineStatus()
  const { isAuthenticated } = useSellerAuthentication()
  const dashboardQuery = useQuery(
    api.functions.cash.sellerDashboard,
    E2E_MODE || !isAuthenticated ? "skip" : {}
  )
  const sessionQuery = useQuery(
    api.functions.cash.mySession,
    E2E_MODE || !isAuthenticated ? "skip" : {}
  )
  const closeSession = useMutation(api.functions.cash.closeSession)
  const dashboard = E2E_MODE ? DEMO_DASHBOARD : dashboardQuery
  const summary: CashSummary = E2E_MODE
    ? {
        salesCount: 42,
        totalTtc: 1_246_500,
        totalReceived: 1_246_500,
        cancellations: 3,
        refunds: 1,
      }
    : {
        salesCount: sessionQuery?.salesCount ?? 0,
        totalTtc: sessionQuery?.totalTtc ?? 0,
        totalReceived: sessionQuery?.totalReceived ?? 0,
        cancellations: sessionQuery?.cancellations ?? 0,
        refunds: sessionQuery?.refunds ?? 0,
      }

  if (!dashboard) return <p className="p-8">Chargement de la caisse…</p>

  return (
    <CashScreen
      dashboard={dashboard}
      summary={summary}
      online={online}
      onClose={async (cash, mobile, varianceReason) => {
        if (!E2E_MODE)
          await closeSession({
            countedByMethod: [
              { method: "especes", amountXaf: cash },
              { method: "airtel_money", amountXaf: mobile },
            ],
            varianceReason,
          })
      }}
      onSignOut={() => authClient.signOut()}
    />
  )
}

export function ManualSalesPageClient() {
  const online = useOnlineStatus()
  const { isAuthenticated } = useSellerAuthentication()
  const dashboardQuery = useQuery(
    api.functions.cash.sellerDashboard,
    E2E_MODE || !isAuthenticated ? "skip" : {}
  )
  const stationsQuery = useQuery(
    api.functions.referential.listStations,
    E2E_MODE ? "skip" : {}
  )
  const rowsQuery = useQuery(
    api.functions.manualSales.list,
    E2E_MODE || !isAuthenticated ? "skip" : { limit: 20 }
  )
  const record = useMutation(api.functions.manualSales.recordManualSale)
  const dashboard = E2E_MODE ? DEMO_DASHBOARD : dashboardQuery
  const stations = E2E_MODE
    ? DEMO_STATIONS
    : (stationsQuery ?? []).map((station) => ({
        id: station._id,
        code: station.code,
        name: station.name,
      }))
  const rows: ManualSaleRow[] = E2E_MODE
    ? DEMO_MANUAL_SALES
    : (rowsQuery ?? []).map(({ manual, sale }) => ({
        id: manual._id,
        preprintedNumber: manual.preprintedNumber,
        systemNumber: manual.systemNumber,
        passengerName: "Voyageur billet papier",
        amountXaf: sale?.amounts.ttc ?? 0,
        soldAt: manual.soldAt,
      }))

  if (!dashboard) {
    return <p className="p-8">Chargement des ventes manuelles…</p>
  }

  return (
    <ManualSalesScreen
      dashboard={dashboard}
      stations={stations}
      rows={rows}
      online={online}
      onRecord={async (values) => {
        if (E2E_MODE) return
        if (!dashboard.seller.id) {
          throw new Error("Identifiant du vendeur indisponible.")
        }
        await record({
          ...values,
          originalSellerId: dashboard.seller.id as never,
          originStationId: values.originStationId as never,
          destinationStationId: values.destinationStationId as never,
        })
      }}
      onSignOut={() => authClient.signOut()}
    />
  )
}
