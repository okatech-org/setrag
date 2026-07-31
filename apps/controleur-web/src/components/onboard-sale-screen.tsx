"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import { Field, Input } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"
import { Stepper } from "@workspace/ui/components/stepper"

import { humanError } from "@/lib/errors"
import { classLabel, dayTime, xaf } from "@/lib/format"
import { commitOperation } from "@/lib/offline/db"
import { availableClasses, quoteOnboard } from "@/lib/offline/fares"
import { clientId, localNumber, nowMs } from "@/lib/offline/ids"
import type { LocalSale } from "@/lib/offline/types"
import { NetworkBadge, StatusTag } from "./network-badge"
import { useTerminal } from "./terminal-provider"

/**
 * Vente à bord — CM-07.
 *
 * Trois étapes : trajet restant, encaissement, titre remis. Le prix vient du
 * barème embarqué, donc le calcul survit à l'absence de réseau ; la vente,
 * elle, part en file d'envoi et prend son numéro définitif au retour du
 * signal. Le voyageur repart avec une référence provisoire, et l'écran le dit
 * plutôt que de laisser croire à un titre déjà enregistré.
 *
 * Aucune place n'est bloquée : à bord, on constate, on ne réserve pas.
 */

type Step = 0 | 1 | 2
type ServiceClass = "DEUXIEME" | "PREMIERE" | "VIP"

const CASH_SHORTCUTS = [5_000, 10_000, 15_000, 20_000]

/** Abrégés des classes, pour les commandes serrées. */
const SHORT_CLASS: Record<ServiceClass, string> = {
  DEUXIEME: "2e",
  PREMIERE: "1re",
  VIP: "VIP",
}

