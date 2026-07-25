import { BoardingPass } from "@workspace/ui"

const qr = (
  <span
    aria-hidden
    style={{
      width: "100%",
      height: "100%",
      background:
        "repeating-linear-gradient(90deg, var(--c-surface) 0 4px, var(--c-ink) 4px 7px)",
    }}
  />
)

export const AvantDepart = () => (
  <BoardingPass
    countdownLabel="Départ dans 34 min"
    routeLabel="Owendo → Franceville"
    coachLabel="12"
    seatLabel="44"
    platformLabel="H"
    reference="KX7 24Q · Camille Roux"
    qrCode={qr}
    onAddToWallet={() => {}}
    onExchange={() => {}}
  />
)

export const SansActions = () => (
  <BoardingPass
    countdownLabel="Départ dans 2 h 10"
    routeLabel="Franceville → Owendo"
    coachLabel="8"
    seatLabel="12"
    reference="MP4 88T · Jean-Baptiste Ondo"
    qrCode={qr}
  />
)
