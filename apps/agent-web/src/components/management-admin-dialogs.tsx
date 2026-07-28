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
import { Field, Input, SelectNative } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"

type Close = (open: boolean) => void

function ResultMessages({ error, result }: { error: string; result: string }) {
  return (
    <>
      {error ? (
        <InlineMessage tone="danger" title="Action impossible">
          {error}
        </InlineMessage>
      ) : null}
      {result ? <InlineMessage tone="success" title={result} /> : null}
    </>
  )
}

export interface FareScheduleDraft {
  label: string
  validFrom: number
  validUntil: number
  vatPct: number
  cssPct: number
  trainType: "EXPRESS" | "OMNIBUS" | "AUTORAIL" | "SPECIAL"
  serviceClass: "DEUXIEME" | "PREMIERE" | "VIP"
  shortDistanceRate: number
  longDistanceRate: number
}

export function FareScheduleDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  onOpenChange: Close
  onSubmit: (draft: FareScheduleDraft) => Promise<void>
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const [result, setResult] = useState("")
  const today = new Date().toISOString().slice(0, 10)
  const nextYear = new Date(Date.now() + 365 * 86_400_000)
    .toISOString()
    .slice(0, 10)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setPending(true)
    setError("")
    setResult("")
    try {
      await onSubmit({
        label: String(data.get("label") ?? "").trim(),
        validFrom: Date.parse(`${String(data.get("validFrom"))}T00:00:00`),
        validUntil: Date.parse(`${String(data.get("validUntil"))}T23:59:59`),
        vatPct: Number(data.get("vatPct")),
        cssPct: Number(data.get("cssPct")),
        trainType: String(
          data.get("trainType")
        ) as FareScheduleDraft["trainType"],
        serviceClass: String(
          data.get("serviceClass")
        ) as FareScheduleDraft["serviceClass"],
        shortDistanceRate: Number(data.get("shortDistanceRate")),
        longDistanceRate: Number(data.get("longDistanceRate")),
      })
      setResult("La grille a été créée et soumise à validation.")
      event.currentTarget.reset()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Création échouée.")
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nouvelle grille tarifaire</DialogTitle>
          <DialogDescription>
            La grille est persistée avec l’état « à valider » et une trace
            d’audit.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={submit}>
          <Field label="Libellé" htmlFor="fare-label">
            <Input
              id="fare-label"
              name="label"
              defaultValue={`Grille ${today}`}
              required
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Valide à partir du" htmlFor="fare-from">
              <Input
                id="fare-from"
                name="validFrom"
                type="date"
                defaultValue={today}
                required
              />
            </Field>
            <Field label="Valide jusqu’au" htmlFor="fare-until">
              <Input
                id="fare-until"
                name="validUntil"
                type="date"
                defaultValue={nextYear}
                required
              />
            </Field>
            <Field label="Type de train" htmlFor="fare-train-type">
              <SelectNative id="fare-train-type" name="trainType">
                <option value="EXPRESS">Express</option>
                <option value="OMNIBUS">Omnibus</option>
                <option value="AUTORAIL">Autorail</option>
                <option value="SPECIAL">Spécial</option>
              </SelectNative>
            </Field>
            <Field label="Classe" htmlFor="fare-class">
              <SelectNative id="fare-class" name="serviceClass">
                <option value="DEUXIEME">2e classe</option>
                <option value="PREMIERE">1re classe</option>
                <option value="VIP">VIP</option>
              </SelectNative>
            </Field>
            <Field label="Taux 0–99 km (FCFA/km)" htmlFor="fare-short">
              <Input
                id="fare-short"
                name="shortDistanceRate"
                type="number"
                min="1"
                step="0.01"
                defaultValue="38"
              />
            </Field>
            <Field label="Taux 100 km et + (FCFA/km)" htmlFor="fare-long">
              <Input
                id="fare-long"
                name="longDistanceRate"
                type="number"
                min="1"
                step="0.01"
                defaultValue="34"
              />
            </Field>
            <Field label="TVA (%)" htmlFor="fare-vat">
              <Input
                id="fare-vat"
                name="vatPct"
                type="number"
                min="0"
                step="0.01"
                defaultValue="18"
              />
            </Field>
            <Field label="CSS (%)" htmlFor="fare-css">
              <Input
                id="fare-css"
                name="cssPct"
                type="number"
                min="0"
                step="0.01"
                defaultValue="0"
              />
            </Field>
          </div>
          <ResultMessages error={error} result={result} />
          <DialogFooter>
            <Button type="submit" loading={pending} loadingLabel="Envoi…">
              Créer et soumettre
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export interface PricingRuleDraft {
  type: "remplissage" | "anticipation" | "periode" | "canal" | "promotion"
  threshold?: number
  modifierPct: number
  priority: number
  code: string
}

export function PricingRuleDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  onOpenChange: Close
  onSubmit: (draft: PricingRuleDraft) => Promise<void>
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const [result, setResult] = useState("")

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const threshold = String(data.get("threshold") ?? "")
    setPending(true)
    setError("")
    setResult("")
    try {
      await onSubmit({
        type: String(data.get("type")) as PricingRuleDraft["type"],
        threshold: threshold ? Number(threshold) : undefined,
        modifierPct: Number(data.get("modifierPct")),
        priority: Number(data.get("priority")),
        code: String(data.get("code") ?? "").trim(),
      })
      setResult("La règle de yield est active et auditée.")
      event.currentTarget.reset()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Création échouée.")
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Nouvelle règle de yield</DialogTitle>
          <DialogDescription>
            Les bornes de sécurité du moteur tarifaire restent appliquées.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={submit}>
          <Field label="Code unique" htmlFor="yield-code">
            <Input
              id="yield-code"
              name="code"
              placeholder="ex. remplissage-80"
              required
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Déclencheur" htmlFor="yield-type">
              <SelectNative id="yield-type" name="type">
                <option value="remplissage">Remplissage</option>
                <option value="anticipation">Anticipation</option>
                <option value="periode">Période</option>
                <option value="canal">Canal</option>
                <option value="promotion">Promotion</option>
              </SelectNative>
            </Field>
            <Field label="Seuil" htmlFor="yield-threshold">
              <Input
                id="yield-threshold"
                name="threshold"
                type="number"
                step="0.01"
                defaultValue="0.8"
              />
            </Field>
            <Field label="Modulation (%)" htmlFor="yield-modifier">
              <Input
                id="yield-modifier"
                name="modifierPct"
                type="number"
                min="-80"
                max="100"
                defaultValue="12"
              />
            </Field>
            <Field label="Priorité" htmlFor="yield-priority">
              <Input
                id="yield-priority"
                name="priority"
                type="number"
                min="1"
                defaultValue="60"
              />
            </Field>
          </div>
          <ResultMessages error={error} result={result} />
          <DialogFooter>
            <Button type="submit" loading={pending} loadingLabel="Création…">
              Activer la règle
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export interface TrainOption {
  id: string
  label: string
}

export interface CoachDraft {
  trainId: string
  label: string
  serviceClass: "DEUXIEME" | "PREMIERE" | "VIP"
  rowCount: number
  columnCount: number
  seatCount: number
  standingCapacity: number
  position: number
}

export function TrainCompositionDialog({
  open,
  trains,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  trains: readonly TrainOption[]
  onOpenChange: Close
  onSubmit: (draft: CoachDraft) => Promise<void>
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const [result, setResult] = useState("")

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setPending(true)
    setError("")
    setResult("")
    try {
      await onSubmit({
        trainId: String(data.get("trainId")),
        label: String(data.get("label") ?? "").trim(),
        serviceClass: String(
          data.get("serviceClass")
        ) as CoachDraft["serviceClass"],
        rowCount: Number(data.get("rowCount")),
        columnCount: Number(data.get("columnCount")),
        seatCount: Number(data.get("seatCount")),
        standingCapacity: Number(data.get("standingCapacity")),
        position: Number(data.get("position")),
      })
      setResult("La voiture et son plan de sièges ont été créés.")
      event.currentTarget.reset()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Création échouée.")
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Ajouter une voiture à une composition</DialogTitle>
          <DialogDescription>
            Le plan de sièges est généré dans la même transaction Convex.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={submit}>
          <Field label="Train" htmlFor="coach-train">
            <SelectNative id="coach-train" name="trainId" required>
              {trains.map((train) => (
                <option key={train.id} value={train.id}>
                  {train.label}
                </option>
              ))}
            </SelectNative>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Repère voiture" htmlFor="coach-label">
              <Input id="coach-label" name="label" placeholder="V7" required />
            </Field>
            <Field label="Classe" htmlFor="coach-class">
              <SelectNative id="coach-class" name="serviceClass">
                <option value="DEUXIEME">2e classe</option>
                <option value="PREMIERE">1re classe</option>
                <option value="VIP">VIP</option>
              </SelectNative>
            </Field>
            <Field label="Rangées" htmlFor="coach-rows">
              <Input
                id="coach-rows"
                name="rowCount"
                type="number"
                min="1"
                defaultValue="10"
              />
            </Field>
            <Field label="Colonnes" htmlFor="coach-columns">
              <Input
                id="coach-columns"
                name="columnCount"
                type="number"
                min="1"
                defaultValue="4"
              />
            </Field>
            <Field label="Places numérotées" htmlFor="coach-seats">
              <Input
                id="coach-seats"
                name="seatCount"
                type="number"
                min="1"
                defaultValue="40"
              />
            </Field>
            <Field label="Places debout" htmlFor="coach-standing">
              <Input
                id="coach-standing"
                name="standingCapacity"
                type="number"
                min="0"
                defaultValue="0"
              />
            </Field>
            <Field label="Position" htmlFor="coach-position">
              <Input
                id="coach-position"
                name="position"
                type="number"
                min="1"
                defaultValue="7"
              />
            </Field>
          </div>
          <ResultMessages error={error} result={result} />
          <DialogFooter>
            <Button
              type="submit"
              loading={pending}
              loadingLabel="Création…"
              disabled={trains.length === 0}
            >
              Créer la voiture
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export interface StationOption {
  id: string
  label: string
}

export interface PointOfSaleDraft {
  code: string
  name: string
  type: "gare" | "agence_accreditee" | "agence_premium"
  stationId?: string
  passengerCounters: number
  baggageCounters: number
  parcelCounters: number
  royaltyPct?: number
}

export function PointOfSaleDialog({
  open,
  stations,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  stations: readonly StationOption[]
  onOpenChange: Close
  onSubmit: (draft: PointOfSaleDraft) => Promise<void>
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const [result, setResult] = useState("")

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const stationId = String(data.get("stationId") ?? "")
    const royalty = String(data.get("royaltyPct") ?? "")
    setPending(true)
    setError("")
    setResult("")
    try {
      await onSubmit({
        code: String(data.get("code") ?? "").trim(),
        name: String(data.get("name") ?? "").trim(),
        type: String(data.get("type")) as PointOfSaleDraft["type"],
        stationId: stationId || undefined,
        passengerCounters: Number(data.get("passengerCounters")),
        baggageCounters: Number(data.get("baggageCounters")),
        parcelCounters: Number(data.get("parcelCounters")),
        royaltyPct: royalty ? Number(royalty) : undefined,
      })
      setResult("Le point de vente est actif dans le référentiel.")
      event.currentTarget.reset()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Création échouée.")
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nouveau point de vente</DialogTitle>
          <DialogDescription>
            Les compteurs et le rattachement sont enregistrés dans le
            référentiel central.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={submit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Code" htmlFor="pos-code">
              <Input
                id="pos-code"
                name="code"
                placeholder="AG-LBV-05"
                required
              />
            </Field>
            <Field label="Nom" htmlFor="pos-name">
              <Input id="pos-name" name="name" required />
            </Field>
            <Field label="Type" htmlFor="pos-type">
              <SelectNative id="pos-type" name="type">
                <option value="gare">Gare</option>
                <option value="agence_accreditee">Agence accréditée</option>
                <option value="agence_premium">Agence premium</option>
              </SelectNative>
            </Field>
            <Field label="Gare de rattachement" htmlFor="pos-station">
              <SelectNative id="pos-station" name="stationId">
                <option value="">Aucune</option>
                {stations.map((station) => (
                  <option key={station.id} value={station.id}>
                    {station.label}
                  </option>
                ))}
              </SelectNative>
            </Field>
            <Field label="Guichets voyageurs" htmlFor="pos-passengers">
              <Input
                id="pos-passengers"
                name="passengerCounters"
                type="number"
                min="0"
                defaultValue="1"
              />
            </Field>
            <Field label="Guichets bagages" htmlFor="pos-baggage">
              <Input
                id="pos-baggage"
                name="baggageCounters"
                type="number"
                min="0"
                defaultValue="0"
              />
            </Field>
            <Field label="Guichets colis" htmlFor="pos-parcels">
              <Input
                id="pos-parcels"
                name="parcelCounters"
                type="number"
                min="0"
                defaultValue="0"
              />
            </Field>
            <Field label="Royalties agence (%)" htmlFor="pos-royalty">
              <Input
                id="pos-royalty"
                name="royaltyPct"
                type="number"
                min="0"
                max="100"
                step="0.01"
              />
            </Field>
          </div>
          <ResultMessages error={error} result={result} />
          <DialogFooter>
            <Button type="submit" loading={pending} loadingLabel="Création…">
              Créer le point de vente
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export interface SettingsDraft {
  vatPct: number
  cssPct: number
  seatHoldMinutes: number
  mobilePaymentAttempts: number
  degradedSalesEnabled: boolean
  cashVarianceNotificationsEnabled: boolean
}

export function SettingsDialog({
  open,
  initial,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  initial: SettingsDraft
  onOpenChange: Close
  onSubmit: (draft: SettingsDraft) => Promise<void>
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const [result, setResult] = useState("")

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setPending(true)
    setError("")
    setResult("")
    try {
      await onSubmit({
        vatPct: Number(data.get("vatPct")),
        cssPct: Number(data.get("cssPct")),
        seatHoldMinutes: Number(data.get("seatHoldMinutes")),
        mobilePaymentAttempts: Number(data.get("mobilePaymentAttempts")),
        degradedSalesEnabled: data.get("degradedSalesEnabled") === "on",
        cashVarianceNotificationsEnabled:
          data.get("cashVarianceNotificationsEnabled") === "on",
      })
      setResult("Le paramétrage métier a été enregistré et audité.")
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Enregistrement échoué."
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Paramétrage métier</DialogTitle>
          <DialogDescription>
            Ces valeurs sont conservées dans Convex et partagées par le réseau.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={submit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="TVA billets (%)" htmlFor="settings-vat">
              <Input
                id="settings-vat"
                name="vatPct"
                type="number"
                min="0"
                step="0.01"
                defaultValue={initial.vatPct}
              />
            </Field>
            <Field label="CSS (%)" htmlFor="settings-css">
              <Input
                id="settings-css"
                name="cssPct"
                type="number"
                min="0"
                step="0.01"
                defaultValue={initial.cssPct}
              />
            </Field>
            <Field label="Tenue des places (min)" htmlFor="settings-hold">
              <Input
                id="settings-hold"
                name="seatHoldMinutes"
                type="number"
                min="1"
                defaultValue={initial.seatHoldMinutes}
              />
            </Field>
            <Field
              label="Tentatives paiement mobile"
              htmlFor="settings-attempts"
            >
              <Input
                id="settings-attempts"
                name="mobilePaymentAttempts"
                type="number"
                min="1"
                defaultValue={initial.mobilePaymentAttempts}
              />
            </Field>
          </div>
          <label className="flex items-center gap-3">
            <input
              name="degradedSalesEnabled"
              type="checkbox"
              defaultChecked={initial.degradedSalesEnabled}
              className="size-5 accent-[var(--color-accent-base)]"
            />
            Autoriser la vente en mode dégradé
          </label>
          <label className="flex items-center gap-3">
            <input
              name="cashVarianceNotificationsEnabled"
              type="checkbox"
              defaultChecked={initial.cashVarianceNotificationsEnabled}
              className="size-5 accent-[var(--color-accent-base)]"
            />
            Notifier les écarts de caisse
          </label>
          <ResultMessages error={error} result={result} />
          <DialogFooter>
            <Button
              type="submit"
              loading={pending}
              loadingLabel="Enregistrement…"
            >
              Enregistrer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function DataSelectionDialog({
  open,
  title,
  description,
  label,
  options,
  actionLabel,
  onOpenChange,
  onRun,
}: {
  open: boolean
  title: string
  description: string
  label: string
  options: readonly TrainOption[]
  actionLabel: string
  onOpenChange: Close
  onRun: (id: string) => Promise<string>
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const [result, setResult] = useState("")

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const id = String(new FormData(event.currentTarget).get("id") ?? "")
    setPending(true)
    setError("")
    setResult("")
    try {
      setResult(await onRun(id))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Action échouée.")
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={submit}>
          <Field label={label} htmlFor="data-selection">
            <SelectNative id="data-selection" name="id" required>
              {options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </SelectNative>
          </Field>
          <ResultMessages error={error} result={result} />
          <DialogFooter>
            <Button
              type="submit"
              loading={pending}
              loadingLabel="Traitement…"
              disabled={options.length === 0}
            >
              {actionLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
