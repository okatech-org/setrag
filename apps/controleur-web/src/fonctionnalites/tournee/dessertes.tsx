"use client"

import { useMemo } from "react"
import type { FunctionReturnType } from "convex/server"

import { useQuery } from "@workspace/api/hooks"
import { api } from "@workspace/backend/generated"
import { SkeletonLines } from "@workspace/ui/components/empty-state"
import { Tag } from "@workspace/ui/components/tag"

import { CartesChoix } from "@/composants/carte-choix"
import { Message } from "@/composants/message"
import { Note } from "@/coquille/ecran"
import { dateCourte, heure } from "@/lib/format"
import { nomTrain } from "@/lib/train"

import { useTerminal } from "../terminal/contexte-terminal"

export type Desserte = FunctionReturnType<typeof api.functions.control.assignedTrips>[number]

/** « Express 201 · Owendo Virié → Franceville » : ce que l'agent a choisi. */
export function libelleDesserte(desserte: Desserte): string {
  return `${nomTrain(desserte.trainType, desserte.trainNumber)} · ${desserte.origin} → ${desserte.destination}`
}

/** Dessertes de la fenêtre de service, quand le serveur est joignable. */
export function useDessertes() {
  const { online, authenticated } = useTerminal()
  // `online` ne suffit pas : sans session reconnue, la requête serait refusée.
  const pret = online && authenticated
  const dessertes = useQuery(api.functions.control.assignedTrips, pret ? { limit: 8 } : "skip")
  return { pret, dessertes }
}

/**
 * La desserte du jour, choisie dans la fenêtre de service.
 *
 * Choisir, puis télécharger : deux gestes distincts. Le choix se fait ici,
 * en cartes ; le téléchargement part du bouton du bas, au pouce.
 */
export function ChoixDesserte({
  valeur,
  onChange,
}: {
  valeur: string | undefined
  onChange: (desserte: Desserte) => void
}) {
  const { online } = useTerminal()
  const { pret, dessertes } = useDessertes()

  /**
   * Circulations qui portent le même numéro à la même heure : deux livrets
   * horaires qui se chevauchent. Le contrôleur ne peut pas les distinguer à
   * l'œil, et embarquer la mauvaise fait refuser tous les titres du train.
   */
  const homonymes = useMemo(() => {
    const vus = new Map<string, number>()
    for (const d of dessertes ?? []) {
      const cle = `${d.trainNumber}|${d.departureAt}`
      vus.set(cle, (vus.get(cle) ?? 0) + 1)
    }
    return new Set([...vus.entries()].filter(([, n]) => n > 1).map(([cle]) => cle))
  }, [dessertes])

  if (!pret) {
    return (
      <Note>
        {online
          ? "La liste des dessertes attend que le serveur reconnaisse la session. Celle qui est embarquée reste utilisable."
          : "La liste des dessertes exige le réseau. Celle qui est embarquée reste utilisable."}
      </Note>
    )
  }
  if (dessertes === undefined) return <SkeletonLines />
  if (dessertes.length === 0) {
    return <Note>Aucune desserte dans la fenêtre de service (les 12 dernières heures et les 3 prochains jours).</Note>
  }

  return (
    <div className="grid gap-2">
      {homonymes.size > 0 && (
        <Message ton="alerte" titre="Deux circulations portent le même numéro et la même heure.">
          Elles viennent de livrets horaires qui se chevauchent : un titre vendu
          sur l&apos;une sera refusé sur l&apos;autre. Choisissez celle qui porte
          des titres, et signalez le doublon à l&apos;exploitation.
        </Message>
      )}
      <CartesChoix
        label="Desserte"
        valeur={valeur}
        onChange={(id) => {
          const desserte = dessertes.find((d) => d.id === id)
          if (desserte) onChange(desserte)
        }}
        options={dessertes.map((d) => {
          const nom = nomTrain(d.trainType, d.trainNumber)
          const ambigue = homonymes.has(`${d.trainNumber}|${d.departureAt}`)
          return {
            valeur: d.id,
            nom: `${nom}, départ ${heure(d.departureAt)} le ${dateCourte(d.serviceDate)}, ${d.origin} vers ${d.destination}, ${d.expectedPassengers} titres`,
            titre: (
              <>
                {nom} · <span className="tabular font-semibold">{heure(d.departureAt)}</span>
              </>
            ),
            sousTitre: (
              <>
                {dateCourte(d.serviceDate)} · {d.origin} → {d.destination} ·{" "}
                <span className="tabular">{d.expectedPassengers}</span> titres
                {/* Le nombre de gares départage deux circulations homonymes. */}
                {ambigue && (
                  <>
                    {" · "}
                    <span className="tabular">{d.stopCount}</span> gares
                  </>
                )}
              </>
            ),
            fin:
              d.id === valeur ? (
                <Tag tone="accent">choisie</Tag>
              ) : (
                <Tag tone="neutral">choisir</Tag>
              ),
          }
        })}
      />
    </div>
  )
}
