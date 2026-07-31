"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import { Field, Input } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"
import { Stepper } from "@workspace/ui/components/stepper"

import { humanError } from "@/lib/errors"
import { dayTime, xaf } from "@/lib/format"
import { commitOperation, getTicketByNumber } from "@/lib/offline/db"
import { quoteOnboard } from "@/lib/offline/fares"
import { clientId, localNumber, nowMs } from "@/lib/offline/ids"
import type { LocalPenalty, PenaltyScaleRow } from "@/lib/offline/types"
import { NetworkBadge, StatusTag } from "./network-badge"
import { useTerminal } from "./terminal-provider"

/**
 * Procès-verbal — CM-08.
 *
 * Le montant vient du barème embarqué et n'est PAS modifiable par l'agent :
 * c'est ce qui rend le procès-verbal opposable et protège le contrôleur d'un
 * marchandage à bord. Le trajet dû s'y ajoute, calculé sur le même barème que
 * la vente.
 *
 * L'identité est DÉCLARÉE, jamais vérifiée : le terminal consigne ce que le
 * contrevenant annonce, et l'écrit tel quel.
 */

type Step = 0 | 1 | 2

/** Motifs déduits d'un verdict de contrôle, quand le PV vient d'un scan. */
const VERDICT_TO_REASON: Record<string, PenaltyScaleRow["reason"]> = {
  contrefait: "titre_invalide",
  illisible: "titre_invalide",
  annule: "titre_invalide",
  rembourse: "titre_invalide",
  expire: "titre_invalide",
  non_paye: "titre_invalide",
  mauvaise_desserte: "titre_invalide",
  hors_segment: "sans_titre",
  inconnu: "sans_titre",
  cle_hors_service: "autre",
}

