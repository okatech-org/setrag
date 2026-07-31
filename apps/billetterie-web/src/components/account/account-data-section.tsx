"use client"

import * as React from "react"
import { Download, TriangleAlert } from "lucide-react"
import { useRouter } from "next/navigation"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { Switch } from "@workspace/ui/components/choice"
import { Field, Input } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"

import { useTravelerAuth } from "@/hooks/use-traveler-auth"
import { ticketingStorage } from "@/lib/ticketing"
import { seDeconnecter } from "@/lib/offline/deconnexion"

/**
 * Consentements et droits sur les données, en mobile.
 *
 * Ces trois actions — marketing, export, suppression — restent sur l'écran de
 * compte plutôt que dans un sous-écran : la conformité exige qu'elles soient
 * atteignables sans chercher.
 */
export function AccountDataSection() {
  const router = useRouter()
  const { isAuthenticated, isProfileReady, profile } = useTravelerAuth()
  const ready = isAuthenticated && isProfileReady

  const grantConsent = useMutation(api.functions.customers.grantConsent)
  const revokeConsent = useMutation(api.functions.customers.revokeConsent)
  const deleteAccount = useMutation(api.functions.customers.deleteMyAccount)
  const exportData = useQuery(
    api.functions.customers.exportMyData,
    ready ? {} : "skip"
  )

  const [marketingDraft, setMarketing] = React.useState<boolean>()
  const [confirmation, setConfirmation] = React.useState("")
  const [showDelete, setShowDelete] = React.useState(false)
  const [message, setMessage] = React.useState<string>()

  const marketing =
    marketingDraft ??
    profile?.consents.some(
      (consent) =>
        consent.type === "marketing" && consent.revokedAt === undefined
    ) ??
    false

  async function toggleMarketing(value: boolean) {
    setMarketing(value)
    if (value) {
      await grantConsent({
        type: "marketing",
        version: "marketing-2026-01",
        channel: "web",
      })
    } else {
      await revokeConsent({ type: "marketing" })
    }
  }

  function downloadExport() {
    if (!exportData) {
      setMessage("Votre export est encore en préparation.")
      return
    }
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(exportData, null, 2)], {
        type: "application/json",
      })
    )
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = `mes-donnees-setrag-${new Date().toISOString().slice(0, 10)}.json`
    anchor.click()
    URL.revokeObjectURL(url)
    setMessage("Votre export a été téléchargé.")
  }

  async function removeAccount() {
    try {
      await deleteAccount({ confirmation })
      await seDeconnecter()
      ticketingStorage.clearBooking()
      setConfirmation("")
      router.replace("/")
      router.refresh()
    } catch (cause) {
      setMessage(
        cause instanceof Error
          ? cause.message
          : "La suppression n’a pas pu être effectuée."
      )
    }
  }

  return (
    <section aria-labelledby="mes-donnees" className="grid gap-s-3">
      <h2 id="mes-donnees" className="text-h4">
        Mes données
      </h2>

      <div className="grid gap-s-3 rounded-md border border-line bg-surface p-s-4">
        <Switch
          checked={marketing}
          onCheckedChange={(checked) => void toggleMarketing(checked === true)}
          label="Recevoir les offres commerciales SETRAG"
        />
        <p className="text-caption text-ink-muted">
          Sans effet sur les alertes liées à vos voyages, qui restent envoyées.
        </p>
      </div>

      <Button variant="secondary" block onClick={downloadExport}>
        <Download />
        Télécharger mes données
      </Button>

      {message && <InlineMessage tone="info" title={message} />}

      {!showDelete ? (
        <Button
          variant="ghost"
          block
          onClick={() => setShowDelete(true)}
          className="text-danger-ink"
        >
          Supprimer mon compte
        </Button>
      ) : (
        <div className="grid gap-s-3 rounded-md border border-danger-soft bg-danger-soft p-s-4">
          <span className="flex items-center gap-s-2 text-danger-ink">
            <TriangleAlert aria-hidden className="size-5 shrink-0" />
            <strong className="text-body">Suppression du compte</strong>
          </span>
          <p className="text-small text-danger-ink">
            Votre profil est anonymisé. Les billets et les écritures comptables
            sont conservés : la loi l’impose.
          </p>
          <Field
            label="Saisissez SUPPRIMER pour confirmer"
            htmlFor="delete-confirm"
          >
            <Input
              id="delete-confirm"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
            />
          </Field>
          <Button
            variant="danger"
            block
            disabled={confirmation !== "SUPPRIMER"}
            onClick={() => void removeAccount()}
          >
            Supprimer définitivement
          </Button>
          <Button
            variant="ghost"
            block
            onClick={() => {
              setShowDelete(false)
              setConfirmation("")
            }}
          >
            Annuler
          </Button>
        </div>
      )}
    </section>
  )
}
