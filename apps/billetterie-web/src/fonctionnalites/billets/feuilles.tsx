"use client"

import { useState } from "react"
import { toast } from "sonner"

import { useMutation } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { Feuille } from "@workspace/ui/components/feuille"
import { InlineMessage } from "@workspace/ui/components/inline-message"

import { messageServeur } from "@/fonctionnalites/tunnel/outils"
import { useOnline } from "@/hooks/use-online"

import { Reference } from "./elements"

/**
 * Annulation d'une réservation non réglée, confirmée d'un second geste : les
 * places repartent à la vente aussitôt, et rien ne permet de les reprendre.
 */
export function FeuilleAnnulerOption({
  reference,
  contact,
  ouvert,
  onOuvertChange,
}: {
  reference: string
  contact: string | null
  ouvert: boolean
  onOuvertChange: (ouvert: boolean) => void
}) {
  const annulerOption = useMutation(api.functions.bookings.cancelHold)
  const enLigne = useOnline()
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  const changer = (valeur: boolean) => {
    if (!valeur) setErreur(null)
    onOuvertChange(valeur)
  }

  const annuler = async () => {
    if (!enLigne || !navigator.onLine) {
      setErreur(
        "L'annulation demande une connexion : c'est le serveur qui remet les places en vente."
      )
      return
    }
    setEnvoi(true)
    setErreur(null)
    try {
      await annulerOption({ reference, contactPhone: contact ?? undefined })
      toast("Réservation annulée. Les places sont remises en vente.")
      changer(false)
    } catch (cause) {
      setErreur(
        messageServeur(cause) ??
          "L'annulation n'a pas abouti. Réessayez dans un instant."
      )
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <Feuille
      open={ouvert}
      onOpenChange={changer}
      titre="Annuler cette réservation ?"
      description="Elle n'est pas payée : aucun montant n'est en jeu."
      pied={
        <div className="grid gap-2 md:flex md:justify-end">
          <Button
            variant="danger"
            size="lg"
            loading={envoi}
            onClick={() => void annuler()}
            className="md:order-2"
          >
            Annuler la réservation
          </Button>
          <Button variant="ghost" size="lg" onClick={() => changer(false)}>
            Garder la réservation
          </Button>
        </div>
      }
    >
      <div className="grid gap-3 text-[15px]">
        <p>
          Les places sont remises en vente tout de suite. Pour faire ce voyage,
          il faudra réserver à nouveau.
        </p>
        {erreur && <InlineMessage tone="danger" title={erreur} />}
      </div>
    </Feuille>
  )
}

/**
 * Billet payé : l'annulation et la modification ne se font pas encore en
 * ligne. Le barème voyageur n'est pas arrêté par SETRAG ; on ne l'invente
 * pas, on dit où s'adresser.
 */
export function FeuilleAnnulerOuModifier({
  reference,
  ouvert,
  onOuvertChange,
}: {
  reference: string
  ouvert: boolean
  onOuvertChange: (ouvert: boolean) => void
}) {
  return (
    <Feuille
      open={ouvert}
      onOpenChange={onOuvertChange}
      titre="Annuler ou modifier ce voyage"
      description="Ces opérations se font aujourd'hui au guichet."
      pied={
        <Button
          variant="secondary"
          size="lg"
          block
          onClick={() => onOuvertChange(false)}
        >
          J&apos;ai compris
        </Button>
      }
    >
      <div className="grid gap-3 text-[15px]">
        <p>
          Un billet payé ne s&apos;annule pas et ne se modifie pas encore en
          ligne : les conditions d&apos;annulation de la vente en ligne ne sont
          pas encore arrêtées par SETRAG.
        </p>
        <p>
          Au guichet d&apos;une gare SETRAG, l&apos;agent annule ou modifie le
          billet aux conditions en vigueur. Donnez-lui la référence de la
          réservation :
        </p>
        <div className="rounded-md border border-line bg-surface px-4 py-1 text-[17px]">
          <Reference reference={reference} />
        </div>
      </div>
    </Feuille>
  )
}