export function PenaltyScreen() {
  const router = useRouter()
  const params = useSearchParams()
  const { manifest, settings, online, refresh } = useTerminal()

  const initialReason =
    VERDICT_TO_REASON[params.get("motif") ?? ""] ?? "sans_titre"
  const ticketRef = params.get("titre") ?? ""

  const [step, setStep] = useState<Step>(0)
  const [reason, setReason] = useState<PenaltyScaleRow["reason"]>(initialReason)
  const [lastName, setLastName] = useState("")
  const [documentNumber, setDocumentNumber] = useState("")
  const [phone, setPhone] = useState("")
  const [declined, setDeclined] = useState(false)
  const [paidOnBoard, setPaidOnBoard] = useState(true)
  const [signature, setSignature] = useState<LocalPenalty["signature"]>("aucune")
  const [notes, setNotes] = useState("")
  const [saved, setSaved] = useState<LocalPenalty | null>(null)
  const [pending, setPending] = useState(false)

  const scale = manifest?.penalties ?? []
  const row = scale.find((r) => r.reason === reason)

  /**
   * Trajet dû : de la gare atteinte au terminus.
   *
   * Un voyageur sans titre est réputé devoir la fin du parcours qu'il occupe.
   * Sans barème embarqué, seule l'amende est perçue — l'écran le dit.
   */
  const legQuote = useMemo(() => {
    if (!manifest) return null
    const last = manifest.stops[manifest.stops.length - 1]
    if (!last || last.sequence <= settings.currentStopIndex) return null
    try {
      return quoteOnboard(manifest, {
        fromSequence: settings.currentStopIndex,
        toSequence: last.sequence,
        serviceClass: "DEUXIEME",
      })
    } catch {
      return null
    }
  }, [manifest, settings.currentStopIndex])

  const legLabel = useMemo(() => {
    if (!manifest || !legQuote) return undefined
    const from = manifest.stops.find(
      (s) => s.sequence === settings.currentStopIndex
    )
    const to = manifest.stops[manifest.stops.length - 1]
    return `${from?.name ?? "?"} → ${to?.name ?? "?"} · ${legQuote.distanceKm} km`
  }, [legQuote, manifest, settings.currentStopIndex])

  const fine = row?.amountXaf ?? 0
  const leg = legQuote?.ttc ?? 0
  const total = fine + leg

  if (!manifest) {
    return (
      <main className="safe-top flex flex-1 flex-col gap-4 px-5 pt-5">
        <InlineMessage tone="warning" title="Aucun manifeste embarqué.">
          Le barème des amendes voyage avec le manifeste de la desserte.
        </InlineMessage>
        <Button size="lg" block asChild>
          <Link href="/manifeste">Télécharger le manifeste</Link>
        </Button>
      </main>
    )
  }

  async function save() {
    setPending(true)
    try {
      const ticket = ticketRef
        ? await getTicketByNumber(manifest!.tripId, ticketRef)
        : undefined
      const penalty: LocalPenalty = {
        clientId: clientId("pv"),
        tripId: manifest!.tripId,
        ticketId: ticket?._id,
        offender: {
          lastName: lastName.trim() || undefined,
          documentNumber: documentNumber.trim() || undefined,
          phone: phone.trim() || undefined,
          declined,
        },
        reason,
        notes: notes.trim() || undefined,
        fineXaf: fine,
        legXaf: leg,
        legLabel,
        amountXaf: total,
        paidOnBoard,
        signature,
        issuedAt: nowMs(),
        offline: !online,
        localNumber: localNumber("PV", 4),
        state: "pending",
      }
      await commitOperation("penalty", penalty.clientId, penalty)
      await refresh()
      setSaved(penalty)
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
          <h1 className="text-h3">Procès-verbal</h1>
          <p className="text-[13px] text-ink-muted">
            {manifest.trainNumber} · voiture {settings.coachLabel}
            {ticketRef && ` · titre ${ticketRef}`}
          </p>
        </div>
        <NetworkBadge />
      </header>

      <Stepper
        steps={[{ label: "Motif" }, { label: "Montant" }, { label: "Signature" }]}
        current={step}
      />

      {step === 0 && (
        <>
          {/* Quatre motifs à libellés longs : une liste déroulante les tient
              sur une ligne au lieu de quatre pavés. Le montant du barème est
              rappelé sous le champ — c'est ce que l'agent annonce ensuite. */}
          <Field
            label="Motif"
            htmlFor="pv-motif"
            hint={row ? `Amende au barème : ${xaf(row.amountXaf)}` : undefined}
          >
            <select
              id="pv-motif"
              value={reason}
              onChange={(event) =>
                setReason(event.target.value as PenaltyScaleRow["reason"])
              }
              className="h-13 w-full rounded-md border border-line-strong bg-surface px-4 text-[16px] outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {scale.map((option) => (
                <option key={option.reason} value={option.reason}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Nom déclaré">
            <Input
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              placeholder="NGUEMA Serge"
            />
          </Field>
          <Field label="Pièce présentée">
            <Input
              value={documentNumber}
              onChange={(event) => setDocumentNumber(event.target.value)}
              placeholder="CNI 04-889-231"
              className="tabular"
            />
          </Field>
          <Field label="Téléphone (facultatif)">
            <Input
              inputMode="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="+241 …"
            />
          </Field>

          <label className="flex items-center gap-3 rounded-md border border-line bg-surface p-4">
            <input
              type="checkbox"
              checked={declined}
              onChange={(event) => setDeclined(event.target.checked)}
              className="size-5"
            />
            <span className="text-[15px]">
              Le contrevenant refuse de décliner son identité
            </span>
          </label>

          <InlineMessage tone="warning" title="Identité déclarée par le contrevenant.">
            Le terminal ne la vérifie pas : c&apos;est une déclaration,
            consignée comme telle.
          </InlineMessage>

          <Button size="lg" block onClick={() => setStep(1)}>
            Continuer
          </Button>
        </>
      )}

      {step === 1 && (
        <>
          <section className="rounded-md border border-line bg-surface p-4">
            <div className="flex items-baseline justify-between">
              <p className="text-[15px]">Amende · {row?.label}</p>
              <p className="text-h2 tabular">{xaf(fine)}</p>
            </div>
            <p className="mt-1 text-[13px] text-ink-muted">
              Barème embarqué, non modifiable par l&apos;agent.
            </p>
            {legQuote ? (
              <div className="mt-3 flex items-baseline justify-between border-t border-line pt-3">
                <p className="text-[15px]">Trajet dû · {legLabel}</p>
                <p className="text-[15px] tabular">{xaf(leg)}</p>
              </div>
            ) : (
              <p className="mt-3 border-t border-line pt-3 text-[13px] text-ink-muted">
                Aucun trajet dû calculable : seule l&apos;amende est perçue.
              </p>
            )}
          </section>

          <fieldset>
            <legend className="text-[13px] font-medium">Encaissement</legend>
            <div className="mt-2 flex gap-2">
              <Button
                type="button"
                variant={paidOnBoard ? "primary" : "secondary"}
                size="lg"
                className="flex-1"
                onClick={() => setPaidOnBoard(true)}
              >
                Immédiat, espèces
              </Button>
              <Button
                type="button"
                variant={!paidOnBoard ? "primary" : "secondary"}
                size="lg"
                className="flex-1"
                onClick={() => setPaidOnBoard(false)}
              >
                Différé
              </Button>
            </div>
          </fieldset>

          <section className="rounded-md bg-accent-soft p-4">
            <p className="text-[15px] text-accent-ink">Total à percevoir</p>
            <p className="text-h2 text-accent-ink tabular">{xaf(total)}</p>
          </section>

          <Field label="Observations (facultatif)">
            <Input
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </Field>

          <div className="mt-auto flex flex-col gap-3">
            <Button size="lg" block loading={pending} onClick={() => void save()}>
              Enregistrer le procès-verbal
            </Button>
            <Button variant="secondary" size="lg" block onClick={() => setStep(0)}>
              Revenir au motif
            </Button>
          </div>
        </>
      )}

      {step === 2 && saved && (
        <>
          <InlineMessage
            tone={saved.paidOnBoard ? "success" : "warning"}
            title={
              saved.paidOnBoard
                ? `Procès-verbal enregistré — n° ${saved.localNumber}`
                : "Paiement différé — recouvrement à la descente"
            }
          >
            Le procès-verbal existe même s&apos;il n&apos;est pas encore parti.
          </InlineMessage>

          <section className="rounded-md border border-line bg-surface-sunk p-4">
            <p className="text-[15px] font-semibold">
              {saved.offender.declined
                ? "Identité refusée — consignée comme telle"
                : [saved.offender.lastName, saved.offender.documentNumber]
                    .filter(Boolean)
                    .join(" · ") || "Identité non déclarée"}
            </p>
            <p className="mt-1 text-[13px] text-ink-muted tabular">
              {row?.label} · {manifest.trainNumber} · voiture{" "}
              {settings.coachLabel} · {dayTime(saved.issuedAt)}
            </p>
            <p className="mt-2 text-[15px] tabular">
              Amende {xaf(saved.fineXaf)}
              {saved.legXaf > 0 && ` + trajet ${xaf(saved.legXaf)}`} ={" "}
              {xaf(saved.amountXaf)}
            </p>
          </section>

          <fieldset className="rounded-md border border-dashed border-line-strong p-4">
            <legend className="px-1 text-[13px] text-ink-muted">
              Signature du contrevenant — facultative
            </legend>
            <p className="rounded-sm bg-surface-sunk px-3 py-6 text-center text-[15px] text-ink-muted">
              {signature === "signe"
                ? "Signé par le contrevenant"
                : signature === "refuse"
                  ? "Refus de signer — consigné"
                  : "Zone de signature"}
            </p>
            <div className="mt-3 flex gap-2">
              <Button
                type="button"
                variant={signature === "signe" ? "primary" : "secondary"}
                size="md"
                className="flex-1"
                onClick={() => setSignature("signe")}
              >
                Faire signer
              </Button>
              <Button
                type="button"
                variant={signature === "refuse" ? "primary" : "secondary"}
                size="md"
                className="flex-1"
                onClick={() => setSignature("refuse")}
              >
                Refus de signer
              </Button>
            </div>
          </fieldset>

          <div className="flex flex-wrap items-center gap-2">
            <StatusTag tone="warning">en attente d&apos;envoi</StatusTag>
            <span className="text-[13px] text-ink-muted">
              Numéro définitif attribué à la synchronisation.
            </span>
          </div>

          <div className="mt-auto flex flex-col gap-3">
            <Button size="lg" block onClick={() => router.push("/scan")}>
              Terminer
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
