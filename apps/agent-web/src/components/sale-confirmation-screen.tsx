"use client"

import { CheckCircle2, FileDown, Printer, RotateCcw } from "lucide-react"
import type { Route } from "next"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"

import { authClient } from "@workspace/api/auth-client"
import { useAction, useAuth, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Card } from "@workspace/ui/components/card"
import { InlineMessage } from "@workspace/ui/components/inline-message"

import { useOnlineStatus } from "@/hooks/use-online-status"
import {
  DEMO_DASHBOARD,
  type SaleConfirmationData,
  type SellerDashboardData,
} from "@/lib/agent-data"
import { formatTime, formatXaf } from "@/lib/format"
import {
  clearTicketSaleDraft,
  useStoredSaleConfirmation,
} from "@/lib/sale-draft"
import { SellerShell } from "./seller-shell"

const E2E_MODE =
  process.env.NODE_ENV !== "production" &&
  process.env.NEXT_PUBLIC_E2E_MODE === "1"

export function SaleConfirmationScreen({
  dashboard,
  confirmation,
  online,
  printingTicket,
  printError,
  onPrintTicket,
  onPrintAll,
  onNewSale,
  onSignOut,
}: {
  dashboard: SellerDashboardData
  confirmation: SaleConfirmationData | null
  online: boolean
  printingTicket?: string
  printError?: string
  onPrintTicket: (ticketId: string) => void
  onPrintAll: () => void
  onNewSale: () => void
  onSignOut?: () => void
}) {
  return (
    <SellerShell
      seller={dashboard.seller}
      pointOfSale={dashboard.pointOfSale}
      session={dashboard.session}
      online={online}
      onSignOut={onSignOut}
    >
      <div className="sale-confirmation mx-auto grid max-w-6xl gap-6">
        {!confirmation ? (
          <InlineMessage tone="warning" title="Confirmation introuvable.">
            La vente n’est plus disponible dans cette session.
          </InlineMessage>
        ) : (
          <>
            <header className="sale-success grid justify-items-center gap-3 rounded-xl bg-success-soft px-6 py-8 text-center">
              <CheckCircle2 className="size-14 text-success-ink" />
              <div>
                <span className="text-mono-label text-success-ink">
                  AW-V-08 · vente confirmée
                </span>
                <h1 className="text-h2 mt-1">Billets émis avec succès</h1>
                <p className="text-small mt-2 text-ink-muted">
                  Référence {confirmation.number} · monnaie rendue{" "}
                  {formatXaf(confirmation.changeDue)}
                </p>
              </div>
            </header>

            {printError ? (
              <InlineMessage tone="danger" title="Impression indisponible.">
                {printError}
              </InlineMessage>
            ) : null}

            <div className="print-actions flex flex-wrap justify-end gap-2">
              <Button type="button" variant="secondary" onClick={onPrintAll}>
                <Printer />
                Imprimer tout
              </Button>
              <Button type="button" onClick={onNewSale}>
                <RotateCcw />
                Nouvelle vente
              </Button>
            </div>

            <section
              className="ticket-previews grid gap-4"
              aria-label="Billets émis"
            >
              {confirmation.tickets.map((ticket, index) => (
                <Card
                  key={ticket.number}
                  className="ticket-preview overflow-hidden p-0 shadow-none"
                >
                  <div className="grid gap-5 p-6 lg:grid-cols-[1fr_auto]">
                    <div className="grid gap-4">
                      <div className="flex flex-wrap items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <span className="text-mono-label text-accent-ink">
                            BILLET {ticket.number}
                          </span>
                          <h2 className="text-h3 mt-1">
                            {confirmation.draft.originName} →{" "}
                            {confirmation.draft.destinationName}
                          </h2>
                        </div>
                        <Badge variant="success">valide</Badge>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-4">
                        <div>
                          <p className="text-caption text-ink-muted">
                            Voyageur
                          </p>
                          <p className="font-semibold">
                            {ticket.passengerName ||
                              `${confirmation.draft.passengers[index]?.firstName ?? ""} ${confirmation.draft.passengers[index]?.lastName ?? ""}`}
                          </p>
                        </div>
                        <div>
                          <p className="text-caption text-ink-muted">Train</p>
                          <p className="font-semibold">
                            {confirmation.draft.trainNumber}
                          </p>
                        </div>
                        <div>
                          <p className="text-caption text-ink-muted">Départ</p>
                          <p className="font-semibold">
                            {formatTime(confirmation.draft.departureAt)}
                          </p>
                        </div>
                        <div>
                          <p className="text-caption text-ink-muted">Place</p>
                          <p className="font-semibold">
                            {ticket.seatLabel ?? "attribuée"}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="print-actions flex items-center">
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={!ticket.id || printingTicket === ticket.id}
                        onClick={() => ticket.id && onPrintTicket(ticket.id)}
                      >
                        <FileDown />
                        {printingTicket === ticket.id
                          ? "Génération…"
                          : "PDF du billet"}
                      </Button>
                    </div>
                  </div>
                  <div className="flex justify-between border-t border-dashed border-line bg-surface-sunk px-6 py-3">
                    <span className="text-caption">
                      {confirmation.draft.serviceDate} ·{" "}
                      {confirmation.draft.serviceClass.toLowerCase()}
                    </span>
                    <strong>{formatXaf(ticket.unitPriceTtc)}</strong>
                  </div>
                </Card>
              ))}
            </section>
          </>
        )}
      </div>
    </SellerShell>
  )
}

