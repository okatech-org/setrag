"use client"

import { useCallback, useMemo, useSyncExternalStore } from "react"

import type { Classe } from "@/lib/agent-data"

/**
 * Vente de billet en cours, gardée dans l'onglet (sessionStorage).
 *
 * Le tunnel passe par quatre étapes ; un rechargement de page, un aller-retour
 * vers l'accueil ou la caisse ne doivent pas faire perdre la saisie, ni
 * oublier la tenue des places en cours. La vente elle-même vit dans Convex :
 * ce brouillon n'en garde que la trace nécessaire à l'écran.
 */

export interface VoyageurBrouillon {
  /** Code de réduction de la grille ; vide pour un adulte plein tarif. */
  categorie: string
  seatId?: string
  voiture?: string
  place?: string
  nom: string
  prenom: string
  civilite: "M" | "F"
  telephone: string
}

export interface DesserteChoisie {
  tripId: string
  trainNumber: string
  trainType: string
  serviceDate: string
  departAt: number
  arriveeAt: number
  fromIndex: number
  toIndex: number
  distanceKm: number
  arretsIntermediaires: number
  delayMinutes: number
  classe: Classe
}

export interface TenueBrouillon {
  venteId: string
  numero: string
  finTenue: number
  montants: { ht: number; vat: number; css: number; ttc: number; received: number }
  billets: Array<{
    id: string
    numero: string
    seatId: string | null
    voiture: string | null
    place: string | null
    prix: number
    reduction: string | null
  }>
  /** Places et catégories tenues : une différence impose une nouvelle tenue. */
  signature: string
}

export interface BrouillonVente {
  version: 2
  origineId: string
  arriveeId: string
  date: string
  /** Nombre de voyageurs par catégorie ("" : adulte). */
  comptes: Record<string, number>
  desserte: DesserteChoisie | null
  voyageurs: VoyageurBrouillon[]
  tenue: TenueBrouillon | null
  /** Options de la vente. */
  imprimer: boolean
  conventionne: boolean
}

const CLE = "setrag:agent-web:vente-billet:v2"
const abonnes = new Set<() => void>()

function prevenir() {
  for (const abonne of abonnes) abonne()
}

function abonner(rappel: () => void) {
  abonnes.add(rappel)
  const stockage = (event: StorageEvent) => {
    if (event.key === CLE) rappel()
  }
  window.addEventListener("storage", stockage)
  return () => {
    abonnes.delete(rappel)
    window.removeEventListener("storage", stockage)
  }
}

function lire() {
  try {
    return window.sessionStorage.getItem(CLE)
  } catch {
    return null
  }
}

export function lireBrouillonVente(): BrouillonVente | null {
  if (typeof window === "undefined") return null
  return analyser(lire())
}

function analyser(brut: string | null): BrouillonVente | null {
  if (!brut) return null
  try {
    const valeur = JSON.parse(brut) as BrouillonVente
    return valeur.version === 2 ? valeur : null
  } catch {
    return null
  }
}

export function ecrireBrouillonVente(brouillon: BrouillonVente | null) {
  if (brouillon) window.sessionStorage.setItem(CLE, JSON.stringify(brouillon))
  else window.sessionStorage.removeItem(CLE)
  prevenir()
}

export function effacerBrouillonVente() {
  if (typeof window === "undefined") return
  window.sessionStorage.removeItem(CLE)
  prevenir()
}

/** Brouillon de la vente, partagé entre les composants et les rechargements. */
export function useBrouillonVente() {
  const brut = useSyncExternalStore(abonner, lire, () => null)
  const brouillon = useMemo(() => analyser(brut), [brut])
  const ecrire = useCallback((suivant: BrouillonVente | null | ((courant: BrouillonVente | null) => BrouillonVente | null)) => {
    const valeur = typeof suivant === "function" ? suivant(lireBrouillonVente()) : suivant
    ecrireBrouillonVente(valeur)
  }, [])
  return [brouillon, ecrire] as const
}

/** Signature d'une tenue : desserte, classe, places et catégories. */
export function signatureTenue(desserte: DesserteChoisie | null, voyageurs: readonly VoyageurBrouillon[]) {
  if (!desserte) return ""
  return JSON.stringify([desserte.tripId, desserte.fromIndex, desserte.toIndex, desserte.classe, voyageurs.map((v) => [v.seatId ?? "", v.categorie])])
}
