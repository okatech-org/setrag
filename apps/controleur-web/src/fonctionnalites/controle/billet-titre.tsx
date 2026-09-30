"use client"

import { Billet } from "@workspace/ui/voyage/billet"

import { classeCourte, dateCourte, heure } from "@/lib/format"
import type { EmbarkedManifest, EmbarkedTicket } from "@/lib/offline/types"
import { arretDeRang } from "@/lib/position"
import { nomDuTrain, numeroVoiture } from "@/lib/train"

/**
 * Le billet du voyageur, tel qu'il le tient dans sa main : l'objet encre de
 * la billetterie, logo négatif, voie entre les deux heures. L'agent
 * reconnaît d'un coup d'œil ce qu'on lui montre.
 *
 * La voie est vide quand le trajet n'est plus acquis (titre annulé,
 * remboursé, non réglé, expiré). Sans découpe : au contrôle, rien ne se
 * détache.
 */
export function BilletTitre({
  manifest,
  ticket,
  trajetAcquis = true,
}: {
  manifest: EmbarkedManifest
  ticket: EmbarkedTicket
  trajetAcquis?: boolean
}) {
  const depart = arretDeRang(manifest, ticket.fromStopIndex)
  const arrivee = arretDeRang(manifest, ticket.toStopIndex)
  const heureDepart = depart?.departureAt ?? depart?.arrivalAt
  const heureArrivee = arrivee?.arrivalAt ?? arrivee?.departureAt
  return (
    <Billet
      decoupe={false}
      train={`${nomDuTrain(manifest)} · ${dateCourte(manifest.serviceDate)}`}
      titulaire={`${ticket.passenger.lastName} ${ticket.passenger.firstName}`}
      depart={{
        heure: heureDepart !== undefined ? heure(heureDepart) : "--:--",
        gare: depart?.name ?? "Départ",
      }}
      arrivee={{
        heure: heureArrivee !== undefined ? heure(heureArrivee) : "--:--",
        gare: arrivee?.name ?? "Arrivée",
      }}
      voie={trajetAcquis ? "pleine" : "vide"}
      cases={[
        { libelle: "Voiture", valeur: ticket.coachLabel ? numeroVoiture(ticket.coachLabel) : "—" },
        { libelle: "Place", valeur: ticket.seatLabel ?? "debout" },
        { libelle: "Classe", valeur: classeCourte(ticket.serviceClass) },
      ]}
      pied={<span className="font-mono tracking-[0.04em]">N° {ticket.number}</span>}
    />
  )
}
