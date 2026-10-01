"use client"

import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from "react"

import { api } from "@workspace/backend/generated"
import { SkeletonLines } from "@workspace/ui/components/empty-state"
import { cn } from "@workspace/ui/lib/utils"

import { CoquilleAgent } from "@/coquille/coquille-agent"
import { useOnlineStatus } from "@/hooks/use-online-status"

import { messageErreur, useLecture, type Contexte } from "./donnees"
import { ErreurLecture } from "./elements"

/**
 * Cadre d'un écran du guichet : la coquille du portail, renseignée avec le
 * vendeur et son point de vente dès que le contexte est lu.
 */
export function CadreGuichet({
  contexte,
  titre,
  children,
  className,
}: {
  contexte: Contexte | undefined
  /** Dernier maillon du fil d'Ariane (dossier ouvert). */
  titre?: string
  children: ReactNode
  className?: string
}) {
  return (
    <CoquilleAgent
      utilisateur={
        contexte
          ? {
              firstName: contexte.seller.firstName,
              lastName: contexte.seller.lastName,
              matricule: contexte.seller.matricule,
              role: contexte.seller.role,
            }
          : undefined
      }
      perimetre={contexte?.pointOfSale.name}
      titre={titre}
    >
      <div className={cn("mx-auto grid w-full max-w-[1480px] min-w-0 content-start gap-5", className)}>
        <LimiteErreur>{children}</LimiteErreur>
      </div>
    </CoquilleAgent>
  )
}

/** Contexte du guichet et état du réseau, lus une fois par écran. */
export function useGuichet() {
  const contexte = useLecture(api.functions.guichet.contexte, {})
  const enLigne = useOnlineStatus()
  const caisseOuverte = Boolean(contexte?.session)
  return {
    contexte,
    enLigne,
    caisseOuverte,
    /** La vente électronique suppose le réseau et une caisse ouverte. */
    peutVendre: enLigne && caisseOuverte,
  }
}

/** Heure courante, rafraîchie à intervalle régulier (une minute par défaut). */
export function useMaintenant(pas = 60_000) {
  const [maintenant, setMaintenant] = useState(() => Date.now())
  useEffect(() => {
    const minuterie = window.setInterval(() => setMaintenant(Date.now()), pas)
    return () => window.clearInterval(minuterie)
  }, [pas])
  return maintenant
}

/** Chargement d'un écran : des lignes grisées, pas de texte qui clignote. */
export function ChargementEcran({ libelle = "Chargement…" }: { libelle?: string }) {
  return (
    <div className="grid gap-4" role="status" aria-label={libelle}>
      <span className="sr-only">{libelle}</span>
      <SkeletonLines />
      <SkeletonLines />
    </div>
  )
}

/**
 * Une lecture Convex en échec lève dans le rendu : la limite l'arrête ici et
 * l'écrit, au lieu de vider tout l'écran.
 */
export class LimiteErreur extends Component<{ children: ReactNode; titre?: string }, { erreur: unknown }> {
  state: { erreur: unknown } = { erreur: null }

  static getDerivedStateFromError(erreur: unknown) {
    return { erreur }
  }

  componentDidCatch(erreur: unknown, info: ErrorInfo) {
    console.error("Guichet : lecture en échec", erreur, info.componentStack)
  }

  render() {
    if (this.state.erreur) {
      return (
        <div className="grid gap-3">
          <ErreurLecture titre={this.props.titre ?? "Cet écran n'a pas pu être chargé."}>
            {messageErreur(this.state.erreur, "Rechargez la page. Si l'erreur persiste, prévenez le chef de gare.")}
          </ErreurLecture>
          <div>
            <button
              type="button"
              className="min-h-11 rounded-pill border border-accent-line bg-surface px-5 text-[15px] font-semibold text-accent-ink hover:bg-accent-soft"
              onClick={() => this.setState({ erreur: null })}
            >
              Réessayer
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
