"use client"

import type { FunctionReturnType } from "convex/server"
import { Check, Search, Settings2, ShieldCheck } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import {
  moduleAccessLevelLabel,
  type ModuleAccessLevel,
  type ModuleCode,
} from "@workspace/backend/modules"
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

import { PLATFORM_MODULES_API_ENABLED } from "@/lib/platform-modules-runtime"
import { asAppRole } from "@/lib/portal-access"
import { ROLE_LABELS } from "@/lib/roles"
import { EnterpriseShell } from "./enterprise-layout"
import {
  canAdministerModules,
  useModuleNavigationAccesses,
} from "./module-access-navigation"
import { usePortalSession } from "./portal-guard"

const E2E_MODE =
  process.env.NODE_ENV !== "production" &&
  process.env.NEXT_PUBLIC_E2E_MODE === "1"

type AdministrationData = NonNullable<
  FunctionReturnType<
    typeof api.modules.platform.queries.listModuleAccessAdministration
  >
>
type AdministrationUser = AdministrationData["users"][number]
type AdministrationCell = AdministrationData["cells"][number]
type SelectionValue = ModuleAccessLevel | "none"

interface PendingChange {
  key: string
  userId: AdministrationUser["userId"]
  moduleCode: ModuleCode
  value: SelectionValue
}

export const MAX_MODULE_ACCESS_BATCH_SIZE = 100

export function canAddPendingModuleChange(
  currentSize: number,
  alreadyPending: boolean
) {
  return alreadyPending || currentSize < MAX_MODULE_ACCESS_BATCH_SIZE
}

const LEVEL_OPTIONS = [
  { value: "none", label: "Aucun" },
  { value: "lecture", label: "Lecture" },
  { value: "utilisation", label: "Utilisation" },
  { value: "admin", label: "Admin" },
] as const satisfies readonly { value: SelectionValue; label: string }[]

const SOURCE_LABELS: Record<
  NonNullable<AdministrationCell["accessSource"]>,
  string
> = {
  system: "système",
  grant: "attribution directe",
  role: "rôle",
}

export function moduleAccessCellKey(userId: string, moduleCode: ModuleCode) {
  return `${userId}:${moduleCode}`
}

function normalized(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
}

export function filterAdministrationUsers<
  T extends Pick<
    AdministrationUser,
    "email" | "firstName" | "lastName" | "matricule" | "role"
  >,
>(users: readonly T[], query: string) {
  const needle = normalized(query.trim())
  if (!needle) return [...users]

  return users.filter((user) =>
    normalized(
      [
        user.firstName,
        user.lastName,
        user.email,
        user.matricule,
        ROLE_LABELS[user.role],
      ]
        .filter(Boolean)
        .join(" ")
    ).includes(needle)
  )
}

function displayName(user: AdministrationUser) {
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim()
  return name || user.email || user.matricule || "Utilisateur sans nom"
}

function AccessLegend() {
  return (
    <section
      aria-labelledby="access-legend-heading"
      className="grid gap-3 rounded-xl border border-line bg-surface p-4 md:grid-cols-3"
    >
      <h2 id="access-legend-heading" className="sr-only">
        Légende des niveaux d’accès
      </h2>
      <div className="flex gap-3">
        <Badge variant="outline" className="h-fit shrink-0">
          Lecture
        </Badge>
        <p className="text-xs leading-relaxed text-ink-muted">
          Visibilité du module, sans action.
        </p>
      </div>
      <div className="flex gap-3">
        <Badge variant="info" className="h-fit shrink-0">
          Utilisation
        </Badge>
        <p className="text-xs leading-relaxed text-ink-muted">
          Lecture et actions métier autorisées.
        </p>
      </div>
      <div className="flex gap-3">
        <Badge variant="warning" className="h-fit shrink-0">
          Admin
        </Badge>
        <p className="text-xs leading-relaxed text-ink-muted">
          Paramétrage et attribution d’accès à un tiers.
        </p>
      </div>
    </section>
  )
}

