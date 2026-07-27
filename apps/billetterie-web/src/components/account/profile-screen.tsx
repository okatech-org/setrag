"use client"

import { useState } from "react"
import Link from "next/link"

import { useMutation } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { EmptyState, SkeletonLines } from "@workspace/ui/components/empty-state"
import { Field, Input } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"

import { useTravelerAuth } from "@/hooks/use-traveler-auth"

/**
 * Édition du profil.
 *
 * Écran commun aux deux largeurs : il n'existait pas côté bureau, rien n'a
 * donc à être préservé, et sa colonne unique tient aussi bien sur 390 px que
 * sur un écran large borné à 2xl.
 */
export function ProfileScreen() {
  const { isAuthenticated, isLoading, isProfileReady, profile, user } =
    useTravelerAuth()
  const updateProfile = useMutation(api.functions.customers.updateProfile)

  const [firstNameDraft, setFirstName] = useState<string>()
  const [lastNameDraft, setLastName] = useState<string>()
  const [emailDraft, setEmail] = useState<string>()
  const [phoneDraft, setPhone] = useState<string>()
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{
    tone: "success" | "danger"
    text: string
  }>()

  if (isLoading) return <SkeletonLines lines={5} />

  if (!isAuthenticated) {
    return (
      <EmptyState
        title="Connectez-vous pour modifier votre profil"
        description="La connexion se fait avec un code à usage unique, sans mot de passe."
        action={
          <Button asChild>
            <Link href="/connexion?retour=/compte/profil">Se connecter</Link>
          </Button>
        }
      />
    )
  }

  if (!isProfileReady || !profile) return <SkeletonLines lines={5} />

  const firstName =
    firstNameDraft ?? profile.user.firstName ?? user?.name?.split(" ")[0] ?? ""
  const lastName = lastNameDraft ?? profile.user.lastName ?? ""
  const email =
    emailDraft ??
    profile.user.email ??
    // Better Auth fabrique une adresse technique pour les comptes créés par
    // téléphone : elle n'a rien à faire dans un champ modifiable.
    (user?.email?.endsWith("@auth.setrag.local") ? "" : (user?.email ?? ""))
  const phone = phoneDraft ?? profile.user.phone ?? ""

  async function save() {
    if (!lastName.trim() || !firstName.trim()) {
      setMessage({
        tone: "danger",
        text: "Le nom et le prénom sont obligatoires : ils figurent sur le billet.",
      })
      return
    }
    setSaving(true)
    setMessage(undefined)
    try {
      await updateProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
      })
      setMessage({ tone: "success", text: "Vos informations sont à jour." })
    } catch (cause) {
      setMessage({
        tone: "danger",
        text:
          cause instanceof Error
            ? cause.message
            : "La modification n’a pas pu être enregistrée.",
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid gap-s-4 *:min-w-0">
      <div className="grid gap-s-3 rounded-md border border-line bg-surface p-s-4">
        <Field label="Prénom" htmlFor="profile-first-name">
          <Input
            id="profile-first-name"
            autoComplete="given-name"
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
          />
        </Field>
        <Field label="Nom" htmlFor="profile-last-name">
          <Input
            id="profile-last-name"
            autoComplete="family-name"
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
          />
        </Field>
        <Field
          label="Téléphone"
          htmlFor="profile-phone"
          hint="Il reçoit vos billets et les alertes de retard."
        >
          <Input
            id="profile-phone"
            type="tel"
            autoComplete="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
        </Field>
        <Field label="Adresse e-mail" htmlFor="profile-email">
          <Input
            id="profile-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>
      </div>

      {message && (
        <InlineMessage
          tone={message.tone === "success" ? "success" : "danger"}
          title={message.text}
        />
      )}

      <Button
        block
        loading={saving}
        loadingLabel="Enregistrement…"
        onClick={() => void save()}
      >
        Enregistrer
      </Button>
    </div>
  )
}
