"use client"

import {
  Archive,
  CarFront,
  ChevronRight,
  Clock3,
  Luggage,
  PackageOpen,
  Receipt,
  Ticket,
  TriangleAlert,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { useConvex } from "convex/react"

import { authClient } from "@workspace/api/auth-client"
import { useAction, useAuth, useMutation, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Card } from "@workspace/ui/components/card"
import { Field, Input } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"
import { cn } from "@workspace/ui/lib/utils"

import { useOnlineStatus } from "@/hooks/use-online-status"
import { DEMO_DASHBOARD, type SellerDashboardData } from "@/lib/agent-data"
import {
  formatTime,
  formatXaf,
  productLabel,
  sellerDisplayName,
} from "@/lib/format"
import { SellerShell } from "./seller-shell"

const E2E_MODE =
  process.env.NODE_ENV !== "production" &&
  process.env.NEXT_PUBLIC_E2E_MODE === "1"

interface ProductShortcutProps {
  icon: ReactNode
  title: string
  description: string
  shortcut: string
  primary?: boolean
  disabled?: boolean
  onSelect: () => void
}

export function ProductShortcut({
  icon,
  title,
  description,
  shortcut,
  primary,
  disabled,
  onSelect,
}: ProductShortcutProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "group min-h-28 rounded-md border p-4 text-left transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-55",
        primary
          ? "border-transparent bg-accent-base text-ink-inverse hover:bg-accent-hover"
          : "border-line bg-surface text-ink hover:border-accent-base hover:bg-accent-soft"
      )}
    >
      <span className="mb-3 flex items-center gap-3">
        <span
          className={cn(
            "flex size-9 items-center justify-center rounded-sm",
            primary ? "bg-white/15" : "bg-surface-sunk text-accent-ink"
          )}
        >
          {icon}
        </span>
        <span className="text-h4 flex-1">{title}</span>
        <kbd
          className={cn(
            "text-caption rounded-xs border px-2 py-1 font-mono",
            primary
              ? "border-white/25 bg-white/10"
              : "border-line-strong bg-surface-sunk"
          )}
        >
          {shortcut}
        </kbd>
      </span>
      <span
        className={cn(
          "text-small",
          primary ? "text-white/80" : "text-ink-muted"
        )}
      >
        {description}
      </span>
    </button>
  )
}

export function OpenCashForm({
  onOpen,
}: {
  onOpen: (openingFloatXaf: number) => Promise<void>
}) {
  const [value, setValue] = useState("0")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const openingFloatXaf = Number(value)
    if (!Number.isFinite(openingFloatXaf) || openingFloatXaf < 0) {
      setError("Saisissez un fond de caisse positif ou nul.")
      return
    }
    setPending(true)
    setError("")
    try {
      await onOpen(openingFloatXaf)
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "La caisse n’a pas pu être ouverte."
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <Card className="border-warning bg-warning-soft p-5 shadow-none">
      <form className="grid gap-4 sm:grid-cols-[1fr_auto]" onSubmit={submit}>
        <div className="sm:col-span-2">
          <InlineMessage
            tone="warning"
            title="Aucune session de caisse ouverte."
          >
            La vente reste bloquée jusqu’à la déclaration du fond de caisse.
          </InlineMessage>
        </div>
        <Field
          label="Fond de caisse (FCFA)"
          htmlFor="opening-float"
          error={error}
          hint="Le montant est horodaté et inscrit au journal d’audit."
        >
          <Input
            id="opening-float"
            name="openingFloatXaf"
            type="number"
            min={0}
            step={500}
            inputMode="numeric"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </Field>
        <Button
          type="submit"
          className="self-start sm:mt-[25px]"
          size="lg"
          loading={pending}
          loadingLabel="Ouverture…"
        >
          Ouvrir ma caisse
        </Button>
      </form>
    </Card>
  )
}

interface SellerDashboardScreenProps {
  data: SellerDashboardData
  online: boolean
  onOpenCash: (openingFloatXaf: number) => Promise<void>
  onNavigate: (href: string) => void
  onReprint?: (saleId: string) => Promise<void>
  onSignOut?: () => void
}

