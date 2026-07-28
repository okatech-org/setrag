"use client"

import { Power, Save } from "lucide-react"
import { useState, type FormEvent } from "react"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Card } from "@workspace/ui/components/card"
import { Field, Input, SelectNative } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"

import { asAppRole, canRole } from "@/lib/portal-access"
import { ManagementDetailShell } from "./management-detail-shell"
import { usePortalSession } from "./portal-guard"

function dateValue(timestamp: number | undefined) {
  return timestamp ? new Date(timestamp).toISOString().slice(0, 10) : ""
}

function optionalNumber(data: FormData, key: string) {
  const value = String(data.get(key) ?? "").trim()
  return value === "" ? undefined : Number(value)
}

function optionalDate(data: FormData, key: string) {
  const value = String(data.get(key) ?? "").trim()
  return value === "" ? undefined : Date.parse(`${value}T00:00:00Z`)
}

export function PricingRuleDetail({ ruleId }: { ruleId: string }) {
  const session = usePortalSession()
  const role = asAppRole(session?.profile.user.role)
  const mayModify = canRole(role, "yield", "modifier")
  const maySuspend = canRole(role, "yield", "supprimer")
  const detail = useQuery(api.functions.administration.getPricingRule, {
    ruleId: ruleId as never,
  })
  const trips = useQuery(api.functions.administration.listYieldTripOptions, {})
  const updateRule = useMutation(api.functions.administration.updatePricingRule)
  const setStatus = useMutation(
    api.functions.administration.setPricingRuleStatus
  )
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
    const tripId = String(data.get("tripId") ?? "")
    const selectedClass = String(data.get("serviceClass") ?? "")
    await run(
      () =>
        updateRule({
          ruleId: ruleId as never,
          scope: String(data.get("scope")) as never,
          tripId: tripId ? (tripId as never) : undefined,
          serviceClass: selectedClass ? (selectedClass as never) : undefined,
          type: String(data.get("type")) as never,
          threshold: optionalNumber(data, "threshold"),
          modifierPct: Number(data.get("modifierPct")),
          priority: Number(data.get("priority")),
          validFrom: optionalDate(data, "validFrom"),
          validUntil: optionalDate(data, "validUntil"),
          floorXaf: optionalNumber(data, "floorXaf"),
          capXaf: optionalNumber(data, "capXaf"),
          code: String(data.get("code") ?? ""),
        }),
      "La règle de yield a été mise à jour."
    )
  }

  if (detail === undefined || trips === undefined) {
    return (
      <ManagementDetailShell
        title="Règle yield"
        eyebrow="YIELD · CHARGEMENT"
        backHref="/gestion/yield"
      >
        <p role="status">Chargement de la règle…</p>
      </ManagementDetailShell>
    )
  }

  if (detail === null) {
    return (
      <ManagementDetailShell
        title="Règle introuvable"
        eyebrow="YIELD"
        backHref="/gestion/yield"
      >
        <InlineMessage tone="danger" title="Cette règle n’existe plus." />
      </ManagementDetailShell>
    )
  }

  const { rule, trip, creator } = detail

  return (
    <ManagementDetailShell
      title={rule.code ?? `Règle ${rule.type}`}
      eyebrow="YIELD · RÈGLE TARIFAIRE"
      backHref="/gestion/yield"
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
            <Badge variant={rule.isActive ? "success" : "warning"}>
              {rule.isActive ? "Active" : "Suspendue"}
            </Badge>
          </div>
        </div>
        <div>
          <span className="text-caption text-ink-muted">Créée par</span>
          <p className="font-semibold">
            {creator
              ? `${creator.firstName ?? ""} ${creator.lastName ?? ""}`.trim() ||
                creator.email ||
                creator.authId
              : "Utilisateur inconnu"}
          </p>
        </div>
        <div>
          <span className="text-caption text-ink-muted">Desserte ciblée</span>
          <p className="font-semibold">
            {trip
              ? `${trip.trainNumber} · ${trip.serviceDate}`
              : "Réseau ou ligne"}
          </p>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="text-h3">Paramètres de la règle</h2>
        <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={save}>
          <fieldset className="contents" disabled={!mayModify || pending}>
            <Field label="Code" htmlFor="yield-code">
              <Input
                id="yield-code"
                name="code"
                defaultValue={rule.code}
                required
              />
            </Field>
            <Field label="Priorité" htmlFor="yield-priority">
              <Input
                id="yield-priority"
                name="priority"
                type="number"
                min="1"
                max="10000"
                defaultValue={rule.priority}
                required
              />
            </Field>
            <Field label="Périmètre" htmlFor="yield-scope">
              <SelectNative
                id="yield-scope"
                name="scope"
                defaultValue={rule.scope}
              >
                <option value="reseau">Réseau</option>
                <option value="ligne">Ligne</option>
                <option value="desserte">Desserte</option>
              </SelectNative>
            </Field>
            <Field label="Desserte" htmlFor="yield-trip">
              <SelectNative
                id="yield-trip"
                name="tripId"
                defaultValue={rule.tripId ?? ""}
              >
                <option value="">Aucune</option>
                {trips.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </SelectNative>
            </Field>
            <Field label="Type" htmlFor="yield-type">
              <SelectNative
                id="yield-type"
                name="type"
                defaultValue={rule.type}
              >
                <option value="remplissage">Remplissage</option>
                <option value="anticipation">Anticipation</option>
                <option value="periode">Période</option>
                <option value="canal">Canal</option>
                <option value="promotion">Promotion</option>
              </SelectNative>
            </Field>
            <Field label="Classe" htmlFor="yield-class">
              <SelectNative
                id="yield-class"
                name="serviceClass"
                defaultValue={rule.serviceClass ?? ""}
              >
                <option value="">Toutes les classes</option>
                <option value="DEUXIEME">Deuxième</option>
                <option value="PREMIERE">Première</option>
                <option value="VIP">VIP</option>
              </SelectNative>
            </Field>
            <Field label="Seuil" htmlFor="yield-threshold">
              <Input
                id="yield-threshold"
                name="threshold"
                type="number"
                step="0.01"
                defaultValue={rule.threshold}
              />
            </Field>
            <Field label="Modulation (%)" htmlFor="yield-modifier">
              <Input
                id="yield-modifier"
                name="modifierPct"
                type="number"
                min="-80"
                max="100"
                step="0.01"
                defaultValue={rule.modifierPct}
                required
              />
            </Field>
            <Field label="Début de validité" htmlFor="yield-valid-from">
              <Input
                id="yield-valid-from"
                name="validFrom"
                type="date"
                defaultValue={dateValue(rule.validFrom)}
              />
            </Field>
            <Field label="Fin de validité" htmlFor="yield-valid-until">
              <Input
                id="yield-valid-until"
                name="validUntil"
                type="date"
                defaultValue={dateValue(rule.validUntil)}
              />
            </Field>
            <Field label="Prix plancher (FCFA)" htmlFor="yield-floor">
              <Input
                id="yield-floor"
                name="floorXaf"
                type="number"
                min="0"
                defaultValue={rule.floorXaf}
              />
            </Field>
            <Field label="Prix plafond (FCFA)" htmlFor="yield-cap">
              <Input
                id="yield-cap"
                name="capXaf"
                type="number"
                min="0"
                defaultValue={rule.capXaf}
              />
            </Field>
          </fieldset>
          <div className="flex flex-wrap gap-3 sm:col-span-2">
            <Button type="submit" loading={pending} disabled={!mayModify}>
              <Save />
              Enregistrer
            </Button>
            <Button
              type="button"
              variant={rule.isActive ? "danger" : "secondary"}
              loading={pending}
              disabled={rule.isActive ? !maySuspend : !mayModify}
              onClick={() =>
                run(
                  () =>
                    setStatus({
                      ruleId: ruleId as never,
                      isActive: !rule.isActive,
                    }),
                  rule.isActive
                    ? "La règle a été suspendue sans effacer son historique."
                    : "La règle a été réactivée."
                )
              }
            >
              <Power />
              {rule.isActive ? "Suspendre" : "Réactiver"}
            </Button>
          </div>
        </form>
      </Card>
    </ManagementDetailShell>
  )
}
