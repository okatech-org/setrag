"use client"

import { useState, type FormEvent } from "react"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Card } from "@workspace/ui/components/card"
import { Field, Input, SelectNative } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"

import { ManagementDetailShell } from "./management-detail-shell"

export function ReportScheduleDetail({ scheduleId }: { scheduleId: string }) {
  const schedule = useQuery(api.functions.reportSchedules.get, {
    scheduleId: scheduleId as never,
  })
  const updateSchedule = useMutation(api.functions.reportSchedules.update)
  const setActive = useMutation(api.functions.reportSchedules.setActive)
  const runNow = useMutation(api.functions.reportSchedules.runNow)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  async function run(action: () => Promise<unknown>, success: string) {
    setPending(true)
    setError("")
    setMessage("")
    try {
      await action()
      setMessage(success)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "L’action a échoué.")
    } finally {
      setPending(false)
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    await run(
      () =>
        updateSchedule({
          scheduleId: scheduleId as never,
          label: String(data.get("label") ?? ""),
          reportType: String(data.get("reportType")) as never,
          frequency: String(data.get("frequency")) as never,
          format: String(data.get("format")) as never,
          recipients: String(data.get("recipients") ?? "")
            .split(/[,\n;]/)
            .map((recipient) => recipient.trim())
            .filter(Boolean),
        }),
      "La programmation a été mise à jour."
    )
  }

  if (schedule === undefined) {
    return (
      <ManagementDetailShell
        title="Rapport programmé"
        eyebrow="AW-G-13"
        backHref="/gestion/rapports"
      >
        <p role="status">Chargement de la programmation…</p>
      </ManagementDetailShell>
    )
  }

  if (schedule === null) {
    return (
      <ManagementDetailShell
        title="Programmation introuvable"
        eyebrow="Rapports"
        backHref="/gestion/rapports"
      >
        <InlineMessage
          tone="danger"
          title="Cette programmation n’existe plus."
        />
      </ManagementDetailShell>
    )
  }

  return (
    <ManagementDetailShell
      title={schedule.label}
      eyebrow="Détail du rapport programmé"
      backHref="/gestion/rapports"
    >
      {error ? (
        <InlineMessage tone="danger" title="Action impossible">
          {error}
        </InlineMessage>
      ) : null}
      {message ? <InlineMessage tone="success" title={message} /> : null}

      <Card className="grid gap-4 p-5 sm:grid-cols-3">
        <div>
          <span className="text-caption text-ink-muted">État</span>
          <div className="mt-1">
            <Badge>{schedule.isActive ? "Actif" : "Suspendu"}</Badge>
          </div>
        </div>
        <div>
          <span className="text-caption text-ink-muted">
            Prochaine exécution
          </span>
          <p>{new Date(schedule.nextRunAt).toLocaleString("fr-FR")}</p>
        </div>
        <div>
          <span className="text-caption text-ink-muted">
            Dernière exécution
          </span>
          <p>
            {schedule.lastRunAt
              ? new Date(schedule.lastRunAt).toLocaleString("fr-FR")
              : "Jamais exécuté"}
          </p>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="text-h3">Paramètres</h2>
        <form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={save}>
          <Field label="Nom" htmlFor="report-label">
            <Input
              id="report-label"
              name="label"
              defaultValue={schedule.label}
              required
            />
          </Field>
          <Field label="Rapport" htmlFor="report-type">
            <SelectNative
              id="report-type"
              name="reportType"
              defaultValue={schedule.reportType}
            >
              <option value="ventes_canaux">Ventes par canal</option>
              <option value="remplissage">Remplissage</option>
              <option value="annulations">Annulations</option>
              <option value="recettes">Recettes</option>
            </SelectNative>
          </Field>
          <Field label="Fréquence" htmlFor="report-frequency">
            <SelectNative
              id="report-frequency"
              name="frequency"
              defaultValue={schedule.frequency}
            >
              <option value="quotidien">Quotidien</option>
              <option value="hebdomadaire">Hebdomadaire</option>
              <option value="mensuel">Mensuel</option>
            </SelectNative>
          </Field>
          <Field label="Format" htmlFor="report-format">
            <SelectNative
              id="report-format"
              name="format"
              defaultValue={schedule.format}
            >
              <option value="csv">CSV</option>
              <option value="xlsx">XLSX</option>
              <option value="pdf">PDF</option>
            </SelectNative>
          </Field>
          <Field
            className="sm:col-span-2"
            label="Destinataires (séparés par des virgules)"
            htmlFor="report-recipients"
          >
            <Input
              id="report-recipients"
              name="recipients"
              defaultValue={schedule.recipients.join(", ")}
              required
            />
          </Field>
          <Button type="submit" loading={pending}>
            Enregistrer les modifications
          </Button>
        </form>
      </Card>

      <Card className="flex flex-wrap gap-3 p-5">
        <Button
          loading={pending}
          onClick={() =>
            run(
              () => runNow({ scheduleId: scheduleId as never }),
              "Le rapport a été placé dans la file d’envoi."
            )
          }
        >
          Exécuter maintenant
        </Button>
        <Button
          variant="secondary"
          loading={pending}
          onClick={() =>
            run(
              () =>
                setActive({
                  scheduleId: scheduleId as never,
                  isActive: !schedule.isActive,
                }),
              schedule.isActive
                ? "La programmation a été suspendue."
                : "La programmation a été réactivée."
            )
          }
        >
          {schedule.isActive ? "Suspendre" : "Réactiver"}
        </Button>
      </Card>
    </ManagementDetailShell>
  )
}
