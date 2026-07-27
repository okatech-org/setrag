"use client"

import { ArrowLeft, Banknote, CreditCard, Smartphone } from "lucide-react"
import type { Route } from "next"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { FormEvent, useEffect, useState } from "react"

import { authClient } from "@workspace/api/auth-client"
import { useAuth, useMutation, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Card } from "@workspace/ui/components/card"
import { Field, Input } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"

import { useOnlineStatus } from "@/hooks/use-online-status"
import {
  DEMO_DASHBOARD,
  type SaleConfirmationData,
  type SellerDashboardData,
  type TicketSaleDraft,
} from "@/lib/agent-data"
import { formatTime, formatXaf } from "@/lib/format"
import {
  saveSaleConfirmation,
  useStoredTicketSaleDraft,
} from "@/lib/sale-draft"
import { SellerShell } from "./seller-shell"

const E2E_MODE = process.env.NEXT_PUBLIC_E2E_MODE === "1"

export function PaymentScreen({
  dashboard,
  draft,
  online,
  pending,
  error,
  onSubmit,
  onSignOut,
}: {
  dashboard: SellerDashboardData
  draft: TicketSaleDraft | null
  online: boolean
  pending: boolean
  error?: string
  onSubmit: (tendered: number) => Promise<void>
  onSignOut?: () => void
}) {
  const [tendered, setTendered] = useState("")
  const amount = Number(tendered)
  const change = draft ? Math.max(0, amount - draft.totalTtc) : 0

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!draft || !Number.isFinite(amount) || amount < draft.totalTtc) return
    await onSubmit(amount)
  }

  return (
    <SellerShell
      seller={dashboard.seller}
      pointOfSale={dashboard.pointOfSale}
      session={dashboard.session}
      online={online}
      onSignOut={onSignOut}
    >
      <div className="mx-auto grid w-full max-w-6xl min-w-0 gap-6">
        <header className="flex min-w-0 flex-col items-start gap-3 sm:flex-row sm:gap-4">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="max-w-full whitespace-normal"
          >
            <Link href={"/vente/billet" as Route}>
              <ArrowLeft />
              Modifier la vente
            </Link>
          </Button>
          <div className="min-w-0">
            <span className="text-mono-label text-accent-ink">AW-V-07</span>
            <h1 className="text-h2 mt-1">Encaissement</h1>
            <p className="text-small mt-2 text-ink-muted">
              Étape 3 sur 4 · contrôle et règlement
            </p>
          </div>
        </header>

        {!draft ? (
          <InlineMessage tone="warning" title="Aucune vente en cours.">
            Revenez à la vente billet pour préparer un trajet.
          </InlineMessage>
        ) : (
          <div className="grid min-w-0 gap-5 lg:grid-cols-[1.15fr_.85fr]">
            <Card className="min-w-0 gap-5 p-4 shadow-none sm:p-6">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <span className="text-mono-label text-accent-ink">
                    {draft.trainNumber} · {draft.serviceClass.toLowerCase()}
                  </span>
                  <h2 className="text-h3 mt-1">
                    {draft.originName} → {draft.destinationName}
                  </h2>
                  <p className="text-small mt-1 text-ink-muted">
                    {draft.serviceDate} · {formatTime(draft.departureAt)} à{" "}
                    {formatTime(draft.arrivalAt)}
                  </p>
                </div>
                <Badge variant="success">
                  {draft.passengers.length} voyageur(s)
                </Badge>
              </div>

              <div className="divide-y divide-line rounded-md border border-line">
                {draft.passengers.map((passenger, index) => (
                  <div
                    key={`${passenger.lastName}-${index}`}
                    className="flex items-center gap-3 p-4"
                  >
                    <span className="text-mono-label text-ink-muted">
                      V{index + 1}
                    </span>
                    <strong className="min-w-0 flex-1">
                      {passenger.firstName} {passenger.lastName}
                    </strong>
                    <Badge variant="secondary">
                      {passenger.seatLabel ?? "auto"}
                    </Badge>
                  </div>
                ))}
              </div>
            </Card>

            <form className="grid min-w-0 gap-5" onSubmit={submit}>
              <Card
                data-theme="dark"
                className="min-w-0 gap-5 border-0 bg-[oklch(0.24_0.058_257)] p-4 text-ink shadow-none sm:p-6"
              >
                <span className="text-mono-label text-ink-muted">
                  Total à encaisser
                </span>
                <strong className="tabular text-h1 text-ink">
                  {formatXaf(draft.totalTtc)}
                </strong>
              </Card>

              <Card className="min-w-0 gap-4 p-4 shadow-none sm:p-6">
                <h2 className="text-h4">Mode de paiement</h2>
                <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
                  <Button type="button" variant="primary" className="min-w-0">
                    <Banknote />
                    Espèces
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled
                    className="min-w-0"
                  >
                    <Smartphone />
                    Airtel Money
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled
                    className="min-w-0"
                  >
                    <Smartphone />
                    Moov Money
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled
                    className="min-w-0"
                  >
                    <CreditCard />
                    Carte
                  </Button>
                </div>
                <p className="text-caption text-ink-muted">
                  Les opérateurs électroniques seront activés après le
                  raccordement de leurs terminaux.
                </p>

                <Field label="Montant remis (FCFA)" htmlFor="tendered">
                  <Input
                    id="tendered"
                    type="number"
                    min={draft.totalTtc}
                    step={1}
                    inputMode="numeric"
                    value={tendered}
                    onChange={(event) => setTendered(event.target.value)}
                    required
                    autoFocus
                  />
                </Field>

                <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-md bg-success-soft p-4">
                  <span className="font-semibold">Monnaie à rendre</span>
                  <strong className="tabular text-h3 text-success-ink">
                    {formatXaf(change)}
                  </strong>
                </div>

                {error ? (
                  <InlineMessage tone="danger" title="Vente non finalisée.">
                    {error}
                  </InlineMessage>
                ) : null}

                <Button
                  type="submit"
                  size="lg"
                  disabled={
                    pending ||
                    !online ||
                    !dashboard.session ||
                    !Number.isFinite(amount) ||
                    amount < draft.totalTtc
                  }
                >
                  {pending ? "Validation en cours…" : "Valider et émettre"}
                </Button>
              </Card>
            </form>
          </div>
        )}
      </div>
    </SellerShell>
  )
}

