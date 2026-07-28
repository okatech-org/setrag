"use client"

import {
  Armchair,
  Pencil,
  Plus,
  Power,
  PowerOff,
  Save,
  Trash2,
  TrainFront,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { type FormEvent, useState } from "react"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Field,
  Input,
  SelectNative,
  Textarea,
} from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"

import { asAppRole, canRole } from "@/lib/portal-access"
import { ManagementDetailShell } from "./management-detail-shell"
import { usePortalSession } from "./portal-guard"

type TrainType = "EXPRESS" | "OMNIBUS" | "AUTORAIL" | "SPECIAL"
type ServiceClass = "DEUXIEME" | "PREMIERE" | "VIP"

const TRAIN_TYPES: readonly { value: TrainType; label: string }[] = [
  { value: "EXPRESS", label: "Express" },
  { value: "OMNIBUS", label: "Omnibus" },
  { value: "AUTORAIL", label: "Autorail" },
  { value: "SPECIAL", label: "Spécial" },
]

const SERVICE_CLASSES: readonly {
  value: ServiceClass
  label: string
}[] = [
  { value: "DEUXIEME", label: "2e classe" },
  { value: "PREMIERE", label: "1re classe" },
  { value: "VIP", label: "VIP" },
]

function messageFrom(cause: unknown) {
  return cause instanceof Error ? cause.message : "L’action a échoué."
}

function ResultMessage({ error, success }: { error: string; success: string }) {
  if (error) {
    return (
      <InlineMessage tone="danger" title="Action impossible">
        {error}
      </InlineMessage>
    )
  }
  if (success) {
    return (
      <InlineMessage tone="success" title="Modification enregistrée">
        {success}
      </InlineMessage>
    )
  }
  return null
}

export function TrainCreateScreen() {
  const router = useRouter()
  const session = usePortalSession()
  const role = asAppRole(session?.profile.user.role)
  const canCreate = canRole(role, "referentiel", "creer")
  const createTrain = useMutation(api.functions.referential.upsertTrain)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setPending(true)
    setError("")
    try {
      const trainId = await createTrain({
        number: String(form.get("number") ?? ""),
        name: String(form.get("name") ?? ""),
        description: String(form.get("description") ?? "") || undefined,
        type: String(form.get("type")) as TrainType,
        isActive: true,
      })
      router.replace(`/gestion/trains/${trainId}`)
    } catch (cause) {
      setError(messageFrom(cause))
    } finally {
      setPending(false)
    }
  }

  return (
    <ManagementDetailShell
      title="Nouveau train"
      eyebrow="RÉFÉRENTIEL · MATÉRIEL ROULANT"
      backHref="/gestion/trains"
    >
      <Card>
        <CardHeader>
          <CardTitle>Identification du train</CardTitle>
        </CardHeader>
        <CardContent>
          {canCreate ? (
            <form className="grid gap-5" onSubmit={submit}>
              <TrainFields />
              {error ? (
                <InlineMessage tone="danger" title="Création impossible">
                  {error}
                </InlineMessage>
              ) : null}
              <div className="flex justify-end">
                <Button
                  type="submit"
                  loading={pending}
                  loadingLabel="Création…"
                >
                  <Plus />
                  Créer le train
                </Button>
              </div>
            </form>
          ) : (
            <InlineMessage tone="warning" title="Consultation seule">
              Votre profil ne permet pas de créer un train.
            </InlineMessage>
          )}
        </CardContent>
      </Card>
    </ManagementDetailShell>
  )
}

