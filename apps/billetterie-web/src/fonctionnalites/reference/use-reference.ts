"use client"

import type { FunctionReturnType } from "convex/server"
import { useMemo } from "react"

import { useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"

export type Gare = FunctionReturnType<typeof api.functions.referential.listStations>[number]
export type Reduction = FunctionReturnType<typeof api.functions.fareSchedules.publicDiscounts>[number]

/**
 * Les gares de la ligne, dans l'ordre du point kilométrique : c'est l'ordre
 * dans lequel le train les dessert, et celui dans lequel on les choisit.
 */
export function useGares() {
  const gares = useQuery(api.functions.referential.listStations, {})
  return useMemo(() => {
    const parCode = new Map(gares?.map((gare) => [gare.code, gare]))
    const parId = new Map(gares?.map((gare) => [gare._id as string, gare]))
    return {
      gares,
      chargement: gares === undefined,
      parCode: (code: string | null | undefined) => (code ? parCode.get(code) : undefined),
      parId: (id: string | null | undefined) => (id ? parId.get(id) : undefined),
    }
  }, [gares])
}

/**
 * Réductions publiques de la grille active. L'enfant est celle qui porte une
 * borne d'âge : le formulaire en tire son libellé (« 4 à 11 ans ») et son
 * taux, sans rien coder en dur.
 */
export function useReductions() {
  const reductions = useQuery(api.functions.fareSchedules.publicDiscounts, {})
  return useMemo(() => {
    const enfant = reductions?.find((r) => r.maxAge !== null && r.maxAge < 18) ?? null
    // Réductions individuelles sur justificatif (militaire…) : les groupes
    // relèvent du guichet, au-delà de neuf voyageurs.
    const individuelles = reductions?.filter((r) => r !== enfant && r.minPassengers === null) ?? []
    return { reductions, enfant, individuelles, chargement: reductions === undefined }
  }, [reductions])
}

/** « Enfant (4 à 11 ans) » d'après la réduction, ou « Enfant ». */
export function libelleEnfant(enfant: Reduction | null): string {
  if (!enfant || enfant.minAge === null || enfant.maxAge === null) return "Enfant"
  return `Enfant (${enfant.minAge} à ${enfant.maxAge} ans)`
}
