"use client"

import type { Route } from "next"
import Link from "next/link"
import { useState } from "react"

import { useConvex } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { Field, Input } from "@workspace/ui/components/field"
import { InlineMessage } from "@workspace/ui/components/inline-message"
import { cn } from "@workspace/ui/lib/utils"

import { useNaviguer } from "@/coquille/filet-navigation"
import { adresseConnexion } from "@/fonctionnalites/tunnel/adresses"
import { useOnline } from "@/hooks/use-online"
import { memoriserContact } from "@/lib/acces-reservation"
import {
  EXEMPLE_TELEPHONE,
  erreurTelephone,
  lireTelephone,
} from "@/lib/telephone"

/** « v-ligne-2026 0930 » → « V-LIGNE-20260930 » */
export function normaliserReference(saisie: string): string {
  return saisie.replace(/\s+/g, "").toUpperCase()
}

/**
 * Écritures à présenter au serveur, qui compare le téléphone au caractère
 * près. Le tunnel enregistre la forme compacte de `lireTelephone`
 * (+24177123456) : on la tente d'abord, puis la saisie telle quelle, pour
 * une réservation prise ailleurs (guichet, agence) sous une autre écriture.
 */
export function variantesTelephone(saisie: string): string[] {
  const lecture = lireTelephone(saisie)
  const brut = saisie.trim()
  return [
    ...new Set(
      [
        lecture.ok ? lecture.numero : null,
        brut,
        brut.replace(/\s+/g, ""),
      ].filter((v): v is string => Boolean(v))
    ),
  ]
}

function telephoneInvalide(saisie: string): string | undefined {
  const lecture = lireTelephone(saisie)
  if (lecture.ok) return undefined
  // Un numéro inhabituel (ancien format, étranger) peut être celui de la
  // réservation : seule une saisie vide ou trop courte est refusée d'emblée.
  if (lecture.raison === "vide" || saisie.replace(/\D/g, "").length < 8)
    return erreurTelephone(lecture.raison === "vide" ? "vide" : "incomplet")
  return undefined
}

/**
 * Retrouver une réservation faite sans compte : sa référence et le téléphone
 * de contact. Vérifiés auprès du serveur avant d'ouvrir le dossier, pour dire
 * tout de suite ce qui ne va pas plutôt que d'afficher un écran d'erreur.
 *
 * Avec `reference`, seule la saisie du téléphone est demandée : la
 * référence est celle de l'écran, qui se relit une fois le numéro mémorisé.
 */
export function FormulaireRetrouver({
  reference: referenceFixe,
  onTrouve,
  principal = false,
  erreurInitiale,
  className,
}: {
  reference?: string
  onTrouve?: (telephone: string) => void
  principal?: boolean
  erreurInitiale?: string
  className?: string
}) {
  const convex = useConvex()
  const naviguer = useNaviguer()
  const enLigne = useOnline()
  const [reference, setReference] = useState(referenceFixe ?? "")
  const [telephone, setTelephone] = useState("")
  const [erreurs, setErreurs] = useState<{
    reference?: string
    telephone?: string
  }>({})
  const [erreur, setErreur] = useState<string | null>(erreurInitiale ?? null)
  const [envoi, setEnvoi] = useState(false)

  const chercher = async () => {
    const ref = normaliserReference(referenceFixe ?? reference)
    const manques = {
      reference: ref ? undefined : "Indiquez la référence de la réservation.",
      telephone: telephoneInvalide(telephone),
    }
    setErreurs(manques)
    setErreur(null)
    if (manques.reference || manques.telephone) return
    if (!enLigne || !navigator.onLine) {
      setErreur("Retrouver une réservation demande une connexion.")
      return
    }

    setEnvoi(true)
    try {
      // Le serveur ne dit pas lequel des deux ne va pas (il ne révèle pas
      // qu'une référence existe) : chaque écriture du numéro est essayée,
      // puis une seule erreur couvre la référence et le téléphone.
      for (const variante of variantesTelephone(telephone)) {
        try {
          const dossier = await convex.query(
            api.functions.bookings.getByReference,
            { reference: ref, contactPhone: variante }
          )
          if (dossier === null) continue
          memoriserContact(ref, variante)
          // Sur l'écran d'une réservation, le téléphone mémorisé suffit : il
          // se relit de lui-même. Ailleurs, on ouvre la réservation.
          if (onTrouve) onTrouve(variante)
          else if (referenceFixe === undefined)
            naviguer(`/billets/${encodeURIComponent(ref)}` as Route)
          return
        } catch {
          // Erreur passagère sous cette écriture : on essaie la suivante.
        }
      }
      setErreur(
        "Référence ou téléphone incorrect. Vérifiez la référence reçue à la confirmation et le téléphone donné au moment de réserver."
      )
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <form
      noValidate
      className={cn("grid gap-3", className)}
      onSubmit={(event) => {
        event.preventDefault()
        void chercher()
      }}
    >
      {referenceFixe === undefined && (
        <Field
          label="Référence"
          htmlFor="retrouver-reference"
          hint="Indiquée à la confirmation de la réservation."
          error={erreurs.reference}
        >
          <Input
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            className="font-mono uppercase"
            value={reference}
            onChange={(event) => setReference(event.target.value)}
          />
        </Field>
      )}
      <Field
        label="Téléphone de contact"
        htmlFor={`retrouver-telephone-${referenceFixe ?? "saisie"}`}
        hint={`Celui donné au moment de réserver, par exemple ${EXEMPLE_TELEPHONE}.`}
        error={
          erreurs.telephone ?? (referenceFixe ? erreurs.reference : undefined)
        }
      >
        <Input
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={telephone}
          onChange={(event) => setTelephone(event.target.value)}
        />
      </Field>
      {erreur && <InlineMessage tone="warning" title={erreur} />}
      <Button
        type="submit"
        variant={principal ? "primary" : "secondary"}
        size="lg"
        loading={envoi}
        className="md:justify-self-start"
      >
        Afficher la réservation
      </Button>
    </form>
  )
}

/** Accès d'un invité à une réservation donnée : son téléphone, ou la connexion. */
export function AccesReservation({
  reference,
  erreur,
  retour = `/billets/${reference}`,
}: {
  reference: string
  erreur?: string
  /** Écran à rouvrir après la connexion. */
  retour?: string
}) {
  return (
    <section className="grid max-w-[560px] gap-4 md:mx-auto md:w-full">
      <div className="grid gap-1">
        <h1 className="md:text-h2 text-[22px] leading-tight font-bold">
          Retrouver cette réservation
        </h1>
        <p className="text-small text-ink-muted">
          Réservation <span className="font-mono text-ink">{reference}</span>.
          Sans compte, elle s&apos;ouvre avec le téléphone donné au moment de
          réserver.
        </p>
      </div>
      <div className="rounded-lg border border-line bg-surface p-4 md:p-5">
        <FormulaireRetrouver
          reference={reference}
          principal
          erreurInitiale={erreur}
        />
      </div>
      <p className="text-small text-ink-muted">
        Réservée avec votre compte ?{" "}
        <Link
          href={adresseConnexion(retour)}
          className="font-semibold text-accent-ink underline-offset-4 hover:underline"
        >
          Connectez-vous
        </Link>
      </p>
    </section>
  )
}
