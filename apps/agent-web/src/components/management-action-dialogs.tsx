"use client"

import { useState, type FormEvent } from "react"

import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  Field,
  Input,
  SelectNative,
  Textarea,
} from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"

import { formatXaf } from "@/lib/format"

export interface PenaltyTripOption {
  id: string
  trainNumber: string
  serviceDate: string
  origin: string
  destination: string
}

export interface PenaltyDraft {
  tripId: string
  lastName: string
  firstName: string
  documentNumber?: string
  phone?: string
  reason: "sans_titre" | "titre_invalide" | "classe_superieure" | "autre"
  amountXaf: number
  paidOnBoard: boolean
  notes?: string
}

export function PenaltyDialog({
  open,
  trips,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  trips: readonly PenaltyTripOption[]
  onOpenChange: (open: boolean) => void
  onSubmit: (draft: PenaltyDraft) => Promise<string>
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const [result, setResult] = useState("")

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const tripId = String(data.get("tripId") ?? "")
    const lastName = String(data.get("lastName") ?? "").trim()
    const firstName = String(data.get("firstName") ?? "").trim()
    const amountXaf = Number(data.get("amountXaf"))
    if (!tripId || !lastName || !firstName) {
      setError("La desserte, le nom et le prénom sont obligatoires.")
      return
    }
    if (!Number.isFinite(amountXaf) || amountXaf < 0) {
      setError("Le montant de l’amende est invalide.")
      return
    }

    setPending(true)
    setError("")
    try {
      const number = await onSubmit({
        tripId,
        lastName,
        firstName,
        documentNumber:
          String(data.get("documentNumber") ?? "").trim() || undefined,
        phone: String(data.get("phone") ?? "").trim() || undefined,
        reason: String(data.get("reason")) as PenaltyDraft["reason"],
        amountXaf,
        paidOnBoard: data.get("paidOnBoard") === "on",
        notes: String(data.get("notes") ?? "").trim() || undefined,
      })
      setResult(`Le procès-verbal ${number} a été créé.`)
      event.currentTarget.reset()
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "La création du procès-verbal a échoué."
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-h3">Nouveau procès-verbal</DialogTitle>
          <DialogDescription>
            Le numéro est attribué par Convex et l’opération est inscrite au
            journal d’audit après validation.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={submit}>
          <Field label="Desserte contrôlée" htmlFor="pv-trip">
            <SelectNative id="pv-trip" name="tripId" defaultValue="">
              <option value="" disabled>
                Sélectionner une desserte
              </option>
              {trips.map((trip) => (
                <option key={trip.id} value={trip.id}>
                  {trip.trainNumber} · {trip.serviceDate} · {trip.origin} →{" "}
                  {trip.destination}
                </option>
              ))}
            </SelectNative>
          </Field>
          {trips.length === 0 ? (
            <InlineMessage tone="warning" title="Aucune desserte disponible.">
              Une desserte doit exister avant de pouvoir établir un
              procès-verbal.
            </InlineMessage>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nom du contrevenant" htmlFor="pv-last-name">
              <Input
                id="pv-last-name"
                name="lastName"
                autoComplete="family-name"
              />
            </Field>
            <Field label="Prénom du contrevenant" htmlFor="pv-first-name">
              <Input
                id="pv-first-name"
                name="firstName"
                autoComplete="given-name"
              />
            </Field>
            <Field label="Numéro de pièce" htmlFor="pv-document">
              <Input id="pv-document" name="documentNumber" />
            </Field>
            <Field label="Téléphone" htmlFor="pv-phone">
              <Input id="pv-phone" name="phone" type="tel" />
            </Field>
            <Field label="Motif" htmlFor="pv-reason">
              <SelectNative id="pv-reason" name="reason">
                <option value="sans_titre">Absence de titre</option>
                <option value="titre_invalide">Titre invalide</option>
                <option value="classe_superieure">
                  Voyage en classe supérieure
                </option>
                <option value="autre">Autre motif</option>
              </SelectNative>
            </Field>
            <Field label="Montant de l’amende (FCFA)" htmlFor="pv-amount">
              <Input
                id="pv-amount"
                name="amountXaf"
                type="number"
                min="0"
                step="100"
                defaultValue="10000"
              />
            </Field>
          </div>
          <Field label="Observations" htmlFor="pv-notes">
            <Textarea id="pv-notes" name="notes" />
          </Field>
          <label className="flex min-h-11 items-center gap-3">
            <input
              name="paidOnBoard"
              type="checkbox"
              className="size-5 accent-[var(--color-accent-base)]"
            />
            Amende encaissée immédiatement à bord
          </label>
          {error ? (
            <InlineMessage tone="danger" title="Création impossible">
              {error}
            </InlineMessage>
          ) : null}
          {result ? (
            <InlineMessage tone="success" title={result}>
              La création et sa trace d’audit ont été confirmées par le
              back-end.
            </InlineMessage>
          ) : null}
          <DialogFooter>
            <Button
              type="submit"
              loading={pending}
              loadingLabel="Création…"
              disabled={trips.length === 0}
            >
              Créer le procès-verbal
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export interface ReportScheduleDraft {
  label: string
  reportType: "ventes_canaux" | "remplissage" | "annulations" | "recettes"
  frequency: "quotidien" | "hebdomadaire" | "mensuel"
  format: "csv" | "xlsx" | "pdf"
  recipients: string[]
  nextRunAt: number
}

function defaultRunDate() {
  const date = new Date(Date.now() + 60 * 60 * 1000)
  date.setMinutes(0, 0, 0)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

export function ReportScheduleDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (draft: ReportScheduleDraft) => Promise<void>
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const [result, setResult] = useState("")

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const label = String(data.get("label") ?? "").trim()
    const recipients = String(data.get("recipients") ?? "")
      .split(/[,;\n]/)
      .map((value) => value.trim())
      .filter(Boolean)
    const nextRunAt = new Date(String(data.get("nextRunAt") ?? "")).getTime()
    if (!label || recipients.length === 0 || !Number.isFinite(nextRunAt)) {
      setError("Le nom, la date et au moins un destinataire sont obligatoires.")
      return
    }
    setPending(true)
    setError("")
    try {
      await onSubmit({
        label,
        reportType: String(
          data.get("reportType")
        ) as ReportScheduleDraft["reportType"],
        frequency: String(
          data.get("frequency")
        ) as ReportScheduleDraft["frequency"],
        format: String(data.get("format")) as ReportScheduleDraft["format"],
        recipients,
        nextRunAt,
      })
      setResult("L’envoi récurrent a été programmé.")
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "La programmation a échoué."
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-h3">Programmer un envoi</DialogTitle>
          <DialogDescription>
            Convex conservera la programmation et placera chaque occurrence dans
            la file d’envoi durable.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={submit}>
          <Field label="Nom de la programmation" htmlFor="report-label">
            <Input
              id="report-label"
              name="label"
              defaultValue="Rapport commercial périodique"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Rapport" htmlFor="report-type">
              <SelectNative id="report-type" name="reportType">
                <option value="ventes_canaux">
                  Chiffre d’affaires par canal
                </option>
                <option value="remplissage">Remplissage par desserte</option>
                <option value="annulations">Contrôle des annulations</option>
                <option value="recettes">Contrôle des recettes</option>
              </SelectNative>
            </Field>
            <Field label="Fréquence" htmlFor="report-frequency">
              <SelectNative id="report-frequency" name="frequency">
                <option value="quotidien">Quotidienne</option>
                <option value="hebdomadaire">Hebdomadaire</option>
                <option value="mensuel">Mensuelle</option>
              </SelectNative>
            </Field>
            <Field label="Format" htmlFor="report-format">
              <SelectNative id="report-format" name="format">
                <option value="csv">CSV</option>
                <option value="xlsx">XLSX</option>
                <option value="pdf">PDF</option>
              </SelectNative>
            </Field>
            <Field label="Première exécution" htmlFor="report-next-run">
              <Input
                id="report-next-run"
                name="nextRunAt"
                type="datetime-local"
                defaultValue={defaultRunDate()}
              />
            </Field>
          </div>
          <Field
            label="Destinataires"
            htmlFor="report-recipients"
            hint="Séparez plusieurs adresses par une virgule."
          >
            <Textarea
              id="report-recipients"
              name="recipients"
              defaultValue="direction.commerciale@setrag.ga"
            />
          </Field>
          {error ? (
            <InlineMessage tone="danger" title="Programmation impossible">
              {error}
            </InlineMessage>
          ) : null}
          {result ? (
            <InlineMessage tone="success" title={result}>
              La prochaine exécution est désormais visible dans le tableau.
            </InlineMessage>
          ) : null}
          <DialogFooter>
            <Button
              type="submit"
              loading={pending}
              loadingLabel="Programmation…"
            >
              Confirmer la programmation
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export interface AccountingDayOption {
  id: string
  date: string
  status: "ouverte" | "cloturee"
}

export function JournalExportDialog({
  open,
  days,
  onOpenChange,
  onExport,
}: {
  open: boolean
  days: readonly AccountingDayOption[]
  onOpenChange: (open: boolean) => void
  onExport: (
    accountingDayId: string,
    date: string
  ) => Promise<{ filename: string; rowCount: number }>
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const [result, setResult] = useState("")

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const id = String(data.get("accountingDayId") ?? "")
    const day = days.find((entry) => entry.id === id)
    if (!day) {
      setError("Sélectionnez une journée comptable.")
      return
    }
    setPending(true)
    setError("")
    try {
      const exported = await onExport(id, day.date)
      setResult(
        `${exported.filename} téléchargé · ${exported.rowCount} écriture(s).`
      )
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "L’export du journal a échoué."
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-h3">Exporter le journal V65</DialogTitle>
          <DialogDescription>
            Le fichier téléchargé contient les écritures déjà générées pour la
            journée choisie.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={submit}>
          <Field label="Journée comptable" htmlFor="journal-day">
            <SelectNative
              id="journal-day"
              name="accountingDayId"
              defaultValue={days[0]?.id ?? ""}
            >
              {days.length === 0 ? (
                <option value="">Aucune journée disponible</option>
              ) : null}
              {days.map((day) => (
                <option key={day.id} value={day.id}>
                  {day.date} ·{" "}
                  {day.status === "cloturee" ? "clôturée" : "ouverte"}
                </option>
              ))}
            </SelectNative>
          </Field>
          {error ? (
            <InlineMessage tone="danger" title="Export impossible">
              {error}
            </InlineMessage>
          ) : null}
          {result ? (
            <InlineMessage tone="success" title="Téléchargement terminé">
              {result}
            </InlineMessage>
          ) : null}
          <DialogFooter>
            <Button
              type="submit"
              loading={pending}
              loadingLabel="Préparation…"
              disabled={days.length === 0}
            >
              Télécharger le fichier
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export interface RevenueControlSnapshot {
  date: string
  status: "ouverte" | "cloturee"
  sessions: number
  openSessions: number
  unjustifiedVariances: number
  sales: number
  cancellations: number
  refunds: number
  ttc: number
  received: number
}

export function RevenueControlDialog({
  open,
  days,
  onOpenChange,
  onInspect,
  onCloseDay,
}: {
  open: boolean
  days: readonly AccountingDayOption[]
  onOpenChange: (open: boolean) => void
  onInspect: (accountingDayId: string) => Promise<RevenueControlSnapshot>
  onCloseDay: (accountingDayId: string) => Promise<void>
}) {
  const [selectedId, setSelectedId] = useState(days[0]?.id ?? "")
  const [snapshot, setSnapshot] = useState<RevenueControlSnapshot | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const [result, setResult] = useState("")

  async function inspect() {
    if (!selectedId) return
    setPending(true)
    setError("")
    setResult("")
    try {
      setSnapshot(await onInspect(selectedId))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Le contrôle a échoué.")
    } finally {
      setPending(false)
    }
  }

  async function closeDay() {
    if (!selectedId || !snapshot) return
    setPending(true)
    setError("")
    try {
      await onCloseDay(selectedId)
      setSnapshot({ ...snapshot, status: "cloturee" })
      setResult(`La journée du ${snapshot.date} a été clôturée.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "La clôture a échoué.")
    } finally {
      setPending(false)
    }
  }

  const blocking =
    (snapshot?.openSessions ?? 0) > 0 ||
    (snapshot?.unjustifiedVariances ?? 0) > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-h3">Contrôler les recettes</DialogTitle>
          <DialogDescription>
            Vérifiez le rapprochement avant toute clôture comptable.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <Field label="Journée comptable" htmlFor="revenue-day">
              <SelectNative
                id="revenue-day"
                value={selectedId}
                onChange={(event) => {
                  setSelectedId(event.target.value)
                  setSnapshot(null)
                  setResult("")
                }}
              >
                {days.length === 0 ? (
                  <option value="">Aucune journée disponible</option>
                ) : null}
                {days.map((day) => (
                  <option key={day.id} value={day.id}>
                    {day.date} ·{" "}
                    {day.status === "cloturee" ? "clôturée" : "ouverte"}
                  </option>
                ))}
              </SelectNative>
            </Field>
            <Button
              type="button"
              variant="secondary"
              loading={pending}
              loadingLabel="Contrôle…"
              disabled={!selectedId}
              onClick={inspect}
            >
              Lancer le contrôle
            </Button>
          </div>
          {snapshot ? (
            <div className="grid gap-3 rounded-lg border border-line p-4 sm:grid-cols-2">
              <span>Sessions : {snapshot.sessions}</span>
              <span>Ventes : {snapshot.sales}</span>
              <span>Annulations : {snapshot.cancellations}</span>
              <span>Remboursements : {snapshot.refunds}</span>
              <span>Recette TTC : {formatXaf(snapshot.ttc)}</span>
              <span>Montant reçu : {formatXaf(snapshot.received)}</span>
              <span>Sessions ouvertes : {snapshot.openSessions}</span>
              <span>
                Écarts non justifiés : {snapshot.unjustifiedVariances}
              </span>
            </div>
          ) : null}
          {snapshot && blocking ? (
            <InlineMessage tone="warning" title="Clôture bloquée">
              Fermez les sessions encore ouvertes et justifiez les écarts de
              caisse avant de clôturer cette journée.
            </InlineMessage>
          ) : null}
          {error ? (
            <InlineMessage tone="danger" title="Opération impossible">
              {error}
            </InlineMessage>
          ) : null}
          {result ? (
            <InlineMessage tone="success" title={result}>
              Convex a confirmé la clôture et lancé le calcul des indicateurs.
            </InlineMessage>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              loading={pending}
              loadingLabel="Clôture…"
              disabled={!snapshot || blocking || snapshot.status === "cloturee"}
              onClick={closeDay}
            >
              Clôturer la journée contrôlée
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
