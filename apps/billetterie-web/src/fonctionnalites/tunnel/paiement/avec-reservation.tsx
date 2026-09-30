"use client"

import Link from "next/link"
import { useState, type FormEvent, type ReactNode } from "react"

import { useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { Field, Input } from "@workspace/ui/components/field"
import { Chargeur } from "@workspace/ui/components/voie"

import { useTravelerAuth } from "@/hooks/use-traveler-auth"
import { memoriserContact, useContact } from "@/lib/acces-reservation"
import { telephone } from "@/lib/format"
import {
  EXEMPLE_TELEPHONE,
  erreurTelephone,
  lireTelephone,
} from "@/lib/telephone"

import type { Dossier } from "../adresses"
import { EcranMessage, Page, SqueletteTunnel } from "../etapes"
import { LimiteErreur } from "../limite-erreur"
import { useAttenteLongue } from "../outils"

/** Même message pour une référence inconnue et un mauvais téléphone. */
const ERREUR_ACCES =
  "Référence ou téléphone incorrect. Vérifiez la référence et saisissez le téléphone donné en réservant."

/**
 * Lit une réservation par sa référence, pour le paiement et l'attente.
 *
 * Le serveur ne la rend qu'à son titulaire connecté, ou à qui donne aussi le
 * téléphone de contact. Ce téléphone a été retenu dans l'onglet à la
 * réservation ; s'il manque (autre appareil, onglet fermé), on le demande.
 */
export function AvecReservation({
  reference,
  children,
}: {
  reference: string | null
  children: (dossier: Dossier) => ReactNode
}) {
  const { isLoading, isAuthenticated, isProfileReady } = useTravelerAuth()
  const contact = useContact(reference)

  if (!reference) {
    return (
      <Page className="py-6">
        <EcranMessage
          titre="Aucune réservation à afficher."
          description="L'adresse ne porte pas de référence de réservation."
          action={
            <Button asChild variant="secondary">
              <Link href="/">Chercher un train</Link>
            </Button>
          }
        />
      </Page>
    )
  }
  if (
    isLoading ||
    (isAuthenticated && !isProfileReady) ||
    contact === undefined
  )
    return <SqueletteTunnel />
  if (!isAuthenticated && !contact)
    return <DemanderContact reference={reference} />

  return (
    <LimiteErreur
      key={contact ?? "compte"}
      secours={() => (
        <DemanderContact
          reference={reference}
          saisieInitiale={contact ? telephone(contact) : ""}
          erreur="La réservation n'a pas pu être lue. Vérifiez le téléphone donné en réservant, puis réessayez."
        />
      )}
    >
      <Lecture reference={reference} contact={contact}>
        {children}
      </Lecture>
    </LimiteErreur>
  )
}

function Lecture({
  reference,
  contact,
  children,
}: {
  reference: string
  contact: string | null
  children: (dossier: Dossier) => ReactNode
}) {
  const dossier = useQuery(api.functions.bookings.getByReference, {
    reference,
    contactPhone: contact ?? undefined,
  })
  const longue = useAttenteLongue(dossier === undefined)

  if (dossier === undefined) {
    return longue ? (
      <Page className="py-10">
        <Chargeur>Lecture de votre réservation…</Chargeur>
      </Page>
    ) : (
      <SqueletteTunnel />
    )
  }
  // Le serveur répond `null` aussi bien à une référence inconnue qu'à un
  // téléphone qui ne lui correspond pas : l'écran ne dit pas lequel.
  if (dossier === null) {
    return (
      <DemanderContact
        reference={reference}
        saisieInitiale={contact ? telephone(contact) : ""}
        erreur={ERREUR_ACCES}
      />
    )
  }
  return children(dossier)
}

/** Le téléphone de contact, quand l'onglet ne l'a pas gardé. */
function DemanderContact({
  reference,
  erreur: erreurInitiale,
  saisieInitiale = "",
}: {
  reference: string
  erreur?: string
  saisieInitiale?: string
}) {
  const [saisie, setSaisie] = useState(saisieInitiale)
  const [erreur, setErreur] = useState(erreurInitiale)

  const valider = (event: FormEvent) => {
    event.preventDefault()
    const lecture = lireTelephone(saisie)
    if (!lecture.ok) {
      setErreur(erreurTelephone(lecture.raison))
      return
    }
    memoriserContact(reference, lecture.numero)
  }

  return (
    <Page className="py-6">
      <form
        onSubmit={valider}
        className="mx-auto grid max-w-[480px] gap-4 rounded-lg border border-line bg-surface p-5 md:p-6"
      >
        <div className="grid gap-1">
          <h2 className="text-[20px] font-bold">Retrouver la réservation</h2>
          <p className="text-small text-ink-muted">
            Réservation <span className="tabular">{reference}</span>. Sans
            compte, elle s&apos;ouvre avec le téléphone donné en réservant.
          </p>
        </div>
        <Field
          label="Téléphone de contact"
          htmlFor="contact-reservation"
          hint={`9 chiffres, par exemple ${EXEMPLE_TELEPHONE}.`}
          error={erreur}
        >
          <Input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={saisie}
            onChange={(e) => setSaisie(e.target.value)}
          />
        </Field>
        <Button type="submit" size="lg" block>
          Ouvrir la réservation
        </Button>
      </form>
    </Page>
  )
}