export function OnboardSaleScreen() {
  const router = useRouter()
  const { manifest, settings, online, refresh } = useTerminal()

  const [step, setStep] = useState<Step>(0)
  const [fromSequence, setFromSequence] = useState(settings.currentStopIndex)
  const [toSequence, setToSequence] = useState(
    Math.min(settings.currentStopIndex + 1, 99)
  )
  const [serviceClass, setServiceClass] = useState<ServiceClass>("DEUXIEME")
  const [method, setMethod] = useState<LocalSale["method"]>("especes")
  const [tendered, setTendered] = useState("")
  const [lastName, setLastName] = useState("")
  const [firstName, setFirstName] = useState("")
  const [gender, setGender] = useState<"M" | "F">("M")
  const [phone, setPhone] = useState("")
  const [saved, setSaved] = useState<LocalSale | null>(null)
  const [pending, setPending] = useState(false)

  const classes = useMemo(
    () => (manifest ? availableClasses(manifest) : []),
    [manifest]
  )

  const quote = useMemo(() => {
    if (!manifest) return null
    try {
      return quoteOnboard(manifest, { fromSequence, toSequence, serviceClass })
    } catch {
      return null
    }
  }, [manifest, fromSequence, toSequence, serviceClass])

  const quoteError = useMemo(() => {
    if (!manifest) return "Aucun manifeste embarqué."
    try {
      quoteOnboard(manifest, { fromSequence, toSequence, serviceClass })
      return null
    } catch (error) {
      return (error as Error).message
    }
  }, [manifest, fromSequence, toSequence, serviceClass])

  const tenderedValue = Number.parseInt(tendered.replace(/\s/g, ""), 10) || 0
  const change = quote ? tenderedValue - quote.ttc : 0

  if (!manifest) {
    return (
      <main className="safe-top flex flex-1 flex-col gap-4 px-5 pt-5">
        <InlineMessage tone="warning" title="Aucun manifeste embarqué.">
          La vente à bord exige le barème kilométrique de la desserte.
        </InlineMessage>
        <Button size="lg" block asChild>
          <Link href="/manifeste">Télécharger le manifeste</Link>
        </Button>
      </main>
    )
  }

  async function confirm() {
    if (!quote || !manifest) return
    if (method === "especes" && change < 0) {
      toast.error("Montant remis insuffisant.")
      return
    }
    setPending(true)
    try {
      const from = manifest.stops.find((s) => s.sequence === fromSequence)!
      const to = manifest.stops.find((s) => s.sequence === toSequence)!
      const sale: LocalSale = {
        clientSaleId: clientId("sale"),
        tripId: manifest.tripId,
        originStationId: from.stationId,
        destinationStationId: to.stationId,
        originName: from.name,
        destinationName: to.name,
        serviceClass,
        passengers: [
          {
            lastName: lastName.trim() || "VOYAGEUR",
            firstName: firstName.trim() || "À BORD",
            gender,
            phone: phone.trim() || undefined,
          },
        ],
        distanceKm: quote.distanceKm,
        quotedXaf: quote.ttc,
        tenderedXaf: method === "especes" ? tenderedValue : undefined,
        changeXaf: method === "especes" ? change : undefined,
        method,
        localRef: localNumber("B", 4),
        soldAt: nowMs(),
        state: "pending",
      }
      await commitOperation("sale", sale.clientSaleId, sale)
      await refresh()
      setSaved(sale)
      setStep(2)
    } catch (error) {
      toast.error(humanError(error))
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="safe-top flex flex-1 flex-col gap-5 px-5 pt-5 pb-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-h3">Vente à bord</h1>
          <p className="text-[13px] text-ink-muted">
            {manifest.trainNumber} · voiture {settings.coachLabel}
          </p>
        </div>
        <NetworkBadge />
      </header>

      <Stepper
        steps={[{ label: "Trajet" }, { label: "Encaissement" }, { label: "Titre" }]}
        current={step}
      />

      {step === 0 && (
        <>
          <Field label="Départ du trajet restant" hint="Dernière gare atteinte.">
            <select
              value={fromSequence}
              onChange={(event) => setFromSequence(Number(event.target.value))}
              className="h-13 w-full rounded-md border border-line-strong bg-surface px-4 text-[16px] outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {manifest.stops.map((stop) => (
                <option key={stop.sequence} value={stop.sequence}>
                  {stop.name} · PK {stop.kilometerPoint}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Destination">
            <select
              value={toSequence}
              onChange={(event) => setToSequence(Number(event.target.value))}
              className="h-13 w-full rounded-md border border-line-strong bg-surface px-4 text-[16px] outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {manifest.stops.map((stop) => (
                <option key={stop.sequence} value={stop.sequence}>
                  {stop.name} · PK {stop.kilometerPoint}
                </option>
              ))}
            </select>
          </Field>

          <fieldset>
            <legend className="text-[13px] font-medium">Classe</legend>
            {/* Libellés abrégés : à trois classes, « 2e classe » et « 1re
                classe » ne tiennent pas côte à côte sur 375 px. Le mot est
                déjà porté par la légende ; le libellé complet reste annoncé
                aux lecteurs d'écran. */}
            <div className="mt-2 flex gap-2">
              {classes.map((cls) => (
                <Button
                  key={cls}
                  type="button"
                  variant={serviceClass === cls ? "primary" : "secondary"}
                  size="md"
                  className="min-w-0 flex-1 px-2"
                  aria-label={classLabel(cls)}
                  aria-pressed={serviceClass === cls}
                  onClick={() => setServiceClass(cls)}
                >
                  {SHORT_CLASS[cls]}
                </Button>
              ))}
            </div>
          </fieldset>

          {quoteError ? (
            <InlineMessage tone="danger" title="Tarif indisponible.">
              {quoteError}
            </InlineMessage>
          ) : (
            <section className="rounded-md border border-line bg-surface-sunk p-4">
              <p className="text-[13px] text-ink-muted tabular">
                {quote!.distanceKm} km · {quote!.ratePerKm} FCFA/km ·{" "}
                {manifest.fare?.label}
              </p>
              <p className="mt-1 text-h3 tabular">{xaf(quote!.ttc)}</p>
            </section>
          )}

          <Button
            size="lg"
            block
            disabled={Boolean(quoteError)}
            onClick={() => setStep(1)}
          >
            Encaisser {quote ? xaf(quote.ttc) : ""}
          </Button>
        </>
      )}

      {step === 1 && quote && (
        <>
          <section className="rounded-md border border-line bg-surface p-4">
            <p className="text-[13px] text-ink-muted">Montant dû</p>
            <p className="text-h2 tabular">{xaf(quote.ttc)}</p>
          </section>

          <fieldset>
            <legend className="text-[13px] font-medium">Mode de paiement</legend>
            <div className="mt-2 flex gap-2">
              <Button
                type="button"
                variant={method === "especes" ? "primary" : "secondary"}
                size="lg"
                className="flex-1"
                onClick={() => setMethod("especes")}
              >
                Espèces
              </Button>
              <Button
                type="button"
                variant={method !== "especes" ? "primary" : "secondary"}
                size="lg"
                className="flex-1"
                onClick={() => setMethod("airtel_money")}
              >
                Mobile money
              </Button>
            </div>
          </fieldset>

          {method !== "especes" && (
            <InlineMessage tone="warning" title="Le mobile money exige le réseau.">
              La demande partira à la reconnexion et le titre reste dû. Ne
              laissez pas croire au voyageur que le paiement est passé.
            </InlineMessage>
          )}

          {method === "especes" && (
            <>
              <Field label="Montant remis">
                <Input
                  inputMode="numeric"
                  className="tabular"
                  value={tendered}
                  onChange={(event) =>
                    setTendered(event.target.value.replace(/\D/g, ""))
                  }
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                {CASH_SHORTCUTS.map((amount) => (
                  <Button
                    key={amount}
                    type="button"
                    variant="secondary"
                    size="md"
                    onClick={() => setTendered(String(amount))}
                  >
                    {amount.toLocaleString("fr-FR")}
                  </Button>
                ))}
              </div>
              <section
                className={`rounded-md p-4 ${
                  change < 0
                    ? "bg-danger-soft text-danger-ink"
                    : "bg-surface-sunk"
                }`}
              >
                <p className="text-[13px]">
                  {change < 0 ? "Montant insuffisant" : "À rendre"}
                </p>
                <p className="text-h3 tabular">{xaf(Math.abs(change))}</p>
              </section>
            </>
          )}

          <details className="rounded-md border border-line bg-surface p-4">
            <summary className="cursor-pointer text-[15px] font-semibold">
              Identité du voyageur (facultative)
            </summary>
            <div className="mt-3 flex flex-col gap-3">
              <Field label="Nom">
                <Input
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                />
              </Field>
              <Field label="Prénom">
                <Input
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                />
              </Field>
              <div className="flex gap-2">
                {(["M", "F"] as const).map((value) => (
                  <Button
                    key={value}
                    type="button"
                    variant={gender === value ? "primary" : "secondary"}
                    size="md"
                    className="flex-1"
                    onClick={() => setGender(value)}
                  >
                    {value === "M" ? "Masculin" : "Féminin"}
                  </Button>
                ))}
              </div>
              <Field label="Téléphone" hint="Pour l'envoi de la référence.">
                <Input
                  inputMode="tel"
                  placeholder="+241 …"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                />
              </Field>
            </div>
          </details>

          <div className="mt-auto flex flex-col gap-3">
            <Button
              size="lg"
              block
              loading={pending}
              disabled={method === "especes" && change < 0}
              onClick={() => void confirm()}
            >
              Confirmer le paiement
            </Button>
            <Button variant="secondary" size="lg" block onClick={() => setStep(0)}>
              Revenir au trajet
            </Button>
          </div>
        </>
      )}

      {step === 2 && saved && (
        <>
          <InlineMessage tone="success" title="Titre délivré.">
            {saved.method === "especes"
              ? `Réglé en espèces · ${xaf(saved.changeXaf ?? 0)} rendus`
              : "Paiement mobile en attente de réseau — le titre reste dû."}
          </InlineMessage>

          <section className="rounded-lg bg-[oklch(0.24_0.058_257)] p-5 text-white">
            <p className="text-h3 tabular">{saved.localRef}</p>
            <p className="mt-1 text-[15px]">
              {saved.originName} → {saved.destinationName}
            </p>
            <p className="text-[15px] tabular">
              {classLabel(saved.serviceClass)} · {xaf(saved.quotedXaf)}
            </p>
            <p className="mt-2 text-[13px] text-white/70 tabular">
              {dayTime(saved.soldAt)} · {saved.distanceKm} km
            </p>
          </section>

          <div className="flex flex-wrap items-center gap-2">
            <StatusTag tone="warning">en attente d&apos;envoi</StatusTag>
            <span className="text-[13px] text-ink-muted">
              {online
                ? "Sera confirmé à la prochaine synchronisation."
                : "Sera synchronisé au retour du réseau."}
            </span>
          </div>

          <InlineMessage tone="info" title="Référence provisoire.">
            {`${saved.localRef} est le numéro attribué par ce terminal. Le numéro définitif du titre est délivré par le système à la synchronisation, et apparaîtra dans l'historique.`}
          </InlineMessage>

          <div className="mt-auto flex flex-col gap-3">
            <Button size="lg" block onClick={() => router.push("/scan")}>
              Terminer et scanner le suivant
            </Button>
            <Button variant="secondary" size="lg" block asChild>
              <Link href="/historique">Voir la file d&apos;envoi</Link>
            </Button>
          </div>
        </>
      )}
    </main>
  )
}