export function SellerDashboardScreen({
  data,
  online,
  onOpenCash,
  onNavigate,
  onReprint,
  onSignOut,
}: SellerDashboardScreenProps) {
  const saleReady = online && data.session !== null
  const [reprinting, setReprinting] = useState("")
  const [reprintMessage, setReprintMessage] = useState<{
    tone: "success" | "danger"
    text: string
  } | null>(null)

  const shortcuts = useMemo(
    () => [
      {
        icon: <Ticket />,
        title: "Billet voyageur",
        description: "Rechercher une desserte et attribuer les places.",
        shortcut: "F1",
        href: "/vente/billet",
        ready: true,
        primary: true,
      },
      {
        icon: <Luggage />,
        title: "Bagage",
        description: "Enregistrer un bagage rattaché à un billet.",
        shortcut: "F2",
        href: "/vente/bagage",
        ready: true,
      },
      {
        icon: <PackageOpen />,
        title: "Colis express",
        description: "Créer une expédition autonome avec suivi.",
        shortcut: "F3",
        href: "/vente/colis",
        ready: true,
      },
      {
        icon: <CarFront />,
        title: "Auto accompagné",
        description: "Transporter un véhicule avec son propriétaire.",
        shortcut: "F4",
        href: "/vente/prestation-speciale?type=auto",
        ready: true,
      },
      {
        icon: <Archive />,
        title: "Transport funéraire",
        description: "Enregistrer la prestation et ses justificatifs.",
        shortcut: "F5",
        href: "/vente/prestation-speciale?type=funeraire",
        ready: true,
      },
    ],
    []
  )

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement
      ) {
        return
      }
      const shortcut = shortcuts.find(
        (item) => item.shortcut === event.key.toUpperCase()
      )
      if (!shortcut || !shortcut.ready || !saleReady) return
      event.preventDefault()
      onNavigate(shortcut.href)
    }
    window.addEventListener("keydown", handleShortcut)
    return () => window.removeEventListener("keydown", handleShortcut)
  }, [onNavigate, saleReady, shortcuts])

  return (
    <SellerShell
      seller={data.seller}
      pointOfSale={data.pointOfSale}
      session={data.session}
      online={online}
      onSignOut={onSignOut}
    >
      <div className="mx-auto grid max-w-[1440px] gap-6">
        {!online ? (
          <InlineMessage tone="warning" title="Connexion au central perdue.">
            Aucune vente électronique ne peut être émise. Passez au mode dégradé
            papier et ressaisissez les titres après le retour du réseau.
          </InlineMessage>
        ) : null}

        <header className="flex flex-wrap items-end gap-4">
          <div className="min-w-0 flex-1">
            <span className="text-mono-label text-accent-ink">AW-V-01</span>
            <h1 className="text-h2 mt-1">
              Bonjour,{" "}
              {sellerDisplayName(data.seller.firstName, data.seller.lastName)}
            </h1>
            <p className="text-small mt-2 flex flex-wrap items-center gap-2 text-ink-muted">
              {data.session ? (
                <>
                  <Clock3 className="size-4" />
                  Caisse ouverte à {formatTime(data.session.openedAt)}
                  <span aria-hidden>·</span>
                  fond {formatXaf(data.session.openingFloatXaf)}
                </>
              ) : (
                "Ouvrez votre caisse pour commencer les ventes."
              )}
            </p>
          </div>
          <Badge
            variant={data.session ? "success" : "warning"}
            className="px-3 py-1.5"
          >
            {data.session ? "Caisse ouverte" : "Caisse fermée"}
          </Badge>
        </header>

        {data.session ? (
          <section
            aria-label="Indicateurs de la caisse"
            className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
          >
            {[
              {
                value: data.metrics.salesCount.toLocaleString("fr-FR"),
                label: "ventes du jour",
              },
              {
                value: formatXaf(data.metrics.totalReceived),
                label: "encaissés",
              },
              {
                value: data.metrics.cancellations.toLocaleString("fr-FR"),
                label: "annulations",
              },
              {
                value: `−${formatXaf(data.metrics.refunded)}`,
                label: "remboursés",
              },
            ].map((metric) => (
              <Card key={metric.label} className="gap-1 p-4 shadow-none">
                <strong className="tabular text-h3">{metric.value}</strong>
                <span className="text-small text-ink-muted">
                  {metric.label}
                </span>
              </Card>
            ))}
          </section>
        ) : (
          <OpenCashForm onOpen={onOpenCash} />
        )}

        <section className="grid gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-mono-label text-ink-muted">Nouvelle vente</h2>
            {!data.session ? (
              <span className="text-caption flex items-center gap-2 text-warning-ink">
                <TriangleAlert className="size-4" />
                caisse requise
              </span>
            ) : null}
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {shortcuts.map((shortcut) => (
              <ProductShortcut
                key={shortcut.shortcut}
                {...shortcut}
                disabled={!saleReady || !shortcut.ready}
                onSelect={() => onNavigate(shortcut.href)}
              />
            ))}
          </div>
          <p className="text-caption text-ink-muted">
            Chaque prestation est enregistrée dans la caisse et le journal
            d’audit du point de vente.
          </p>
        </section>

        <section className="grid gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-mono-label text-ink-muted">
              Dernières opérations
            </h2>
            <span className="text-caption text-ink-muted">
              {data.lastOperations.length} affichée(s)
            </span>
          </div>
          {reprintMessage ? (
            <InlineMessage
              tone={reprintMessage.tone}
              title={reprintMessage.text}
            />
          ) : null}

          <div className="overflow-x-auto rounded-md border border-line bg-surface">
            <table className="text-small w-full min-w-[720px] border-collapse">
              <thead className="text-caption bg-surface-sunk text-left text-ink-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">N°</th>
                  <th className="px-4 py-3 font-medium">Prestation</th>
                  <th className="px-4 py-3 font-medium">Heure</th>
                  <th className="px-4 py-3 text-right font-medium">Montant</th>
                  <th className="px-4 py-3 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {data.lastOperations.map((operation) => (
                  <tr
                    key={operation.id}
                    className="border-t border-line first:border-t-0"
                  >
                    <td className="tabular px-4 py-3 font-semibold">
                      {operation.number}
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2">
                        <Receipt className="size-4 text-accent-ink" />
                        {productLabel(operation.product)}
                      </span>
                    </td>
                    <td className="tabular px-4 py-3 text-ink-muted">
                      {formatTime(operation.createdAt)}
                    </td>
                    <td className="tabular px-4 py-3 text-right">
                      {formatXaf(operation.amountXaf)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        loading={reprinting === operation.id}
                        loadingLabel="Préparation…"
                        disabled={
                          !online ||
                          operation.product !== "billet" ||
                          !onReprint
                        }
                        title={
                          operation.product !== "billet"
                            ? "Seuls les billets disposent d’un duplicata imprimable."
                            : undefined
                        }
                        onClick={async () => {
                          if (!onReprint) return
                          setReprinting(operation.id)
                          setReprintMessage(null)
                          try {
                            await onReprint(operation.id)
                            setReprintMessage({
                              tone: "success",
                              text: `Duplicata de ${operation.number} généré et tracé.`,
                            })
                          } catch (cause) {
                            setReprintMessage({
                              tone: "danger",
                              text:
                                cause instanceof Error
                                  ? cause.message
                                  : "La réimpression a échoué.",
                            })
                          } finally {
                            setReprinting("")
                          }
                        }}
                      >
                        Réimprimer
                        <ChevronRight />
                      </Button>
                    </td>
                  </tr>
                ))}
                {data.lastOperations.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-10 text-center text-ink-muted"
                    >
                      Aucune opération dans cette session.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </SellerShell>
  )
}