export function PaymentPageClient() {
  const router = useRouter()
  const online = useOnlineStatus()
  const draft = useStoredTicketSaleDraft()
  const { isAuthenticated, isLoading } = useAuth()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const createSale = useMutation(api.functions.sales.createCounterSale)
  const liveDashboard = useQuery(
    api.functions.cash.sellerDashboard,
    E2E_MODE || !isAuthenticated ? "skip" : {}
  )

  useEffect(() => {
    if (!E2E_MODE && !isLoading && !isAuthenticated) {
      router.replace("/connexion")
    }
  }, [isAuthenticated, isLoading, router])

  const dashboard = E2E_MODE
    ? DEMO_DASHBOARD
    : (liveDashboard as SellerDashboardData | undefined)
  if (!dashboard) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <p role="status">Préparation de l’encaissement…</p>
      </main>
    )
  }

  return (
    <PaymentScreen
      dashboard={dashboard}
      draft={draft}
      online={online}
      pending={pending}
      error={error}
      onSubmit={async (tendered) => {
        if (!draft) return
        setPending(true)
        setError("")
        try {
          const result = E2E_MODE
            ? {
                saleId: "sale-demo-4822",
                number: "V-20260726-4822",
                amounts: {
                  ht: Math.round(draft.totalTtc / 1.18),
                  vat: draft.totalTtc - Math.round(draft.totalTtc / 1.18),
                  css: 0,
                  ttc: draft.totalTtc,
                  received: draft.totalTtc,
                },
                tickets: draft.passengers.map((passenger, index) => ({
                  id: `ticket-demo-${index + 1}`,
                  number: `B-4822-${index + 1}`,
                  seatLabel: passenger.seatLabel ?? null,
                  unitPriceTtc: Math.round(
                    draft.totalTtc / draft.passengers.length
                  ),
                })),
                changeDue: tendered - draft.totalTtc,
              }
            : await createSale({
                tripId: draft.tripId as never,
                originStationId: draft.originStationId as never,
                destinationStationId: draft.destinationStationId as never,
                serviceClass: draft.serviceClass,
                passengers: draft.passengers.map((passenger) => ({
                  firstName: passenger.firstName,
                  lastName: passenger.lastName,
                  gender: passenger.gender,
                  phone: passenger.phone,
                  emergencyPhone: passenger.emergencyPhone,
                  discountCode: passenger.discountCode,
                  seatId: passenger.seatId as never,
                })),
                method: "especes",
                tendered,
                deviceId: "agent-web-browser",
              })
          const confirmation: SaleConfirmationData = {
            ...result,
            saleId: String(result.saleId),
            tickets: result.tickets.map(
              (
                ticket: {
                  id?: string
                  number: string
                  seatLabel: string | null
                  unitPriceTtc: number
                },
                index: number
              ) => ({
                ...ticket,
                passengerName:
                  `${draft.passengers[index]?.firstName ?? ""} ${draft.passengers[index]?.lastName ?? ""}`.trim(),
              })
            ),
            draft,
          }
          saveSaleConfirmation(confirmation)
          router.push(`/vente/confirmation/${String(result.saleId)}` as Route)
        } catch (cause) {
          setError(
            cause instanceof Error
              ? cause.message
              : "La transaction n’a pas pu être enregistrée."
          )
        } finally {
          setPending(false)
        }
      }}
      onSignOut={async () => {
        if (!E2E_MODE) await authClient.signOut()
        router.replace("/connexion")
      }}
    />
  )
}
