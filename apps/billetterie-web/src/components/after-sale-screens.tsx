"use client"

import {
  Clock3,
  Download,
  LogOut,
  RefreshCw,
  ShieldCheck,
  TrainFront,
} from "lucide-react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import QRCode from "react-qr-code"
import { useEffect, useState } from "react"

import { authClient } from "@workspace/api/auth-client"
import { useAction, useMutation, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import { Field, Input } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"
import { EmptyState, SkeletonLines } from "@workspace/ui/components/empty-state"
import { Switch } from "@workspace/ui/components/choice"
import { Tag } from "@workspace/ui/components/tag"
import { Ticket } from "@workspace/ui/components/voyage/ticket"
import { formatPrice } from "@workspace/ui/lib/format"

import { AccountDataSection } from "@/components/account/account-data-section"
import { AccountMobile } from "@/components/account/account-mobile"
import { AccountNavigation } from "@/components/account/account-navigation"
import { PaymentWaitingMobile } from "@/components/payment/payment-waiting-mobile"
import { ReservationsMobile } from "@/components/reservations/reservations-mobile"
import { TrackingMobile } from "@/components/tracking/tracking-mobile"
import { useReservations } from "@/features/reservations/use-reservations"
import {
  DEFAULT_BOOKING,
  DEFAULT_SEARCH,
  IS_E2E,
  demoTrips,
  gabonDate,
  ticketingStorage,
  type BookingDraft,
} from "@/lib/ticketing"
import { useTravelerAuth } from "@/hooks/use-traveler-auth"

const E2E_TRACKING_BASE = Date.UTC(2026, 7, 14, 8)

/** Desserte factice du mode de test, partagée par les deux vues du suivi. */
const E2E_TRACKING_STOPS = [
  {
    _id: "owe",
    station: { name: "Owendo" },
    departureAt: E2E_TRACKING_BASE,
    kilometerPoint: 0,
  },
  {
    _id: "ndj",
    station: { name: "Ndjolé" },
    arrivalAt: E2E_TRACKING_BASE + 3 * 60 * 60_000,
    kilometerPoint: 187,
  },
  {
    _id: "boo",
    station: { name: "Booué" },
    arrivalAt: E2E_TRACKING_BASE + 7 * 60 * 60_000,
    kilometerPoint: 335,
  },
  {
    _id: "fcv",
    station: { name: "Franceville" },
    arrivalAt: E2E_TRACKING_BASE + 12 * 60 * 60_000,
    kilometerPoint: 648,
  },
]

const CLASS_FACTORS = { DEUXIEME: 1, PREMIERE: 1.45, VIP: 1.9 } as const

/**
 * Montant du dossier en attente.
 *
 * Recalculé depuis la desserte retenue : l'écran d'attente n'a pas de devis
 * serveur sous la main, la vente étant déjà engagée.
 */
function paymentTotal(booking: BookingDraft | null) {
  const trip = ticketingStorage.getTrip() ?? demoTrips(DEFAULT_SEARCH)[0]!
  const passengers = booking?.passengers.length ?? 1
  const factor = CLASS_FACTORS[booking?.serviceClass ?? "DEUXIEME"]
  return Math.round(trip.priceXaf * passengers * factor)
}

export function PaymentWaiting() {
  const router = useRouter()
  const booking = ticketingStorage.getBooking()
  const [seconds, setSeconds] = useState(42)
  useEffect(() => {
    if (IS_E2E) return
    const interval = window.setInterval(
      () => setSeconds((value) => Math.max(0, value - 1)),
      1_000
    )
    const redirect = window.setTimeout(() => {
      const reference = ticketingStorage.getBooking()?.reference
      router.replace(
        reference
          ? `/reservation/${encodeURIComponent(reference)}`
          : "/mes-reservations"
      )
    }, 3_500)
    return () => {
      window.clearInterval(interval)
      window.clearTimeout(redirect)
    }
  }, [router])
  return (
    <>
      <PaymentWaitingMobile
        amountXaf={paymentTotal(booking)}
        methodLabel="Airtel Money"
        payerPhone={booking?.contactPhone || "votre téléphone"}
        countdown={`02:${String(seconds).padStart(2, "0")}`}
        extraAction={
          IS_E2E ? (
            <Button asChild block>
              <Link href="/confirmation">Simuler la confirmation</Link>
            </Button>
          ) : undefined
        }
      />
      <PaymentWaitingDesktop seconds={seconds} />
    </>
  )
}

/** Écran d'attente au format bureau. */
function PaymentWaitingDesktop({ seconds }: { seconds: number }) {
  return (
    <section className="mx-auto hidden max-w-xl justify-items-center gap-6 text-center md:grid">
      <span className="grid size-20 place-items-center rounded-pill bg-accent-soft text-accent-ink">
        <RefreshCw className="size-9 animate-spin" aria-hidden />
      </span>
      <div className="grid gap-2">
        <h1 className="text-h2">Validez le paiement sur votre téléphone</h1>
        <p className="text-body-lg text-ink-muted">
          Une demande Airtel Money vient d’être envoyée. Composez votre code
          secret pour confirmer.
        </p>
      </div>
      <div
        className="w-full overflow-hidden rounded-pill bg-line"
        aria-label="Paiement en attente"
      >
        <div
          className="h-2 w-2/3 animate-progress-slide rounded-pill bg-accent-base"
          data-motion="progress"
        />
      </div>
      <span className="tabular text-h3">
        02:{String(seconds).padStart(2, "0")}
      </span>
      <InlineMessage
        tone="info"
        title="Vos places restent bloquées pendant cette vérification."
      >
        Ne fermez pas cette page.
      </InlineMessage>
      {IS_E2E && (
        <Button asChild>
          <Link href="/confirmation">Simuler la confirmation</Link>
        </Button>
      )}
      <Button asChild variant="ghost">
        <Link href="/paiement">Changer de moyen de paiement</Link>
      </Button>
    </section>
  )
}

export function ConfirmationScreen({
  counterPayment = false,
}: {
  counterPayment?: boolean
}) {
  const storedBooking = ticketingStorage.getBooking()
  const storedTrip = ticketingStorage.getTrip()
  const booking = storedBooking ?? {
    ...DEFAULT_BOOKING,
    reference: "RS-2026-084517",
  }
  const trip = storedTrip ?? demoTrips(DEFAULT_SEARCH)[0]!
  const canQuery =
    !IS_E2E &&
    Boolean(booking.reference && booking.reference !== "RS-2026-084517")
  const detail = useQuery(
    api.functions.bookings.getByReference,
    canQuery
      ? { reference: booking.reference!, contactPhone: booking.contactPhone }
      : "skip"
  )
  const ticketPdf = useAction(api.functions.documents.ticketPdf)
  const backendTicket = detail?.tickets[0]
  async function download() {
    if (!backendTicket) return
    const result = await ticketPdf({
      ticketId: backendTicket._id,
      contactPhone: booking.contactPhone,
    })
    window.location.assign(result.url)
  }
  if ((!storedBooking || !storedTrip) && !IS_E2E) {
    return (
      <EmptyState
        title="Aucun billet à afficher"
        description="Ouvrez cette page depuis une réservation confirmée ou depuis votre espace voyageur."
        action={
          <Button asChild>
            <Link href="/mes-reservations">Mes réservations</Link>
          </Button>
        }
      />
    )
  }
  return (
    <div className="grid gap-8">
      <InlineMessage
        tone={counterPayment ? "warning" : "success"}
        title={
          counterPayment
            ? "Votre réservation est enregistrée."
            : "Paiement reçu, vos billets sont prêts."
        }
      >
        {counterPayment
          ? "Réglez-la dans une gare SETRAG avant l’échéance indiquée."
          : "Téléchargez votre billet ici ou retrouvez-le dans vos réservations."}
      </InlineMessage>
      <div className="flex min-w-0 flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <span className="text-mono-label text-ink-muted">
            Référence de réservation
          </span>
          <h1 className="tabular text-h1 break-all">
            {booking.reference ?? "RS-2026-084517"}
          </h1>
        </div>
        <div className="grid w-full min-w-0 gap-2 sm:flex sm:w-auto">
          <Button
            variant="secondary"
            onClick={download}
            disabled={!backendTicket}
            className="min-w-0 text-center whitespace-normal"
          >
            <Download /> Télécharger le PDF
          </Button>
          <Button asChild className="min-w-0 text-center whitespace-normal">
            <Link href="/mes-reservations">Mes réservations</Link>
          </Button>
        </div>
      </div>
      <Ticket
        legLabel="Aller · voyage confirmé"
        routeLabel={`${trip.originName} → ${trip.destinationName}`}
        departureAt={trip.departureAt}
        arrivalAt={trip.arrivalAt}
        passengerLabel={`${booking.passengers[0]?.firstName ?? "Ariane"} ${booking.passengers[0]?.lastName ?? "Moussavou"}`}
        reference={booking.reference ?? "RS-2026-084517"}
        seatLabel={
          counterPayment ? "Attribuée au paiement" : "Voiture 4 · Place 18"
        }
        conditionsNote={
          counterPayment
            ? "À régler au guichet"
            : "Présentez ce code à l’embarquement"
        }
        qrCode={
          <QRCode
            value={
              backendTicket?.barcodePayload ??
              `SETRAG:${booking.reference ?? "RS-2026-084517"}`
            }
            size={128}
          />
        }
      />
    </div>
  )
}

/**
 * Mes réservations.
 *
 * Les états communs — chargement, visiteur non connecté, liste vide — sont
 * rendus une fois pour les deux largeurs ; seule la liste elle-même diverge.
 */
export function ReservationsScreen() {
  const reservations = useReservations()

  if (reservations.state === "loading") return <SkeletonLines lines={5} />

  if (reservations.state === "anonymous") {
    return (
      <div className="grid gap-4">
        <InlineMessage
          tone="info"
          title="Connectez-vous pour retrouver automatiquement votre historique."
        >
          L’achat d’un billet reste possible sans compte.
        </InlineMessage>
        <Button asChild className="w-fit">
          <Link href="/connexion?intention=connexion&retour=/mes-reservations">
            Se connecter
          </Link>
        </Button>
      </div>
    )
  }

  if (reservations.state === "empty") {
    return (
      <EmptyState
        title="Aucune réservation"
        description="Vos prochains voyages apparaîtront ici."
        action={
          <Button asChild>
            <Link href="/">Rechercher un train</Link>
          </Button>
        }
      />
    )
  }

  return (
    <>
      <ReservationsMobile reservations={reservations} />
      <ReservationsDesktop reservations={reservations} />
    </>
  )
}

/** Liste des dossiers au format bureau : une carte large par vente. */
function ReservationsDesktop({
  reservations,
}: {
  reservations: ReturnType<typeof useReservations>
}) {
  return (
    <div className="hidden min-w-0 gap-5 md:grid">
      {reservations.message && (
        <InlineMessage tone="info" title={reservations.message} />
      )}
      {reservations.items.map((item) => (
        <Card key={item.sale.number} className="min-w-0">
          <CardHeader className="flex-col items-start gap-3 sm:flex-row sm:justify-between">
            <div className="min-w-0">
              <span className="text-mono-label text-ink-muted">
                {item.sale.number}
              </span>
              <CardTitle>
                {item.origin?.name ?? "Départ"} →{" "}
                {item.destination?.name ?? "Arrivée"}
              </CardTitle>
            </div>
            <Tag
              tone={
                item.sale.status === "confirmee"
                  ? "success"
                  : item.sale.status === "en_attente_paiement"
                    ? "warning"
                    : "neutral"
              }
            >
              {item.sale.status === "confirmee"
                ? "Payée"
                : item.sale.status === "en_attente_paiement"
                  ? "À payer"
                  : item.sale.status === "remboursee"
                    ? "Remboursée"
                    : item.sale.status === "annulee"
                      ? "Annulée"
                      : item.sale.status}
            </Tag>
          </CardHeader>
          <CardContent className="text-small grid gap-2 text-ink-muted">
            <span>
              {item.trip?.trainNumber ?? "Train"} ·{" "}
              {item.trip
                ? new Date(item.trip.departureAt).toLocaleDateString("fr-FR")
                : "date indisponible"}{" "}
              · {item.tickets.length} billet(s)
            </span>
            <strong className="text-h4 text-ink">
              {formatPrice(item.sale.amounts.ttc)}
            </strong>
          </CardContent>
          <CardFooter className="grid min-w-0 gap-2 sm:flex">
            <Button asChild className="min-w-0 text-center whitespace-normal">
              <Link
                href={`/reservation/${encodeURIComponent(item.sale.number)}`}
              >
                Voir les billets
              </Link>
            </Button>
            <Button
              asChild
              variant="secondary"
              className="min-w-0 text-center whitespace-normal"
            >
              <Link
                href={`/suivi?train=${encodeURIComponent(item.trip?.trainNumber ?? "")}&date=${item.trip ? new Date(item.trip.departureAt).toISOString().slice(0, 10) : ""}`}
              >
                Suivre le train
              </Link>
            </Button>
            {item.sale.status === "en_attente_paiement" && (
              <Button
                variant="danger"
                disabled={reservations.cancelling === item.sale.number}
                onClick={() => {
                  if (
                    !window.confirm(
                      `Annuler la réservation ${item.sale.number} et libérer les places ?`
                    )
                  )
                    return
                  void reservations.cancel(item.sale.number)
                }}
              >
                {reservations.cancelling === item.sale.number
                  ? "Annulation…"
                  : "Annuler la réservation"}
              </Button>
            )}
          </CardFooter>
        </Card>
      ))}
    </div>
  )
}

export function TrackingScreen() {
  const router = useRouter()
  const params = useSearchParams()
  const storedTrip = ticketingStorage.getTrip()
  const fallbackTrip = demoTrips(DEFAULT_SEARCH)[0]!
  const [trainNumber, setTrainNumber] = useState(
    params.get("train") ??
      storedTrip?.trainNumber ??
      (IS_E2E ? fallbackTrip.trainNumber : "")
  )
  const [serviceDate, setServiceDate] = useState(
    params.get("date") ??
      (storedTrip
        ? new Intl.DateTimeFormat("fr-CA", {
            timeZone: "Africa/Libreville",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).format(new Date(storedTrip.departureAt))
        : gabonDate(0))
  )
  const todayTrips = useQuery(
    api.functions.trips.listByDate,
    IS_E2E ? "skip" : { serviceDate }
  )
  const liveTrip = todayTrips?.find((trip) => trip.trainNumber === trainNumber)
  const detail = useQuery(
    api.functions.trips.get,
    !IS_E2E && liveTrip ? { tripId: liveTrip._id } : "skip"
  )
  const delay = liveTrip?.delayMinutes ?? (IS_E2E ? 25 : 0)
  const showTimeline = IS_E2E || Boolean(liveTrip)
  const status =
    liveTrip?.status === "annule"
      ? "Circulation supprimée"
      : liveTrip?.status === "termine"
        ? "Desserte terminée"
        : delay > 0
          ? `Retard de ${delay} min`
          : "À l’heure"
  const formatHour = (timestamp?: number) =>
    timestamp
      ? new Intl.DateTimeFormat("fr-FR", {
          timeZone: "Africa/Libreville",
          hour: "2-digit",
          minute: "2-digit",
        }).format(timestamp)
      : "—"
  function applySearch() {
    const query = new URLSearchParams({
      train: trainNumber.trim().toUpperCase(),
      date: serviceDate,
    })
    router.replace(`/suivi?${query.toString()}`)
  }

  const trackingStops = IS_E2E ? E2E_TRACKING_STOPS : (detail?.stops ?? [])

  return (
    <div className="grid gap-6">
      <TrackingMobile
        trainNumber={trainNumber}
        serviceDate={serviceDate}
        onTrainNumberChange={setTrainNumber}
        onServiceDateChange={setServiceDate}
        onSubmit={applySearch}
        showTimeline={showTimeline}
        status={status}
        statusTone={
          liveTrip?.status === "annule"
            ? "danger"
            : delay > 0
              ? "warning"
              : "success"
        }
        statusNote={
          liveTrip?.status === "annule"
            ? "Consultez votre dossier pour connaître les conditions de report ou de remboursement."
            : "Dernière mise à jour : à l’instant."
        }
        delayMinutes={delay}
        stops={trackingStops}
        cancelled={liveTrip?.status === "annule"}
      />

      <form
        className="hidden flex-wrap items-end gap-3 md:flex"
        onSubmit={(event) => {
          event.preventDefault()
          applySearch()
        }}
      >
        <Field
          label="Numéro de train"
          htmlFor="train-number"
          className="flex-1"
        >
          <Input
            value={trainNumber}
            onChange={(event) =>
              setTrainNumber(event.target.value.toUpperCase())
            }
          />
        </Field>
        <Field label="Date de circulation" htmlFor="tracking-date">
          <Input
            id="tracking-date"
            type="date"
            value={serviceDate}
            onChange={(event) => setServiceDate(event.target.value)}
          />
        </Field>
        <Button type="submit">Suivre ce train</Button>
      </form>
      {showTimeline ? (
        <Card className="hidden overflow-hidden md:block">
          <CardHeader className="bg-ink text-ink-inverse">
            <div className="flex items-center justify-between gap-4">
              <div>
                <span className="text-mono-label text-accent-on-ink">
                  En circulation
                </span>
                <CardTitle className="text-h2">
                  {trainNumber || "TR-201"}
                </CardTitle>
              </div>
              <TrainFront className="size-12 text-accent-on-ink" />
            </div>
          </CardHeader>
          <CardContent className="grid gap-6 pt-6">
            <InlineMessage
              tone={
                liveTrip?.status === "annule"
                  ? "danger"
                  : delay > 0
                    ? "warning"
                    : "success"
              }
              title={status}
            >
              {liveTrip?.status === "annule"
                ? "Consultez votre dossier pour connaître les conditions de report ou de remboursement."
                : "Dernière mise à jour : à l’instant."}
            </InlineMessage>
            <div className="relative grid gap-6 border-l-2 border-accent-line pl-6">
              {trackingStops.map((stop, index, stops) => (
                <div key={stop._id} className="relative">
                  <span
                    className="absolute top-1 -left-[31px] size-3 rounded-pill bg-accent-base"
                    aria-hidden
                  />
                  <strong>
                    {stop.station?.name ?? "Gare"} ·{" "}
                    <span className="tabular">
                      {formatHour(stop.departureAt ?? stop.arrivalAt)}
                    </span>
                  </strong>
                  <p className="text-small text-ink-muted">
                    {index === 0
                      ? "Départ"
                      : index === stops.length - 1
                        ? `Arrivée estimée ${formatHour((stop.arrivalAt ?? stop.departureAt)! + delay * 60_000)}`
                        : `Passage estimé ${formatHour((stop.arrivalAt ?? stop.departureAt)! + delay * 60_000)}`}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        <EmptyState
          className="hidden md:grid"
          title="Saisissez le numéro indiqué sur votre billet"
          description="Le statut de la desserte apparaîtra ici et se mettra à jour automatiquement."
        />
      )}
    </div>
  )
}

export function AccountScreen() {
  const router = useRouter()
  const { isAuthenticated, isLoading, isProfileReady, profile, user } =
    useTravelerAuth()
  const updateProfile = useMutation(api.functions.customers.updateProfile)
  const grantConsent = useMutation(api.functions.customers.grantConsent)
  const revokeConsent = useMutation(api.functions.customers.revokeConsent)
  const deleteAccount = useMutation(api.functions.customers.deleteMyAccount)
  const exportData = useQuery(
    api.functions.customers.exportMyData,
    isAuthenticated && isProfileReady ? {} : "skip"
  )
  const [marketingDraft, setMarketing] = useState<boolean>()
  const [saved, setSaved] = useState(false)
  const [accountMessage, setAccountMessage] = useState<string>()
  const [deleteConfirmation, setDeleteConfirmation] = useState("")
  const [firstNameDraft, setFirstName] = useState<string>()
  const [lastNameDraft, setLastName] = useState<string>()
  const [phoneDraft, setPhone] = useState<string>()
  const [emailDraft, setEmail] = useState<string>()
  const firstName =
    firstNameDraft ?? profile?.user.firstName ?? user?.name?.split(" ")[0] ?? ""
  const lastName =
    lastNameDraft ??
    profile?.user.lastName ??
    user?.name?.split(" ").slice(1).join(" ") ??
    ""
  const email =
    emailDraft ??
    profile?.user.email ??
    (user?.email?.endsWith("@auth.setrag.local") ? "" : user?.email) ??
    ""
  const phone = phoneDraft ?? profile?.user.phone ?? ""
  const marketing =
    marketingDraft ??
    profile?.consents.some(
      (consent) =>
        consent.type === "marketing" && consent.revokedAt === undefined
    ) ??
    false
  async function save() {
    if (isAuthenticated)
      await updateProfile({
        firstName,
        lastName,
        phone: phone || undefined,
        email: email || undefined,
      })
    setSaved(true)
  }
  async function toggleMarketing(value: boolean) {
    setMarketing(value)
    if (isAuthenticated) {
      if (value)
        await grantConsent({
          type: "marketing",
          version: "marketing-2026-01",
          channel: "web",
        })
      else await revokeConsent({ type: "marketing" })
    }
  }
  function downloadExport() {
    if (!exportData) {
      setAccountMessage("Votre export est encore en préparation.")
      return
    }
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(exportData, null, 2)], {
        type: "application/json",
      })
    )
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = `mes-donnees-setrag-${new Date().toISOString().slice(0, 10)}.json`
    anchor.click()
    URL.revokeObjectURL(url)
    setAccountMessage("Votre export a été téléchargé.")
  }
  async function removeAccount() {
    try {
      await deleteAccount({ confirmation: deleteConfirmation })
      await authClient.signOut()
      setAccountMessage(
        "Votre compte a été anonymisé. Les écritures légalement obligatoires sont conservées."
      )
      setDeleteConfirmation("")
      router.replace("/")
      router.refresh()
    } catch (cause) {
      setAccountMessage(
        cause instanceof Error
          ? cause.message
          : "La suppression n’a pas pu être effectuée."
      )
    }
  }
  if (isLoading) return <SkeletonLines lines={5} />
  if (!isAuthenticated) {
    return (
      <EmptyState
        title="Connectez-vous pour gérer votre compte"
        description="La connexion se fait avec un code à usage unique, sans mot de passe."
        action={
          <Button asChild>
            <Link href="/connexion?intention=connexion&retour=/compte">
              Se connecter
            </Link>
          </Button>
        }
      />
    )
  }
  if (!isProfileReady || !profile) return <SkeletonLines lines={5} />
  return (
    <>
      <AccountMobile>
        <AccountDataSection />
      </AccountMobile>
      <div className="hidden min-w-0 gap-6 md:grid lg:grid-cols-2">
        <Card className="min-w-0 lg:col-span-2">
          <CardHeader>
            <CardTitle>Réglages du compte</CardTitle>
          </CardHeader>
          <CardContent>
            <AccountNavigation layout="grid" />
          </CardContent>
        </Card>
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Informations personnelles</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Field label="Prénom" htmlFor="profile-first-name">
              <Input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </Field>
            <Field label="Nom" htmlFor="profile-last-name">
              <Input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </Field>
            <Field label="Téléphone" htmlFor="profile-phone">
              <Input
                id="profile-phone"
                type="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </Field>
            <Field label="Adresse e-mail" htmlFor="profile-email">
              <Input
                id="profile-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Button
              onClick={save}
              className="h-auto min-h-11 min-w-0 py-2 text-center whitespace-normal"
            >
              Enregistrer les modifications
            </Button>
            {saved && (
              <InlineMessage tone="success" title="Profil enregistré." />
            )}
          </CardContent>
        </Card>
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Consentements et données</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Switch
              label="Recevoir les offres SETRAG"
              checked={marketing}
              onCheckedChange={toggleMarketing}
            />
            <InlineMessage
              tone="info"
              title="Vos choix sont versionnés et révocables à tout moment."
            />
            <Button
              variant="secondary"
              onClick={downloadExport}
              className="h-auto min-h-11 min-w-0 py-2 text-center whitespace-normal"
            >
              <Download /> Exporter mes données
            </Button>
            <Button
              variant="ghost"
              onClick={async () => {
                await authClient.signOut()
                router.replace("/")
                router.refresh()
              }}
              className="h-auto min-h-11 min-w-0 py-2 text-center whitespace-normal"
            >
              <LogOut /> Se déconnecter
            </Button>
            <Dialog>
              <DialogTrigger asChild>
                <Button
                  variant="danger"
                  className="h-auto min-h-11 min-w-0 py-2 text-center whitespace-normal"
                >
                  Supprimer mon compte
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Supprimer mon compte</DialogTitle>
                  <DialogDescription>
                    Le profil sera anonymisé. Les réservations, paiements et
                    écritures comptables imposés par la loi seront conservés.
                  </DialogDescription>
                </DialogHeader>
                <Field
                  label="Saisissez SUPPRIMER pour confirmer"
                  htmlFor="delete-confirmation"
                >
                  <Input
                    id="delete-confirmation"
                    value={deleteConfirmation}
                    onChange={(event) =>
                      setDeleteConfirmation(event.target.value)
                    }
                  />
                </Field>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="secondary">Renoncer</Button>
                  </DialogClose>
                  <Button
                    variant="danger"
                    disabled={deleteConfirmation !== "SUPPRIMER"}
                    onClick={removeAccount}
                  >
                    Confirmer la suppression
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            {accountMessage && (
              <InlineMessage tone="info" title={accountMessage} />
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}

export function OtpScreen() {
  const router = useRouter()
  const params = useSearchParams()
  const { isAuthenticated, isLoading } = useTravelerAuth()
  const authStatus = useQuery(api.functions.devAuth.status, {})
  const consumeDevCode = useMutation(api.functions.devAuth.consumeCode)
  const intention =
    params.get("intention") === "inscription" ? "inscription" : "connexion"
  const requestedReturn = params.get("retour")
  const returnTo =
    requestedReturn?.startsWith("/") &&
    !requestedReturn.startsWith("//") &&
    !requestedReturn.startsWith("/connexion")
      ? requestedReturn
      : "/"
  const [mode, setMode] = useState<"phone" | "email">("email")
  const [identifier, setIdentifier] = useState("")
  const [code, setCode] = useState("")
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string>()
  const [pending, setPending] = useState(false)
  const developmentEnabled = IS_E2E || Boolean(authStatus?.developmentEnabled)
  const emailEnabled =
    developmentEnabled || Boolean(authStatus?.emailDeliveryEnabled)
  const phoneEnabled =
    developmentEnabled || Boolean(authStatus?.smsDeliveryEnabled)
  const channelEnabled = mode === "email" ? emailEnabled : phoneEnabled

  useEffect(() => {
    if (!isLoading && isAuthenticated) router.replace(returnTo)
  }, [isAuthenticated, isLoading, returnTo, router])

  function normalizedIdentifier() {
    if (mode === "email") return identifier.trim().toLowerCase()
    return identifier.replace(/[\s().-]/g, "")
  }

  function selectMode(nextMode: "phone" | "email") {
    setMode(nextMode)
    setIdentifier("")
    setCode("")
    setSent(false)
    setError(undefined)
  }

  async function send() {
    setPending(true)
    setError(undefined)
    try {
      if (!channelEnabled) {
        throw new Error(
          mode === "email"
            ? "L'envoi des codes par e-mail n'est pas encore configuré."
            : "L'envoi des codes par SMS n'est pas encore configuré."
        )
      }
      const target = normalizedIdentifier()
      if (!target) throw new Error("Renseignez votre identifiant.")
      if (!IS_E2E) {
        const result =
          mode === "phone"
            ? await authClient.phoneNumber.sendOtp({ phoneNumber: target })
            : await authClient.emailOtp.sendVerificationOtp({
                email: target,
                type: "sign-in",
              })
        if (result.error) {
          throw new Error(result.error.message ?? "Envoi du code impossible")
        }
      }
      setIdentifier(target)
      setCode("")
      setSent(true)
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Impossible d'envoyer le code."
      )
    } finally {
      setPending(false)
    }
  }

  async function retrieveDevelopmentCode() {
    setPending(true)
    setError(undefined)
    try {
      const result = await consumeDevCode({
        identifier: normalizedIdentifier(),
      })
      if (!result) throw new Error("Aucun code de développement disponible.")
      setCode(result.code)
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Le code de développement est indisponible."
      )
    } finally {
      setPending(false)
    }
  }

  async function verify() {
    setPending(true)
    setError(undefined)
    try {
      if (code.length !== 6) throw new Error("Saisissez le code à 6 chiffres.")
      if (!IS_E2E) {
        const target = normalizedIdentifier()
        const result =
          mode === "phone"
            ? await authClient.phoneNumber.verify({
                phoneNumber: target,
                code,
              })
            : await authClient.signIn.emailOtp({
                email: target,
                otp: code,
              })
        if (result.error) {
          throw new Error(result.error.message ?? "Le code saisi est invalide.")
        }
      }
      if (IS_E2E) {
        router.replace(returnTo)
      } else {
        // La session cross-domain et le jeton Convex doivent être relus
        // ensemble. Une navigation SPA peut conserver l'ancien état anonyme
        // alors que le cookie Better Auth vient déjà d'être écrit.
        authClient.updateSession()
        window.location.replace(returnTo)
      }
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Le code saisi est invalide."
      )
    } finally {
      setPending(false)
    }
  }

  if (isLoading || isAuthenticated) return <SkeletonLines lines={5} />

  return (
    // Carte au-delà de 768 px, pleine largeur en dessous : sur un écran étroit
    // un cadre supplémentaire ne fait que rogner la place du formulaire.
    <Card className="mx-auto max-w-lg border-0 bg-transparent p-0 shadow-none md:border md:bg-surface md:p-6 md:shadow-sm">
      <CardHeader className="text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-pill bg-accent-soft text-accent-ink">
          <ShieldCheck />
        </span>
        <h1 className="text-h3 md:text-h2 font-semibold">
          {intention === "inscription" ? "S’inscrire" : "Se connecter"}
        </h1>
        <p className="text-small text-ink-muted">
          {intention === "inscription"
            ? "Créez votre compte avec un code à usage unique, sans mot de passe."
            : "Recevez un code à usage unique pour accéder à votre compte."}
        </p>
      </CardHeader>
      <CardContent className="grid gap-4">
        {/* `min-w-0` sur les deux colonnes : sans lui, « Téléphone » élargit la
            pastille au-delà de l'écran sous 360 px. */}
        <div className="grid grid-cols-2 gap-1 rounded-pill bg-surface-sunk p-1 *:min-w-0">
          <Button
            variant={mode === "phone" ? "primary" : "ghost"}
            size="sm"
            disabled={!phoneEnabled}
            onClick={() => selectMode("phone")}
          >
            Téléphone
          </Button>
          <Button
            variant={mode === "email" ? "primary" : "ghost"}
            size="sm"
            disabled={!emailEnabled}
            onClick={() => selectMode("email")}
          >
            E-mail
          </Button>
        </div>
        {authStatus !== undefined && !emailEnabled && !phoneEnabled && (
          <InlineMessage
            tone="warning"
            title="La connexion n’est pas encore activée."
          >
            Configurez l’envoi des codes par e-mail ou activez le mode de
            développement sur le déploiement local.
          </InlineMessage>
        )}
        <Field
          label={mode === "phone" ? "Numéro de téléphone" : "Adresse e-mail"}
          htmlFor="otp-identifier"
        >
          <Input
            id="otp-identifier"
            type={mode === "phone" ? "tel" : "email"}
            autoComplete={mode === "phone" ? "tel" : "email"}
            placeholder={
              mode === "phone" ? "+241 06 12 34 56" : "vous@exemple.ga"
            }
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
          />
        </Field>
        {!sent ? (
          <Button
            size="lg"
            onClick={send}
            loading={pending}
            disabled={!channelEnabled || !identifier.trim()}
          >
            Recevoir mon code
          </Button>
        ) : (
          <>
            <InlineMessage tone="success" title="Code envoyé.">
              Il reste valable dix minutes.
            </InlineMessage>
            <Field label="Code à 6 chiffres" htmlFor="otp-code">
              <Input
                id="otp-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(event) =>
                  setCode(event.target.value.replace(/\D/g, ""))
                }
              />
            </Field>
            {developmentEnabled && !IS_E2E && (
              <Button
                variant="secondary"
                onClick={retrieveDevelopmentCode}
                loading={pending}
              >
                Utiliser le code de développement
              </Button>
            )}
            <Button
              size="lg"
              onClick={verify}
              loading={pending}
              disabled={code.length !== 6}
            >
              Continuer
            </Button>
            <Button variant="ghost" onClick={send} disabled={pending}>
              <Clock3 /> Renvoyer le code
            </Button>
          </>
        )}
        {error && <InlineMessage tone="danger" title={error} />}
      </CardContent>
    </Card>
  )
}
