"use client"

import { Billet } from "@workspace/ui/voyage/billet"
import {
  PastilleBillet,
  PastilleDesserte,
  type StatutBillet,
} from "@workspace/ui/voyage/statut"

import { arriveLendemain, dateCourte, heure } from "@/lib/format"
import { LIBELLE_CLASSE, estClasse, nomTrain } from "@/lib/voyage"

import {
  codeAffichable,
  etatBillet,
  nomVoyageur,
  type Dossier,
  type Titre,
} from "./dossier"
import type { Horaires } from "./use-horaires"

/**
 * Un titre de transport du dossier, sous la forme du billet de la charte.
 *
 * L'en-tête dit l'état du billet ; il cède la place à l'état du train quand
 * celui-ci change le voyage (retard, suppression) : c'est l'information que
 * le voyageur doit voir d'abord.
 */
export function BilletTitre({
  dossier,
  titre,
  horaires,
  rang,
  emis,
  fondDecoupe,
  className,
}: {
  dossier: Dossier
  titre: Titre
  /** Heures de montée et de descente du voyageur (`useHoraires`). */
  horaires: Horaires
  /** Rang du billet dans le dossier, à partir de 1. */
  rang: number
  emis?: boolean
  fondDecoupe?: string
  className?: string
}) {
  const trip = dossier.trip
  if (!trip) return null
  const total = dossier.tickets.length
  const statut = titre.status as StatutBillet
  const trainChange =
    statut === "valide" &&
    (trip.status === "annule" ||
      (trip.delayMinutes > 0 && trip.status !== "termine"))

  const cases = [
    ...(titre.coachLabel
      ? [{ libelle: "Voiture", valeur: titre.coachLabel }]
      : []),
    {
      libelle: "Place",
      valeur: titre.isStanding ? "Debout" : (titre.seatLabel ?? "—"),
    },
    {
      libelle: "Classe",
      valeur: estClasse(titre.serviceClass)
        ? LIBELLE_CLASSE[titre.serviceClass].court
        : titre.serviceClass,
    },
  ]

  return (
    <Billet
      className={className}
      depart={{
        heure: horaires.departAt === null ? "--:--" : heure(horaires.departAt),
        gare: dossier.origin?.name ?? "Départ",
      }}
      arrivee={{
        heure:
          horaires.arriveeAt === null ? "--:--" : heure(horaires.arriveeAt),
        gare: dossier.destination?.name ?? "Arrivée",
      }}
      milieu={`${dateCourte(trip.serviceDate)}${horaires.departAt !== null && horaires.arriveeAt !== null && arriveLendemain(horaires.departAt, horaires.arriveeAt) ? " (+1 j)" : ""}`}
      train={nomTrain(trip.trainType, trip.trainNumber)}
      statut={
        trainChange ? (
          <PastilleDesserte statut={trip.status} retard={trip.delayMinutes} />
        ) : (
          <PastilleBillet statut={statut} />
        )
      }
      etat={etatBillet(titre, dossier)}
      cases={cases}
      code={codeAffichable(titre)}
      legendeCode={`${dossier.sale.number} · ${rang}/${total}`}
      pied={
        <>
          <span className="min-w-0 truncate">{nomVoyageur(titre)}</span>
          <span className="shrink-0 font-mono">
            {titre.fare.discountPct > 0
              ? `Réduction ${titre.fare.discountPct} % · `
              : ""}
            {rang}/{total}
          </span>
        </>
      }
      emis={emis}
      fondDecoupe={fondDecoupe}
    />
  )
}