export function SaleConfirmationPageClient() {
  const router = useRouter()
  const online = useOnlineStatus()
  const stored = useStoredSaleConfirmation()
  const { isAuthenticated, isLoading } = useAuth()
  const [printingTicket, setPrintingTicket] = useState("")
  const [printError, setPrintError] = useState("")
  const ticketPdf = useAction(api.functions.documents.ticketPdf)
  const liveDashboard = useQuery(
    api.functions.cash.sellerDashboard,
    E2E_MODE || !isAuthenticated ? "skip" : {}
  )
  const liveSale = useQuery(
    api.functions.sales.get,
    E2E_MODE || !stored ? "skip" : { saleId: stored.saleId as never }
  )

  useEffect(() => {
    if (!E2E_MODE && !isLoading && !isAuthenticated) {
      router.replace("/connexion")
    }
  }, [isAuthenticated, isLoading, router])

  const dashboard = E2E_MODE
    ? DEMO_DASHBOARD
    : (liveDashboard as SellerDashboardData | undefined)
  const confirmation =
    stored && liveSale
      ? {
          ...stored,
          tickets: stored.tickets.map((ticket, index) => ({
            ...ticket,
            id: liveSale.tickets[index]?._id,
          })),
        }
      : stored

  if (!dashboard) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <p role="status">Chargement de la confirmation…</p>
      </main>
    )
  }

  return (
    <SaleConfirmationScreen
      dashboard={dashboard}
      confirmation={confirmation}
      online={online}
      printingTicket={printingTicket}
      printError={printError}
      onPrintTicket={async (ticketId) => {
        if (E2E_MODE) {
          window.print()
          return
        }
        setPrintingTicket(ticketId)
        setPrintError("")
        try {
          const { url } = await ticketPdf({ ticketId: ticketId as never })
          window.open(url, "_blank", "noopener,noreferrer")
        } catch (cause) {
          setPrintError(
            cause instanceof Error
              ? cause.message
              : "Le PDF n’a pas pu être généré."
          )
        } finally {
          setPrintingTicket("")
        }
      }}
      onPrintAll={() => window.print()}
      onNewSale={() => {
        clearTicketSaleDraft()
        router.push("/vente/billet" as Route)
      }}
      onSignOut={async () => {
        if (!E2E_MODE) await authClient.signOut()
        router.replace("/connexion")
      }}
    />
  )
}
