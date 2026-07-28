"use client"

import { Building2, CircleDollarSign, Power, Save, Users } from "lucide-react"
import type { FormEvent } from "react"
import { useState } from "react"
import type { GenericId } from "convex/values"

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
import { Field, Input, SelectNative } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"

import { asAppRole, canRole } from "@/lib/portal-access"
import { ManagementDetailShell } from "./management-detail-shell"
import { usePortalSession } from "./portal-guard"

type PointOfSaleId = GenericId<"pointsOfSale">
type StationId = GenericId<"stations">

const TYPE_LABELS = {
  gare: "Gare",
  agence_accreditee: "Agence accréditée",
  agence_premium: "Agence premium",
} as const

function StatCard({
  label,
  value,
  icon,
}: {
  label: string
  value: string
  icon: React.ReactNode
}) {
  return (
    <Card className="gap-2 p-5">
      <div className="flex items-center justify-between gap-3 text-ink-muted">
        <span className="text-small">{label}</span>
        {icon}
      </div>
      <strong className="tabular text-h3">{value}</strong>
    </Card>
  )
}

export function PointOfSaleDetail({
  pointOfSaleId,
}: {
  pointOfSaleId: string
}) {
  const id = pointOfSaleId as PointOfSaleId
  const session = usePortalSession()
  const role = asAppRole(session?.profile.user.role)
  const mayModify = canRole(role, "referentiel", "modifier")
  const maySuspend = canRole(role, "referentiel", "supprimer")
  const detail = useQuery(api.functions.management.getPointOfSale, {
    pointOfSaleId: id,
  })
  const stations = useQuery(api.functions.referential.listStations, {
    includeInactive: true,
  })
  const updatePointOfSale = useMutation(
    api.functions.management.updatePointOfSale
  )
  const setPointOfSaleStatus = useMutation(
    api.functions.management.setPointOfSaleStatus
  )
  const [pending, setPending] = useState(false)
  const [statusPending, setStatusPending] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const stationId = String(data.get("stationId") ?? "")
    const royalty = String(data.get("royaltyPct") ?? "")
    setPending(true)
    setMessage("")
    setError("")
    try {
      await updatePointOfSale({
        pointOfSaleId: id,
        code: String(data.get("code") ?? ""),
        name: String(data.get("name") ?? ""),
        type: String(data.get("type")) as
          "gare" | "agence_accreditee" | "agence_premium",
        stationId: stationId ? (stationId as StationId) : undefined,
        passengerCounters: Number(data.get("passengerCounters")),
        baggageCounters: Number(data.get("baggageCounters")),
        parcelCounters: Number(data.get("parcelCounters")),
        royaltyPct: royalty === "" ? undefined : Number(royalty),
      })
      setMessage("Les modifications du point de vente sont enregistrées.")
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "La modification a échoué."
      )
    } finally {
      setPending(false)
    }
  }

  async function changeStatus(isActive: boolean) {
    if (
      !isActive &&
      !window.confirm(
        "Suspendre ce point de vente ? Les nouvelles ventes y seront immédiatement bloquées."
      )
    ) {
      return
    }
    setStatusPending(true)
    setMessage("")
    setError("")
    try {
      await setPointOfSaleStatus({ pointOfSaleId: id, isActive })
      setMessage(
        isActive
          ? "Le point de vente est de nouveau actif."
          : "Le point de vente est suspendu. Son historique est conservé."
      )
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Le changement d’état a échoué."
      )
    } finally {
      setStatusPending(false)
    }
  }

  if (detail === undefined || stations === undefined) {
    return (
      <ManagementDetailShell
        title="Chargement…"
        eyebrow="RÉFÉRENTIEL · POINT DE VENTE"
        backHref="/gestion/points-de-vente"
      >
        <p role="status" className="text-small text-ink-muted">
          Chargement du point de vente…
        </p>
      </ManagementDetailShell>
    )
  }

  const { pointOfSale, station, dependencies, attachedUsers } = detail
  const totalCounters =
    pointOfSale.counters.passengers +
    pointOfSale.counters.baggage +
    pointOfSale.counters.parcels
  const suspensionBlocked =
    dependencies.openCashSessions > 0 || dependencies.activeAgencyQuotas > 0

  return (
    <ManagementDetailShell
      title={pointOfSale.name}
      eyebrow={`POINT DE VENTE · ${pointOfSale.code}`}
      backHref="/gestion/points-de-vente"
    >
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant={pointOfSale.isActive ? "success" : "warning"}>
          {pointOfSale.isActive ? "Actif" : "Suspendu"}
        </Badge>
        <Badge variant="outline">{TYPE_LABELS[pointOfSale.type]}</Badge>
        <span className="text-small text-ink-muted">
          {station
            ? `${station.code} · ${station.name}`
            : "Sans gare de rattachement"}
        </span>
      </div>

      {message ? (
        <InlineMessage tone="success" title="Modification enregistrée">
          {message}
        </InlineMessage>
      ) : null}
      {error ? (
        <InlineMessage tone="danger" title="Action impossible">
          {error}
        </InlineMessage>
      ) : null}
      {suspensionBlocked ? (
        <InlineMessage tone="warning" title="Suspension protégée">
          Clôturez les {dependencies.openCashSessions} caisse(s) ouverte(s) et
          désactivez les {dependencies.activeAgencyQuotas} quota(s) actif(s)
          avant de suspendre ce point de vente.
        </InlineMessage>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Guichets configurés"
          value={String(totalCounters)}
          icon={<Building2 className="size-5" />}
        />
        <StatCard
          label="Agents rattachés"
          value={String(dependencies.attachedUsers)}
          icon={<Users className="size-5" />}
        />
        <StatCard
          label="Caisses ouvertes"
          value={String(dependencies.openCashSessions)}
          icon={<CircleDollarSign className="size-5" />}
        />
        <StatCard
          label="Ventes historiques"
          value={dependencies.sales.toLocaleString("fr-FR")}
          icon={<Save className="size-5" />}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.6fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Informations du point de vente</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="grid gap-5" onSubmit={submit}>
              <fieldset
                disabled={!mayModify || pending}
                className="grid gap-4 sm:grid-cols-2"
              >
                <Field label="Code" htmlFor="pos-detail-code">
                  <Input
                    id="pos-detail-code"
                    name="code"
                    defaultValue={pointOfSale.code}
                    required
                  />
                </Field>
                <Field label="Nom" htmlFor="pos-detail-name">
                  <Input
                    id="pos-detail-name"
                    name="name"
                    defaultValue={pointOfSale.name}
                    required
                  />
                </Field>
                <Field label="Type" htmlFor="pos-detail-type">
                  <SelectNative
                    id="pos-detail-type"
                    name="type"
                    defaultValue={pointOfSale.type}
                  >
                    <option value="gare">Gare</option>
                    <option value="agence_accreditee">Agence accréditée</option>
                    <option value="agence_premium">Agence premium</option>
                  </SelectNative>
                </Field>
                <Field
                  label="Gare de rattachement"
                  htmlFor="pos-detail-station"
                >
                  <SelectNative
                    id="pos-detail-station"
                    name="stationId"
                    defaultValue={pointOfSale.stationId ?? ""}
                  >
                    <option value="">Aucune</option>
                    {stations.map((stationOption) => (
                      <option key={stationOption._id} value={stationOption._id}>
                        {stationOption.code} · {stationOption.name}
                        {!stationOption.isActive ? " · inactive" : ""}
                      </option>
                    ))}
                  </SelectNative>
                </Field>
                <Field
                  label="Guichets voyageurs"
                  htmlFor="pos-detail-passengers"
                >
                  <Input
                    id="pos-detail-passengers"
                    name="passengerCounters"
                    type="number"
                    min="0"
                    max="1000"
                    defaultValue={pointOfSale.counters.passengers}
                    required
                  />
                </Field>
                <Field label="Guichets bagages" htmlFor="pos-detail-baggage">
                  <Input
                    id="pos-detail-baggage"
                    name="baggageCounters"
                    type="number"
                    min="0"
                    max="1000"
                    defaultValue={pointOfSale.counters.baggage}
                    required
                  />
                </Field>
                <Field label="Guichets colis" htmlFor="pos-detail-parcels">
                  <Input
                    id="pos-detail-parcels"
                    name="parcelCounters"
                    type="number"
                    min="0"
                    max="1000"
                    defaultValue={pointOfSale.counters.parcels}
                    required
                  />
                </Field>
                <Field
                  label="Royalties agence (%)"
                  htmlFor="pos-detail-royalty"
                  hint="Laissez vide pour un point de vente sans commission."
                >
                  <Input
                    id="pos-detail-royalty"
                    name="royaltyPct"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    defaultValue={pointOfSale.royaltyPct}
                  />
                </Field>
              </fieldset>
              <div className="flex flex-wrap gap-3">
                <Button
                  type="submit"
                  loading={pending}
                  loadingLabel="Enregistrement…"
                  disabled={!mayModify}
                >
                  <Save />
                  Enregistrer
                </Button>
                {pointOfSale.isActive ? (
                  <Button
                    type="button"
                    variant="danger"
                    loading={statusPending}
                    loadingLabel="Suspension…"
                    disabled={!maySuspend || suspensionBlocked}
                    onClick={() => changeStatus(false)}
                  >
                    <Power />
                    Suspendre
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="secondary"
                    loading={statusPending}
                    loadingLabel="Réactivation…"
                    disabled={!mayModify}
                    onClick={() => changeStatus(true)}
                  >
                    <Power />
                    Réactiver
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Rattachements et dépendances</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5">
            <dl className="text-small grid gap-3">
              <div className="flex justify-between gap-4">
                <dt className="text-ink-muted">Agents actifs</dt>
                <dd className="tabular font-semibold">
                  {dependencies.activeUsers}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-muted">Sessions de caisse</dt>
                <dd className="tabular font-semibold">
                  {dependencies.cashSessions}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-muted">Quotas agence actifs</dt>
                <dd className="tabular font-semibold">
                  {dependencies.activeAgencyQuotas}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-muted">Taux de royalties</dt>
                <dd className="tabular font-semibold">
                  {pointOfSale.royaltyPct === undefined
                    ? "Non applicable"
                    : `${pointOfSale.royaltyPct.toLocaleString("fr-FR")} %`}
                </dd>
              </div>
            </dl>

            <div className="grid gap-2 border-t border-line pt-4">
              <h2 className="font-semibold">Agents rattachés</h2>
              {attachedUsers.length === 0 ? (
                <p className="text-small text-ink-muted">
                  Aucun agent rattaché.
                </p>
              ) : (
                <ul className="grid gap-2">
                  {attachedUsers.map((user) => (
                    <li
                      key={user.id}
                      className="rounded-md bg-surface-sunk px-3 py-2"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-semibold">
                          {user.displayName}
                        </span>
                        <Badge
                          variant={user.isActive ? "success" : "secondary"}
                        >
                          {user.isActive ? "Actif" : "Suspendu"}
                        </Badge>
                      </div>
                      <p className="text-caption text-ink-muted">
                        {user.matricule ?? "Sans matricule"} · {user.role}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </ManagementDetailShell>
  )
}
