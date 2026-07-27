"use client"

import * as React from "react"
import { Pencil, Plus, Trash2 } from "lucide-react"
import Link from "next/link"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Avatar } from "@workspace/ui/components/avatar"
import { Button } from "@workspace/ui/components/button"
import { EmptyState, SkeletonLines } from "@workspace/ui/components/empty-state"
import { Field, Input, SelectNative } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"
import { Tag } from "@workspace/ui/components/tag"
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/mobile/sheet"

import { useTravelerAuth } from "@/hooks/use-traveler-auth"

/** Réductions proposées à la fiche — le référentiel serveur reste seul juge. */
const DISCOUNTS = [
  { value: "", label: "Plein tarif" },
  { value: "ENFANT", label: "Enfant (4–11 ans) · −50 %" },
]

interface Draft {
  passengerId?: string
  lastName: string
  firstName: string
  gender: "M" | "F"
  phone: string
  emergencyPhone: string
  birthDate: string
  discountCode: string
}

const EMPTY_DRAFT: Draft = {
  lastName: "",
  firstName: "",
  gender: "F",
  phone: "",
  emergencyPhone: "",
  birthDate: "",
  discountCode: "",
}

/**
 * Voyageurs enregistrés.
 *
 * L'ajout et la modification passent par une feuille glissante plutôt que par
 * un formulaire déplié sous la liste : sur un écran étroit, la liste
 * disparaîtrait sous le clavier au moment même où l'on veut la relire.
 */