export function SellerDashboardPageClient() {
  const router = useRouter()
  const convex = useConvex()
  const online = useOnlineStatus()
  const { isAuthenticated, isLoading } = useAuth()
  const liveDashboard = useQuery(
    api.functions.cash.sellerDashboard,
    E2E_MODE || !isAuthenticated ? "skip" : {}
  )
  const openSession = useMutation(api.functions.cash.openSession)
  const reprintTicket = useMutation(api.functions.sales.reprintTicket)
  const ticketPdf = useAction(api.functions.documents.ticketPdf)
  const [demoDashboard, setDemoDashboard] =
    useState<SellerDashboardData>(DEMO_DASHBOARD)
  const dashboard = E2E_MODE
    ? demoDashboard
    : (liveDashboard as SellerDashboardData | undefined)

  useEffect(() => {
    if (!E2E_MODE && !isLoading && !isAuthenticated) {
      router.replace("/connexion")
    }
  }, [isAuthenticated, isLoading, router])

  if (!dashboard) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-canvas">
        <p role="status" className="text-small text-ink-muted">
          Chargement de l’espace vendeur…
        </p>
      </main>
    )
  }

  return (
    <SellerDashboardScreen
      data={dashboard}
      online={online}
      onNavigate={(href) => router.push(href)}
      onReprint={async (saleId) => {
        if (E2E_MODE) {
          window.print()
          return
        }
        const detail = await convex.query(api.functions.sales.get, {
          saleId: saleId as never,
        })
        const ticket = detail.tickets.find(
          (candidate) => candidate.status === "valide"
        )
        if (!ticket) throw new Error("Aucun billet valide à réimprimer.")
        await reprintTicket({ ticketId: ticket._id })
        const { url } = await ticketPdf({
          ticketId: ticket._id,
          force: true,
        })
        window.open(url, "_blank", "noopener,noreferrer")
      }}
      onOpenCash={async (openingFloatXaf) => {
        if (E2E_MODE) {
          setDemoDashboard((current) => ({
            ...current,
            session: {
              id: "cash-e2e",
              openedAt: Date.now(),
              openingFloatXaf,
            },
          }))
        } else {
          await openSession({ openingFloatXaf })
        }
        toast.success("Caisse ouverte. Les ventes sont maintenant autorisées.")
      }}
      onSignOut={async () => {
        if (!E2E_MODE) await authClient.signOut()
        router.replace("/connexion")
      }}
    />
  )
}
