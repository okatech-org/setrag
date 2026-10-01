"use client"

import type { Route } from "next"
import { useRouter } from "next/navigation"
import { useEffect } from "react"

import { CadreGuichet, ChargementEcran, useGuichet } from "./guichet/cadre"

/**
 * L'encaissement est la quatrième étape du tunnel de vente : l'ancienne
 * adresse y renvoie, la vente en cours reprend où elle en était.
 */
export function PaymentPageClient() {
  const router = useRouter()
  const { contexte } = useGuichet()
  useEffect(() => {
    router.replace("/vente/billet?etape=encaissement" as Route)
  }, [router])
  return (
    <CadreGuichet contexte={contexte}>
      <ChargementEcran libelle="Reprise de l'encaissement…" />
    </CadreGuichet>
  )
}
