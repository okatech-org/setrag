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
import { ROLE_LABELS, ROLES } from "@/lib/roles"
import { ManagementDetailShell } from "./management-detail-shell"
import { usePortalSession } from "./portal-guard"

export function ManagedUserDetail({ userId }: { userId: string }) {
  const session = usePortalSession()
  const role = asAppRole(session?.profile.user.role)
  const mayModify = canRole(role, "utilisateurs", "modifier")
  const maySuspend = canRole(role, "utilisateurs", "supprimer")
  const detail = useQuery(api.functions.administration.getManagedUser, {
    userId: userId as never,
  })
  const pointsOfSale = useQuery(api.functions.management.listPointsOfSale, {})
  const updateUser = useMutation(api.functions.administration.updateManagedUser)
  const setStatus = useMutation(
    api.functions.administration.setManagedUserStatus
  )
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  async function run(action: () => Promise<unknown>, success: string) {
    setPending(true)
    setMessage("")
    setError("")
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
    const optional = (key: string) => {
      const value = String(data.get(key) ?? "").trim()
      return value || undefined
    }
    await run(
      () =>
        updateUser({
          userId: userId as never,
          email: optional("email"),
          phone: optional("phone"),
          firstName: optional("firstName"),
          lastName: optional("lastName"),
          role: String(data.get("role") ?? detail?.user.role ?? "") as never,
          matricule: optional("matricule"),
          pointOfSaleId: optional("pointOfSaleId") as never,
        }),
      "Le profil utilisateur a été mis à jour."
    )
  }

  if (detail === undefined || pointsOfSale === undefined) {
    return (
      <ManagementDetailShell
        title="Utilisateur"
        eyebrow="UTILISATEURS · CHARGEMENT"
        backHref="/gestion/utilisateurs"
      >
        <p role="status">Chargement du profil…</p>
      </ManagementDetailShell>
    )
  }

  if (detail === null) {
    return (
      <ManagementDetailShell
        title="Utilisateur introuvable"
        eyebrow="UTILISATEURS"
        backHref="/gestion/utilisateurs"
      >
        <InlineMessage tone="danger" title="Ce compte n’existe plus." />
      </ManagementDetailShell>
    )
  }

  const { user, pointOfSale, dependencies, isSelf } = detail
  const displayName =
    `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() ||
    user.email ||
    user.authId

  return (
    <ManagementDetailShell
      title={displayName}
      eyebrow={`UTILISATEUR · ${ROLE_LABELS[user.role]}`}
      backHref="/gestion/utilisateurs"
    >
      {error ? (
        <InlineMessage tone="danger" title="Action impossible">
          {error}
        </InlineMessage>
      ) : null}
      {message ? <InlineMessage tone="success" title={message} /> : null}
      {dependencies.openCashSessions > 0 ? (
        <InlineMessage tone="warning" title="Suspension protégée">
          Cet utilisateur possède {dependencies.openCashSessions} caisse(s)
          ouverte(s). Elles doivent être clôturées avant sa suspension.
        </InlineMessage>
      ) : null}

      <Card className="grid gap-4 p-5 sm:grid-cols-4">
        <div>
          <span className="text-caption text-ink-muted">État</span>
          <div className="mt-1">
            <Badge variant={user.isActive ? "success" : "warning"}>
              {user.isActive ? "Actif" : "Suspendu"}
            </Badge>
          </div>
        </div>
        <div>
          <span className="text-caption text-ink-muted">Source d’identité</span>
          <p className="font-semibold">
            {user.identitySource === "annuaire" ? "Annuaire" : "Compte local"}
          </p>
        </div>
        <div>
          <span className="text-caption text-ink-muted">Point de vente</span>
          <p className="font-semibold">
            {pointOfSale
              ? `${pointOfSale.code} · ${pointOfSale.name}`
              : "Non rattaché"}
          </p>
        </div>
        <div>
          <span className="text-caption text-ink-muted">Ventes réalisées</span>
          <p className="tabular font-semibold">
            {dependencies.sales.toLocaleString("fr-FR")}
          </p>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="text-h3">Informations et habilitations</h2>
        <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={save}>
          <fieldset className="contents" disabled={!mayModify || pending}>
            <Field label="Prénom" htmlFor="managed-user-first-name">
              <Input
                id="managed-user-first-name"
                name="firstName"
                defaultValue={user.firstName}
              />
            </Field>
            <Field label="Nom" htmlFor="managed-user-last-name">
              <Input
                id="managed-user-last-name"
                name="lastName"
                defaultValue={user.lastName}
              />
            </Field>
            <Field label="Adresse e-mail" htmlFor="managed-user-email">
              <Input
                id="managed-user-email"
                name="email"
                type="email"
                defaultValue={user.email}
              />
            </Field>
            <Field label="Téléphone" htmlFor="managed-user-phone">
              <Input
                id="managed-user-phone"
                name="phone"
                type="tel"
                defaultValue={user.phone}
              />
            </Field>
            <Field label="Matricule" htmlFor="managed-user-matricule">
              <Input
                id="managed-user-matricule"
                name="matricule"
                defaultValue={user.matricule}
              />
            </Field>
            <Field
              label="Identifiant d’authentification"
              htmlFor="managed-user-auth-id"
              hint="Cet identifiant est géré par le fournisseur d’identité."
            >
              <Input
                id="managed-user-auth-id"
                value={user.authId}
                disabled
                readOnly
              />
            </Field>
            <Field
              label="Rôle"
              htmlFor="managed-user-role"
              hint={
                isSelf
                  ? "Votre propre rôle ne peut pas être modifié ici."
                  : undefined
              }
            >
              <SelectNative
                id="managed-user-role"
                name="role"
                defaultValue={user.role}
                disabled={isSelf || !mayModify}
              >
                {ROLES.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </SelectNative>
            </Field>
            <Field label="Point de vente" htmlFor="managed-user-point-of-sale">
              <SelectNative
                id="managed-user-point-of-sale"
                name="pointOfSaleId"
                defaultValue={user.pointOfSaleId ?? ""}
              >
                <option value="">Aucun rattachement</option>
                {pointsOfSale.map(({ pointOfSale: option }) => (
                  <option
                    key={option._id}
                    value={option._id}
                    disabled={!option.isActive}
                  >
                    {option.code} · {option.name}
                    {!option.isActive ? " · suspendu" : ""}
                  </option>
                ))}
              </SelectNative>
            </Field>
          </fieldset>
          <div className="flex flex-wrap gap-3 sm:col-span-2">
            <Button type="submit" loading={pending} disabled={!mayModify}>
              <Save />
              Enregistrer
            </Button>
            <Button
              type="button"
              variant={user.isActive ? "danger" : "secondary"}
              loading={pending}
              disabled={
                user.isActive
                  ? !maySuspend || isSelf || dependencies.openCashSessions > 0
                  : !mayModify
              }
              onClick={() =>
                run(
                  () =>
                    setStatus({
                      userId: userId as never,
                      isActive: !user.isActive,
                    }),
                  user.isActive
                    ? "Le compte a été suspendu sans effacer son historique."
                    : "Le compte a été réactivé."
                )
              }
            >
              <Power />
              {user.isActive ? "Suspendre" : "Réactiver"}
            </Button>
          </div>
        </form>
      </Card>
    </ManagementDetailShell>
  )
}
