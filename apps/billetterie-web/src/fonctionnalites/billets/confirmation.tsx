"use client"

import { CheckIcon, SearchIcon, XIcon } from "lucide-react"
import type { Route } from "next"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useEffect, useState, type ReactNode } from "react"

import { useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { EmptyState } from "@workspace/ui/components/empty-state"
import { InlineMessage } from "@workspace/ui/components/inline-message"
import { Stepper } from "@workspace/ui/components/stepper"

import { BarreApp } from "@/coquille/barre-app"
import { useNaviguer } from "@/coquille/filet-navigation"
import {
  adresseAttente,
  adresseConnexion,
  adresseConfirmation,
} from "@/fonctionnalites/tunnel/adresses"
import { ETAPES } from "@/fonctionnalites/tunnel/etapes"
import { LimiteErreur } from "@/fonctionnalites/tunnel/limite-erreur"
import { useOnline } from "@/hooks/use-online"
import { useTravelerAuth } from "@/hooks/use-traveler-auth"
import { useContact } from "@/lib/acces-reservation"
import { telephone } from "@/lib/format"
import { ecrireSession, lireSession } from "@/lib/stockage-session"

import { ActionsDossier, useActionsBillets } from "./actions-billets"
import { BilletTitre } from "./billet-titre"
import { aPayer, type Dossier } from "./dossier"
import { Attente, Conteneur } from "./elements"
import { useMaintenant } from "./horloge"
import { AccesReservation, normaliserReference } from "./retrouver-reservation"
import { useHoraires } from "./use-horaires"

/**
 * Le ruban ne traverse la découpe qu'une fois : à l'émission. Revenir sur la
 * confirmation (retour, rechargement) montre des billets déjà émis.
 */
const CLE_EMIS = "setrag:billets-emis"

function dejaEmis(reference: string): boolean {
  return (lireSession(CLE_EMIS) ?? "").split(" ").includes(reference)
}

function marquerEmis(reference: string) {
  const liste = (lireSession(CLE_EMIS) ?? "").split(" ").filter(Boolean)
  if (!liste.includes(reference))
    ecrireSession(CLE_EMIS, [...liste, reference].slice(-12).join(" "))
}

/** Hors réseau, la confirmation attend le serveur : c'est lui qui émet. */
function HorsReseau() {
  return (
    <EmptyState
      title="Hors réseau"
      description="Vos billets s'afficheront ici dès le retour du réseau. Ils se retrouvent aussi dans l'onglet Billets."
    />
  )
}

function Cadre({
  children,
  reference,
}: {
  children: ReactNode
  reference?: string
}) {
  return (
    <>
      <BarreApp
        titre="Billets émis"
        actions={
          <Link
            href={
              (reference
                ? `/billets/${encodeURIComponent(reference)}`
                : "/billets") as Route
            }
            aria-label="Fermer"
            className="grid size-11 place-items-center rounded-pill text-ink-muted active:bg-surface-sunk"
          >
            <XIcon className="size-6" aria-hidden />
          </Link>
        }
      />
      <Conteneur>{children}</Conteneur>
    </>
  )
}

/**
 * Étape 4 du tunnel : `/confirmation?ref=`. Les billets d'abord, les moyens
 * de les emporter ensuite (maquettes « Confirmation » et « Billets émis »).
 */
export function Confirmation() {
  const parametres = useSearchParams()
  const reference = normaliserReference(parametres.get("ref") ?? "")
  const auth = useTravelerAuth()
  const contact = useContact(reference)
  const enLigne = useOnline()
  const compte = auth.isAuthenticated && auth.isProfileReady

  if (!reference) {
    return (
      <Cadre>
        <EmptyState
          title="Aucune réservation à afficher"
          description="Cette page s'ouvre après un paiement. Vos réservations se retrouvent dans l'onglet Billets."
          action={
            <Button asChild>
              <Link href="/billets">Mes billets</Link>
            </Button>
          }
        />
      </Cadre>
    )
  }
  if (!contact && contact !== undefined && !enLigne) {
    return (
      <Cadre reference={reference}>
        <HorsReseau />
      </Cadre>
    )
  }
  if (
    contact === undefined ||
    (!contact &&
      (auth.isLoading || (auth.isAuthenticated && !auth.isProfileReady)))
  ) {
    return (
      <Cadre reference={reference}>
        <Attente phrase="Émission de vos billets…" />
      </Cadre>
    )
  }
  if (!compte && !contact) {
    return (
      <Cadre reference={reference}>
        <AccesReservation
          reference={reference}
          retour={adresseConfirmation(reference)}
        />
      </Cadre>
    )
  }
  return (
    <LimiteErreur
      key={contact ?? "compte"}
      secours={() => (
        <Cadre reference={reference}>
          <AccesReservation
            reference={reference}
            retour={adresseConfirmation(reference)}
            erreur="La réservation n'a pas pu être lue. Vérifiez le téléphone donné au moment de réserver, puis réessayez."
          />
        </Cadre>
      )}
    >
      <ConfirmationChargee
        reference={reference}
        contact={contact}
        invite={!auth.isAuthenticated}
      />
    </LimiteErreur>
  )
}

function ConfirmationChargee({
  reference,
  contact,
  invite,
}: {
  reference: string
  contact: string | null
  invite: boolean
}) {
  const enLigne = useOnline()
  const dossier = useQuery(api.functions.bookings.getByReference, {
    reference,
    contactPhone: contact ?? undefined,
  })
  const naviguer = useNaviguer()
  const maintenant = useMaintenant()
  const enAttente =
    dossier?.sale.status === "en_attente_paiement" &&
    (maintenant === null || aPayer(dossier, maintenant))

  // Pas encore payée : l'écran d'attente suit le paiement jusqu'au bout.
  useEffect(() => {
    if (enAttente && maintenant !== null)
      naviguer(adresseAttente(reference), { remplacer: true })
  }, [enAttente, maintenant, naviguer, reference])

  if (dossier === undefined && !enLigne) {
    return (
      <Cadre reference={reference}>
        <HorsReseau />
      </Cadre>
    )
  }
  if (dossier === undefined || enAttente) {
    return (
      <Cadre reference={reference}>
        <Attente phrase="Émission de vos billets…" />
      </Cadre>
    )
  }
  // `null` : référence inconnue ou téléphone qui ne lui correspond pas — le
  // serveur ne dit pas lequel, l'écran non plus.
  if (dossier === null) {
    return (
      <Cadre reference={reference}>
        <AccesReservation
          reference={reference}
          retour={adresseConfirmation(reference)}
          erreur="Référence ou téléphone incorrect."
        />
      </Cadre>
    )
  }
  if (dossier.sale.status !== "confirmee" || !dossier.trip) {
    const annulee = dossier.sale.status === "annulee"
    return (
      <Cadre reference={reference}>
        <EmptyState
          title={
            annulee
              ? "Cette réservation est annulée"
              : dossier.sale.status === "remboursee"
                ? "Cette réservation est remboursée"
                : "Le délai de paiement est écoulé"
          }
          description="Aucun billet n'a été émis pour elle, et ses places ont été remises en vente."
          action={
            <Button asChild>
              <Link href="/">
                <SearchIcon aria-hidden />
                Chercher un train
              </Link>
            </Button>
          }
        />
      </Cadre>
    )
  }
  return <VueConfirmation dossier={dossier} contact={contact} invite={invite} />
}

function VueConfirmation({
  dossier,
  contact,
  invite,
}: {
  dossier: Dossier
  contact: string | null
  invite: boolean
}) {
  const horaires = useHoraires(dossier)
  const actions = useActionsBillets(dossier, contact, horaires)
  const reference = dossier.sale.number
  const total = dossier.tickets.length
  // Monté seulement une fois les billets reçus : jamais au rendu serveur.
  const [emis] = useState(() => !dejaEmis(reference))

  useEffect(() => {
    marquerEmis(reference)
    if (!emis) return
    // Une vibration légère quand le ruban a fini de traverser (720 ms) — si le
    // navigateur la permet : sans geste préalable sur la page, il la refuse.
    const minuteur = window.setTimeout(() => {
      if (navigator.userActivation?.hasBeenActive !== false)
        navigator.vibrate?.(10)
    }, 720)
    return () => window.clearTimeout(minuteur)
  }, [emis, reference])

  return (
    <Cadre reference={reference}>
      <header className="grid gap-5 md:flex md:items-center md:justify-between md:gap-10">
        <div className="grid justify-items-center gap-2 text-center md:flex md:items-center md:gap-4 md:text-left">
          <span className="grid size-[52px] shrink-0 place-items-center rounded-pill bg-success-soft text-success-ink md:size-14">
            <CheckIcon
              className="size-7 md:size-[30px]"
              strokeWidth={2.4}
              aria-hidden
            />
          </span>
          <div className="grid gap-1">
            <h1 className="text-[22px] leading-tight font-bold md:text-[30px]">
              C&apos;est réservé
            </h1>
            <p className="text-small text-ink-muted">
              {total > 1 ? `${total} billets` : "1 billet"} · réf.{" "}
              <span className="font-mono text-ink">{reference}</span>
            </p>
          </div>
        </div>
        <Stepper
          steps={ETAPES}
          current={3}
          className="hidden md:block md:w-[440px] md:shrink-0"
        />
      </header>

      <ul
        aria-label="Vos billets"
        className="grid gap-4 md:grid-cols-2 md:gap-5"
      >
        {dossier.tickets.map((titre, index) => (
          <li key={titre._id} className="min-w-0">
            <BilletTitre
              dossier={dossier}
              titre={titre}
              horaires={horaires}
              rang={index + 1}
              emis={emis}
            />
          </li>
        ))}
      </ul>

      <ActionsDossier dossier={dossier} actions={actions} principal />

      {invite ? (
        <InlineMessage tone="info" title="Réservation sans compte.">
          Retrouvez-la avec sa référence et le{" "}
          {contact ? (
            <b className="font-mono">{telephone(contact)}</b>
          ) : (
            "téléphone de contact"
          )}
          . Téléchargez le PDF pour avoir vos billets sans réseau, ou{" "}
          <Link
            href={adresseConnexion("/billets")}
            className="font-semibold underline underline-offset-4"
          >
            créez un compte
          </Link>{" "}
          pour que les prochains restent sur ce téléphone.
        </InlineMessage>
      ) : (
        <p className="text-small text-ink-muted">
          Vos billets sont enregistrés sur ce téléphone : ils restent lisibles
          sans réseau, dans l&apos;onglet Billets.
        </p>
      )}

      <Link
        href={`/billets/${encodeURIComponent(reference)}` as Route}
        className="grid min-h-11 place-items-center text-[15px] font-semibold text-accent-ink underline-offset-4 hover:underline md:justify-self-start"
      >
        Ouvrir mes billets
      </Link>
    </Cadre>
  )
}
