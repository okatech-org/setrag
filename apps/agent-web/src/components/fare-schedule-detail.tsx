"use client"

import { Check, Clock, Pencil, Plus, Send, Trash2, X } from "lucide-react"
import { type FormEvent, useState } from "react"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Card } from "@workspace/ui/components/card"
import { Field, Input, SelectNative } from "@workspace/ui/components/field"
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

type TrainType = "EXPRESS" | "OMNIBUS" | "AUTORAIL" | "SPECIAL"
type ServiceClass = "DEUXIEME" | "PREMIERE" | "VIP"

const TRAIN_TYPES: readonly TrainType[] = [
  "EXPRESS",
  "OMNIBUS",
  "AUTORAIL",
  "SPECIAL",
]
const SERVICE_CLASSES: readonly ServiceClass[] = ["DEUXIEME", "PREMIERE", "VIP"]

function dateInput(timestamp: number) {
  return new Date(timestamp).toISOString().slice(0, 10)
}

function endOfDay(value: FormDataEntryValue | null) {
  return Date.parse(`${String(value)}T23:59:59.999Z`)
}

function displayActor(
  user:
    | { firstName?: string; lastName?: string; matricule?: string }
    | null
    | undefined
) {
  if (!user) return "—"
  return (
    [user.firstName, user.lastName].filter(Boolean).join(" ") ||
    user.matricule ||
    "Utilisateur"
  )
}

