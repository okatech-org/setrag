"use client"

import { useRouter } from "next/navigation"

import { Button } from "@workspace/ui/components/button"
import { EmptyState, SkeletonLines } from "@workspace/ui/components/empty-state"

import { TripResultsDesktop } from "@/components/results/trip-results-desktop"
import { TripResultsMobile } from "@/components/results/trip-results-mobile"
import { useTripResults } from "@/features/resultats/use-trip-results"

/**
 * Résultats de recherche.
 *
 * L'état est tenu ici, une seule fois, et les deux vues n'en sont que le
 * rendu : montées ensemble, elles partageraient sinon un même écran deux tris
 * différents.
 */
export function TripResults() {
  const router = useRouter()
  const results = useTripResults()

  if (results.state === "no-search") {
    return (
      <EmptyState
        title="Commencez par choisir votre trajet"
        description="La gare de départ, l’arrivée et la date sont nécessaires pour consulter les dessertes."
        action={
          <Button onClick={() => router.push("/")}>Rechercher un train</Button>
        }
      />
    )
  }

  if (results.state === "loading") return <SkeletonLines lines={5} />

  if (results.state === "empty") {
    return (
      <EmptyState
        title="Aucune desserte ce jour-là"
        description="Essayez le jour précédent ou le jour suivant."
        action={
          <Button onClick={() => router.push("/")}>
            Modifier la recherche
          </Button>
        }
      />
    )
  }

  return (
    <>
      <TripResultsMobile results={results} />
      <TripResultsDesktop results={results} />
    </>
  )
}
