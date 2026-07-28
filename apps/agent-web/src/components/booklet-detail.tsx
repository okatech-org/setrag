"use client"

import { Check, Pencil, Plus, Send, Trash2, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { type FormEvent, useState } from "react"

import { useMutation, useQuery } from "@workspace/api/hooks"
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

import { asAppRole, canRole } from "@/lib/portal-access"
import { ManagementDetailShell } from "./management-detail-shell"
import { usePortalSession } from "./portal-guard"

const DAY_LABELS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"]

function dateInput(value: number) {
  return new Date(value).toISOString().slice(0, 10)
}

export function BookletDetail({ bookletId }: { bookletId: string }) {
  const router = useRouter()
  const session = usePortalSession()
  const role = asAppRole(session?.profile.user.role)
  const mayEdit = canRole(role, "livrets_horaires", "modifier")
  const mayDelete = canRole(role, "livrets_horaires", "supprimer")
  const mayApprove = canRole(role, "livrets_horaires", "valider")
  const detail = useQuery(api.functions.booklets.get, {
    bookletId: bookletId as never,
  })
  const preview = useQuery(api.functions.booklets.previewGeneration, {
    bookletId: bookletId as never,
  })
  const trains = useQuery(api.functions.referential.listTrains, {})
  const stations = useQuery(api.functions.referential.listStations, {})
  const updateBooklet = useMutation(api.functions.booklets.update)
  const addSchedule = useMutation(api.functions.booklets.addSchedule)
  const updateSchedule = useMutation(api.functions.booklets.updateSchedule)
  const removeSchedule = useMutation(api.functions.booklets.removeSchedule)
  const removeDraft = useMutation(api.functions.booklets.removeDraft)
  const submit = useMutation(api.functions.booklets.submit)
  const approve = useMutation(api.functions.booklets.approve)
  const reject = useMutation(api.functions.booklets.reject)
  const [pending, setPending] = useState("")
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [editingHeader, setEditingHeader] = useState(false)
  const [editingScheduleId, setEditingScheduleId] = useState<
    string | "new" | null
  >(null)
  const [rejecting, setRejecting] = useState(false)

  async function run(
    key: string,
    action: () => Promise<unknown>,
    success: string
  ) {
    setPending(key)
    setError("")
    setMessage("")
    try {
      await action()
      setMessage(success)
      return true
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "L’action a échoué.")
      return false
    } finally {
      setPending("")
    }
  }

  if (!detail) {
    return (
      <ManagementDetailShell
        title="Livret horaire"
        eyebrow="OFFRE · LIVRET HORAIRE"
        backHref="/gestion/livrets"
      >
        <p role="status">Chargement du livret…</p>
      </ManagementDetailShell>
    )
  }

  const { booklet, schedules } = detail
  const editable = booklet.status === "brouillon" || booklet.status === "rejete"
  const selectedSchedule =
    editingScheduleId && editingScheduleId !== "new"
      ? schedules.find((schedule) => schedule._id === editingScheduleId)
      : undefined

  async function saveHeader(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const success = await run(
      "header",
      () =>
        updateBooklet({
          bookletId: booklet._id,
          label: String(data.get("label") ?? ""),
          description: String(data.get("description") ?? "") || undefined,
          validFrom: Date.parse(`${String(data.get("validFrom"))}T00:00:00Z`),
          validUntil: Date.parse(
            `${String(data.get("validUntil"))}T23:59:59.999Z`
          ),
        }),
      "Le livret a été modifié."
    )
    if (success) setEditingHeader(false)
  }

  async function saveRoute(
    input: {
      trainId: string
      departureTime: string
      daysOfWeek: number[]
      stops: Array<{
        stationId: string
        sequence: number
        arrivalOffsetMinutes?: number
        departureOffsetMinutes?: number
      }>
    },
    scheduleId?: string
  ) {
    const success = await run(
      scheduleId ? `schedule-${scheduleId}` : "schedule-new",
      () =>
        scheduleId
          ? updateSchedule({
              scheduleId: scheduleId as never,
              trainId: input.trainId as never,
              departureTime: input.departureTime,
              daysOfWeek: input.daysOfWeek,
              stops: input.stops.map((stop) => ({
                ...stop,
                stationId: stop.stationId as never,
              })),
            })
          : addSchedule({
              bookletId: booklet._id,
              trainId: input.trainId as never,
              departureTime: input.departureTime,
              daysOfWeek: input.daysOfWeek,
              stops: input.stops.map((stop) => ({
                ...stop,
                stationId: stop.stationId as never,
              })),
            }),
      scheduleId ? "L’horaire a été modifié." : "L’horaire a été ajouté."
    )
    if (success) setEditingScheduleId(null)
  }

  async function deleteSchedule(scheduleId: string) {
    if (!window.confirm("Retirer cet horaire du livret en préparation ?"))
      return
    await run(
      `remove-${scheduleId}`,
      () => removeSchedule({ scheduleId: scheduleId as never }),
      "L’horaire a été retiré."
    )
  }

  async function deleteBooklet() {
    if (
      !window.confirm(
        "Supprimer définitivement ce brouillon et tous ses horaires ?"
      )
    ) {
      return
    }
    const success = await run(
      "remove-booklet",
      () => removeDraft({ bookletId: booklet._id }),
      "Le brouillon a été supprimé."
    )
    if (success) router.replace("/gestion/livrets")
  }

  return (
    <ManagementDetailShell
      title={booklet.label}
      eyebrow="OFFRE · LIVRET HORAIRE"
      backHref="/gestion/livrets"
    >
      {error ? (
        <InlineMessage tone="danger" title="Action impossible">
          {error}
        </InlineMessage>
      ) : null}
      {message ? (
        <InlineMessage tone="success" title="Action enregistrée">
          {message}
        </InlineMessage>
      ) : null}
      {booklet.rejectionReason ? (
        <InlineMessage tone="warning" title="Motif du rejet">
          {booklet.rejectionReason}
        </InlineMessage>
      ) : null}

      <Card className="grid gap-5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <Badge
              variant={
                booklet.status === "actif"
                  ? "success"
                  : booklet.status === "rejete"
                    ? "destructive"
                    : booklet.status === "a_valider"
                      ? "warning"
                      : "secondary"
              }
            >
              {booklet.status}
            </Badge>
            <Badge variant="info">
              {preview?.total ?? "…"} desserte(s) prévue(s)
            </Badge>
          </div>
          {editable && mayEdit && !editingHeader ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => setEditingHeader(true)}
            >
              <Pencil />
              Modifier le livret
            </Button>
          ) : null}
        </div>

        {editingHeader ? (
          <form className="grid gap-4" onSubmit={saveHeader}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Libellé" htmlFor="booklet-label">
                <Input name="label" defaultValue={booklet.label} required />
              </Field>
              <Field label="Description" htmlFor="booklet-description">
                <Textarea
                  name="description"
                  defaultValue={booklet.description}
                />
              </Field>
              <Field label="Début de validité" htmlFor="booklet-valid-from">
                <Input
                  name="validFrom"
                  type="date"
                  defaultValue={dateInput(booklet.validFrom)}
                  required
                />
              </Field>
              <Field label="Fin de validité" htmlFor="booklet-valid-until">
                <Input
                  name="validUntil"
                  type="date"
                  defaultValue={dateInput(booklet.validUntil)}
                  required
                />
              </Field>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setEditingHeader(false)}
              >
                Annuler
              </Button>
              <Button
                type="submit"
                loading={pending === "header"}
                loadingLabel="Enregistrement…"
              >
                Enregistrer
              </Button>
            </div>
          </form>
        ) : (
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-caption text-ink-muted">Début</dt>
              <dd>{new Date(booklet.validFrom).toLocaleDateString("fr-FR")}</dd>
            </div>
            <div>
              <dt className="text-caption text-ink-muted">Fin</dt>
              <dd>
                {new Date(booklet.validUntil).toLocaleDateString("fr-FR")}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-caption text-ink-muted">Description</dt>
              <dd>{booklet.description || "Aucune description."}</dd>
            </div>
          </dl>
        )}
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 p-5">
          <div>
            <h2 className="text-h3">Horaires et itinéraires</h2>
            <p className="text-small text-ink-muted">
              Chaque arrêt conserve ses heures relatives au départ.
            </p>
          </div>
          {editable && mayEdit && editingScheduleId === null ? (
            <Button type="button" onClick={() => setEditingScheduleId("new")}>
              <Plus />
              Ajouter un horaire
            </Button>
          ) : null}
        </div>

        {editingScheduleId ? (
          <RouteForm
            key={editingScheduleId}
            schedule={selectedSchedule}
            trains={trains ?? []}
            stations={stations ?? []}
            pending={
              pending ===
              (selectedSchedule
                ? `schedule-${selectedSchedule._id}`
                : "schedule-new")
            }
            onCancel={() => setEditingScheduleId(null)}
            onSubmit={(input) => saveRoute(input, selectedSchedule?._id)}
          />
        ) : null}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Train</TableHead>
              <TableHead>Départ</TableHead>
              <TableHead>Jours</TableHead>
              <TableHead>Itinéraire</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {schedules.map((schedule) => (
              <TableRow key={schedule._id}>
                <TableCell className="font-semibold">
                  {schedule.trainNumber}
                </TableCell>
                <TableCell>{schedule.departureTime}</TableCell>
                <TableCell>
                  {schedule.daysOfWeek.length === 0
                    ? "Tous les jours"
                    : schedule.daysOfWeek
                        .map((day) => DAY_LABELS[day])
                        .join(", ")}
                </TableCell>
                <TableCell>
                  {schedule.stops
                    .map(
                      (stop) =>
                        stations?.find(
                          (station) => station._id === stop.stationId
                        )?.code ?? "?"
                    )
                    .join(" → ")}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    {editable && mayEdit ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => setEditingScheduleId(schedule._id)}
                      >
                        <Pencil />
                        Modifier
                      </Button>
                    ) : null}
                    {editable && mayDelete ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="danger"
                        loading={pending === `remove-${schedule._id}`}
                        loadingLabel="Retrait…"
                        onClick={() => deleteSchedule(schedule._id)}
                      >
                        <Trash2 />
                        Retirer
                      </Button>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {schedules.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-ink-muted">
                  Aucun horaire dans ce livret.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </Card>

      {rejecting ? (
        <Card className="p-5">
          <h2 className="text-h3">Rejeter le livret</h2>
          <form
            className="mt-4 grid gap-4"
            onSubmit={async (event) => {
              event.preventDefault()
              const data = new FormData(event.currentTarget)
              const success = await run(
                "reject",
                () =>
                  reject({
                    bookletId: booklet._id,
                    reason: String(data.get("reason") ?? ""),
                  }),
                "Le livret a été rejeté pour correction."
              )
              if (success) setRejecting(false)
            }}
          >
            <Field
              label="Motif du rejet"
              hint="Ce texte sera visible par la personne qui corrigera le livret."
              htmlFor="booklet-rejection-reason"
            >
              <Textarea name="reason" required />
            </Field>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setRejecting(false)}
              >
                Annuler
              </Button>
              <Button
                type="submit"
                variant="danger"
                loading={pending === "reject"}
                loadingLabel="Rejet…"
              >
                <X />
                Confirmer le rejet
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      <Card className="flex flex-wrap gap-3 p-5">
        {editable && mayEdit ? (
          <Button
            loading={pending === "submit"}
            loadingLabel="Soumission…"
            onClick={() =>
              void run(
                "submit",
                () => submit({ bookletId: booklet._id }),
                "Le livret a été soumis à validation."
              )
            }
          >
            <Send />
            Soumettre à validation
          </Button>
        ) : null}
        {booklet.status === "a_valider" && mayApprove ? (
          <>
            <Button
              loading={pending === "approve"}
              loadingLabel="Activation…"
              onClick={() =>
                void run(
                  "approve",
                  () => approve({ bookletId: booklet._id }),
                  "Le livret a été activé et ses dessertes sont en génération."
                )
              }
            >
              <Check />
              Approuver et activer
            </Button>
            <Button
              variant="danger"
              onClick={() => setRejecting(true)}
              disabled={rejecting}
            >
              <X />
              Rejeter
            </Button>
          </>
        ) : null}
        {booklet.status === "brouillon" && mayDelete ? (
          <Button
            variant="danger"
            loading={pending === "remove-booklet"}
            loadingLabel="Suppression…"
            onClick={deleteBooklet}
          >
            <Trash2 />
            Supprimer le brouillon
          </Button>
        ) : null}
      </Card>
    </ManagementDetailShell>
  )
}

type RouteStop = {
  stationId: string
  sequence: number
  arrivalOffsetMinutes?: number
  departureOffsetMinutes?: number
}

function RouteForm({
  schedule,
  trains,
  stations,
  pending,
  onCancel,
  onSubmit,
}: {
  schedule?: {
    trainId: string
    departureTime: string
    daysOfWeek: number[]
    stops: RouteStop[]
  }
  trains: readonly { _id: string; number: string; name: string }[]
  stations: readonly { _id: string; code: string; name: string }[]
  pending: boolean
  onCancel: () => void
  onSubmit: (input: {
    trainId: string
    departureTime: string
    daysOfWeek: number[]
    stops: RouteStop[]
  }) => Promise<void>
}) {
  const [stops, setStops] = useState<RouteStop[]>(
    schedule?.stops.map((stop) => ({ ...stop })) ?? [
      {
        stationId: stations[0]?._id ?? "",
        sequence: 0,
        departureOffsetMinutes: 0,
      },
      {
        stationId: stations[stations.length - 1]?._id ?? "",
        sequence: 1,
        arrivalOffsetMinutes: 700,
      },
    ]
  )

  async function submitRoute(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    await onSubmit({
      trainId: String(data.get("trainId") ?? ""),
      departureTime: String(data.get("departureTime") ?? ""),
      daysOfWeek: data
        .getAll("daysOfWeek")
        .map(Number)
        .sort((left, right) => left - right),
      stops: stops.map((_, index) => {
        const arrival = String(data.get(`arrival-${index}`) ?? "")
        const departure = String(data.get(`departure-${index}`) ?? "")
        return {
          stationId: String(data.get(`station-${index}`) ?? ""),
          sequence: index,
          arrivalOffsetMinutes: arrival === "" ? undefined : Number(arrival),
          departureOffsetMinutes:
            departure === "" ? undefined : Number(departure),
        }
      }),
    })
  }

  return (
    <form
      className="grid gap-5 border-y border-line bg-surface-sunk p-5"
      onSubmit={submitRoute}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Train" htmlFor="route-train">
          <SelectNative
            name="trainId"
            defaultValue={schedule?.trainId}
            required
          >
            {trains.map((train) => (
              <option key={train._id} value={train._id}>
                {train.number} · {train.name}
              </option>
            ))}
          </SelectNative>
        </Field>
        <Field label="Départ" htmlFor="route-departure">
          <Input
            name="departureTime"
            type="time"
            defaultValue={schedule?.departureTime ?? "08:00"}
            required
          />
        </Field>
      </div>

      <fieldset className="grid gap-2">
        <legend className="text-small font-semibold">
          Jours de circulation
        </legend>
        <p className="text-caption text-ink-muted">
          Aucun jour coché signifie « tous les jours ».
        </p>
        <div className="flex flex-wrap gap-3">
          {DAY_LABELS.map((label, day) => (
            <label key={label} className="flex items-center gap-2">
              <input
                type="checkbox"
                name="daysOfWeek"
                value={day}
                defaultChecked={schedule?.daysOfWeek.includes(day)}
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold">Arrêts</h3>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() =>
              setStops((current) => [
                ...current,
                {
                  stationId: stations[0]?._id ?? "",
                  sequence: current.length,
                },
              ])
            }
          >
            <Plus />
            Ajouter un arrêt
          </Button>
        </div>
        {stops.map((stop, index) => (
          <div
            key={`${index}-${stop.stationId}`}
            className="grid gap-3 rounded-md border border-line bg-surface p-3 sm:grid-cols-[minmax(12rem,1fr)_10rem_10rem_auto]"
          >
            <Field label={`Arrêt ${index + 1}`} htmlFor={`station-${index}`}>
              <SelectNative
                name={`station-${index}`}
                defaultValue={stop.stationId}
                required
              >
                {stations.map((station) => (
                  <option key={station._id} value={station._id}>
                    {station.code} · {station.name}
                  </option>
                ))}
              </SelectNative>
            </Field>
            <Field label="Arrivée (+ min)" htmlFor={`arrival-${index}`}>
              <Input
                name={`arrival-${index}`}
                type="number"
                min="0"
                defaultValue={stop.arrivalOffsetMinutes}
              />
            </Field>
            <Field label="Départ (+ min)" htmlFor={`departure-${index}`}>
              <Input
                name={`departure-${index}`}
                type="number"
                min="0"
                defaultValue={stop.departureOffsetMinutes}
              />
            </Field>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={`Retirer l’arrêt ${index + 1}`}
              disabled={stops.length <= 2}
              onClick={() =>
                setStops((current) =>
                  current
                    .filter((_, candidate) => candidate !== index)
                    .map((candidate, sequence) => ({
                      ...candidate,
                      sequence,
                    }))
                )
              }
            >
              <Trash2 />
            </Button>
          </div>
        ))}
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Annuler
        </Button>
        <Button
          type="submit"
          loading={pending}
          loadingLabel="Enregistrement…"
          disabled={trains.length === 0 || stations.length < 2}
        >
          Enregistrer l’horaire
        </Button>
      </div>
    </form>
  )
}
