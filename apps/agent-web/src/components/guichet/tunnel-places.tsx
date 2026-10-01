"use client"

import { Armchair, Users } from "lucide-react"
import { useMemo, useState } from "react"

import { api } from "@workspace/backend/generated"
import { Button } from "@workspace/ui/components/button"
import { SkeletonLines } from "@workspace/ui/components/empty-state"
import { InlineMessage } from "@workspace/ui/components/inline-message"
import { Tenue } from "@workspace/ui/components/compte-a-rebours"
import { cn } from "@workspace/ui/lib/utils"

import { Panneau } from "@/components/charte"
import type { BrouillonVente, VoyageurBrouillon } from "@/lib/sale-draft"

import { useLecture, type Categorie, type Siege } from "./donnees"
import { ChoixVoiture, PlanVoiture, nomVoiture, placerCoteACote, voituresDepuis } from "./plan-voiture"
import { libelleCategorie } from "./vente-billet"

/**
 * Étape « Places » : une voiture à la fois, le plan intégré à la page, les
 * voyageurs placés l'un après l'autre.
 */
export function EtapePlaces({
  brouillon,
  categories,
  tenueActive,
  onVoyageurs,
}: {
  brouillon: BrouillonVente
  categories: readonly Categorie[]
  /** Fin de la tenue en cours, si elle couvre encore la saisie. */
  tenueActive: number | null
  onVoyageurs: (voyageurs: VoyageurBrouillon[]) => void
}) {
  const desserte = brouillon.desserte!
  const sieges = useLecture(api.functions.trips.availableSeats, {
    tripId: desserte.tripId as never,
    fromIndex: desserte.fromIndex,
    toIndex: desserte.toIndex,
  })
  // Les places de la tenue en cours restent « à nous » : libres pour cette vente.
  const nosPlaces = useMemo(
    () => new Set((brouillon.tenue?.billets ?? []).map((b) => b.seatId).filter((id): id is string => Boolean(id))),
    [brouillon.tenue]
  )
  const voitures = useMemo(() => voituresDepuis(sieges ?? [], nosPlaces), [sieges, nosPlaces])
  const voyageurs = brouillon.voyageurs
  const [actif, setActif] = useState(() => Math.max(0, voyageurs.findIndex((v) => !v.seatId)))
  const [voitureChoisie, setVoitureChoisie] = useState<string | null>(null)

  const siegesParId = useMemo(() => new Map<string, Siege>((sieges ?? []).map((s) => [s.seatId, s])), [sieges])
  const premiereVoiture =
    voitures.find((v) => voyageurs.some((vo) => vo.seatId && siegesParId.get(vo.seatId)?.coachId === v.id))?.id ??
    voitures.find((v) => v.classe === desserte.classe && v.libres >= voyageurs.length)?.id ??
    voitures.find((v) => v.classe === desserte.classe && v.libres > 0)?.id ??
    null
  const voitureActive = voitureChoisie ?? premiereVoiture
  const siegesVoiture = (sieges ?? []).filter((s) => s.coachId === voitureActive)
  const choisies = new Map(voyageurs.flatMap((v, index) => (v.seatId ? [[v.seatId, index + 1] as const] : [])))
  const libelleActive = voitures.find((v) => v.id === voitureActive)?.libelle ?? ""

  // Une place déjà vendue par un autre guichet pendant la saisie se libère ici.
  const perdues = voyageurs.filter((v) => {
    if (!v.seatId || nosPlaces.has(v.seatId)) return false
    const siege = siegesParId.get(v.seatId)
    return siege !== undefined && !siege.isFree
  })

  const placer = (siege: Siege) => {
    const index = voyageurs.findIndex((v) => v.seatId === siege.seatId)
    if (index >= 0) {
      onVoyageurs(voyageurs.map((v, i) => (i === index ? { ...v, seatId: undefined, place: undefined, voiture: undefined } : v)))
      setActif(index)
      return
    }
    const cible = Math.min(actif, voyageurs.length - 1)
    const suivants = voyageurs.map((v, i) => (i === cible ? { ...v, seatId: siege.seatId, place: siege.label, voiture: siege.coachLabel } : v))
    onVoyageurs(suivants)
    const libre = suivants.findIndex((v) => !v.seatId)
    setActif(libre >= 0 ? libre : cible)
  }

  const coteACote = () => {
    if (!sieges) return
    const places = placerCoteACote(sieges, voyageurs.length, desserte.classe, nosPlaces, voitureActive)
    onVoyageurs(voyageurs.map((v, i) => (places[i] ? { ...v, seatId: places[i].seatId, place: places[i].label, voiture: places[i].coachLabel } : v)))
    if (places[0]) setVoitureChoisie(places[0].coachId)
    setActif(0)
  }

  if (sieges === undefined) {
    return (
      <div role="status" aria-label="Chargement du plan de voiture" className="grid gap-3">
        <SkeletonLines />
        <SkeletonLines />
      </div>
    )
  }

  return (
    <>
      {perdues.length > 0 ? (
        <InlineMessage tone="warning" title="Une place choisie vient d'être vendue.">
          {perdues.map((v) => v.place).join(", ")} : choisissez-en une autre pour ce voyageur.
        </InlineMessage>
      ) : null}
      {voitures.length === 0 ? (
        <InlineMessage tone="warning" title="Aucun plan de voiture pour cette desserte.">
          La composition du train n&apos;est pas renseignée : la gestion doit l&apos;importer avant la vente.
        </InlineMessage>
      ) : (
        <>
          <ChoixVoiture voitures={voitures} classe={desserte.classe} active={voitureActive} onChoisir={setVoitureChoisie} />
          <PlanVoiture
            sieges={siegesVoiture}
            choisies={choisies}
            nosPlaces={nosPlaces}
            onPlace={placer}
            libelleVoiture={nomVoiture(libelleActive)}
          />
        </>
      )}
      <div className={cn("grid items-start gap-5", tenueActive && "xl:grid-cols-[minmax(0,1fr)_360px]")}>
        <Panneau
          titre="Affectation"
          icone={Armchair}
          sousTitre="Choisissez le voyageur, puis sa place"
          actions={
            <Button type="button" variant="secondary" size="sm" onClick={coteACote} disabled={voitures.length === 0}>
              <Users aria-hidden />
              Placer côte à côte
            </Button>
          }
        >
          <div className="grid gap-2 sm:grid-cols-[repeat(auto-fill,minmax(260px,1fr))]" role="radiogroup" aria-label="Voyageur à placer">
            {voyageurs.map((voyageur, index) => {
              const estActif = index === actif
              return (
                <button
                  key={index}
                  type="button"
                  role="radio"
                  aria-checked={estActif}
                  onClick={() => setActif(index)}
                  className={cn(
                    "flex min-h-14 items-center gap-3 rounded-md border px-3 py-2.5 text-left text-[14px] transition-colors",
                    estActif ? "border-accent-base shadow-[inset_0_0_0_1px_var(--c-accent)]" : "border-line hover:bg-surface-sunk",
                    !voyageur.seatId && !estActif && "border-dashed text-ink-muted"
                  )}
                >
                  <span
                    className={cn(
                      "grid size-7 shrink-0 place-items-center rounded-pill text-[13px] font-bold",
                      voyageur.seatId ? "bg-accent-base text-ink-inverse" : "bg-surface-sunk text-ink-muted"
                    )}
                  >
                    {index + 1}
                  </span>
                  <span className="grid min-w-0 flex-1">
                    <b className="truncate font-semibold text-ink">{libelleCategorie(voyageur.categorie, categories)}</b>
                    <small className="text-[12.5px] text-ink-muted">
                      {estActif ? (voyageur.seatId ? "Touchez une autre place pour changer" : "Choisissez sa place") : "Touchez pour placer ce voyageur"}
                    </small>
                  </span>
                  <span className="tabular text-[15px] font-semibold whitespace-nowrap">
                    {voyageur.place ? `${voyageur.voiture ?? ""} · ${voyageur.place}` : "—"}
                  </span>
                </button>
              )
            })}
          </div>
        </Panneau>
        {tenueActive ? <Tenue fin={tenueActive}>Places tenues encore</Tenue> : null}
      </div>
    </>
  )
}