export function FareScheduleDetail({ scheduleId }: { scheduleId: string }) {
  const session = usePortalSession()
  const role = asAppRole(session?.profile.user.role)
  const mayEdit = canRole(role, "tarifs", "modifier")
  const mayDelete = canRole(role, "tarifs", "supprimer")
  const mayApprove = canRole(role, "tarifs", "valider")
  const detail = useQuery(api.functions.fareSchedules.get, {
    scheduleId: scheduleId as never,
  })
  const updateSchedule = useMutation(api.functions.fareSchedules.update)
  const upsertBase = useMutation(api.functions.fareSchedules.upsertBase)
  const removeBase = useMutation(api.functions.fareSchedules.removeBase)
  const submit = useMutation(api.functions.fareSchedules.submit)
  const approve = useMutation(api.functions.fareSchedules.approve)
  const reject = useMutation(api.functions.fareSchedules.reject)
  const expire = useMutation(api.functions.fareSchedules.expire)
  const [editingSchedule, setEditingSchedule] = useState(false)
  const [editingBaseId, setEditingBaseId] = useState<string | "new" | null>(
    null
  )
  const [pending, setPending] = useState("")
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")

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
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "L’action a échoué.")
      throw cause
    } finally {
      setPending("")
    }
  }

  if (!detail) {
    return (
      <ManagementDetailShell
        title="Grille tarifaire"
        eyebrow="TARIFICATION · BARÈME"
        backHref="/gestion/tarifs"
      >
        <p role="status">Chargement du barème…</p>
      </ManagementDetailShell>
    )
  }

  const { schedule, bases, creator, approver } = detail
  const editable =
    schedule.status === "brouillon" || schedule.status === "rejete"

  async function saveSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    try {
      await run(
        "schedule",
        () =>
          updateSchedule({
            scheduleId: schedule._id,
            label: String(data.get("label") ?? ""),
            validFrom: Date.parse(`${String(data.get("validFrom"))}T00:00:00Z`),
            validUntil: endOfDay(data.get("validUntil")),
            roundingBasis: String(data.get("roundingBasis")) as "HT" | "TTC",
            vatPct: Number(data.get("vatPct")),
            cssPct: Number(data.get("cssPct")),
          }),
        "Les paramètres du barème ont été enregistrés."
      )
      setEditingSchedule(false)
    } catch {
      // Le message est affiché par run.
    }
  }

  async function saveBase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const baseId = editingBaseId === "new" ? undefined : editingBaseId
    try {
      await run(
        "base",
        () =>
          upsertBase({
            scheduleId: schedule._id,
            baseId: baseId as never,
            trainType: String(data.get("trainType")) as TrainType,
            serviceClass: String(data.get("serviceClass")) as ServiceClass,
            shortDistanceRate: Number(data.get("shortDistanceRate")),
            longDistanceRate: Number(data.get("longDistanceRate")),
          }),
        baseId
          ? "La base tarifaire a été modifiée."
          : "La base tarifaire a été ajoutée."
      )
      setEditingBaseId(null)
    } catch {
      // Le message est affiché par run.
    }
  }

  async function deleteBase(baseId: string) {
    if (
      !window.confirm("Supprimer cette base de la version en préparation ?")
    ) {
      return
    }
    try {
      await run(
        `delete-${baseId}`,
        () => removeBase({ baseId: baseId as never }),
        "La base a été retirée de cette version."
      )
    } catch {
      // Le message est affiché par run.
    }
  }

  async function workflow(
    key: string,
    action: () => Promise<unknown>,
    success: string
  ) {
    try {
      await run(key, action, success)
    } catch {
      // Le message est affiché par run.
    }
  }

  return (
    <ManagementDetailShell
      title={schedule.label}
      eyebrow="TARIFICATION · BARÈME KILOMÉTRIQUE"
      backHref="/gestion/tarifs"
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
      {schedule.rejectionReason ? (
        <InlineMessage tone="warning" title="Motif du rejet">
          {schedule.rejectionReason}
        </InlineMessage>
      ) : null}

      <Card className="grid gap-5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <Badge
              variant={
                schedule.status === "actif"
                  ? "success"
                  : schedule.status === "rejete"
                    ? "destructive"
                    : schedule.status === "a_valider"
                      ? "warning"
                      : "secondary"
              }
            >
              {schedule.status}
            </Badge>
            <Badge variant="info">{bases.length} base(s)</Badge>
          </div>
          {editable && mayEdit && !editingSchedule ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => setEditingSchedule(true)}
            >
              <Pencil />
              Modifier le barème
            </Button>
          ) : null}
        </div>

        {editingSchedule ? (
          <form className="grid gap-4" onSubmit={saveSchedule}>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Libellé" htmlFor="fare-label">
                <Input name="label" defaultValue={schedule.label} required />
              </Field>
              <Field label="Valide du" htmlFor="fare-valid-from">
                <Input
                  name="validFrom"
                  type="date"
                  defaultValue={dateInput(schedule.validFrom)}
                  required
                />
              </Field>
              <Field label="Valide jusqu’au" htmlFor="fare-valid-until">
                <Input
                  name="validUntil"
                  type="date"
                  defaultValue={dateInput(schedule.validUntil)}
                  required
                />
              </Field>
              <Field label="Assiette d’arrondi" htmlFor="fare-rounding">
                <SelectNative
                  name="roundingBasis"
                  defaultValue={schedule.roundingBasis}
                >
                  <option value="TTC">TTC</option>
                  <option value="HT">HT</option>
                </SelectNative>
              </Field>
              <Field label="TVA (%)" htmlFor="fare-vat">
                <Input
                  name="vatPct"
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue={schedule.vatPct}
                  required
                />
              </Field>
              <Field label="CSS (%)" htmlFor="fare-css">
                <Input
                  name="cssPct"
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue={schedule.cssPct}
                  required
                />
              </Field>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setEditingSchedule(false)}
              >
                Annuler
              </Button>
              <Button
                type="submit"
                loading={pending === "schedule"}
                loadingLabel="Enregistrement…"
              >
                Enregistrer
              </Button>
            </div>
          </form>
        ) : (
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-caption text-ink-muted">Validité</dt>
              <dd>
                {new Date(schedule.validFrom).toLocaleDateString("fr-FR")} →{" "}
                {new Date(schedule.validUntil).toLocaleDateString("fr-FR")}
              </dd>
            </div>
            <div>
              <dt className="text-caption text-ink-muted">Fiscalité</dt>
              <dd>
                TVA {schedule.vatPct} % · CSS {schedule.cssPct} %
              </dd>
            </div>
            <div>
              <dt className="text-caption text-ink-muted">Créée par</dt>
              <dd>{displayActor(creator)}</dd>
            </div>
            <div>
              <dt className="text-caption text-ink-muted">Validée par</dt>
              <dd>{displayActor(approver)}</dd>
            </div>
          </dl>
        )}

        <div className="flex flex-wrap gap-2 border-t border-line pt-4">
          {schedule.status === "brouillon" && mayEdit ? (
            <Button
              type="button"
              loading={pending === "submit"}
              loadingLabel="Soumission…"
              onClick={() =>
                workflow(
                  "submit",
                  () => submit({ scheduleId: schedule._id }),
                  "La grille est soumise à validation."
                )
              }
            >
              <Send />
              Soumettre
            </Button>
          ) : null}
          {schedule.status === "a_valider" && mayApprove ? (
            <>
              <Button
                type="button"
                loading={pending === "approve"}
                loadingLabel="Activation…"
                onClick={() =>
                  workflow(
                    "approve",
                    () => approve({ scheduleId: schedule._id }),
                    "La grille est validée et active."
                  )
                }
              >
                <Check />
                Valider et activer
              </Button>
              <Button
                type="button"
                variant="danger"
                loading={pending === "reject"}
                loadingLabel="Rejet…"
                onClick={() => {
                  const reason = window.prompt("Motif obligatoire du rejet")
                  if (reason !== null) {
                    void workflow(
                      "reject",
                      () => reject({ scheduleId: schedule._id, reason }),
                      "La grille est rejetée et peut être corrigée."
                    )
                  }
                }}
              >
                <X />
                Rejeter
              </Button>
            </>
          ) : null}
          {schedule.status === "actif" && mayApprove ? (
            <Button
              type="button"
              variant="danger"
              loading={pending === "expire"}
              loadingLabel="Expiration…"
              onClick={() => {
                if (
                  window.confirm(
                    "Expirer cette grille ? Elle restera consultable mais ne pourra plus être réactivée."
                  )
                ) {
                  void workflow(
                    "expire",
                    () => expire({ scheduleId: schedule._id }),
                    "La grille est expirée et conservée dans l’historique."
                  )
                }
              }}
            >
              <Clock />
              Expirer
            </Button>
          ) : null}
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 p-5">
          <div>
            <h2 className="text-h3">Bases tarifaires</h2>
            <p className="text-small text-ink-muted">
              Taux XAF par kilomètre, par matériel et classe de service.
            </p>
          </div>
          {editable && mayEdit && editingBaseId === null ? (
            <Button type="button" onClick={() => setEditingBaseId("new")}>
              <Plus />
              Ajouter une base
            </Button>
          ) : null}
        </div>

        {editingBaseId ? (
          <BaseForm
            key={editingBaseId}
            base={
              editingBaseId === "new"
                ? undefined
                : bases.find((base) => base._id === editingBaseId)
            }
            pending={pending === "base"}
            onCancel={() => setEditingBaseId(null)}
            onSubmit={saveBase}
          />
        ) : null}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type de train</TableHead>
              <TableHead>Classe</TableHead>
              <TableHead>0–99 km</TableHead>
              <TableHead>100 km et plus</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bases.map((base) => (
              <TableRow key={base._id}>
                <TableCell className="font-semibold">
                  {base.trainType}
                </TableCell>
                <TableCell>{base.serviceClass}</TableCell>
                <TableCell>{base.shortDistanceRate} XAF/km</TableCell>
                <TableCell>{base.longDistanceRate} XAF/km</TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    {editable && mayEdit ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => setEditingBaseId(base._id)}
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
                        loading={pending === `delete-${base._id}`}
                        loadingLabel="Suppression…"
                        onClick={() => deleteBase(base._id)}
                      >
                        <Trash2 />
                        Supprimer
                      </Button>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {bases.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-ink-muted">
                  Aucune base tarifaire.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </Card>

      <InlineMessage tone="info" title="Historique opposable">
        Une grille active ou expirée n’est jamais modifiée ni supprimée. Toute
        évolution doit être créée comme une nouvelle version.
      </InlineMessage>
    </ManagementDetailShell>
  )
}

function BaseForm({
  base,
  pending,
  onCancel,
  onSubmit,
}: {
  base?: {
    trainType: TrainType
    serviceClass: ServiceClass
    shortDistanceRate: number
    longDistanceRate: number
  }
  pending: boolean
  onCancel: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
  return (
    <form
      className="grid gap-4 border-y border-line bg-surface-sunk p-5"
      onSubmit={onSubmit}
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Type de train" htmlFor="base-train-type">
          <SelectNative
            name="trainType"
            defaultValue={base?.trainType ?? "EXPRESS"}
          >
            {TRAIN_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </SelectNative>
        </Field>
        <Field label="Classe" htmlFor="base-class">
          <SelectNative
            name="serviceClass"
            defaultValue={base?.serviceClass ?? "DEUXIEME"}
          >
            {SERVICE_CLASSES.map((serviceClass) => (
              <option key={serviceClass} value={serviceClass}>
                {serviceClass}
              </option>
            ))}
          </SelectNative>
        </Field>
        <Field label="Taux 0–99 km" htmlFor="base-short-rate">
          <Input
            name="shortDistanceRate"
            type="number"
            min="0.01"
            step="0.01"
            defaultValue={base?.shortDistanceRate}
            required
          />
        </Field>
        <Field label="Taux 100 km et plus" htmlFor="base-long-rate">
          <Input
            name="longDistanceRate"
            type="number"
            min="0.01"
            step="0.01"
            defaultValue={base?.longDistanceRate}
            required
          />
        </Field>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Annuler
        </Button>
        <Button type="submit" loading={pending} loadingLabel="Enregistrement…">
          Enregistrer la base
        </Button>
      </div>
    </form>
  )
}