export function SavedPassengersScreen() {
  const { isAuthenticated, isLoading, isProfileReady } = useTravelerAuth()
  const passengers = useQuery(
    api.functions.customers.listSavedPassengers,
    isAuthenticated && isProfileReady ? {} : "skip"
  )
  const addPassenger = useMutation(api.functions.customers.addSavedPassenger)
  const updatePassenger = useMutation(
    api.functions.customers.updateSavedPassenger
  )
  const removePassenger = useMutation(
    api.functions.customers.removeSavedPassenger
  )

  const [draft, setDraft] = React.useState<Draft | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string>()

  if (isLoading) return <SkeletonLines lines={4} />

  if (!isAuthenticated) {
    return (
      <EmptyState
        title="Connectez-vous pour enregistrer des voyageurs"
        description="Ces fiches sont rattachées à votre compte."
        action={
          <Button asChild>
            <Link href="/connexion?retour=/compte/voyageurs">Se connecter</Link>
          </Button>
        }
      />
    )
  }

  if (!isProfileReady || passengers === undefined)
    return <SkeletonLines lines={4} />

  async function save() {
    if (!draft) return
    if (!draft.lastName.trim() || !draft.firstName.trim()) {
      setError("Le nom et le prénom sont obligatoires.")
      return
    }
    setSaving(true)
    setError(undefined)
    try {
      const fields = {
        lastName: draft.lastName.trim(),
        firstName: draft.firstName.trim(),
        gender: draft.gender,
        phone: draft.phone.trim() || undefined,
        emergencyPhone: draft.emergencyPhone.trim() || undefined,
        birthDate: draft.birthDate || undefined,
        discountCode: draft.discountCode || undefined,
      }
      if (draft.passengerId) {
        await updatePassenger({
          passengerId: draft.passengerId as never,
          ...fields,
        })
      } else {
        await addPassenger(fields)
      }
      setDraft(null)
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "La fiche n’a pas pu être enregistrée."
      )
    } finally {
      setSaving(false)
    }
  }

  async function remove(passengerId: string) {
    if (
      !window.confirm(
        "Supprimer cette fiche ? Les billets déjà émis ne sont pas modifiés."
      )
    )
      return
    try {
      await removePassenger({ passengerId: passengerId as never })
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "La fiche n’a pas pu être supprimée."
      )
    }
  }

  return (
    <div className="grid gap-s-4 *:min-w-0">
      {error && <InlineMessage tone="danger" title={error} />}

      {passengers.length === 0 ? (
        <EmptyState
          title="Aucun voyageur enregistré"
          description="Enregistrez les personnes avec qui vous voyagez souvent : leurs informations seront proposées à la réservation."
        />
      ) : (
        <ul className="grid gap-s-2">
          {passengers.map((passenger) => (
            // Identité sur la première ligne, actions sur la seconde : un
            // nom composé et deux cibles de 44 px ne tiennent pas côte à côte
            // sous 400 px sans tronquer le nom.
            <li
              key={passenger._id}
              className="grid gap-s-2 rounded-md border border-line bg-surface p-s-3"
            >
              <div className="flex items-center gap-s-3">
                <Avatar
                  name={`${passenger.firstName} ${passenger.lastName}`}
                  size="lg"
                />
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className="text-body truncate font-medium">
                    {passenger.lastName.toUpperCase()} {passenger.firstName}
                  </span>
                  <span className="tabular text-caption truncate text-ink-muted">
                    {passenger.gender === "F" ? "Femme" : "Homme"}
                    {passenger.phone ? ` · ${passenger.phone}` : ""}
                  </span>
                </span>
                {passenger.discountCode === "ENFANT" && (
                  <Tag tone="accent">−50 %</Tag>
                )}
              </div>
              <div className="flex justify-end gap-s-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setDraft({
                      passengerId: passenger._id,
                      lastName: passenger.lastName,
                      firstName: passenger.firstName,
                      gender: passenger.gender,
                      phone: passenger.phone ?? "",
                      emergencyPhone: passenger.emergencyPhone ?? "",
                      birthDate: passenger.birthDate ?? "",
                      discountCode: passenger.discountCode ?? "",
                    })
                  }
                >
                  <Pencil />
                  Modifier
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void remove(passenger._id)}
                >
                  <Trash2 />
                  Supprimer
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Button block onClick={() => setDraft({ ...EMPTY_DRAFT })}>
        <Plus />
        Ajouter un voyageur
      </Button>

      <Sheet
        open={draft !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDraft(null)
            setError(undefined)
          }
        }}
      >
        <SheetContent aria-describedby={undefined}>
          <SheetHeader>
            <SheetTitle>
              {draft?.passengerId ? "Modifier la fiche" : "Nouveau voyageur"}
            </SheetTitle>
          </SheetHeader>
          {draft && (
            <>
              <SheetBody>
                <Field label="Prénom" htmlFor="sp-first-name">
                  <Input
                    id="sp-first-name"
                    value={draft.firstName}
                    onChange={(event) =>
                      setDraft({ ...draft, firstName: event.target.value })
                    }
                  />
                </Field>
                <Field label="Nom" htmlFor="sp-last-name">
                  <Input
                    id="sp-last-name"
                    value={draft.lastName}
                    onChange={(event) =>
                      setDraft({ ...draft, lastName: event.target.value })
                    }
                  />
                </Field>
                <Field label="Sexe" htmlFor="sp-gender">
                  <SelectNative
                    id="sp-gender"
                    value={draft.gender}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        gender: event.target.value as "M" | "F",
                      })
                    }
                  >
                    <option value="F">Femme</option>
                    <option value="M">Homme</option>
                  </SelectNative>
                </Field>
                <Field label="Téléphone" htmlFor="sp-phone">
                  <Input
                    id="sp-phone"
                    type="tel"
                    value={draft.phone}
                    onChange={(event) =>
                      setDraft({ ...draft, phone: event.target.value })
                    }
                  />
                </Field>
                <Field label="Contact d’urgence" htmlFor="sp-emergency">
                  <Input
                    id="sp-emergency"
                    type="tel"
                    value={draft.emergencyPhone}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        emergencyPhone: event.target.value,
                      })
                    }
                  />
                </Field>
                <Field
                  label="Date de naissance"
                  htmlFor="sp-birth"
                  hint="Nécessaire pour justifier une réduction enfant."
                >
                  <Input
                    id="sp-birth"
                    type="date"
                    value={draft.birthDate}
                    onChange={(event) =>
                      setDraft({ ...draft, birthDate: event.target.value })
                    }
                  />
                </Field>
                <Field label="Réduction habituelle" htmlFor="sp-discount">
                  <SelectNative
                    id="sp-discount"
                    value={draft.discountCode}
                    onChange={(event) =>
                      setDraft({ ...draft, discountCode: event.target.value })
                    }
                  >
                    {DISCOUNTS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </SelectNative>
                </Field>
              </SheetBody>
              <SheetFooter>
                <Button
                  size="lg"
                  block
                  loading={saving}
                  loadingLabel="Enregistrement…"
                  onClick={() => void save()}
                >
                  Enregistrer
                </Button>
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