function TrainFields({
  train,
}: {
  train?: {
    number: string
    name: string
    description?: string
    type: TrainType
  }
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Numéro commercial" htmlFor="train-number">
        <Input
          id="train-number"
          name="number"
          defaultValue={train?.number}
          placeholder="TR-203"
          required
        />
      </Field>
      <Field label="Nom" htmlFor="train-name">
        <Input
          id="train-name"
          name="name"
          defaultValue={train?.name}
          placeholder="Express Transgabonais"
          required
        />
      </Field>
      <Field label="Type" htmlFor="train-type">
        <SelectNative id="train-type" name="type" defaultValue={train?.type}>
          {TRAIN_TYPES.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </SelectNative>
      </Field>
      <Field
        label="Description"
        htmlFor="train-description"
        className="sm:col-span-2"
      >
        <Textarea
          id="train-description"
          name="description"
          defaultValue={train?.description}
          placeholder="Usage, particularités ou affectation…"
        />
      </Field>
    </div>
  )
}

export function TrainDetailScreen({ trainId }: { trainId: string }) {
  const session = usePortalSession()
  const role = asAppRole(session?.profile.user.role)
  const canEdit = canRole(role, "referentiel", "modifier")
  const canAdd = canRole(role, "referentiel", "creer")
  const canRemove = canRole(role, "referentiel", "supprimer")
  const composition = useQuery(api.functions.referential.getTrainComposition, {
    trainId: trainId as never,
  })
  const updateTrain = useMutation(api.functions.referential.updateTrain)
  const setTrainActive = useMutation(api.functions.referential.setTrainActive)
  const addCoach = useMutation(api.functions.referential.addCoach)
  const updateCoach = useMutation(api.functions.referential.updateCoach)
  const removeCoach = useMutation(api.functions.referential.removeCoach)
  const [editingTrain, setEditingTrain] = useState(false)
  const [addingCoach, setAddingCoach] = useState(false)
  const [editingCoach, setEditingCoach] = useState<string | null>(null)
  const [pending, setPending] = useState("")
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  function begin(action: string) {
    setPending(action)
    setError("")
    setSuccess("")
  }

  function fail(cause: unknown) {
    setError(messageFrom(cause))
    setPending("")
  }

  if (composition === undefined) {
    return (
      <ManagementDetailShell
        title="Chargement du train…"
        eyebrow="RÉFÉRENTIEL · MATÉRIEL ROULANT"
        backHref="/gestion/trains"
      >
        <p role="status" className="text-small text-ink-muted">
          Chargement de la composition et des sièges…
        </p>
      </ManagementDetailShell>
    )
  }

  const { train, coaches, capacity } = composition
  const totalCapacity = Object.values(capacity).reduce(
    (total, item) => total + item.total,
    0
  )

  async function submitTrain(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    begin("train")
    try {
      await updateTrain({
        trainId: train._id,
        number: String(form.get("number") ?? ""),
        name: String(form.get("name") ?? ""),
        description: String(form.get("description") ?? "") || undefined,
        type: String(form.get("type")) as TrainType,
      })
      setEditingTrain(false)
      setSuccess("Les informations du train ont été mises à jour.")
      setPending("")
    } catch (cause) {
      fail(cause)
    }
  }

  async function toggleActive() {
    begin("active")
    try {
      await setTrainActive({
        trainId: train._id,
        isActive: !train.isActive,
      })
      setSuccess(
        train.isActive
          ? "Le train est désactivé. Son historique reste conservé."
          : "Le train est de nouveau actif."
      )
      setPending("")
    } catch (cause) {
      fail(cause)
    }
  }

  async function submitCoach(
    event: FormEvent<HTMLFormElement>,
    coachId?: string
  ) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    begin(coachId ? `coach-${coachId}` : "coach-new")
    const values = {
      label: String(form.get("label") ?? ""),
      serviceClass: String(form.get("serviceClass")) as ServiceClass,
      serialNumber: String(form.get("serialNumber") ?? "") || undefined,
      rowCount: Number(form.get("rowCount")),
      columnCount: Number(form.get("columnCount")),
      seatCount: Number(form.get("seatCount")),
      standingCapacity: Number(form.get("standingCapacity")),
      position: Number(form.get("position")),
    }
    try {
      if (coachId) {
        await updateCoach({ ...values, coachId: coachId as never })
        setEditingCoach(null)
        setSuccess("La voiture et son plan ont été mis à jour.")
      } else {
        await addCoach({ ...values, trainId: train._id })
        setAddingCoach(false)
        setSuccess("La voiture et ses sièges ont été ajoutés.")
      }
      setPending("")
    } catch (cause) {
      fail(cause)
    }
  }

  async function remove(coachId: string, label: string) {
    if (
      !window.confirm(
        `Retirer définitivement la voiture ${label} de cette composition ?`
      )
    ) {
      return
    }
    begin(`remove-${coachId}`)
    try {
      await removeCoach({ coachId: coachId as never })
      setSuccess(`La voiture ${label} et ses sièges ont été retirés.`)
      setPending("")
    } catch (cause) {
      fail(cause)
    }
  }

  return (
    <ManagementDetailShell
      title={`${train.number} · ${train.name}`}
      eyebrow="RÉFÉRENTIEL · MATÉRIEL ROULANT"
      backHref="/gestion/trains"
    >
      <ResultMessage error={error} success={success} />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-4">
            <div className="grid gap-2">
              <CardTitle>Fiche du train</CardTitle>
              <div className="flex flex-wrap gap-2">
                <Badge variant={train.isActive ? "success" : "secondary"}>
                  {train.isActive ? "Actif" : "Inactif"}
                </Badge>
                <Badge variant="info">{train.type}</Badge>
              </div>
            </div>
            {canEdit && !editingTrain ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setEditingTrain(true)}
              >
                <Pencil />
                Modifier
              </Button>
            ) : null}
          </CardHeader>
          <CardContent>
            {editingTrain ? (
              <form className="grid gap-5" onSubmit={submitTrain}>
                <TrainFields train={train} />
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setEditingTrain(false)}
                  >
                    Annuler
                  </Button>
                  <Button
                    type="submit"
                    loading={pending === "train"}
                    loadingLabel="Enregistrement…"
                  >
                    <Save />
                    Enregistrer
                  </Button>
                </div>
              </form>
            ) : (
              <dl className="grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-caption text-ink-muted">Numéro</dt>
                  <dd className="font-semibold">{train.number}</dd>
                </div>
                <div>
                  <dt className="text-caption text-ink-muted">Type</dt>
                  <dd className="font-semibold">{train.type}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-caption text-ink-muted">Description</dt>
                  <dd>{train.description || "Aucune description."}</dd>
                </div>
              </dl>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Capacité totale</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <p className="text-h2 tabular">{totalCapacity}</p>
            <p className="text-small text-ink-muted">
              {coaches.length} voiture(s), places assises et debout comprises.
            </p>
            {canEdit ? (
              <Button
                type="button"
                variant={train.isActive ? "danger" : "secondary"}
                loading={pending === "active"}
                loadingLabel="Mise à jour…"
                onClick={toggleActive}
              >
                {train.isActive ? <PowerOff /> : <Power />}
                {train.isActive ? "Désactiver" : "Réactiver"}
              </Button>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <section className="grid gap-4" aria-labelledby="composition-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="composition-title" className="text-h3">
              Composition et sièges
            </h2>
            <p className="text-small text-ink-muted">
              Les voitures sont affichées dans leur ordre de circulation.
            </p>
          </div>
          {canAdd && !addingCoach ? (
            <Button type="button" onClick={() => setAddingCoach(true)}>
              <Plus />
              Ajouter une voiture
            </Button>
          ) : null}
        </div>

        {addingCoach ? (
          <Card>
            <CardHeader>
              <CardTitle>Nouvelle voiture</CardTitle>
            </CardHeader>
            <CardContent>
              <CoachForm
                defaultPosition={coaches.length + 1}
                pending={pending === "coach-new"}
                onCancel={() => setAddingCoach(false)}
                onSubmit={(event) => submitCoach(event)}
              />
            </CardContent>
          </Card>
        ) : null}

        {coaches.length === 0 ? (
          <Card className="p-6">
            <InlineMessage tone="info" title="Composition vide">
              Ajoutez une première voiture pour générer son plan de sièges.
            </InlineMessage>
          </Card>
        ) : (
          coaches.map((coach) => (
            <Card key={coach._id}>
              <CardHeader className="flex-row items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex size-11 items-center justify-center rounded-full bg-accent-soft text-accent-ink">
                    <TrainFront />
                  </span>
                  <div>
                    <CardTitle>
                      {coach.label} · position {coach.position}
                    </CardTitle>
                    <p className="text-small mt-1 text-ink-muted">
                      {coach.serviceClass} · {coach.seatCount} assises ·{" "}
                      {coach.standingCapacity} debout
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {canEdit && editingCoach !== coach._id ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setEditingCoach(coach._id)}
                    >
                      <Pencil />
                      Modifier
                    </Button>
                  ) : null}
                  {canRemove ? (
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      loading={pending === `remove-${coach._id}`}
                      loadingLabel="Retrait…"
                      onClick={() => remove(coach._id, coach.label)}
                    >
                      <Trash2 />
                      Retirer
                    </Button>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="grid gap-5">
                {editingCoach === coach._id ? (
                  <CoachForm
                    coach={coach}
                    pending={pending === `coach-${coach._id}`}
                    onCancel={() => setEditingCoach(null)}
                    onSubmit={(event) => submitCoach(event, coach._id)}
                  />
                ) : (
                  <>
                    <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                      <div>
                        <dt className="text-caption text-ink-muted">
                          N° de série
                        </dt>
                        <dd className="font-semibold">
                          {coach.serialNumber || "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-caption text-ink-muted">Plan</dt>
                        <dd className="font-semibold">
                          {coach.rowCount} × {coach.columnCount}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-caption text-ink-muted">
                          Sièges actifs
                        </dt>
                        <dd className="font-semibold">
                          {coach.seats.filter((seat) => seat.isActive).length}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-caption text-ink-muted">
                          Capacité
                        </dt>
                        <dd className="font-semibold">
                          {coach.seatCount + coach.standingCapacity}
                        </dd>
                      </div>
                    </dl>
                    <div>
                      <p className="text-mono-label mb-3 text-ink-muted">
                        PLAN DES SIÈGES
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {coach.seats.map((seat) => (
                          <span
                            key={seat._id}
                            className="tabular text-caption inline-flex min-h-9 min-w-11 items-center justify-center gap-1 rounded-md border border-line bg-surface-sunk px-2"
                            title={`Rangée ${seat.row}, colonne ${seat.column}`}
                          >
                            <Armchair className="size-3.5" />
                            {seat.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </section>
    </ManagementDetailShell>
  )
}

function CoachForm({
  coach,
  defaultPosition,
  pending,
  onCancel,
  onSubmit,
}: {
  coach?: {
    label: string
    serviceClass: ServiceClass
    serialNumber?: string
    rowCount: number
    columnCount: number
    seatCount: number
    standingCapacity: number
    position: number
  }
  defaultPosition?: number
  pending: boolean
  onCancel: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
  return (
    <form className="grid gap-5" onSubmit={onSubmit}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Repère" htmlFor={`coach-label-${coach?.label ?? "new"}`}>
          <Input
            name="label"
            defaultValue={coach?.label}
            placeholder="V1"
            required
          />
        </Field>
        <Field label="Classe" htmlFor={`coach-class-${coach?.label ?? "new"}`}>
          <SelectNative
            name="serviceClass"
            defaultValue={coach?.serviceClass ?? "DEUXIEME"}
          >
            {SERVICE_CLASSES.map((serviceClass) => (
              <option key={serviceClass.value} value={serviceClass.value}>
                {serviceClass.label}
              </option>
            ))}
          </SelectNative>
        </Field>
        <Field
          label="N° de série"
          htmlFor={`coach-serial-${coach?.label ?? "new"}`}
        >
          <Input
            name="serialNumber"
            defaultValue={coach?.serialNumber}
            placeholder="SETRAG-2026-01"
          />
        </Field>
        <Field
          label="Position"
          htmlFor={`coach-position-${coach?.label ?? "new"}`}
        >
          <Input
            name="position"
            type="number"
            min="1"
            defaultValue={coach?.position ?? defaultPosition ?? 1}
            required
          />
        </Field>
        <Field label="Rangées" htmlFor={`coach-rows-${coach?.label ?? "new"}`}>
          <Input
            name="rowCount"
            type="number"
            min="1"
            defaultValue={coach?.rowCount ?? 10}
            required
          />
        </Field>
        <Field
          label="Colonnes"
          htmlFor={`coach-columns-${coach?.label ?? "new"}`}
        >
          <Input
            name="columnCount"
            type="number"
            min="1"
            max="26"
            defaultValue={coach?.columnCount ?? 4}
            required
          />
        </Field>
        <Field
          label="Places assises"
          hint="Doit correspondre à rangées × colonnes."
          htmlFor={`coach-seats-${coach?.label ?? "new"}`}
        >
          <Input
            name="seatCount"
            type="number"
            min="1"
            defaultValue={coach?.seatCount ?? 40}
            required
          />
        </Field>
        <Field
          label="Places debout"
          htmlFor={`coach-standing-${coach?.label ?? "new"}`}
        >
          <Input
            name="standingCapacity"
            type="number"
            min="0"
            defaultValue={coach?.standingCapacity ?? 0}
            required
          />
        </Field>
      </div>
      <InlineMessage tone="info" title="Sécurité de l’inventaire">
        La classe et les capacités d’une voiture déjà utilisée ne peuvent plus
        être modifiées.
      </InlineMessage>
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Annuler
        </Button>
        <Button type="submit" loading={pending} loadingLabel="Enregistrement…">
          <Save />
          Enregistrer la voiture
        </Button>
      </div>
    </form>
  )
}
