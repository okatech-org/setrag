import { TripResultCard } from "@workspace/ui"

/* Horodatages figés : un aperçu doit rendre à l'identique à chaque capture. */
const D = (h: number, m: number) => Date.UTC(2026, 7, 7, h - 1, m)

export const Standard = () => (
  <TripResultCard
    departureAt={D(7, 42)}
    arrivalAt={D(21, 38)}
    durationMinutes={836}
    originLabel="Owendo"
    destinationLabel="Franceville"
    priceXaf={18000}
    tags={[
      { label: "À l'heure", tone: "success" },
      { label: "Éco · 2,4 kg CO₂", tone: "accent" },
    ]}
    onSelect={() => {}}
  />
)

export const Correspondance = () => (
  <TripResultCard
    departureAt={D(8, 11)}
    arrivalAt={D(23, 55)}
    durationMinutes={944}
    connectionLabel="1 arrêt · Booué"
    originLabel="Owendo"
    destinationLabel="Franceville"
    priceXaf={27000}
    tags={[
      { label: "Départ retardé de 12 min", tone: "warning" },
      { label: "Dernières places", tone: "second" },
    ]}
    onSelect={() => {}}
  />
)

export const Selectionne = () => (
  <TripResultCard
    state="selected"
    departureAt={D(10, 6)}
    arrivalAt={D(23, 4)}
    durationMinutes={778}
    originLabel="Owendo"
    destinationLabel="Franceville"
    priceXaf={40500}
    selectionNote="Sélectionné pour l'aller · voiture 12, place 44 côté fenêtre"
    onSelect={() => {}}
  />
)

export const Supprime = () => (
  <TripResultCard
    state="cancelled"
    departureAt={D(13, 42)}
    arrivalAt={D(23, 42)}
    durationMinutes={600}
    originLabel="Owendo"
    destinationLabel="Franceville"
    cancelledNotice="Nous vous replaçons sans frais sur le 14:06 — même prix, même classe."
    onSelect={() => {}}
  />
)
