"use client"

import type { Route } from "next"
import Link from "next/link"

import { Button } from "@workspace/ui/components/button"

import { useReductions } from "@/fonctionnalites/reference/use-reference"

import {
  adresseConfirmation,
  adresseResultats,
  rechercheDuDossier,
  type Dossier,
} from "../adresses"
import { EcranMessage, Page } from "../etapes"

/**
 * Une réservation qui ne se paie plus : déjà payée, expirée, annulée. Le fait,
 * ce qu'il change, et la suite — les billets, ou la même recherche à refaire.
 */
export function EcranSortie({ dossier }: { dossier: Dossier }) {
  const { enfant } = useReductions()
  const { sale } = dossier
  const recherche = rechercheDuDossier(dossier, enfant?.code ?? null)
  const refaire = (
    <Button asChild>
      <Link href={recherche ? adresseResultats(recherche) : "/"}>
        Refaire la recherche
      </Link>
    </Button>
  )

  let contenu
  if (sale.status === "confirmee") {
    contenu = (
      <EcranMessage
        titre="Cette réservation est déjà payée."
        description="Vos billets sont prêts."
        action={
          <Button asChild>
            <Link href={adresseConfirmation(sale.number)}>
              Voir les billets
            </Link>
          </Button>
        }
      />
    )
  } else if (sale.status === "annulee") {
    contenu = (
      <EcranMessage
        titre="Cette réservation est annulée."
        description="Ses places ont été remises en vente."
        action={refaire}
      />
    )
  } else if (
    sale.status === "expiree" ||
    sale.status === "en_attente_paiement"
  ) {
    contenu = (
      <EcranMessage
        titre="Le délai de paiement est écoulé."
        description="Vos places ont été remises en vente, et rien ne vous a été débité. Le prix du moment peut avoir changé."
        action={refaire}
      />
    )
  } else {
    contenu = (
      <EcranMessage
        titre="Cette réservation n'est plus à payer."
        description="Retrouvez-la dans vos billets."
        action={
          <Button asChild variant="secondary">
            <Link href={"/billets" as Route}>Mes billets</Link>
          </Button>
        }
      />
    )
  }
  return <Page className="py-6">{contenu}</Page>
}