export function ModuleAccessMatrix({ data }: { data: AdministrationData }) {
  const setAccessLevels = useMutation(
    api.modules.platform.mutations.setModuleAccessLevelsBatch
  )
  const [query, setQuery] = useState("")
  const [reason, setReason] = useState("")
  const [saving, setSaving] = useState(false)
  const [changes, setChanges] = useState<Map<string, PendingChange>>(
    () => new Map()
  )
  const users = useMemo(
    () => filterAdministrationUsers(data.users, query),
    [data.users, query]
  )
  const cellsByKey = useMemo(
    () =>
      new Map(
        data.cells.map((cell) => [
          moduleAccessCellKey(cell.userId, cell.moduleCode),
          cell,
        ])
      ),
    [data.cells]
  )

  function selectLevel(
    userId: AdministrationUser["userId"],
    moduleCode: ModuleCode,
    initialValue: SelectionValue,
    value: SelectionValue
  ) {
    const key = moduleAccessCellKey(userId, moduleCode)
    if (
      value !== initialValue &&
      !canAddPendingModuleChange(changes.size, changes.has(key))
    ) {
      toast.error(
        `Un lot est limité à ${MAX_MODULE_ACCESS_BATCH_SIZE} modifications. Enregistrez le lot actuel avant d’en ajouter.`
      )
      return
    }
    setChanges((current) => {
      const next = new Map(current)
      if (value === initialValue) next.delete(key)
      else next.set(key, { key, userId, moduleCode, value })
      return next
    })
  }

  function queueActivation(
    userId: AdministrationUser["userId"],
    moduleCode: ModuleCode,
    value: Exclude<SelectionValue, "none">
  ) {
    const key = moduleAccessCellKey(userId, moduleCode)
    if (!canAddPendingModuleChange(changes.size, changes.has(key))) {
      toast.error(
        `Un lot est limité à ${MAX_MODULE_ACCESS_BATCH_SIZE} modifications. Enregistrez le lot actuel avant d’en ajouter.`
      )
      return
    }
    setChanges((current) => {
      const next = new Map(current)
      next.set(key, { key, userId, moduleCode, value })
      return next
    })
  }

  async function saveChanges() {
    const normalizedReason = reason.trim()
    if (changes.size === 0 || !normalizedReason) return
    if (changes.size > MAX_MODULE_ACCESS_BATCH_SIZE) {
      toast.error(
        `Un lot ne peut pas dépasser ${MAX_MODULE_ACCESS_BATCH_SIZE} modifications.`
      )
      return
    }

    setSaving(true)
    try {
      await setAccessLevels({
        changes: [...changes.values()].map((change) => ({
          userId: change.userId,
          moduleCode: change.moduleCode,
          accessLevel: change.value === "none" ? undefined : change.value,
        })),
        reason: normalizedReason,
      })
      const count = changes.size
      setChanges(new Map())
      setReason("")
      toast.success(
        `${count} attribution${count > 1 ? "s" : ""} enregistrée${count > 1 ? "s" : ""}.`
      )
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : "Les attributions n’ont pas pu être enregistrées."
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid gap-5">
      <Card className="gap-4 p-4 md:p-5">
        <div className="grid items-end gap-4 lg:grid-cols-[minmax(16rem,1fr)_minmax(20rem,2fr)_auto]">
          <Field label="Rechercher un utilisateur" htmlFor="module-user-search">
            <Input
              id="module-user-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Nom, matricule, rôle ou e-mail…"
            />
          </Field>

          <Field
            label="Motif du changement"
            htmlFor="module-access-reason"
            hint="Obligatoire et inscrit au journal d’audit."
          >
            <Textarea
              id="module-access-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Précisez la demande, la décision ou le ticket associé…"
              rows={2}
              className="min-h-13"
            />
          </Field>

          <Button
            type="button"
            loading={saving}
            loadingLabel="Enregistrement…"
            disabled={
              saving ||
              changes.size === 0 ||
              changes.size > MAX_MODULE_ACCESS_BATCH_SIZE ||
              reason.trim().length === 0
            }
            onClick={() => void saveChanges()}
          >
            <Check />
            Enregistrer ({changes.size})
          </Button>
        </div>
        <p className="text-xs text-ink-muted" aria-live="polite">
          {changes.size === 0
            ? "Aucune modification en attente."
            : changes.size === MAX_MODULE_ACCESS_BATCH_SIZE
              ? `Limite de ${MAX_MODULE_ACCESS_BATCH_SIZE} modifications atteinte. Enregistrez ce lot avant de poursuivre.`
            : `${changes.size} modification${changes.size > 1 ? "s" : ""} en attente de validation.`}
        </p>
      </Card>

      <Card className="min-w-0 gap-0 overflow-hidden p-0">
        <div className="border-b border-line px-4 py-4 md:px-5">
          <h2 className="text-base font-bold">Utilisateurs × modules</h2>
          <p className="mt-1 text-xs text-ink-muted">
            La sélection part du niveau effectif. Choisir un autre niveau crée
            une attribution directe et « Aucun » retire l’accès au module.
          </p>
        </div>

        {users.length === 0 ? (
          <div
            role="status"
            className="grid min-h-48 place-items-center p-8 text-center"
          >
            <div className="grid max-w-sm justify-items-center gap-2">
              <Search aria-hidden className="size-6 text-ink-muted" />
              <p className="font-semibold">Aucun utilisateur trouvé</p>
              <p className="text-xs text-ink-muted">
                Modifiez la recherche pour afficher les habilitations.
              </p>
            </div>
          </div>
        ) : (
          <Table className="min-w-max">
            <TableHeader>
              <TableRow className="bg-surface-sunk/70 hover:bg-surface-sunk/70">
                <TableHead className="sticky left-0 z-20 min-w-64 bg-surface-sunk/95 px-4">
                  Utilisateur
                </TableHead>
                {data.modules.map((module) => (
                  <TableHead
                    key={module.code}
                    className="min-w-44 px-3 text-center"
                  >
                    <span className="block">{module.label}</span>
                    <Badge
                      variant={module.defaultEnabled ? "success" : "outline"}
                      className="mt-1.5"
                    >
                      {module.defaultEnabled
                        ? "Actif par défaut"
                        : "Activation ciblée"}
                    </Badge>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.userId}>
                  <TableCell className="sticky left-0 z-10 min-w-64 bg-surface px-4 whitespace-normal">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">
                          {displayName(user)}
                        </p>
                        <p className="mt-0.5 truncate text-[11px] text-ink-muted">
                          {user.matricule ?? user.email ?? "Sans matricule"}
                        </p>
                        <p className="mt-1 text-[11px] text-ink-muted">
                          {ROLE_LABELS[user.role]}
                        </p>
                      </div>
                      <Badge variant={user.isActive ? "success" : "warning"}>
                        {user.isActive ? "Actif" : "Suspendu"}
                      </Badge>
                    </div>
                  </TableCell>
                  {data.modules.map((module) => {
                    const key = moduleAccessCellKey(user.userId, module.code)
                    const cell = cellsByKey.get(key)

                    if (user.role === "admin_it") {
                      return (
                        <TableCell
                          key={module.code}
                          className="px-3 py-3 text-center"
                        >
                          <Badge variant="warning">Admin système</Badge>
                          <p className="mt-1.5 max-w-40 text-[10px] leading-tight text-ink-muted whitespace-normal">
                            Accès de gouvernance non modifiable.
                          </p>
                        </TableCell>
                      )
                    }

                    const initialValue: SelectionValue =
                      cell?.accessLevel ?? "none"
                    const selected = changes.get(key)?.value ?? initialValue
                    const pending = changes.has(key)
                    const effectiveLabel = cell?.accessLevel
                      ? moduleAccessLevelLabel(cell.accessLevel)
                      : "Aucun accès"
                    const sourceLabel = cell?.accessSource
                      ? SOURCE_LABELS[cell.accessSource]
                      : "aucune source"

                    return (
                      <TableCell key={module.code} className="px-3 py-3">
                        <label className="sr-only" htmlFor={`access-${key}`}>
                          Attribution de {module.label} pour {displayName(user)}
                        </label>
                        <SelectNative
                          id={`access-${key}`}
                          value={selected}
                          disabled={saving || !user.isActive}
                          aria-label={`Attribution de ${module.label} pour ${displayName(user)}`}
                          className="h-11 min-w-40 px-3 text-sm"
                          onChange={(event) =>
                            selectLevel(
                              user.userId,
                              module.code,
                              initialValue,
                              event.target.value as SelectionValue
                            )
                          }
                        >
                          {LEVEL_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </SelectNative>
                        {!cell?.enabled &&
                        !pending &&
                        initialValue !== "none" ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            className="mt-1.5 w-full"
                            disabled={saving || !user.isActive}
                            onClick={() =>
                              queueActivation(
                                user.userId,
                                module.code,
                                initialValue
                              )
                            }
                          >
                            Activer ce niveau
                          </Button>
                        ) : null}
                        <p className="mt-1.5 text-center text-[10px] leading-tight text-ink-muted">
                          {!cell?.enabled && pending && selected !== "none"
                            ? "Sera activé à l’enregistrement"
                            : !cell?.enabled
                              ? "Désactivé · attribution requise"
                              : `Effectif : ${effectiveLabel} · ${sourceLabel}`}
                        </p>
                      </TableCell>
                    )
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  )
}

export function ModuleAccessAdministration() {
  const portalSession = usePortalSession()
  const role = E2E_MODE
    ? ("admin_it" as const)
    : asAppRole(portalSession?.profile.user.role)
  const { decisions, loading: accessesLoading } =
    useModuleNavigationAccesses(role)
  const mayAdministerModules = canAdministerModules(role, decisions)
  const shouldLoadAdministration =
    !E2E_MODE &&
    PLATFORM_MODULES_API_ENABLED &&
    !accessesLoading &&
    mayAdministerModules
  const data = useQuery(
    api.modules.platform.queries.listModuleAccessAdministration,
    shouldLoadAdministration ? {} : "skip"
  )

  return (
    <EnterpriseShell
      title="Administration des accès modulaires"
      subtitle="Direction des Systèmes d’Information & Projets Métiers"
      actions={
        <Badge variant="outline" className="border-[#D39E00]/60 text-[#0F2C59]">
          <Settings2 aria-hidden />
          Administration système
        </Badge>
      }
    >
      <div className="grid gap-5">
        <div className="flex items-start gap-3 rounded-xl border border-line bg-surface px-4 py-3">
          <span className="rounded-lg bg-[#0F2C59]/10 p-2 text-[#0F2C59]">
            <ShieldCheck aria-hidden className="size-5" />
          </span>
          <div>
            <h2 className="text-sm font-bold">Gouvernance des habilitations</h2>
            <p className="mt-1 max-w-4xl text-xs leading-relaxed text-ink-muted">
              Attribuez un niveau par utilisateur et par module. Les droits
              métier fins restent limités par le rôle de la personne. Une
              attribution non nulle active automatiquement le module pour cet
              utilisateur.
            </p>
          </div>
        </div>

        <AccessLegend />

        {accessesLoading ? (
          <Card
            role="status"
            className="min-h-64 items-center justify-center p-8 text-center"
          >
            <Settings2
              aria-hidden
              className="size-7 animate-pulse text-ink-muted"
            />
            <p className="font-semibold">
              Vérification des droits d’administration…
            </p>
          </Card>
        ) : !mayAdministerModules ? (
          <InlineMessage tone="warning" title="Administration non autorisée">
            Votre compte ne détient aucun niveau Admin. Contactez
            l’administrateur système de la Direction des Systèmes d’Information
            & Projets Métiers si une délégation est nécessaire.
          </InlineMessage>
        ) : E2E_MODE || !PLATFORM_MODULES_API_ENABLED ? (
          <InlineMessage
            tone="info"
            title="Administration modulaire en cours d’activation"
          >
            La matrice sécurisée sera disponible après activation du service
            d’habilitations.
          </InlineMessage>
        ) : data === undefined ? (
          <Card
            role="status"
            className="min-h-64 items-center justify-center p-8 text-center"
          >
            <Settings2
              aria-hidden
              className="size-7 animate-pulse text-ink-muted"
            />
            <p className="font-semibold">Chargement de la matrice d’accès…</p>
            <p className="text-xs text-ink-muted">
              Vérification des utilisateurs et de leurs attributions.
            </p>
          </Card>
        ) : (
          <ModuleAccessMatrix data={data} />
        )}
      </div>
    </EnterpriseShell>
  )
}
