"use client"

import { useMemo } from "react"

import { useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { Feuille } from "@workspace/ui/components/feuille"
import { cn } from "@workspace/ui/lib/utils"

import { ajouterJours, prixCourt } from "@/lib/format"

/** Fenêtre de vente : aujourd'hui et les 31 jours suivants (backend, `saleWindow`). */
export const JOURS_EN_VENTE = 32

const JOURS_SEMAINE = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."]
const moisFormat = new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", month: "long", year: "numeric" })

function midi(date: string) {
  const [a, m, j] = date.split("-").map(Number) as [number, number, number]
  return new Date(Date.UTC(a, m - 1, j, 11))
}

export interface TrajetCalendrier {
  originStationId: string
  destinationStationId: string
  passengers: number
  discountCodes?: string[]
}

/**
 * Prix et disponibilité de chaque jour de la fenêtre de vente, pour un
 * trajet. Deux requêtes : le backend borne un calendrier à 21 jours.
 */
export function useCalendrierPrix(trajet: TrajetCalendrier | null, aujourdhui: string | null) {
  const base = trajet && aujourdhui ? { ...trajet, originStationId: trajet.originStationId as never, destinationStationId: trajet.destinationStationId as never } : null
  const premier = useQuery(api.functions.trips.fareCalendar, base ? { ...base, from: aujourdhui!, days: 21 } : "skip")
  const second = useQuery(api.functions.trips.fareCalendar, base ? { ...base, from: ajouterJours(aujourdhui!, 21), days: JOURS_EN_VENTE - 21 } : "skip")
  return useMemo(() => {
    if (!premier || !second) return undefined
    return new Map([...premier, ...second].map((jour) => [jour.serviceDate, jour]))
  }, [premier, second])
}

/**
 * Le choix de la date : les jours de la fenêtre de vente, mois par mois,
 * chacun avec le prix le plus bas du groupe cherché. Un jour sans train est
 * grisé ; un jour complet le dit en toutes lettres.
 */
export function ChoixDate({
  open,
  onOpenChange,
  valeur,
  aujourdhui,
  trajet,
  onChoisir,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  valeur: string
  aujourdhui: string
  trajet: TrajetCalendrier | null
  onChoisir: (date: string) => void
}) {
  const calendrier = useCalendrierPrix(open ? trajet : null, aujourdhui)

  const mois = useMemo(() => {
    const groupes = new Map<string, string[]>()
    for (let i = 0; i < JOURS_EN_VENTE; i += 1) {
      const date = ajouterJours(aujourdhui, i)
      const cle = date.slice(0, 7)
      groupes.set(cle, [...(groupes.get(cle) ?? []), date])
    }
    return [...groupes.values()]
  }, [aujourdhui])

  const prixMin = useMemo(() => {
    const prix = [...(calendrier?.values() ?? [])].flatMap((jour) => (jour.prixMinTtc === null ? [] : [jour.prixMinTtc]))
    return prix.length ? Math.min(...prix) : null
  }, [calendrier])

  return (
    <Feuille
      open={open}
      onOpenChange={onOpenChange}
      titre="Date du voyage"
      description={trajet ? "Prix le plus bas du jour, pour votre groupe." : "Choisissez d'abord vos gares pour voir les prix."}
      hauteur="haute"
    >
      <div className="grid gap-6">
        {mois.map((jours) => {
          const decalage = (midi(jours[0]!).getUTCDay() + 6) % 7
          return (
            <section key={jours[0]} aria-label={moisFormat.format(midi(jours[0]!))}>
              <h3 className="mb-2 text-[15px] font-bold first-letter:uppercase">{moisFormat.format(midi(jours[0]!))}</h3>
              <div className="grid grid-cols-7 gap-1" role="grid">
                {JOURS_SEMAINE.map((jour) => (
                  <span key={jour} className="pb-1 text-center text-[11.5px] font-semibold text-ink-muted" aria-hidden>
                    {jour}
                  </span>
                ))}
                {Array.from({ length: decalage }, (_, i) => (
                  <span key={`vide-${i}`} aria-hidden />
                ))}
                {jours.map((date) => {
                  const info = calendrier?.get(date)
                  const sansTrain = info !== undefined && info.trains === 0
                  const complet = info?.complet ?? false
                  const choisi = date === valeur
                  const meilleur = info?.prixMinTtc !== null && info?.prixMinTtc !== undefined && info.prixMinTtc === prixMin
                  const quantieme = Number(date.slice(8))
                  const detail = sansTrain ? "sans train" : complet ? "complet" : info?.prixMinTtc != null ? `${prixCourt(info.prixMinTtc)} FCFA` : ""
                  return (
                    <button
                      key={date}
                      type="button"
                      disabled={sansTrain}
                      aria-pressed={choisi}
                      aria-label={`${quantieme} ${moisFormat.format(midi(date))}${detail ? `, ${detail}` : ""}${meilleur ? ", meilleur prix" : ""}`}
                      onClick={() => {
                        onChoisir(date)
                        onOpenChange(false)
                      }}
                      className={cn(
                        "grid min-h-[54px] content-center justify-items-center gap-0.5 rounded-md px-0.5 transition-colors duration-[var(--dur-fast)]",
                        choisi ? "bg-accent-base text-ink-inverse" : "enabled:hover:bg-accent-soft",
                        sansTrain && "text-ink-faint"
                      )}
                    >
                      <span className="font-mono text-[16px] leading-none font-semibold">{quantieme}</span>
                      <span
                        className={cn(
                          "font-mono text-[10px] leading-none tracking-[-0.02em]",
                          choisi ? "text-ink-inverse/85" : meilleur ? "font-semibold text-success-ink" : "text-ink-muted"
                        )}
                      >
                        {info === undefined ? (trajet ? "·" : "") : sansTrain ? "—" : complet ? "complet" : info.prixMinTtc != null ? prixCourt(info.prixMinTtc) : ""}
                      </span>
                    </button>
                  )
                })}
              </div>
            </section>
          )
        })}
        <p className="text-caption text-ink-muted">
          La vente ouvre 31 jours avant le départ. Prix en FCFA pour l&apos;ensemble des voyageurs ; il est figé à la réservation.
        </p>
      </div>
    </Feuille>
  )
}
