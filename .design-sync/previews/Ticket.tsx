import { Ticket } from "@workspace/ui"

const DEPART = Date.UTC(2026, 7, 7, 6, 42)
const ARRIVEE = Date.UTC(2026, 7, 7, 20, 38)

const qr = (
  <span
    aria-hidden
    style={{
      width: "100%",
      height: "100%",
      borderRadius: 4,
      background:
        "repeating-linear-gradient(90deg, var(--c-canvas) 0 4px, var(--c-ink) 4px 7px)",
    }}
  />
)

export const Valide = () => (
  <div style={{ maxWidth: 460 }}>
    <Ticket
      legLabel="Aller · vendredi 7 août"
      routeLabel="Owendo → Franceville"
      departureAt={DEPART}
      arrivalAt={ARRIVEE}
      departurePlace="Gare d'Owendo · Hall 1"
      arrivalPlace="Gare de Franceville"
      seatLabel="12 · 44"
      seatNote="Fenêtre, sens marche"
      passengerLabel="Camille Roux · Tarif Jeune"
      reference="KX7 24Q"
      conditionsNote="Échangeable jusqu'à 30 min avant le départ"
      qrCode={qr}
    />
  </div>
)

export const Utilise = () => (
  <div style={{ maxWidth: 460 }}>
    <Ticket
      state="utilise"
      legLabel="Aller · vendredi 7 août"
      routeLabel="Owendo → Franceville"
      departureAt={DEPART}
      arrivalAt={ARRIVEE}
      seatLabel="12 · 44"
      passengerLabel="Camille Roux"
      reference="KX7 24Q"
      conditionsNote="Contrôlé à l'embarquement à 07:31"
      qrCode={qr}
    />
  </div>
)

export const Rembourse = () => (
  <div style={{ maxWidth: 460 }}>
    <Ticket
      state="rembourse"
      legLabel="Aller · vendredi 7 août"
      routeLabel="Owendo → Franceville"
      departureAt={DEPART}
      arrivalAt={ARRIVEE}
      passengerLabel="Camille Roux"
      reference="KX7 24Q"
      conditionsNote="Remboursé le 5 août — 16 200 F crédités"
    />
  </div>
)
