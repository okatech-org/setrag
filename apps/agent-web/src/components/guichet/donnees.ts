"use client"

import type { FunctionArgs, FunctionReference, FunctionReturnType } from "convex/server"
import { ConvexError } from "convex/values"
import { useCallback } from "react"

import { useMutation, useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"

import { fixtureEcriture, fixtureLecture } from "./fixtures-e2e"

/**
 * Accès aux données du guichet.
 *
 * En production et en développement, tout passe par Convex. Les parcours
 * Playwright (`NEXT_PUBLIC_E2E_MODE=1`) tournent sans backend : les mêmes
 * écrans lisent alors des jeux de données fixes (`fixtures-e2e.ts`).
 */
export const MODE_E2E = process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_E2E_MODE === "1"

export type Contexte = FunctionReturnType<typeof api.functions.guichet.contexte>
export type Accueil = FunctionReturnType<typeof api.functions.guichet.accueil>
export type Desserte = FunctionReturnType<typeof api.functions.guichet.dessertes>[number]
export type Tenue = FunctionReturnType<typeof api.functions.guichet.tenirPlaces>
export type DossierVente = NonNullable<FunctionReturnType<typeof api.functions.guichet.vente>>
export type Operation = FunctionReturnType<typeof api.functions.guichet.operations>[number]
export type Paiement = NonNullable<FunctionReturnType<typeof api.functions.guichet.paiement>>
export type DetailCaisse = NonNullable<FunctionReturnType<typeof api.functions.guichet.caisse>>
export type SessionPassee = FunctionReturnType<typeof api.functions.guichet.sessionsCaisse>[number]
export type Carnet = FunctionReturnType<typeof api.functions.guichet.ventesManuelles>
export type BilletTrouve = NonNullable<FunctionReturnType<typeof api.functions.guichet.billet>>
export type Siege = FunctionReturnType<typeof api.functions.trips.availableSeats>[number]
export type Categorie = FunctionReturnType<typeof api.functions.fareSchedules.publicDiscounts>[number]
export type Gare = FunctionReturnType<typeof api.functions.referential.listStations>[number]
export type ClientConventionne = FunctionReturnType<typeof api.functions.guichet.clientsConventionnes>[number]

type Requete = FunctionReference<"query">
type Ecriture = FunctionReference<"mutation">

/** `useQuery` de Convex, ou le jeu de données E2E correspondant. */
export function useLecture<Q extends Requete>(
  reference: Q,
  args: FunctionArgs<Q> | "skip"
): FunctionReturnType<Q> | undefined {
  const lire = useQuery as unknown as (ref: Q, a: FunctionArgs<Q> | "skip") => FunctionReturnType<Q> | undefined
  const reel = lire(reference, MODE_E2E ? "skip" : args)
  if (!MODE_E2E) return reel
  return args === "skip" ? undefined : (fixtureLecture(reference, args) as FunctionReturnType<Q> | undefined)
}

/** `useMutation` de Convex, ou sa réponse E2E. */
export function useEcriture<M extends Ecriture>(reference: M) {
  const reelle = useMutation(reference) as unknown as (args: FunctionArgs<M>) => Promise<FunctionReturnType<M>>
  return useCallback(
    async (args: FunctionArgs<M>): Promise<FunctionReturnType<M>> => {
      if (MODE_E2E) return (await fixtureEcriture(reference, args)) as FunctionReturnType<M>
      return await reelle(args)
    },
    [reelle, reference]
  )
}

/**
 * Message métier d'une erreur Convex, sans l'enveloppe technique
 * (« [CONVEX M(...)] Uncaught Error: … »).
 */
export function messageErreur(cause: unknown, repli = "L'opération n'a pas abouti. Réessayez.") {
  if (cause instanceof ConvexError) return typeof cause.data === "string" ? cause.data : repli
  if (cause instanceof Error) {
    const enveloppe = /Uncaught (?:Convex)?Error:\s*([^\n]+)/.exec(cause.message)
    if (enveloppe?.[1]) return enveloppe[1].trim()
    if (/Server Error/.test(cause.message)) return repli
    return cause.message || repli
  }
  return repli
}

/** Identifiant du poste, joint aux opérations pour la traçabilité. */
export const POSTE = "agent-web-guichet"
