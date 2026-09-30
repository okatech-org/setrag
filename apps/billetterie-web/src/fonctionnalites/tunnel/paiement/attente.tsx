"use client"

import { SmartphoneIcon } from "lucide-react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useEffect } from "react"

import { Button } from "@workspace/ui/components/button"
import {
  Tenue,
  useCompteARebours,
} from "@workspace/ui/components/compte-a-rebours"
import { Chargeur } from "@workspace/ui/components/voie"

import { BarreApp } from "@/coquille/barre-app"
import { useNaviguer } from "@/coquille/filet-navigation"
import { prix } from "@/lib/format"

import { adresseConfirmation, adressePaiement, type Dossier } from "../adresses"
import { EnTeteTunnel, Page, libelleEtape } from "../etapes"
import { AvecReservation } from "./avec-reservation"
import { EcranSortie } from "./sortie"

const ETAPE = 2

/**
 * Attente de la validation Mobile Money (`/paiement/attente?ref=…`).
 *
 * L'écran suit le statut de la réservation en direct : payée, il cède la
 * place aux billets (sans laisser d'entrée dans l'historique) ; expirée ou
 * annulée, il le dit. Tant que le règlement est enregistré sans prestataire,
 * la réservation est déjà payée en arrivant ici : l'écran ne fait que passer.
 */
export function Attente() {
  const reference = useSearchParams().get("ref")
  return (
    <>
      <BarreApp titre="Paiement en cours" sousTitre={libelleEtape(ETAPE)} />
      <EnTeteTunnel
        etape={ETAPE}
        etapesMobile={false}
        titre="Paiement en cours"
      />
      <AvecReservation reference={reference}>
        {(dossier) => <EcranAttente dossier={dossier} />}
      </AvecReservation>
    </>
  )
}

function EcranAttente({ dossier }: { dossier: Dossier }) {
  const naviguer = useNaviguer()
  const { sale } = dossier
  const payee = sale.status === "confirmee"
  const restant = useCompteARebours(sale.priceLockedUntil)

  useEffect(() => {
    if (payee) naviguer(adresseConfirmation(sale.number), { remplacer: true })
  }, [payee, naviguer, sale.number])

  if (payee) {
    return (
      <Page className="py-12">
        <Chargeur>Paiement reçu. Ouverture de vos billets…</Chargeur>
      </Page>
    )
  }
  if (
    sale.status !== "en_attente_paiement" ||
    sale.priceLockedUntil === undefined ||
    restant === 0
  ) {
    return <EcranSortie dossier={dossier} />
  }

  return (
    <Page className="py-4 md:py-8">
      <div className="mx-auto grid max-w-[560px] justify-items-center gap-5 rounded-lg border border-line bg-surface px-5 py-10 text-center md:px-10">
        <span className="grid size-[88px] place-items-center rounded-pill bg-accent-soft text-accent-ink">
          <SmartphoneIcon className="size-9" aria-hidden />
        </span>
        <h2 className="max-w-[20ch] text-[26px] leading-tight font-bold">
          Validez le paiement sur votre téléphone
        </h2>
        <p className="text-body max-w-[40ch] text-ink-muted">
          Montant : <b className="tabular text-ink">{prix(sale.amounts.ttc)}</b>
          . Le statut se met à jour tout seul : inutile de recharger la page.
        </p>
        <Chargeur className="w-full">
          En attente de votre confirmation…
        </Chargeur>
        <Tenue fin={sale.priceLockedUntil} />
        <Button asChild variant="ghost">
          <Link href={adressePaiement(sale.number)}>
            Changer de moyen de paiement
          </Link>
        </Button>
      </div>
    </Page>
  )
}
